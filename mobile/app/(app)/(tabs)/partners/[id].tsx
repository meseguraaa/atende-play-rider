import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    Pressable,
    ScrollView,
    ActivityIndicator,
    Alert,
    NativeSyntheticEvent,
    NativeScrollEvent,
    Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, usePathname } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

import { UI, styles } from '../../../../src/theme/client-theme';
import { api } from '../../../../src/services/api';
import { useAuth } from '../../../../src/auth/auth-context';

import { ScreenGate } from '../../../../src/components/layout/ScreenGate';
import { ProductDetailsSkeleton } from '../../../../src/components/loading/ProductDetailsSkeleton';

const HERO_H = 320;

/**
 * ===========================================
 * 📈 Analytics (Parceiros: detalhe)
 * ===========================================
 * Mesmo padrão do ProductDetails: silencioso e resiliente.
 * ✅ Tenant-safe: envia x-company-id
 */
type AnalyticsSource = 'direct' | 'push' | 'menu' | 'deep_link' | 'flow';

type PushContext = {
    pushId?: string | null;
    pushType?: string | null;
    viewedAt?: string | null; // ISO
};

type AnalyticsContext = {
    source: AnalyticsSource;
    pushId?: string | null;
    pushType?: string | null;
    secondsSincePush?: number | null;
};

declare global {
    // eslint-disable-next-line no-var
    var __lastPushContext: PushContext | undefined;
}

function safeNowISO() {
    try {
        return new Date().toISOString();
    } catch {
        return '';
    }
}

function secondsBetween(aISO?: string | null, bISO?: string | null) {
    try {
        if (!aISO || !bISO) return null;
        const a = new Date(aISO).getTime();
        const b = new Date(bISO).getTime();
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        const s = Math.floor((b - a) / 1000);
        return Number.isFinite(s) ? Math.max(0, s) : null;
    } catch {
        return null;
    }
}

function getAnalyticsContext(): AnalyticsContext {
    const lastPush = globalThis.__lastPushContext;

    if (lastPush?.pushId) {
        const nowISO = safeNowISO();
        return {
            source: 'push',
            pushId: lastPush.pushId ?? null,
            pushType: lastPush.pushType ?? null,
            secondsSincePush: secondsBetween(lastPush.viewedAt ?? null, nowISO),
        };
    }

    return { source: 'direct' };
}

async function trackEvent(
    name: string,
    payload: Record<string, any> = {},
    ctx?: AnalyticsContext,
    companyId?: string | null
) {
    try {
        if (!companyId) return;

        const context = ctx ?? getAnalyticsContext();

        await api.post(
            '/api/mobile/analytics/events',
            {
                name,
                ts: safeNowISO(),
                context,
                payload,
            },
            { headers: { 'x-company-id': companyId } }
        );
    } catch {
        // silencioso: analytics nunca pode quebrar UX
    }
}

/**
 * ✅ normaliza url de imagem vinda da API (mesmo padrão de partners/index)
 */
function normalizeApiImageUrl(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    const isHttp = lower.startsWith('http://') || lower.startsWith('https://');

    const getRealHostOrigin = () => {
        try {
            const full = (api as any)?.getUri
                ? (api as any).getUri({ url: '/api/health' })
                : null;

            if (typeof full === 'string' && full.includes('://')) {
                const u = new URL(full);
                return `${u.protocol}//${u.host}`;
            }
        } catch {}

        return null as string | null;
    };

    if (isHttp) {
        try {
            const u = new URL(s);
            const host = u.hostname;

            if (host === 'localhost' || host === '127.0.0.1') {
                const real = getRealHostOrigin();
                if (!real) return s;
                return `${real}${u.pathname}${u.search}`;
            }

            return s;
        } catch {
            return s;
        }
    }

    const baseFromApi =
        (api as any)?.defaults?.baseURL ||
        (api as any)?.defaults?.baseUrl ||
        '';

    const base = String(baseFromApi ?? '').trim();
    if (!base) return null;

    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const path = s.startsWith('/') ? s : `/${s}`;
    return `${cleanBase}${path}`;
}

type ApiPartner = {
    id: string;
    name: string;
    logoUrl: string | null;

    discountPct: number;
    description: string;
    rules: string;

    ctaUrl: string | null;
    ctaLabel?: string | null;

    isActive?: boolean;
};

function safeNumber(v: any, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function clampPct(v: number) {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, Math.round(v)));
}

function normalizeUrl(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) return s;

    if (lower.startsWith('www.')) return `https://${s}`;

    return null;
}

function normalizeLabel(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    return s ? s : null;
}

export default function PartnerDetails() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const pathname = usePathname();

    const { id } = useLocalSearchParams<{ id?: string }>();
    const partnerId = useMemo(() => String(id ?? '').trim(), [id]);

    // ✅ multi-tenant
    const { companyId, refreshMe } = useAuth();
    const companyIdRef = useRef<string | null>(companyId ?? null);

    useEffect(() => {
        companyIdRef.current = companyId ?? null;
    }, [companyId]);

    const [loading, setLoading] = useState(true);
    const [partner, setPartner] = useState<ApiPartner | null>(null);
    const [opening, setOpening] = useState(false);

    const fetchingRef = useRef(false);

    // ✅ gate: libera quando a primeira tentativa terminar (sucesso/erro/vazio)
    const [dataReady, setDataReady] = useState(false);

    // ✅ scroll depth dedupe
    const scrollMarksRef = useRef<Set<number>>(new Set());

    // ✅ helper: sempre envia x-company-id nas requests
    const withTenantHeaders = useCallback(() => {
        const cid = companyIdRef.current;
        return cid ? { headers: { 'x-company-id': cid } } : undefined;
    }, []);

    // ✅ sempre volta para a lista (rota pai do pathname), sem depender do histórico
    const backTarget = useMemo(() => {
        const p = normalizePage(pathname || '/');
        const parts = p.split('?')[0].split('#')[0].split('/').filter(Boolean);

        // ex: "/partners/123" => ["partners","123"] => "/partners"
        if (parts.length >= 2) {
            parts.pop();
            return `/${parts.join('/')}`;
        }

        // fallback seguro caso o pathname não ajude (ajuste se sua lista for outra rota)
        return '/partners';
    }, [pathname]);

    const fetchPartner = useCallback(async () => {
        setDataReady(false);

        // tenta garantir tenant
        if (!companyIdRef.current) {
            try {
                await refreshMe();
            } catch {}
        }

        const cid = companyIdRef.current;

        if (!partnerId) {
            setLoading(false);
            setPartner(null);
            setDataReady(true);

            trackEvent(
                'partner_not_found',
                {
                    page: 'partner_details',
                    pathname: String(pathname || ''),
                    partnerId: '',
                    reason: 'missing_id',
                },
                undefined,
                cid
            );

            return;
        }

        if (!cid) {
            setLoading(false);
            setPartner(null);
            setDataReady(true);

            Alert.alert(
                'Atenção',
                'Não foi possível identificar o estabelecimento (companyId). Faça login novamente.'
            );

            trackEvent(
                'partner_load_error',
                {
                    page: 'partner_details',
                    pathname: String(pathname || ''),
                    partnerId,
                    message: 'missing_company_id',
                },
                undefined,
                cid
            );

            return;
        }

        if (fetchingRef.current) return;
        fetchingRef.current = true;

        // ✅ page viewed (primeira tentativa de carregar)
        trackEvent(
            'page_viewed',
            {
                page: 'partner_details',
                partnerId,
                pathname: normalizePage(pathname || ''),
            },
            undefined,
            cid
        );

        try {
            setLoading(true);

            const res = await api.get<{
                ok?: boolean;
                partner?: any;
                item?: any;
            }>(
                `/api/mobile/partners/${encodeURIComponent(partnerId)}`,
                withTenantHeaders()
            );

            const p = (res?.partner ?? res?.item ?? null) as any;

            if (!p?.id) {
                setPartner(null);

                trackEvent(
                    'partner_not_found',
                    {
                        page: 'partner_details',
                        partnerId,
                        reason: 'api_empty',
                    },
                    undefined,
                    cid
                );

                return;
            }

            const mapped: ApiPartner = {
                id: String(p.id),
                name: String(p.name ?? 'Parceiro'),
                logoUrl: normalizeApiImageUrl(p.logoUrl),

                discountPct: clampPct(safeNumber(p.discountPct, 0)),
                description: String(p.description ?? ''),
                rules: String(p.rules ?? ''),

                ctaUrl:
                    typeof p.ctaUrl === 'string'
                        ? normalizeUrl(p.ctaUrl)
                        : null,

                ctaLabel: normalizeLabel(p.ctaLabel),

                isActive:
                    typeof p.isActive === 'boolean' ? p.isActive : undefined,
            };

            setPartner(mapped);

            trackEvent(
                'partner_loaded',
                {
                    page: 'partner_details',
                    partnerId: mapped.id,
                    isActive: mapped.isActive ?? null,
                    discountPct: mapped.discountPct,
                    hasCtaUrl: !!mapped.ctaUrl,
                },
                undefined,
                cid
            );
        } catch (err: any) {
            console.log(
                '[partner details] error:',
                err?.data ?? err?.message ?? err
            );

            trackEvent(
                'partner_load_error',
                {
                    page: 'partner_details',
                    partnerId,
                    message: String(
                        err?.data?.error ?? err?.message ?? 'error'
                    ),
                },
                undefined,
                cid
            );

            const msg =
                err?.data?.error ||
                err?.message ||
                'Não foi possível carregar o parceiro.';

            Alert.alert('Erro', String(msg));
            setPartner(null);
        } finally {
            setLoading(false);
            fetchingRef.current = false;
            setDataReady(true);
        }
    }, [partnerId, refreshMe, pathname, withTenantHeaders]);

    useEffect(() => {
        scrollMarksRef.current = new Set();
        fetchPartner();
    }, [fetchPartner]);

    const discountLabel = useMemo(() => {
        const pct = clampPct(safeNumber(partner?.discountPct, 0));
        return pct > 0 ? `${pct}% OFF` : null;
    }, [partner?.discountPct]);

    const safeCtaUrl = useMemo(
        () => normalizeUrl(partner?.ctaUrl),
        [partner?.ctaUrl]
    );

    const safeCtaLabel = useMemo(() => {
        const label = normalizeLabel(partner?.ctaLabel);
        return label ?? 'Ir para o site';
    }, [partner?.ctaLabel]);

    const extra = useMemo(() => {
        const p = partner;
        if (!p) return [{ label: 'ID', value: partnerId || '—' }];

        return [
            { label: 'Desconto', value: discountLabel ?? '—' },
            { label: 'Site', value: safeCtaUrl ? safeCtaUrl : '—' },
            ...(typeof p.isActive === 'boolean'
                ? [{ label: 'Status', value: p.isActive ? 'Ativo' : 'Inativo' }]
                : []),
        ];
    }, [partner, partnerId, discountLabel, safeCtaUrl]);

    const onPressBack = useCallback(() => {
        const cid = companyIdRef.current;

        trackEvent(
            'nav_click',
            {
                from: 'partner_details',
                to: backTarget,
                partnerId: partner?.id ?? partnerId,
            },
            undefined,
            cid
        );

        // ✅ não depende do histórico (evita cair no HOME)
        router.replace(backTarget);
    }, [router, partner?.id, partnerId, backTarget]);

    const onPressOpenSite = useCallback(async () => {
        if (!partner) return;
        if (opening) return;

        const cid = companyIdRef.current;

        const url = safeCtaUrl;
        if (!url) {
            trackEvent(
                'partner_cta_click',
                {
                    from: 'partner_details',
                    partnerId: partner.id,
                    ok: false,
                    reason: 'missing_or_invalid_url',
                },
                undefined,
                cid
            );

            Alert.alert(
                'Link indisponível',
                'Este parceiro não possui um link válido no momento.'
            );
            return;
        }

        try {
            setOpening(true);

            trackEvent(
                'partner_cta_click',
                {
                    from: 'partner_details',
                    partnerId: partner.id,
                    ok: true,
                    url,
                },
                undefined,
                cid
            );

            const can = await Linking.canOpenURL(url);
            if (!can) throw new Error('cannot_open_url');

            await Linking.openURL(url);
        } catch (err: any) {
            console.log('[partner cta] error:', err?.message ?? err);

            trackEvent(
                'partner_cta_error',
                {
                    from: 'partner_details',
                    partnerId: partner?.id ?? partnerId,
                    message: String(err?.message ?? 'error'),
                },
                undefined,
                cid
            );

            Alert.alert(
                'Não foi possível abrir',
                'Tente novamente em instantes.'
            );
        } finally {
            setOpening(false);
        }
    }, [partner, opening, partnerId, safeCtaUrl]);

    const onScroll = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            try {
                const cid = companyIdRef.current;
                const pId = partner?.id ?? partnerId;
                if (!pId || !cid) return;

                const { contentOffset, contentSize, layoutMeasurement } =
                    e.nativeEvent;

                const y = Number(contentOffset?.y ?? 0);
                const h = Number(layoutMeasurement?.height ?? 0);
                const total = Number(contentSize?.height ?? 0);

                if (
                    !Number.isFinite(y) ||
                    !Number.isFinite(h) ||
                    !Number.isFinite(total)
                )
                    return;

                const denom = Math.max(1, total - h);
                const pct = Math.max(0, Math.min(1, y / denom));
                const pct100 = Math.round(pct * 100);

                const marks = [25, 50, 75, 100] as const;

                for (const m of marks) {
                    if (pct100 >= m && !scrollMarksRef.current.has(m)) {
                        scrollMarksRef.current.add(m);

                        trackEvent(
                            'scroll_depth',
                            {
                                page: 'partner_details',
                                partnerId: pId,
                                depth: m,
                            },
                            undefined,
                            cid
                        );
                    }
                }
            } catch {}
        },
        [partner?.id, partnerId]
    );

    return (
        <ScreenGate dataReady={dataReady} skeleton={<ProductDetailsSkeleton />}>
            {loading && !dataReady ? (
                <View
                    style={[
                        S.page,
                        { alignItems: 'center', justifyContent: 'center' },
                    ]}
                >
                    <ActivityIndicator />
                    <Text
                        style={{
                            marginTop: 10,
                            color: 'rgba(0,0,0,0.55)',
                            fontWeight: '600',
                        }}
                    >
                        Carregando parceiro…
                    </Text>
                </View>
            ) : !partner ? (
                <View style={S.page}>
                    <View style={[S.headerFloat, { top: insets.top + 10 }]}>
                        <Pressable onPress={onPressBack} style={S.backBtn}>
                            <FontAwesome
                                name="angle-left"
                                size={20}
                                color="#FFFFFF"
                            />
                        </Pressable>
                    </View>

                    <View
                        style={{
                            padding: UI.spacing.screenX,
                            paddingTop: insets.top + 90,
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 18,
                                fontWeight: '700',
                                color: UI.brand.primaryText,
                            }}
                        >
                            Parceiro não encontrado
                        </Text>

                        <Text
                            style={{
                                marginTop: 8,
                                color: 'rgba(0,0,0,0.65)',
                                fontSize: 14,
                            }}
                        >
                            Esse parceiro pode ter sido removido, desativado ou
                            você está sem conexão.
                        </Text>

                        <Pressable
                            onPress={() => {
                                const cid = companyIdRef.current;

                                trackEvent(
                                    'action_click',
                                    {
                                        page: 'partner_details',
                                        action: 'retry_fetch',
                                        partnerId,
                                    },
                                    undefined,
                                    cid
                                );

                                fetchPartner();
                            }}
                            style={[
                                styles.pillPrimary,
                                {
                                    marginTop: 14,
                                    height: 52,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                },
                            ]}
                        >
                            <Text style={styles.pillPrimaryText}>
                                Tentar novamente
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={onPressBack}
                            style={[
                                {
                                    marginTop: 10,
                                    height: 52,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: 999,
                                    backgroundColor: 'rgba(0,0,0,0.04)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(0,0,0,0.06)',
                                },
                            ]}
                        >
                            <Text
                                style={{
                                    fontWeight: '800',
                                    color: UI.brand.primaryText,
                                }}
                            >
                                Voltar
                            </Text>
                        </Pressable>
                    </View>
                </View>
            ) : (
                <View style={S.page}>
                    {/* HERO IMAGE */}
                    <View style={{ height: HERO_H }}>
                        {partner.logoUrl ? (
                            <Image
                                source={{ uri: partner.logoUrl }}
                                style={S.heroImage}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={S.heroFallback}>
                                <FontAwesome
                                    name="handshake-o"
                                    size={34}
                                    color="#FFFFFF"
                                />
                            </View>
                        )}

                        <View style={S.heroOverlay} />

                        {/* 💸 desconto no hero */}
                        {discountLabel ? (
                            <View style={S.heroBadge}>
                                <Text style={S.heroBadgeText} numberOfLines={1}>
                                    {discountLabel}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    <View style={[S.headerFloat, { top: insets.top + 10 }]}>
                        <Pressable onPress={onPressBack} style={S.backBtn}>
                            <FontAwesome
                                name="angle-left"
                                size={20}
                                color="#FFFFFF"
                            />
                        </Pressable>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        style={S.scroll}
                        contentContainerStyle={{ paddingBottom: 140 }}
                        onScroll={onScroll}
                        scrollEventThrottle={120}
                    >
                        <View style={S.mainShell}>
                            <View style={S.mainInner}>
                                <Text style={S.title}>{partner.name}</Text>

                                <Text style={S.subTitle}>
                                    {discountLabel
                                        ? `Desconto especial: ${discountLabel}`
                                        : 'Confira as condições deste parceiro.'}
                                </Text>
                            </View>
                        </View>

                        <View style={S.whiteArea}>
                            <View style={S.whiteContent}>
                                <Text style={S.sectionTitle}>
                                    Sobre o parceiro
                                </Text>
                                <Text style={S.description}>
                                    {partner.description || 'Sem descrição.'}
                                </Text>

                                <Text
                                    style={[S.sectionTitle, { marginTop: 18 }]}
                                >
                                    Regras
                                </Text>
                                <Text style={S.description}>
                                    {partner.rules || 'Sem regras cadastradas.'}
                                </Text>

                                <View style={S.infoGrid}>
                                    {extra.map((item) => (
                                        <View
                                            key={item.label}
                                            style={S.infoItem}
                                        >
                                            <Text style={S.infoLabel}>
                                                {item.label}
                                            </Text>
                                            <Text style={S.infoValue}>
                                                {item.value}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </View>
                    </ScrollView>

                    <View
                        style={[
                            S.ctaBar,
                            { paddingBottom: insets.bottom + 12 },
                        ]}
                    >
                        <Pressable
                            style={[
                                S.reserveBtn,
                                !safeCtaUrl ? { opacity: 0.65 } : null,
                                opening ? { opacity: 0.75 } : null,
                            ]}
                            onPress={onPressOpenSite}
                            disabled={opening || !safeCtaUrl}
                        >
                            {opening ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <FontAwesome
                                    name="external-link"
                                    size={16}
                                    color="#FFFFFF"
                                    style={{ marginRight: 10 }}
                                />
                            )}

                            <Text style={S.reserveBtnText}>
                                {opening
                                    ? 'Abrindo…'
                                    : safeCtaUrl
                                      ? safeCtaLabel
                                      : 'Link indisponível'}
                            </Text>

                            <FontAwesome
                                name="angle-right"
                                size={18}
                                color="#FFFFFF"
                                style={{ marginLeft: 10 }}
                            />
                        </Pressable>
                    </View>
                </View>
            )}
        </ScreenGate>
    );
}

function normalizePage(pathname: string) {
    const p = (pathname || '/').trim();
    const noQuery = p.split('?')[0].split('#')[0];
    return noQuery.length > 1 && noQuery.endsWith('/')
        ? noQuery.slice(0, -1)
        : noQuery || '/';
}

const S = StyleSheet.create({
    page: { flex: 1, backgroundColor: UI.colors.white },
    scroll: { flex: 1, backgroundColor: UI.colors.white },

    heroImage: { width: '100%', height: '100%' },

    heroFallback: {
        width: '100%',
        height: '100%',
        backgroundColor: UI.brand.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },

    heroOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.18)',
    },

    headerFloat: {
        position: 'absolute',
        left: UI.spacing.screenX,
        right: UI.spacing.screenX,
        flexDirection: 'row',
        justifyContent: 'space-between',
        zIndex: 20,
    },

    backBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: UI.brand.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },

    heroBadge: {
        position: 'absolute',
        left: UI.spacing.screenX,
        bottom: 16,
        maxWidth: 260,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: 'rgba(20,20,20,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
    },
    heroBadgeText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 0.2,
    },

    mainShell: {
        backgroundColor: UI.colors.white,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        marginTop: -10,
    },

    mainInner: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 30,
        paddingBottom: 18,
    },

    title: {
        color: UI.brand.primaryText,
        fontSize: 24,
        fontWeight: '600',
        lineHeight: 30,
    },

    subTitle: {
        marginTop: 10,
        color: 'rgba(0,0,0,0.55)',
        fontSize: 14,
        fontWeight: '700',
    },

    whiteArea: { backgroundColor: UI.colors.white },

    whiteContent: {
        paddingHorizontal: UI.spacing.screenX,
    },

    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: UI.brand.primaryText,
        marginBottom: 10,
    },

    description: {
        fontSize: 15,
        lineHeight: 22,
        color: 'rgba(0,0,0,0.72)',
        fontWeight: '400',
    },

    infoGrid: { marginTop: 20, gap: 12 },

    infoItem: {
        padding: 14,
        borderRadius: UI.radius.card,
        backgroundColor: 'rgba(0,0,0,0.04)',
    },

    infoLabel: {
        fontSize: 12,
        color: 'rgba(0,0,0,0.55)',
        fontWeight: '600',
    },

    infoValue: {
        fontSize: 15,
        fontWeight: '600',
        color: UI.brand.primaryText,
        marginTop: 4,
    },

    ctaBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: UI.colors.white,
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
    },

    reserveBtn: {
        height: 44,
        borderRadius: 999,
        paddingHorizontal: 14,
        backgroundColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },

    reserveBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
});
