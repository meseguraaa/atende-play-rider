import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    View,
    Text,
    Pressable,
    Image,
    StyleSheet,
    FlatList,
    ListRenderItemInfo,
    TextInput,
    ActivityIndicator,
    Alert,
    ViewToken,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, usePathname } from 'expo-router';

import { UI, styles } from '../../../../src/theme/client-theme';
import { useAuth } from '../../../../src/auth/auth-context';
import { api } from '../../../../src/services/api';
import { trackEvent } from '../../../../src/services/analytics';

import { ScreenGate } from '../../../../src/components/layout/ScreenGate';
import { PartnersSkeleton } from '../../../../src/components/loading/PartnersSkeleton';
import {
    AppTopBar,
    STICKY_ROW_H as TOPBAR_H,
} from '../../../../src/components/layout/AppTopBar';

const STICKY_ROW_H = TOPBAR_H;

// ✅ normaliza página (evita "/x/" e "/x" contarem diferente)
function normalizePage(pathname: string) {
    const p = (pathname || '/').trim();
    const noQuery = p.split('?')[0].split('#')[0];
    return noQuery.length > 1 && noQuery.endsWith('/')
        ? noQuery.slice(0, -1)
        : noQuery || '/';
}

// ✅ normaliza url de imagem vinda da API (mesmo padrão de products)
function normalizeApiImageUrl(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    const isHttp = lower.startsWith('http://') || lower.startsWith('https://');

    // helper: host do "mundo real" (mesmo que defaults.baseURL seja null)
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

    // 1) absoluta, mas localhost -> reescreve
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

    // 2) relativa -> usa baseURL se existir
    const baseFromApi =
        (api as any)?.defaults?.baseURL ||
        (api as any)?.defaults?.baseUrl ||
        '';

    const base = String(baseFromApi ?? '').trim();

    // ✅ se não tiver baseURL, devolve o path relativo (melhor que sumir)
    const path = s.startsWith('/') ? s : `/${s}`;
    if (!base) return path;

    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}${path}`;
}

// -----------------------------
// 🧠 NÍVEL DO CLIENTE (mesmo padrão Home)
// -----------------------------
type CustomerLevelKey = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';

function normalizeCustomerLevelKey(user: any): CustomerLevelKey | null {
    const raw = String(
        user?.customerLevel?.key ??
            user?.customerLevel?.level ??
            user?.customerLevel?.value ??
            user?.customerLevel ??
            user?.level?.key ??
            user?.level?.value ??
            user?.level ??
            user?.levelKey ??
            user?.levelEnum ??
            ''
    ).trim();

    if (
        raw === 'BRONZE' ||
        raw === 'PRATA' ||
        raw === 'OURO' ||
        raw === 'DIAMANTE'
    )
        return raw;

    const label = String(
        user?.customerLevel?.label ??
            user?.level?.label ??
            user?.levelLabel ??
            user?.tier?.label ??
            user?.tier ??
            ''
    )
        .trim()
        .toLowerCase();

    if (label.includes('bronze')) return 'BRONZE';
    if (label.includes('prata')) return 'PRATA';
    if (label.includes('ouro')) return 'OURO';
    if (label.includes('diam')) return 'DIAMANTE';

    return null;
}

function levelChipColors(level: CustomerLevelKey) {
    switch (level) {
        case 'BRONZE':
            return {
                bg: 'rgba(245, 158, 11, 0.10)',
                border: 'rgba(245, 158, 11, 0.30)',
                text: 'rgb(180, 83, 9)',
            };
        case 'PRATA':
            return {
                bg: 'rgba(100, 116, 139, 0.10)',
                border: 'rgba(100, 116, 139, 0.30)',
                text: 'rgb(226, 232, 240)',
            };
        case 'OURO':
            return {
                bg: 'rgba(234, 179, 8, 0.10)',
                border: 'rgba(234, 179, 8, 0.30)',
                text: 'rgb(161, 98, 7)',
            };
        case 'DIAMANTE':
            return {
                bg: 'rgba(14, 165, 233, 0.10)',
                border: 'rgba(14, 165, 233, 0.30)',
                text: 'rgb(3, 105, 161)',
            };
    }
}

// -----------------------------
// helpers sacolinha
// -----------------------------
function sumQtyFromOrder(order: any): number {
    const items = Array.isArray(order?.items) ? order.items : [];
    const total = items.reduce((acc: number, it: any) => {
        const q = Number(it?.quantity ?? 0);
        return acc + (Number.isFinite(q) ? q : 0);
    }, 0);
    return total > 0 ? total : 0;
}

type ApiPartner = {
    id: string;
    name: string;
    logoUrl: string | null;
    discountPct: number;
    description: string | null;
    rules: string | null;
    ctaUrl: string | null;
    ctaLabel?: string | null;

    // ✅ ordem
    sortOrder?: number | string | null;
};

type Partner = {
    id: string;
    name: string;
    logo: string | null;
    discountPct: number;
    description: string | null;

    // ✅ ordem
    sortOrder: number;
};

type NotificationsSummaryResponse = {
    ok: boolean;
    unreadCount?: number;
    error?: string;
};

const PartnerTile = memo(function PartnerTile({
    item,
    onOpen,
}: {
    item: Partner;
    onOpen: (id: string) => void;
}) {
    const pct = Number(item.discountPct ?? 0);
    const pctLabel =
        Number.isFinite(pct) && pct > 0 ? `${Math.round(pct)}% OFF` : null;

    return (
        <Pressable style={S.card} onPress={() => onOpen(item.id)}>
            <View style={S.cardTop}>
                <View style={S.logoWrap}>
                    {item.logo ? (
                        <Image
                            source={{ uri: item.logo }}
                            style={S.logoImg}
                            fadeDuration={0}
                        />
                    ) : (
                        <View style={S.logoFallback}>
                            <FontAwesome
                                name="handshake-o"
                                size={22}
                                color={UI.colors.white}
                            />
                        </View>
                    )}
                </View>

                {pctLabel ? (
                    <View style={S.pill}>
                        <Text style={S.pillText} numberOfLines={1}>
                            {pctLabel}
                        </Text>
                    </View>
                ) : null}
            </View>

            <Text numberOfLines={2} style={S.title}>
                {item.name}
            </Text>

            {item.description ? (
                <Text numberOfLines={2} style={S.desc}>
                    {item.description}
                </Text>
            ) : (
                <Text numberOfLines={2} style={S.descMuted}>
                    Toque para ver detalhes e regras do parceiro.
                </Text>
            )}

            <View style={S.footer}>
                <View style={S.detailsBtn}>
                    <View style={S.btnCenterRow}>
                        <Text style={S.detailsBtnText}>Ver parceiro</Text>
                        <FontAwesome
                            name="angle-right"
                            size={18}
                            color="#141414"
                            style={{ marginLeft: 8 }}
                        />
                    </View>
                </View>
            </View>
        </Pressable>
    );
});

type PartnersHeaderProps = {
    topBounceHeight: number;
    topOffset: number;
    search: string;
    onChangeSearch: (v: string) => void;
    loading: boolean;
    totalCount: number;
};

const PartnersHeader = memo(function PartnersHeader({
    topBounceHeight,
    topOffset,
    search,
    onChangeSearch,
    loading,
    totalCount,
}: PartnersHeaderProps) {
    return (
        <View>
            <View
                pointerEvents="none"
                style={[S.topBounceDark, { height: topBounceHeight }]}
            />

            <View
                style={{ height: topOffset, backgroundColor: UI.colors.bg }}
            />

            <View style={S.darkShell}>
                <View style={S.darkInner}>
                    <View style={[styles.glassCard, S.filtersCard]}>
                        <View style={S.searchRow}>
                            <View style={S.searchIcon}>
                                <FontAwesome
                                    name="search"
                                    size={16}
                                    color={UI.colors.white}
                                />
                            </View>

                            <TextInput
                                placeholder="Buscar parceiro…"
                                placeholderTextColor="rgba(255,255,255,0.55)"
                                style={S.searchInput}
                                value={search}
                                onChangeText={onChangeSearch}
                                autoCorrect={false}
                                autoCapitalize="none"
                                returnKeyType="search"
                            />

                            {loading ? (
                                <View
                                    style={{
                                        width: 22,
                                        alignItems: 'flex-end',
                                    }}
                                >
                                    <ActivityIndicator />
                                </View>
                            ) : null}
                        </View>
                    </View>
                </View>
            </View>

            <View style={S.whiteArea}>
                <View style={S.whiteContent}>
                    <View style={S.sectionRow}>
                        <Text style={S.sectionTitle}>Parceiros</Text>
                        <Text style={S.sectionMeta}>
                            {loading
                                ? 'Carregando…'
                                : `${totalCount} parceiro(s)`}
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    );
});

export default function Partners() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const pathname = usePathname();

    // ✅ multi-tenant
    const { user, meLoading, companyId, refreshMe } = useAuth();
    const warnedMissingCompanyRef = useRef(false);

    // ✅ padrão Home: ref do companyId (evita closures antigas)
    const companyIdRef = useRef<string | null>(companyId ?? null);
    useEffect(() => {
        companyIdRef.current = companyId ?? null;
    }, [companyId]);

    const withTenantHeaders = useCallback(() => {
        const cid = companyIdRef.current;
        return cid ? { headers: { 'x-company-id': cid } } : undefined;
    }, []);

    const displayName = useMemo(
        () => user?.name || user?.email || 'Cliente',
        [user?.name, user?.email]
    );

    const avatarUrl = useMemo(() => {
        const raw = String(user?.image ?? '').trim();
        return raw.length ? raw : null;
    }, [user?.image]);

    const hasAvatar = useMemo(() => !!avatarUrl, [avatarUrl]);

    // ✅ header: aniversário / nível / sacola / notif
    const [pendingCartCount, setPendingCartCount] = useState<number>(0);
    const [unreadNotificationsCount, setUnreadNotificationsCount] =
        useState<number>(0);
    const [birthdayBadgeLabel, setBirthdayBadgeLabel] = useState<string | null>(
        null
    );

    const userLevelLabel = useMemo(() => {
        const raw =
            (user as any)?.level?.label ??
            (user as any)?.levelLabel ??
            (user as any)?.level ??
            (user as any)?.customerLevel?.label ??
            (user as any)?.customerLevel ??
            (user as any)?.tier?.label ??
            (user as any)?.tier ??
            null;

        const s = String(raw ?? '').trim();
        if (!s) return null;
        return s.length > 12 ? `${s.slice(0, 12)}…` : s;
    }, [user]);

    const userLevelIcon = useMemo(() => {
        const l = String(userLevelLabel ?? '').toLowerCase();
        if (l.includes('diam')) return 'diamond';
        if (l.includes('ouro')) return 'trophy';
        if (l.includes('prata')) return 'certificate';
        return 'star';
    }, [userLevelLabel]);

    const userLevelKey = useMemo(() => normalizeCustomerLevelKey(user), [user]);

    const userLevelStyle = useMemo(() => {
        if (!userLevelKey) return null;
        const c = levelChipColors(userLevelKey);
        return {
            container: { backgroundColor: c.bg, borderColor: c.border },
            text: { color: c.text },
            icon: { color: c.text },
        } as const;
    }, [userLevelKey]);

    const onPressBirthday = useCallback(() => {
        if (!birthdayBadgeLabel) return;
        Alert.alert(
            'Parabéns pra você! 🎂',
            'Aproveite os descontos especiais\npara aniversariantes!'
        );
    }, [birthdayBadgeLabel]);

    const goCart = useCallback(() => {
        if (!companyIdRef.current) return;
        router.push('/client/cart');
    }, [router]);

    const goNotifications = useCallback(() => {
        if (!companyIdRef.current) return;
        router.push('/client/notifications');
    }, [router]);

    // -----------------------------
    // tela
    // -----------------------------
    const [search, setSearch] = useState('');
    const [items, setItems] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchingRef = useRef(false);
    const [dataReady, setDataReady] = useState(false);

    // ============================
    // 👀 Impressions (anti-spam)
    // ============================
    const seenPartnerIdsRef = useRef<Set<string>>(new Set());

    // ✅ page_viewed (dedupe)
    const lastViewedKeyRef = useRef<string>('');

    const trackPageViewed = useCallback(() => {
        if (!companyIdRef.current) return;

        const page = normalizePage(pathname || '/');
        const key = page;

        if (lastViewedKeyRef.current === key) return;
        lastViewedKeyRef.current = key;

        try {
            trackEvent('page_viewed', {
                page,
                platform: 'mobile',
                companyId: companyIdRef.current,
            });
        } catch {}
    }, [pathname]);

    const TOP_OFFSET = insets.top + STICKY_ROW_H;

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

    const openPartner = useCallback(
        (id: string) => {
            const cid = companyIdRef.current;
            if (cid) {
                try {
                    trackEvent('partner_click', {
                        page: normalizePage(pathname || '/'),
                        from: 'partners',
                        partnerId: id,
                        companyId: cid,
                    });
                } catch {}
            }

            router.push({
                pathname: '/(app)/(tabs)/partners/[id]',
                params: { id },
            });
        },
        [router, pathname]
    );

    const fetchPartners = useCallback(async () => {
        const cid = companyIdRef.current;
        if (!cid) return;

        if (fetchingRef.current) return;
        fetchingRef.current = true;

        try {
            setLoading(true);

            const raw = await api.get(
                '/api/mobile/partners',
                withTenantHeaders()
            );

            // ✅ funciona com AxiosResponse (raw.data) e com wrapper (raw)
            const payload: any =
                (raw as any)?.data && typeof (raw as any).data === 'object'
                    ? (raw as any).data
                    : raw;

            const list: ApiPartner[] = Array.isArray(payload?.items)
                ? (payload.items as ApiPartner[])
                : Array.isArray(payload?.partners)
                  ? (payload.partners as ApiPartner[])
                  : [];

            const mapped: Partner[] = list
                .map((p) => {
                    const id = String((p as any)?.id ?? '').trim();
                    if (!id) return null;

                    const logo =
                        normalizeApiImageUrl((p as any)?.logoUrl) || null;

                    const soRaw = (p as any)?.sortOrder;
                    const soNum = Number(
                        String(soRaw ?? '')
                            .trim()
                            .replace(',', '.')
                    );
                    const sortOrder = Number.isFinite(soNum)
                        ? Math.max(0, Math.floor(soNum))
                        : 100;

                    return {
                        id,
                        name: String((p as any)?.name ?? 'Parceiro'),
                        logo,
                        discountPct: Number((p as any)?.discountPct ?? 0),
                        description: (p as any)?.description
                            ? String((p as any).description)
                            : null,
                        sortOrder,
                    };
                })
                .filter(Boolean) as Partner[];

            // ✅ garante sortOrder no client (fallback se backend vier bagunçado)
            mapped.sort((a, b) => {
                if (a.sortOrder !== b.sortOrder)
                    return a.sortOrder - b.sortOrder;

                const an = String(a.name ?? '').toLowerCase();
                const bn = String(b.name ?? '').toLowerCase();
                if (an < bn) return -1;
                if (an > bn) return 1;

                return String(a.id).localeCompare(String(b.id));
            });

            setItems(mapped);

            try {
                trackEvent('partners_loaded', {
                    page: normalizePage(pathname || '/'),
                    count: mapped.length,
                    companyId: cid,
                });

                if (mapped.length === 0) {
                    trackEvent('partners_empty', {
                        page: normalizePage(pathname || '/'),
                        companyId: cid,
                    });
                }
            } catch {}
        } catch (err: any) {
            console.log(
                '[partners] fetch error:',
                err?.data ?? err?.message ?? err
            );

            const cid = companyIdRef.current;

            if (cid) {
                try {
                    trackEvent('partners_fetch_error', {
                        page: normalizePage(pathname || '/'),
                        message: String(err?.message ?? 'error'),
                        companyId: cid,
                    });
                } catch {}
            }

            const msg =
                err?.data?.error ||
                err?.message ||
                'Não foi possível carregar os parceiros.';
            Alert.alert('Erro', String(msg));
            setItems([]);
        } finally {
            setLoading(false);
            fetchingRef.current = false;
            setDataReady(true);
        }
    }, [pathname, withTenantHeaders]);

    // ✅ sacolinha
    const fetchPendingCart = useCallback(async () => {
        try {
            const res: any = await api.get(
                '/api/mobile/orders?view=bag&limit=1',
                withTenantHeaders()
            );
            const list = (res?.orders ?? res?.items ?? []) as any[];
            const first = Array.isArray(list) && list.length ? list[0] : null;
            const count = first ? sumQtyFromOrder(first) : 0;
            setPendingCartCount(count);
        } catch {
            setPendingCartCount(0);
        }
    }, [withTenantHeaders]);

    // ✅ notificações agregadas (reviews + push não lido)
    const fetchUnreadNotificationsCount = useCallback(async () => {
        try {
            const res = await api.get<NotificationsSummaryResponse>(
                '/api/mobile/notifications',
                withTenantHeaders()
            );

            const count =
                res?.ok && Number.isFinite(Number(res?.unreadCount))
                    ? Number(res.unreadCount)
                    : 0;

            setUnreadNotificationsCount(count);
        } catch {
            setUnreadNotificationsCount(0);
        }
    }, [withTenantHeaders]);

    // ✅ badge de aniversário (mesmo método do Home)
    const fetchBirthdayBadge = useCallback(async () => {
        try {
            const res: any = await api.get(
                '/api/mobile/products?limit=4',
                withTenantHeaders()
            );
            const rawList =
                (Array.isArray(res?.items) ? res.items : null) ??
                (Array.isArray(res?.products) ? res.products : null) ??
                (Array.isArray(res?.data?.items) ? res.data.items : null) ??
                (Array.isArray(res?.data?.products)
                    ? res.data.products
                    : null) ??
                [];

            const birthdayFromApi = rawList.find(
                (p: any) =>
                    p?.badge?.type === 'BIRTHDAY' &&
                    String(p?.badge?.label ?? '')
            );

            const birthdayLabel = birthdayFromApi?.badge?.label
                ? String(birthdayFromApi.badge.label).trim()
                : null;

            setBirthdayBadgeLabel(birthdayLabel || null);
        } catch {
            setBirthdayBadgeLabel(null);
        }
    }, [withTenantHeaders]);

    useFocusEffect(
        useCallback(() => {
            let alive = true;

            (async () => {
                seenPartnerIdsRef.current = new Set();
                lastViewedKeyRef.current = '';

                setDataReady(false);

                if (!companyIdRef.current) {
                    try {
                        await refreshMe();
                    } catch {}

                    if (alive && !companyIdRef.current) {
                        if (!warnedMissingCompanyRef.current) {
                            warnedMissingCompanyRef.current = true;
                            Alert.alert(
                                'Atenção',
                                'Não foi possível identificar o estabelecimento (companyId). Faça login novamente ou tente atualizar seu perfil.'
                            );
                        }
                        setDataReady(true);
                        return;
                    }
                }

                trackPageViewed();
                fetchPartners();

                // ✅ header counts
                fetchPendingCart();
                fetchUnreadNotificationsCount();
                fetchBirthdayBadge();
            })();

            return () => {
                alive = false;
                lastViewedKeyRef.current = '';
            };
        }, [
            refreshMe,
            fetchPartners,
            trackPageViewed,
            fetchPendingCart,
            fetchUnreadNotificationsCount,
            fetchBirthdayBadge,
        ])
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter((p) => p.name.toLowerCase().includes(q));
    }, [items, search]);

    const keyPartner = useCallback((item: Partner) => item.id, []);

    const renderPartner = useCallback(
        ({ item }: ListRenderItemInfo<Partner>) => (
            <PartnerTile item={item} onOpen={openPartner} />
        ),
        [openPartner]
    );

    // ✅ search tracking com debounce (mesmo padrão)
    const searchTimerRef = useRef<any>(null);
    const onChangeSearch = useCallback(
        (v: string) => {
            setSearch(v);

            const cid = companyIdRef.current;
            if (!cid) return;

            try {
                if (searchTimerRef.current)
                    clearTimeout(searchTimerRef.current);
                searchTimerRef.current = setTimeout(() => {
                    trackEvent('search_change', {
                        page: normalizePage(pathname || '/'),
                        queryLen: String(v ?? '').trim().length,
                        companyId: cid,
                    });
                }, 600);
            } catch {}
        },
        [pathname]
    );

    // ✅ Impressions na grid
    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 60,
        minimumViewTime: 250,
    }).current;

    const onViewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
            const cid = companyIdRef.current;
            if (!cid) return;

            try {
                for (const v of viewableItems) {
                    const item = v?.item as Partner | undefined;
                    if (!item?.id) continue;
                    if (!v?.isViewable) continue;

                    if (!seenPartnerIdsRef.current.has(item.id)) {
                        seenPartnerIdsRef.current.add(item.id);

                        trackEvent('partner_impression', {
                            page: normalizePage(pathname || '/'),
                            partnerId: item.id,
                            placement: 'grid',
                            hasLogo: !!item.logo,
                            discountPct: Number(item.discountPct ?? 0),
                            companyId: cid,
                        });
                    }
                }
            } catch {}
        }
    ).current;

    const ListHeader = useMemo(
        () => (
            <PartnersHeader
                topBounceHeight={topBounceHeight}
                topOffset={TOP_OFFSET}
                search={search}
                onChangeSearch={onChangeSearch}
                loading={loading}
                totalCount={filtered.length}
            />
        ),
        [
            TOP_OFFSET,
            loading,
            search,
            onChangeSearch,
            topBounceHeight,
            filtered.length,
        ]
    );

    return (
        <ScreenGate dataReady={dataReady} skeleton={<PartnersSkeleton />}>
            <View style={S.page}>
                <AppTopBar
                    insetsTop={insets.top}
                    displayName={displayName}
                    meLoading={meLoading}
                    avatarUrl={avatarUrl}
                    birthdayBadgeLabel={birthdayBadgeLabel}
                    onPressBirthday={onPressBirthday}
                    userLevelLabel={userLevelLabel}
                    userLevelIcon={userLevelIcon as any}
                    userLevelStyle={userLevelStyle}
                    onPressLevel={() => {
                        const cid = companyIdRef.current;
                        trackEvent('action_click', {
                            from: 'home',
                            action: 'level_chip',
                            level: userLevelLabel,
                            companyId: cid ?? null,
                        });
                    }}
                    pendingCartCount={pendingCartCount}
                    unreadNotificationsCount={unreadNotificationsCount}
                    onPressCart={goCart}
                    onPressNotifications={goNotifications}
                />

                <FlatList
                    data={filtered}
                    keyExtractor={keyPartner}
                    renderItem={renderPartner}
                    numColumns={2}
                    columnWrapperStyle={S.gridRow}
                    showsVerticalScrollIndicator={false}
                    style={S.list}
                    contentContainerStyle={S.listContent}
                    ListHeaderComponent={ListHeader}
                    ListEmptyComponent={
                        <View style={{ padding: 18 }}>
                            <Text
                                style={{
                                    color: UI.colors.black45,
                                    textAlign: 'center',
                                    fontWeight: '600',
                                }}
                            >
                                {loading
                                    ? 'Carregando…'
                                    : 'Nenhum parceiro encontrado.'}
                            </Text>
                        </View>
                    }
                    removeClippedSubviews
                    initialNumToRender={6}
                    maxToRenderPerBatch={8}
                    windowSize={7}
                    updateCellsBatchingPeriod={50}
                    viewabilityConfig={viewabilityConfig}
                    onViewableItemsChanged={onViewableItemsChanged}
                />
            </View>
        </ScreenGate>
    );
}

const S = StyleSheet.create({
    page: { flex: 1, backgroundColor: UI.colors.bg },

    fixedTop: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        zIndex: 999,
    },

    // ✅ header padrão Home
    stickyRow: {
        height: STICKY_ROW_H,
        backgroundColor: UI.colors.bg,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },

    profileRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    hello: { color: UI.colors.textMuted, fontSize: 12, fontWeight: '700' },
    name: { color: UI.colors.text, fontSize: 16, fontWeight: '700' },

    avatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 2,
        borderColor: UI.brand.primary,
    },

    avatarFallback: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: UI.brand.primary,
        borderWidth: 2,
        borderColor: UI.brand.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },

    topRightRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },

    iconBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: UI.colors.cardBorder,
    },

    levelBtn: { paddingTop: 7 },

    levelMiniText: {
        marginTop: 2,
        fontSize: 9.5,
        fontWeight: '900',
        color: UI.colors.white,
        includeFontPadding: false,
        textAlign: 'center',
        maxWidth: 38,
    },

    badge: {
        position: 'absolute',
        top: -6,
        right: -6,
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        borderRadius: 999,
        backgroundColor: UI.brand.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: UI.colors.bg,
    },

    badgeText: {
        color: UI.colors.white,
        fontSize: 11,
        fontWeight: '900',
        includeFontPadding: false,
        textAlignVertical: 'center',
    },

    birthdayDot: {
        position: 'absolute',
        top: -6,
        right: -6,
        minWidth: 18,
        height: 18,
        paddingHorizontal: 5,
        borderRadius: 999,
        backgroundColor: 'rgba(124,108,255,0.95)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: UI.colors.bg,
    },

    birthdayDotText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '900',
        includeFontPadding: false,
        textAlignVertical: 'center',
    },

    list: { flex: 1, backgroundColor: UI.colors.white },
    listContent: { paddingBottom: 28 },

    topBounceDark: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: -1400,
        backgroundColor: UI.colors.bg,
    },

    darkShell: {
        backgroundColor: UI.colors.bg,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        overflow: 'hidden',
    },
    darkInner: {
        paddingHorizontal: UI.spacing.screenX,
        paddingBottom: UI.spacing.screenX,
    },

    filtersCard: {
        padding: UI.spacing.cardPad,
        marginTop: 14,
    },

    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },

    searchIcon: {
        width: 36,
        height: 36,
        borderRadius: UI.radius.input,
        backgroundColor: UI.colors.overlay10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: UI.colors.cardBorder,
    },

    searchInput: {
        flex: 1,
        height: 40,
        color: UI.colors.text,
        fontSize: 15,
        paddingHorizontal: 6,
        fontWeight: '500',
    },

    whiteArea: { backgroundColor: UI.colors.white },
    whiteContent: { paddingHorizontal: UI.spacing.screenX, paddingTop: 18 },

    sectionRow: {
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: UI.brand.primaryText,
    },
    sectionMeta: {
        color: UI.colors.black45,
        fontSize: 12,
        fontWeight: '600',
    },

    gridRow: {
        paddingHorizontal: UI.spacing.screenX,
        justifyContent: 'space-between',
    },

    card: {
        width: '48.2%',
        marginBottom: 14,
        borderRadius: UI.radius.card,
        backgroundColor: UI.colors.white,
        borderWidth: 1,
        borderColor: UI.colors.black08,
        padding: 12,
    },

    cardTop: {
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: UI.colors.black05,
        position: 'relative',
        height: 124,
        alignItems: 'center',
        justifyContent: 'center',
    },

    logoWrap: { width: '100%', height: '100%' },

    logoImg: { width: '100%', height: '100%', resizeMode: 'cover' },

    logoFallback: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: UI.brand.primary,
    },

    pill: {
        position: 'absolute',
        left: 10,
        top: 10,
        maxWidth: 190,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: 'rgba(20,20,20,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        zIndex: 2,
    },
    pillText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.2,
    },

    title: {
        marginTop: 10,
        fontSize: 14,
        fontWeight: '700',
        color: UI.brand.primaryText,
        lineHeight: 18,
        minHeight: 36,
    },

    desc: {
        marginTop: 6,
        fontSize: 12,
        fontWeight: '700',
        color: UI.colors.black45,
        lineHeight: 16,
        minHeight: 32,
    },

    descMuted: {
        marginTop: 6,
        fontSize: 12,
        fontWeight: '700',
        color: UI.colors.black45,
        lineHeight: 16,
        minHeight: 32,
    },

    footer: { marginTop: 12, gap: 10 },

    btnCenterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },

    detailsBtn: {
        height: 40,
        borderRadius: 999,
        paddingHorizontal: 12,
        backgroundColor: UI.colors.white,
        borderWidth: 1,
        borderColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
    },

    detailsBtnText: {
        color: '#141414',
        fontSize: 13,
        fontWeight: '600',
    },
});
