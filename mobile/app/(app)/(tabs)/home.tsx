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
    Alert,
    ViewToken,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { UI } from '../../../src/theme/client-theme';
import { useAuth } from '../../../src/auth/auth-context';
import { api } from '../../../src/services/api';

import { ScreenGate } from '../../../src/components/layout/ScreenGate';
import { HomeSkeleton } from '../../../src/components/loading/HomeSkeleton';
import {
    AppTopBar,
    STICKY_ROW_H as TOPBAR_H,
} from '../../../src/components/layout/AppTopBar';

const STICKY_ROW_H = TOPBAR_H;

/**
 * ===========================================
 * 📈 Analytics (base do mapa de calor)
 * ===========================================
 * - Envia eventos simples para o backend.
 * - Já preparado para atribuição de push via contexto global opcional.
 *
 * Próximo passo (em outro arquivo): preencher `globalThis.__lastPushContext`
 * quando um push for visualizado.
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
        // ✅ multi-tenant: analytics também não pode vazar sem tenant
        if (!companyId) return;

        const context = ctx ?? getAnalyticsContext();

        // ✅ envia tenant no header
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

type ProductBadge =
    | { type: 'BIRTHDAY'; label: string }
    | { type: 'LEVEL'; label: string }
    | null;

type Product = {
    id: string;
    name: string;

    // ✅ compat: preço final continua existindo (mas UI usa base/final)
    price: number;

    // ✅ novo motor de preço
    basePrice?: number;
    finalPrice?: number;
    hasDiscount?: boolean;
    badge?: ProductBadge;

    imageUrl: string | null;
    unitName: string;
    isOutOfStock: boolean;
};

type Partner = {
    id: string;
    name: string;
    logoUrl: string | null;
    discountPct: number;
    description: string | null;
    sortOrder?: number | null;
};

type HistoryItem = {
    id: string;
    title: string;
    description: string;
    date: string;
    icon: string;
};

type NextAppt = {
    id: string;
    serviceName: string;
    unitName: string;
    barberName: string;
    startsAtLabel: string;
    statusLabel: string;
    status?: string | null;
    unitId?: string | null;
    serviceId?: string | null;
    barberId?: string | null;
    canReschedule?: boolean;
    canCancel?: boolean;
    cancellationFeeEligible?: boolean;
    cancellationFeeNotice?: string | null;
    usesPlanCredit?: boolean;
    planCancellationNotice?: string | null;
    scheduleAt?: string | Date | null;
    createdAt?: string | Date | null;
};

type NotificationsSummaryResponse = {
    ok: boolean;
    unreadCount?: number;
    error?: string;
};

// -----------------------------
// 💰 dinheiro: sem “,00” quando inteiro
// -----------------------------
function formatMoneySmartBRL(value: number) {
    const v = Number(value ?? 0);
    const safe = Number.isFinite(v) ? v : 0;

    const isInt = Math.abs(safe - Math.round(safe)) < 1e-9;

    try {
        return safe.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: isInt ? 0 : 2,
            maximumFractionDigits: isInt ? 0 : 2,
        });
    } catch {
        const fixed = isInt ? String(Math.round(safe)) : safe.toFixed(2);
        return `R$ ${fixed.replace('.', ',')}`;
    }
}

function sumQtyFromOrder(order: any): number {
    const items = Array.isArray(order?.items) ? order.items : [];
    const total = items.reduce((acc: number, it: any) => {
        const q = Number(it?.quantity ?? 0);
        return acc + (Number.isFinite(q) ? q : 0);
    }, 0);
    return total > 0 ? total : 0;
}

function safeNumber(v: any, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

// =======================
// 🎨 NÍVEL DO CLIENTE (cores copiadas do Admin)
// =======================
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

// ✅ normaliza url de imagem vinda da API (mesmo padrão de partners/products)
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
    const path = s.startsWith('/') ? s : `/${s}`;

    if (!base) return path;

    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}${path}`;
}

const ProductCard = memo(function ProductCard({
    item,
    showDivider,
    onPressDetails,
}: {
    item: Product;
    showDivider: boolean;
    onPressDetails: (id: string) => void;
}) {
    const goDetails = useCallback(() => {
        onPressDetails(item.id);
    }, [item.id, onPressDetails]);

    const pricing = useMemo(() => {
        const base = safeNumber(item.basePrice, NaN);
        const final = safeNumber(item.finalPrice, NaN);

        const hasBase = Number.isFinite(base);
        const hasFinal = Number.isFinite(final);

        if (hasBase && hasFinal) {
            const hasDiscount = !!item.hasDiscount && final < base;

            const economyPct =
                hasDiscount && base > 0
                    ? Math.round(((base - final) / base) * 100)
                    : 0;

            return {
                base,
                final,
                hasDiscount,
                economyPct,
            };
        }

        const p = safeNumber(item.price, 0);
        return {
            base: p,
            final: p,
            hasDiscount: false,
            economyPct: 0,
        };
    }, [item.basePrice, item.finalPrice, item.hasDiscount, item.price]);

    const baseLabel = useMemo(
        () => formatMoneySmartBRL(pricing.base),
        [pricing.base]
    );
    const finalLabel = useMemo(
        () => formatMoneySmartBRL(pricing.final),
        [pricing.final]
    );

    const economyPctLabel = useMemo(() => {
        const v = Number(pricing.economyPct ?? 0);
        if (!Number.isFinite(v) || v <= 0) return null;
        return `${Math.max(0, Math.min(99, Math.round(v)))}%`;
    }, [pricing.economyPct]);

    return (
        <Pressable
            onPress={goDetails}
            style={S.productCard}
            android_ripple={{}}
        >
            <View style={{ position: 'relative' }}>
                <Image
                    source={{
                        uri:
                            item.imageUrl ||
                            'https://picsum.photos/seed/product-placeholder/400/300',
                    }}
                    style={S.productImage}
                    fadeDuration={0}
                />

                {item.badge?.label ? (
                    <View style={[S.badgePill]}>
                        <Text style={S.badgePillText} numberOfLines={1}>
                            {item.badge.label}
                        </Text>
                    </View>
                ) : null}

                {item.isOutOfStock ? (
                    <View style={S.outOfStockPill}>
                        <Text style={S.outOfStockText}>ESGOTADO</Text>
                    </View>
                ) : null}
            </View>

            <View style={S.productBody}>
                <Text style={S.productName} numberOfLines={2}>
                    {item.name}
                </Text>

                <Text style={S.productUnit} numberOfLines={1}>
                    {item.unitName}
                </Text>

                {pricing.hasDiscount ? (
                    <View style={S.priceStack}>
                        <Text style={S.basePriceStriked} numberOfLines={1}>
                            De: {baseLabel}
                        </Text>

                        <Text style={S.finalPrice} numberOfLines={1}>
                            Por: {finalLabel}
                        </Text>

                        {economyPctLabel ? (
                            <Text style={S.economyText} numberOfLines={1}>
                                Economia: {economyPctLabel}
                            </Text>
                        ) : null}
                    </View>
                ) : (
                    <Text style={S.productPrice} numberOfLines={1}>
                        {finalLabel}
                    </Text>
                )}

                <View style={S.productFooter}>
                    <Pressable
                        onPress={goDetails}
                        style={S.detailsBtn}
                        hitSlop={8}
                    >
                        <View style={S.btnCenterRow}>
                            <Text style={S.detailsBtnText}>Ver detalhes</Text>
                            <FontAwesome
                                name="angle-right"
                                size={18}
                                color="#141414"
                                style={{ marginLeft: 8 }}
                            />
                        </View>
                    </Pressable>
                </View>
            </View>

            {showDivider ? <View style={S.productDivider} /> : null}
        </Pressable>
    );
});

const PartnerCard = memo(function PartnerCard({
    item,
    onPressDetails,
}: {
    item: Partner;
    onPressDetails: (id: string) => void;
}) {
    const pct = Number(item.discountPct ?? 0);
    const pctLabel =
        Number.isFinite(pct) && pct > 0 ? `${Math.round(pct)}% OFF` : null;

    const goDetails = useCallback(() => {
        onPressDetails(item.id);
    }, [item.id, onPressDetails]);

    return (
        <Pressable
            onPress={goDetails}
            style={S.partnerCard}
            android_ripple={{}}
        >
            <View style={{ position: 'relative' }}>
                <Image
                    source={{
                        uri:
                            item.logoUrl ||
                            'https://picsum.photos/seed/partner-placeholder/400/300',
                    }}
                    style={S.partnerImage}
                    fadeDuration={0}
                />

                {pctLabel ? (
                    <View style={S.partnerPill}>
                        <Text style={S.partnerPillText} numberOfLines={1}>
                            {pctLabel}
                        </Text>
                    </View>
                ) : null}
            </View>

            <View style={S.partnerBody}>
                <Text style={S.partnerName} numberOfLines={2}>
                    {item.name}
                </Text>

                <Text style={S.partnerDesc} numberOfLines={2}>
                    {item.description || 'Toque para ver detalhes e regras.'}
                </Text>

                <View style={S.partnerFooter}>
                    <Pressable
                        onPress={goDetails}
                        style={S.detailsBtn}
                        hitSlop={8}
                    >
                        <View style={S.btnCenterRow}>
                            <Text style={S.detailsBtnText}>Ver parceiro</Text>
                            <FontAwesome
                                name="angle-right"
                                size={18}
                                color="#141414"
                                style={{ marginLeft: 8 }}
                            />
                        </View>
                    </Pressable>
                </View>
            </View>

            <View style={S.partnerDivider} />
        </Pressable>
    );
});

const HistoryRow = memo(function HistoryRow({
    item,
    showDivider,
}: {
    item: HistoryItem;
    showDivider: boolean;
}) {
    return (
        <View style={S.historyItem}>
            <View style={S.historyLeft}>
                <View style={S.historyIcon}>
                    <FontAwesome
                        name={item.icon as any}
                        size={18}
                        color={UI.colors.historyIconColor}
                    />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={S.historyTitle}>{item.title}</Text>
                    <Text style={S.historyDesc}>{item.description}</Text>
                    <Text style={S.historyDate}>{item.date}</Text>
                </View>
            </View>

            {showDivider ? <View style={S.historyDivider} /> : null}
        </View>
    );
});

export default function Home() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const { user, meLoading, companyId, refreshMe } = useAuth();

    const companyIdRef = useRef<string | null>(companyId ?? null);
    useEffect(() => {
        companyIdRef.current = companyId ?? null;
    }, [companyId]);

    const warnedMissingCompanyRef = useRef(false);

    const displayName = useMemo(
        () => user?.name || user?.email || 'Cliente',
        [user?.name, user?.email]
    );

    const avatarUrl = useMemo(() => {
        const raw = String(user?.image ?? '').trim();
        return raw.length ? raw : null; // null = sem foto (cadastro manual)
    }, [user?.image]);

    const hasAvatar = useMemo(() => !!avatarUrl, [avatarUrl]);

    // ✅ helper: sempre envia x-company-id nas requests (tenant-safe)
    const withTenantHeaders = useCallback(() => {
        const cid = companyIdRef.current;
        return cid ? { headers: { 'x-company-id': cid } } : undefined;
    }, []);

    const [appointments, setAppointments] = useState<NextAppt[]>([]);
    const [nextLoading, setNextLoading] = useState(true);

    const [historyPreview, setHistoryPreview] = useState<HistoryItem[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const fetchingPartnersRef = useRef(false);
    const didPartnersRef = useRef(false);

    const [pendingCartOrderId, setPendingCartOrderId] = useState<string | null>(
        null
    );
    const [pendingCartCount, setPendingCartCount] = useState<number>(0);
    const cartFetchingRef = useRef(false);

    const [unreadNotificationsCount, setUnreadNotificationsCount] =
        useState<number>(0);
    const notificationsFetchingRef = useRef(false);

    const [birthdayBadgeLabel, setBirthdayBadgeLabel] = useState<string | null>(
        null
    );

    const fetchingRef = useRef(false);
    const fetchingHistoryRef = useRef(false);
    const fetchingProductsRef = useRef(false);

    const didNextRef = useRef(false);
    const didHistoryRef = useRef(false);
    const didProductsRef = useRef(false);
    const didCartRef = useRef(false);
    const didNotificationsRef = useRef(false);
    const [dataReady, setDataReady] = useState(false);

    const resetGate = useCallback(() => {
        didNextRef.current = false;
        didHistoryRef.current = false;
        didProductsRef.current = false;
        didCartRef.current = false;
        didNotificationsRef.current = false;
        setDataReady(false);
        didPartnersRef.current = false;
    }, []);

    const recomputeReady = useCallback(() => {
        const ok =
            didNextRef.current &&
            didHistoryRef.current &&
            didProductsRef.current &&
            didPartnersRef.current &&
            didCartRef.current &&
            didNotificationsRef.current;

        if (ok) setDataReady(true);
    }, []);

    const fetchNext = useCallback(async () => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        try {
            setNextLoading(true);

            const res = await api.get<{
                ok: boolean;
                next?: NextAppt | null;
                appointments?: NextAppt[];
            }>('/api/mobile/me/appointments/next', withTenantHeaders());

            const rawAppointments =
                (Array.isArray((res as any)?.appointments)
                    ? (res as any).appointments
                    : null) ??
                (Array.isArray((res as any)?.data?.appointments)
                    ? (res as any).data.appointments
                    : null) ??
                [];

            const normalizedAppointments = rawAppointments.map((item: any) => ({
                ...item,
                canReschedule:
                    typeof item?.canReschedule === 'boolean'
                        ? item.canReschedule
                        : typeof item?.rules?.canReschedule === 'boolean'
                          ? item.rules.canReschedule
                          : true,

                canCancel:
                    typeof item?.canCancel === 'boolean'
                        ? item.canCancel
                        : true,

                usesPlanCredit:
                    typeof item?.usesPlanCredit === 'boolean'
                        ? item.usesPlanCredit
                        : false,

                planCancellationNotice:
                    typeof item?.planCancellationNotice === 'string'
                        ? item.planCancellationNotice
                        : null,
            }));

            setAppointments(normalizedAppointments);
        } catch {
            setAppointments([]);
        } finally {
            setNextLoading(false);
            fetchingRef.current = false;

            didNextRef.current = true;
            recomputeReady();
        }
    }, [recomputeReady, withTenantHeaders]);

    const fetchHistoryPreview = useCallback(async () => {
        if (fetchingHistoryRef.current) return;
        fetchingHistoryRef.current = true;

        try {
            const res = await api.get<{
                ok: boolean;
                items: HistoryItem[];
                _debug?: any;
            }>('/api/mobile/me/history/preview', withTenantHeaders());

            if (__DEV__) {
                console.log('[home] history preview', {
                    ok: res?.ok,
                    items: Array.isArray(res?.items) ? res.items.length : 0,
                    _debug: res?._debug,
                });
            }

            setHistoryPreview(
                res?.ok && Array.isArray(res?.items) ? res.items : []
            );
        } catch {
            setHistoryPreview([]);
        } finally {
            fetchingHistoryRef.current = false;

            didHistoryRef.current = true;
            recomputeReady();
        }
    }, [recomputeReady, withTenantHeaders]);

    const fetchProductsPreview = useCallback(async () => {
        if (fetchingProductsRef.current) return;
        fetchingProductsRef.current = true;

        try {
            const res = await api.get<{
                ok?: boolean;
                items?: any[];
                products?: any[];
                nextCursor?: string | null;
            }>('/api/mobile/products?limit=4', withTenantHeaders());

            const rawList =
                (Array.isArray(res?.items) ? res.items : null) ??
                (Array.isArray(res?.products) ? res.products : null) ??
                [];

            const birthdayFromApi = rawList.find(
                (p: any) =>
                    p?.badge?.type === 'BIRTHDAY' &&
                    String(p?.badge?.label ?? '')
            ) as any;

            const birthdayLabel = birthdayFromApi?.badge?.label
                ? String(birthdayFromApi.badge.label).trim()
                : null;

            setBirthdayBadgeLabel(birthdayLabel || null);

            const mapped: Product[] = rawList
                .slice(0, 4)
                .map((p: any) => {
                    const basePrice = safeNumber(p?.basePrice, NaN);
                    const finalPrice = safeNumber(p?.finalPrice, NaN);
                    const hasDiscount =
                        !!p?.hasDiscount &&
                        Number.isFinite(basePrice) &&
                        Number.isFinite(finalPrice) &&
                        finalPrice < basePrice;

                    const rawBadge: ProductBadge =
                        p?.badge && typeof p.badge === 'object'
                            ? {
                                  type:
                                      p.badge.type === 'BIRTHDAY'
                                          ? 'BIRTHDAY'
                                          : 'LEVEL',
                                  label: String(p.badge.label ?? '').trim(),
                              }
                            : null;

                    const badge: ProductBadge =
                        rawBadge?.type === 'BIRTHDAY' ? null : rawBadge;

                    const final = Number.isFinite(finalPrice)
                        ? finalPrice
                        : safeNumber(p?.price, 0);

                    return {
                        id: String(p?.id ?? ''),
                        name: String(p?.name ?? 'Produto'),
                        price: final,
                        basePrice: Number.isFinite(basePrice)
                            ? basePrice
                            : undefined,
                        finalPrice: Number.isFinite(finalPrice)
                            ? finalPrice
                            : undefined,
                        hasDiscount,
                        badge: badge?.label ? badge : null,
                        imageUrl: normalizeApiImageUrl(
                            typeof p?.imageUrl === 'string' ? p.imageUrl : null
                        ),

                        unitName: String(p?.unitName ?? '—'),
                        isOutOfStock: !!p?.isOutOfStock,
                    };
                })
                .filter((p) => !!p.id);

            setProducts(mapped);
        } catch {
            setProducts([]);
            setBirthdayBadgeLabel(null);
        } finally {
            fetchingProductsRef.current = false;

            didProductsRef.current = true;
            recomputeReady();
        }
    }, [recomputeReady, withTenantHeaders]);

    const fetchPartnersPreview = useCallback(async () => {
        if (fetchingPartnersRef.current) return;
        fetchingPartnersRef.current = true;

        try {
            const cid = companyIdRef.current;

            const res = (await api.get(
                '/api/mobile/partners',
                withTenantHeaders()
            )) as any;

            const rawList =
                (Array.isArray(res?.items) ? res.items : null) ??
                (Array.isArray(res?.partners) ? res.partners : null) ??
                [];

            const mapped: Partner[] = rawList
                .map((p: any) => {
                    const id = String(p?.id ?? '').trim();
                    if (!id) return null;

                    const sortOrderRaw = Number(p?.sortOrder ?? 100000);
                    const sortOrder = Number.isFinite(sortOrderRaw)
                        ? sortOrderRaw
                        : 100000;

                    return {
                        id,
                        name: String(p?.name ?? 'Parceiro'),
                        // ✅ mesmo padrão da tela de Parceiros: normaliza (inclui baseURL/localhost)
                        logoUrl: normalizeApiImageUrl(p?.logoUrl) || null,
                        discountPct: Number(p?.discountPct ?? 0),
                        description: p?.description
                            ? String(p.description)
                            : null,
                        sortOrder,
                    };
                })
                .filter(Boolean)
                .sort((a: Partner, b: Partner) => {
                    const ao = Number(a.sortOrder ?? 100000);
                    const bo = Number(b.sortOrder ?? 100000);

                    if (ao !== bo) return ao - bo;

                    // desempate estável: nome
                    const an = String(a.name ?? '').toLowerCase();
                    const bn = String(b.name ?? '').toLowerCase();
                    if (an < bn) return -1;
                    if (an > bn) return 1;

                    // último desempate: id
                    return String(a.id).localeCompare(String(b.id));
                })
                .slice(0, 6) as Partner[];

            setPartners(mapped);

            // analytics de carregamento (opcional mas útil)
            trackEvent(
                'partners_loaded',
                {
                    page: 'home',
                    count: Array.isArray(rawList)
                        ? rawList.length
                        : mapped.length,

                    placement: 'home_carousel',
                },
                undefined,
                cid
            );
        } catch {
            setPartners([]);
        } finally {
            fetchingPartnersRef.current = false;

            didPartnersRef.current = true;
            recomputeReady();
        }
    }, [recomputeReady, withTenantHeaders]);

    const fetchPendingCart = useCallback(async () => {
        if (cartFetchingRef.current)
            return { id: null as string | null, count: 0 };
        cartFetchingRef.current = true;

        try {
            const res: any = await api.get(
                '/api/mobile/orders?view=bag&limit=1',
                withTenantHeaders()
            );

            const list = (res?.orders ?? res?.items ?? []) as any[];
            const first = Array.isArray(list) && list.length ? list[0] : null;

            const id = first?.id ? String(first.id) : null;
            const count = first ? sumQtyFromOrder(first) : 0;

            setPendingCartOrderId(id);
            setPendingCartCount(count);

            return { id, count };
        } catch {
            setPendingCartOrderId(null);
            setPendingCartCount(0);
            return { id: null as string | null, count: 0 };
        } finally {
            cartFetchingRef.current = false;

            didCartRef.current = true;
            recomputeReady();
        }
    }, [recomputeReady, withTenantHeaders]);

    const fetchUnreadNotificationsCount = useCallback(async () => {
        if (notificationsFetchingRef.current) return 0;
        notificationsFetchingRef.current = true;

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
            return count;
        } catch {
            setUnreadNotificationsCount(0);
            return 0;
        } finally {
            notificationsFetchingRef.current = false;

            didNotificationsRef.current = true;
            recomputeReady();
        }
    }, [recomputeReady, withTenantHeaders]);

    const markAllDoneForGate = useCallback(() => {
        didNextRef.current = true;
        didHistoryRef.current = true;
        didProductsRef.current = true;
        didCartRef.current = true;
        didNotificationsRef.current = true;
        didPartnersRef.current = true;
        setDataReady(true);
    }, []);

    useFocusEffect(
        useCallback(() => {
            let alive = true;

            resetGate();

            (async () => {
                if (!companyIdRef.current) {
                    try {
                        await refreshMe();
                    } catch {
                        // ignore
                    }
                }

                if (!alive) return;

                const cid = companyIdRef.current;

                if (!cid) {
                    if (!warnedMissingCompanyRef.current) {
                        warnedMissingCompanyRef.current = true;
                        Alert.alert(
                            'Atenção',
                            'Não foi possível identificar o estabelecimento (companyId). Faça login novamente ou tente atualizar seu perfil.'
                        );
                    }

                    markAllDoneForGate();
                    return;
                }

                trackEvent('page_viewed', { page: 'home' }, undefined, cid);

                fetchNext();
                fetchHistoryPreview();
                fetchProductsPreview();
                fetchPartnersPreview();
                fetchPendingCart();
                fetchUnreadNotificationsCount();
            })();

            return () => {
                alive = false;
            };
        }, [
            refreshMe,
            fetchNext,
            fetchHistoryPreview,
            fetchProductsPreview,
            fetchPendingCart,
            fetchUnreadNotificationsCount,
            resetGate,
            markAllDoneForGate,
        ])
    );

    const TOP_OFFSET = insets.top + STICKY_ROW_H;

    const headerSpacerStyle = useMemo(
        () => ({ height: TOP_OFFSET, backgroundColor: UI.colors.bg }),
        [TOP_OFFSET]
    );

    const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

    const handleStartBooking = useCallback(async () => {
        const cid = companyIdRef.current;

        try {
            trackEvent(
                'nav_click',
                { from: 'home', to: 'booking_start' },
                undefined,
                cid
            );

            const res = await api.get(
                '/api/mobile/me/plans/active',
                withTenantHeaders()
            );

            const activePlan =
                (res as any)?.plan ?? (res as any)?.data?.plan ?? null;

            const creditsRemaining = Number(activePlan?.creditsRemaining ?? 0);
            const nextSuggestedServiceName = String(
                activePlan?.nextSuggestedService?.serviceName ?? ''
            ).trim();

            const planTypeSnapshot = String(
                activePlan?.planTypeSnapshot ??
                    activePlan?.type ??
                    activePlan?.plan?.type ??
                    ''
            )
                .trim()
                .toUpperCase();

            const isSubscription = planTypeSnapshot === 'SUBSCRIPTION';

            if (activePlan && creditsRemaining > 0) {
                const creditsLabel = String(
                    activePlan?.creditsLabel ?? `0/${creditsRemaining}`
                ).trim();

                const assetLabel = isSubscription ? 'assinatura' : 'plano';
                const assetLabelPlural = isSubscription
                    ? 'créditos da assinatura'
                    : 'créditos do plano';

                const title = isSubscription
                    ? 'Usar assinatura?'
                    : 'Usar plano?';

                const message = nextSuggestedServiceName
                    ? `Você possui ${isSubscription ? 'uma assinatura ativa' : 'um plano ativo'} com ${creditsRemaining} crédito(s) disponível(is).\n\nCréditos: ${creditsLabel}\nPróximo serviço sugerido: ${nextSuggestedServiceName}\n\nDeseja agendar usando ${assetLabelPlural}?`
                    : `Você possui ${isSubscription ? 'uma assinatura ativa' : 'um plano ativo'} com ${creditsRemaining} crédito(s) disponível(is).\n\nCréditos: ${creditsLabel}\n\nDeseja agendar usando ${assetLabelPlural}?`;

                Alert.alert(title, message, [
                    {
                        text: isSubscription
                            ? 'Não usar assinatura'
                            : 'Não usar plano',
                        style: 'cancel',
                        onPress: () => {
                            trackEvent(
                                'action_click',
                                {
                                    from: 'home',
                                    action: isSubscription
                                        ? 'booking_without_subscription'
                                        : 'booking_without_plan',
                                    clientPlanId:
                                        activePlan?.clientPlanId ?? null,
                                    planTypeSnapshot,
                                },
                                undefined,
                                cid
                            );

                            router.push('/booking/unit');
                        },
                    },
                    {
                        text: isSubscription ? 'Usar assinatura' : 'Usar plano',
                        onPress: () => {
                            trackEvent(
                                'action_click',
                                {
                                    from: 'home',
                                    action: isSubscription
                                        ? 'booking_with_subscription'
                                        : 'booking_with_plan',
                                    clientPlanId:
                                        activePlan?.clientPlanId ?? null,
                                    planTypeSnapshot,
                                    suggestedServiceId:
                                        activePlan?.nextSuggestedService
                                            ?.serviceId ?? null,
                                    suggestedBalanceId:
                                        activePlan?.nextSuggestedService
                                            ?.balanceId ?? null,
                                },
                                undefined,
                                cid
                            );

                            router.push({
                                pathname: '/booking/unit',
                                params: {
                                    planMode: 'credit',
                                    clientPlanId: String(
                                        activePlan?.clientPlanId ?? ''
                                    ).trim(),
                                    suggestedServiceId: String(
                                        activePlan?.nextSuggestedService
                                            ?.serviceId ?? ''
                                    ).trim(),
                                    suggestedBalanceId: String(
                                        activePlan?.nextSuggestedService
                                            ?.balanceId ?? ''
                                    ).trim(),
                                    planType: planTypeSnapshot,
                                },
                            });
                        },
                    },
                ]);

                return;
            }

            router.push('/booking/unit');
        } catch {
            router.push('/booking/unit');
        }
    }, [router, withTenantHeaders]);

    const goToHistory = useCallback(() => {
        const cid = companyIdRef.current;
        trackEvent(
            'nav_click',
            { from: 'home', to: '/client/history' },
            undefined,
            cid
        );
        router.push('/client/history');
    }, [router]);

    const goToProducts = useCallback(() => {
        const cid = companyIdRef.current;
        trackEvent(
            'nav_click',
            { from: 'home', to: '/products' },
            undefined,
            cid
        );
        router.push('/products');
    }, [router]);

    const goToPartners = useCallback(() => {
        const cid = companyIdRef.current;
        trackEvent(
            'nav_click',
            { from: 'home', to: '/partners' },
            undefined,
            cid
        );
        router.push('/partners');
    }, [router]);

    const goToProductDetails = useCallback(
        (id: string) => {
            const cid = companyIdRef.current;

            trackEvent(
                'nav_click',
                {
                    from: 'home',
                    to: '/(app)/(tabs)/products/[id]',
                    productId: id,
                },
                undefined,
                cid
            );

            router.push({
                pathname: '/(app)/(tabs)/products/[id]',
                params: { id },
            });
        },
        [router]
    );

    const goToPartnerDetails = useCallback(
        (id: string) => {
            const cid = companyIdRef.current;

            trackEvent(
                'partner_click',
                {
                    from: 'home',
                    placement: 'home_carousel',
                    partnerId: id,
                },
                undefined,
                cid
            );

            router.push({
                pathname: '/(app)/(tabs)/partners/[id]',
                params: { id },
            });
        },
        [router]
    );

    const goCart = useCallback(async () => {
        const cid = companyIdRef.current;
        trackEvent(
            'nav_click',
            { from: 'home', to: '/client/cart' },
            undefined,
            cid
        );

        try {
            const currentId = pendingCartOrderId;
            if (currentId) {
                router.push({
                    pathname: '/client/cart',
                    params: { orderId: currentId },
                });
                return;
            }

            const fresh = await fetchPendingCart();
            if (fresh?.id) {
                router.push({
                    pathname: '/client/cart',
                    params: { orderId: fresh.id },
                });
                return;
            }

            router.push('/client/cart');
        } catch {
            router.push('/client/cart');
        }
    }, [fetchPendingCart, pendingCartOrderId, router]);

    const goNotifications = useCallback(() => {
        const cid = companyIdRef.current;
        trackEvent(
            'nav_click',
            { from: 'home', to: '/client/notifications' },
            undefined,
            cid
        );
        router.push('/client/notifications');
    }, [router]);

    const onPressReschedule = useCallback(
        (appointment: NextAppt) => {
            if (!appointment?.id) return;

            const cid = companyIdRef.current;

            trackEvent(
                'nav_click',
                {
                    from: 'home',
                    to: '/booking/unit',
                    action: 'reschedule',
                    appointmentId: appointment.id,
                },
                undefined,
                cid
            );

            router.push({
                pathname: '/booking/unit',
                params: { mode: 'edit', appointmentId: appointment.id },
            });
        },
        [router]
    );

    const cancelApiCall = useCallback(
        async (appointmentId: string) => {
            try {
                const cid = companyIdRef.current;

                trackEvent(
                    'action_click',
                    {
                        from: 'home',
                        action: 'cancel_appointment',
                        appointmentId,
                    },
                    undefined,
                    cid
                );

                const res = await api.post<{ ok: boolean; error?: string }>(
                    `/api/mobile/me/appointments/${appointmentId}/cancel`,
                    {},
                    withTenantHeaders()
                );

                if (!res?.ok) {
                    Alert.alert(
                        'Não foi possível cancelar',
                        res?.error || 'Tente novamente.'
                    );
                    return;
                }

                Alert.alert(
                    'Cancelado ✅',
                    'Seu agendamento foi cancelado com sucesso.'
                );
                await fetchNext();
                await fetchHistoryPreview();
            } catch (err: any) {
                const msg =
                    err?.data?.error ||
                    err?.message ||
                    'Erro ao cancelar. Tente novamente.';
                Alert.alert('Erro', String(msg));
            }
        },
        [fetchNext, fetchHistoryPreview, withTenantHeaders]
    );

    const onPressCancel = useCallback(
        (appointment: NextAppt) => {
            if (!appointment?.id) return;

            const usesPlanCredit = !!appointment.usesPlanCredit;
            const feeEligible = !!appointment.cancellationFeeEligible;

            const planNotice =
                appointment.planCancellationNotice?.trim() ||
                'Este cancelamento pode gerar o débito de 1 crédito do seu plano, conforme a política do estabelecimento.';

            const feeNotice =
                appointment.cancellationFeeNotice?.trim() ||
                'Este cancelamento pode gerar uma taxa de cancelamento, conforme a política do estabelecimento.';

            const message = usesPlanCredit
                ? `${planNotice}\n\nDeseja cancelar mesmo assim?`
                : feeEligible
                  ? `${feeNotice}\n\nDeseja cancelar mesmo assim?`
                  : 'Ao cancelar, este horário ficará livre na agenda.\n\nDeseja cancelar agora?';

            Alert.alert('Cancelar agendamento?', message, [
                { text: 'Voltar', style: 'cancel' },
                {
                    text: 'Cancelar',
                    style: 'destructive',
                    onPress: () => cancelApiCall(appointment.id),
                },
            ]);
        },
        [cancelApiCall]
    );

    const keyProduct = useCallback((item: Product) => item.id, []);
    const renderProduct = useCallback(
        ({ item, index }: ListRenderItemInfo<Product>) => (
            <ProductCard
                item={item}
                showDivider={index < products.length - 1}
                onPressDetails={goToProductDetails}
            />
        ),
        [goToProductDetails, products.length]
    );

    const seenPartnerIdsRef = useRef<Set<string>>(new Set());

    const keyPartner = useCallback((item: Partner) => item.id, []);

    const renderPartner = useCallback(
        ({ item }: ListRenderItemInfo<Partner>) => (
            <PartnerCard item={item} onPressDetails={goToPartnerDetails} />
        ),
        [goToPartnerDetails]
    );

    const onViewablePartnersChanged = useRef(
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

                        trackEvent(
                            'partner_impression',
                            {
                                page: 'home',
                                partnerId: item.id,
                                placement: 'home_carousel',
                                hasLogo: !!item.logoUrl,
                                discountPct: Number(item.discountPct ?? 0),
                            },
                            undefined,
                            cid
                        );
                    }
                }
            } catch {}
        }
    ).current;

    const partnersViewabilityConfig = useRef({
        itemVisiblePercentThreshold: 60,
        minimumViewTime: 250,
    }).current;

    const renderHistory = useCallback(
        ({ item, index }: ListRenderItemInfo<HistoryItem>) => (
            <HistoryRow
                item={item}
                showDivider={index < historyPreview.length - 1}
            />
        ),
        [historyPreview.length]
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
            container: {
                backgroundColor: c.bg,
                borderColor: c.border,
            },
            text: {
                color: c.text,
            },
            icon: {
                color: c.text,
            },
        } as const;
    }, [userLevelKey]);

    const Header = useMemo(() => {
        const hasAppointments = appointments.length > 0;

        return (
            <View>
                <View
                    pointerEvents="none"
                    style={[S.topBounceDark, { height: topBounceHeight }]}
                />

                <View style={headerSpacerStyle} />

                <View style={S.darkShell}>
                    <View style={S.darkInner}>
                        {hasAppointments ? (
                            <View style={S.heroCard}>
                                <View style={S.heroCardsWrap}>
                                    {appointments.map((appointment, index) => {
                                        const startsAtInline = String(
                                            appointment.startsAtLabel || ''
                                        ).replace(' • ', ' - ');

                                        const isInService =
                                            String(
                                                appointment.status || ''
                                            ).toUpperCase() === 'IN_SERVICE' ||
                                            String(
                                                appointment.status || ''
                                            ).toUpperCase() === 'ATENDIMENTO';

                                        const canReschedule =
                                            appointment.canReschedule !== false;

                                        const canCancel =
                                            appointment.canCancel !== false;

                                        const showActions = !isInService;

                                        const showDivider =
                                            index < appointments.length - 1;

                                        return (
                                            <View
                                                key={appointment.id}
                                                style={S.heroItemBlock}
                                            >
                                                <View style={S.heroSections}>
                                                    <View style={S.heroSection}>
                                                        <View
                                                            style={
                                                                S.heroTitleRow
                                                            }
                                                        >
                                                            <Text
                                                                style={
                                                                    S.heroTitle
                                                                }
                                                                numberOfLines={
                                                                    1
                                                                }
                                                            >
                                                                Seu agendamento
                                                                -{' '}
                                                                {startsAtInline}
                                                            </Text>
                                                        </View>

                                                        <Text
                                                            style={
                                                                S.apptService
                                                            }
                                                            numberOfLines={1}
                                                        >
                                                            {
                                                                appointment.serviceName
                                                            }{' '}
                                                            com{' '}
                                                            {
                                                                appointment.barberName
                                                            }
                                                        </Text>
                                                    </View>

                                                    <View style={S.heroSection}>
                                                        <View style={S.metaRow}>
                                                            <View
                                                                style={{
                                                                    flex: 1,
                                                                    paddingRight: 10,
                                                                }}
                                                            >
                                                                <Text
                                                                    style={
                                                                        S.apptMeta
                                                                    }
                                                                    numberOfLines={
                                                                        1
                                                                    }
                                                                >
                                                                    {
                                                                        appointment.unitName
                                                                    }
                                                                </Text>
                                                            </View>

                                                            <View
                                                                style={[
                                                                    S.statusPill,
                                                                    isInService
                                                                        ? S.statusPillInService
                                                                        : null,
                                                                ]}
                                                            >
                                                                <FontAwesome
                                                                    name={
                                                                        isInService
                                                                            ? 'play'
                                                                            : 'check'
                                                                    }
                                                                    size={12}
                                                                    color={
                                                                        UI
                                                                            .colors
                                                                            .black
                                                                    }
                                                                    style={{
                                                                        marginRight: 6,
                                                                    }}
                                                                />
                                                                <Text
                                                                    style={
                                                                        S.statusText
                                                                    }
                                                                >
                                                                    {isInService
                                                                        ? 'ATENDIMENTO'
                                                                        : appointment.statusLabel}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    </View>

                                                    {showActions ? (
                                                        <View
                                                            style={
                                                                S.heroSection
                                                            }
                                                        >
                                                            <View
                                                                style={
                                                                    S.actionsRow
                                                                }
                                                            >
                                                                {canReschedule ? (
                                                                    <Pressable
                                                                        style={
                                                                            S.actionBtn
                                                                        }
                                                                        onPress={() =>
                                                                            onPressReschedule(
                                                                                appointment
                                                                            )
                                                                        }
                                                                    >
                                                                        <Text
                                                                            style={
                                                                                S.actionText
                                                                            }
                                                                        >
                                                                            Alterar
                                                                        </Text>
                                                                    </Pressable>
                                                                ) : null}

                                                                {canCancel ? (
                                                                    <Pressable
                                                                        style={
                                                                            S.actionBtn
                                                                        }
                                                                        onPress={() =>
                                                                            onPressCancel(
                                                                                appointment
                                                                            )
                                                                        }
                                                                    >
                                                                        <Text
                                                                            style={
                                                                                S.actionText
                                                                            }
                                                                        >
                                                                            Cancelar
                                                                        </Text>
                                                                    </Pressable>
                                                                ) : null}
                                                            </View>
                                                        </View>
                                                    ) : null}
                                                </View>

                                                {showDivider ? (
                                                    <View
                                                        style={S.heroDivider}
                                                    />
                                                ) : null}
                                            </View>
                                        );
                                    })}

                                    <View style={S.heroNewBookingWrap}>
                                        <Pressable
                                            style={S.actionBtn}
                                            onPress={handleStartBooking}
                                        >
                                            <Text style={S.actionText}>
                                                NOVO AGENDAMENTO
                                            </Text>
                                        </Pressable>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <View style={S.heroCard}>
                                <View style={S.emptyApptBox}>
                                    <Text style={S.emptyApptText}>
                                        {nextLoading
                                            ? 'Carregando seu próximo horário…'
                                            : 'Agende seu horário.'}
                                    </Text>

                                    <View style={S.actionsRow}>
                                        <Pressable
                                            style={S.actionBtn}
                                            onPress={handleStartBooking}
                                            disabled={nextLoading}
                                        >
                                            <Text style={S.actionText}>
                                                {nextLoading
                                                    ? 'Aguarde…'
                                                    : 'NOVO AGENDAMENTO'}
                                            </Text>
                                        </Pressable>
                                    </View>
                                </View>
                            </View>
                        )}
                    </View>
                </View>

                <View style={S.whiteArea}>
                    <View style={S.whiteContent}>
                        <Text style={S.sectionTitle}>Produtos</Text>

                        {products.length === 0 ? (
                            <View style={{ paddingVertical: 10 }}>
                                <Text style={S.emptyProductsText}>
                                    Nenhum produto disponível no momento.
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={products}
                                keyExtractor={keyProduct}
                                renderItem={renderProduct}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                removeClippedSubviews
                                initialNumToRender={3}
                                maxToRenderPerBatch={4}
                                windowSize={5}
                            />
                        )}

                        <Pressable
                            style={S.allProductsBtn}
                            onPress={goToProducts}
                        >
                            <View style={S.btnCenterRow}>
                                <Text style={S.allProductsBtnText}>
                                    Ver todos os produtos
                                </Text>
                                <FontAwesome
                                    name="angle-right"
                                    size={18}
                                    color="#FFFFFF"
                                    style={{ marginLeft: 8 }}
                                />
                            </View>
                        </Pressable>

                        <View style={[S.sectionTitleSpacing]}>
                            <Text style={S.sectionTitle}>Parceiros</Text>

                            {partners.length === 0 ? (
                                <View style={{ paddingVertical: 10 }}>
                                    <Text style={S.emptyProductsText}>
                                        Nenhum parceiro disponível no momento.
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    <FlatList
                                        data={partners}
                                        keyExtractor={keyPartner}
                                        renderItem={renderPartner}
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        removeClippedSubviews
                                        initialNumToRender={3}
                                        maxToRenderPerBatch={4}
                                        windowSize={5}
                                        viewabilityConfig={
                                            partnersViewabilityConfig
                                        }
                                        onViewableItemsChanged={
                                            onViewablePartnersChanged
                                        }
                                    />

                                    {/* ✅ Botão igual ao de Produtos */}
                                    <Pressable
                                        style={S.allProductsBtn}
                                        onPress={goToPartners}
                                    >
                                        <View style={S.btnCenterRow}>
                                            <Text style={S.allProductsBtnText}>
                                                Ver todos os parceiros
                                            </Text>
                                            <FontAwesome
                                                name="angle-right"
                                                size={18}
                                                color="#FFFFFF"
                                                style={{ marginLeft: 8 }}
                                            />
                                        </View>
                                    </Pressable>
                                </>
                            )}
                        </View>

                        <View
                            style={[S.historyHeaderRow, S.sectionTitleSpacing]}
                        >
                            <Text style={S.historyTitleInline}>Histórico</Text>

                            <Pressable
                                style={S.allProductsBtnSmall}
                                onPress={goToHistory}
                            >
                                <View style={S.btnCenterRow}>
                                    <Text style={S.allProductsBtnText}>
                                        Ver mais
                                    </Text>
                                    <FontAwesome
                                        name="angle-right"
                                        size={18}
                                        color="#FFFFFF"
                                        style={{ marginLeft: 8 }}
                                    />
                                </View>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </View>
        );
    }, [
        appointments,
        handleStartBooking,
        goToHistory,
        goToProducts,
        headerSpacerStyle,
        keyProduct,
        nextLoading,
        onPressCancel,
        onPressReschedule,
        products.length,
        renderProduct,
        topBounceHeight,
    ]);

    const onPressBirthday = useCallback(() => {
        if (!birthdayBadgeLabel) return;

        const cid = companyIdRef.current;

        trackEvent(
            'action_click',
            { from: 'home', action: 'birthday_badge' },
            undefined,
            cid
        );

        Alert.alert(
            'Parabéns pra você! 🎂',
            'Aproveite os descontos especiais\npara aniversariantes!'
        );
    }, [birthdayBadgeLabel]);

    return (
        <ScreenGate dataReady={dataReady} skeleton={<HomeSkeleton />}>
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
                        trackEvent('action_click', {
                            from: 'home',
                            action: 'level_chip',
                            level: userLevelLabel,
                            companyId: companyId ?? null,
                        });
                    }}
                    pendingCartCount={pendingCartCount}
                    unreadNotificationsCount={unreadNotificationsCount}
                    onPressCart={goCart}
                    onPressNotifications={goNotifications}
                />

                <FlatList
                    data={historyPreview}
                    keyExtractor={(item) => item.id}
                    renderItem={renderHistory}
                    showsVerticalScrollIndicator={false}
                    style={S.list}
                    contentContainerStyle={S.listContent}
                    ListHeaderComponent={Header}
                    ListEmptyComponent={
                        <View style={S.emptyHistoryBox}>
                            <Text style={S.emptyHistoryText}>
                                Você ainda não tem histórico por aqui.
                            </Text>
                        </View>
                    }
                    removeClippedSubviews
                    initialNumToRender={6}
                    maxToRenderPerBatch={8}
                    windowSize={7}
                    updateCellsBatchingPeriod={50}
                />
            </View>
        </ScreenGate>
    );
}

const S = StyleSheet.create({
    page: { flex: 1, backgroundColor: UI.colors.bg },
    fixedTop: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 999 },

    stickyRow: {
        height: STICKY_ROW_H,
        backgroundColor: UI.colors.bg,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },

    profileRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    avatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 2,
        borderColor: UI.brand.primary,
    },
    hello: { color: UI.colors.textMuted, fontSize: 12, fontWeight: '700' },
    name: { color: UI.colors.text, fontSize: 16, fontWeight: '700' },

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
    listContent: { paddingBottom: 24 },

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

    heroCardsWrap: {
        gap: 18,
    },

    heroCard: {
        marginTop: 14,
        backgroundColor: UI.colors.heroCardBg,
        borderRadius: UI.radius.card,
        padding: UI.spacing.cardPad,
        borderWidth: 1,
        borderColor: UI.colors.heroCardBorder,
    },

    heroItemBlock: {
        gap: 0,
    },

    heroDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.10)',
        marginTop: 18,
    },

    heroNewBookingWrap: {
        marginTop: 22,
    },

    heroSections: { gap: 25 },
    heroSection: {},

    heroTitleRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 10,
    },

    heroTitle: { color: UI.colors.text, fontSize: 16, fontWeight: '600' },

    apptService: {
        color: UI.colors.text,
        fontSize: 16,
        fontWeight: '700',
        marginTop: 6,
    },

    apptMeta: { color: UI.colors.textDim, fontSize: 16, marginTop: 2 },

    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },

    statusPill: {
        flexDirection: 'row',
        backgroundColor: UI.buttons.action,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        alignItems: 'center',
    },

    statusPillInService: { backgroundColor: 'rgba(255,193,7,0.95)' },
    statusText: { color: UI.colors.black, fontSize: 12, fontWeight: '700' },

    actionsRow: { flexDirection: 'row', gap: 10 },
    actionBtn: {
        flex: 1,
        backgroundColor: UI.buttons.action,
        borderRadius: 999,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: UI.colors.cardBorder,
    },
    actionText: { color: '#000', fontWeight: '700', fontSize: 17 },

    emptyApptBox: { padding: 5, gap: 14 },

    emptyApptText: {
        color: UI.colors.text,
        fontSize: 17,
        fontWeight: '500',
        lineHeight: 18,
        textAlign: 'center',
    },

    whiteArea: { backgroundColor: UI.colors.white },
    whiteContent: { paddingHorizontal: UI.spacing.screenX, paddingTop: 18 },

    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
        color: UI.brand.primaryText,
    },

    historyTitleInline: {
        fontSize: 18,
        fontWeight: '600',
        color: UI.brand.primaryText,
        marginBottom: 0,
    },

    sectionTitleSpacing: { marginTop: 28 },

    historyHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },

    productCard: {
        width: 220,
        marginRight: 18,
        paddingRight: 18,
        position: 'relative',
    },

    productImage: {
        height: 140,
        borderRadius: UI.radius.input,
        marginBottom: 12,
        backgroundColor: 'rgba(0,0,0,0.05)',
    },

    badgePill: {
        position: 'absolute',
        left: 10,
        top: 10,
        maxWidth: 175,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: 'rgba(20,20,20,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
    },

    badgePillText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.2,
    },

    outOfStockPill: {
        position: 'absolute',
        right: 10,
        top: 10,
        backgroundColor: UI.brand.primary,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },

    outOfStockText: {
        color: UI.colors.white,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.4,
    },

    productBody: { flex: 1, minHeight: 128 },

    productName: {
        fontSize: 16,
        fontWeight: '600',
        color: UI.brand.primaryText,
    },

    productUnit: {
        marginTop: 6,
        fontSize: 12,
        fontWeight: '700',
        color: 'rgba(0,0,0,0.55)',
    },

    productPrice: {
        fontSize: 20,
        fontWeight: '700',
        color: UI.brand.primaryText,
        marginTop: 6,
    },

    priceStack: { marginTop: 6, gap: 2 },

    basePriceStriked: {
        fontSize: 13,
        fontWeight: '800',
        color: 'rgba(0,0,0,0.48)',
        textDecorationLine: 'line-through',
    },

    finalPrice: {
        fontSize: 16,
        fontWeight: '900',
        color: UI.brand.primaryText,
    },

    economyText: {
        marginTop: 1,
        fontSize: 12,
        fontWeight: '900',
        color: 'rgba(0,0,0,0.58)',
    },

    productFooter: { marginTop: 10, flex: 1, justifyContent: 'flex-end' },

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

    detailsBtnText: { color: '#141414', fontSize: 13, fontWeight: '600' },

    productDivider: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 1,
        backgroundColor: 'rgba(0,0,0,0.10)',
    },

    emptyProductsText: {
        color: 'rgba(0,0,0,0.55)',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
        paddingVertical: 10,
    },

    allProductsBtn: {
        marginTop: 18,
        height: 44,
        borderRadius: 999,
        paddingHorizontal: 14,
        backgroundColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
    },

    allProductsBtnSmall: {
        height: 44,
        borderRadius: 999,
        paddingHorizontal: 14,
        backgroundColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
    },

    allProductsBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

    historyItem: {
        paddingVertical: 16,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: UI.colors.white,
    },

    historyLeft: {
        flexDirection: 'row',
        gap: 14,
        flex: 1,
        alignItems: 'center',
    },

    historyIcon: {
        width: 36,
        height: 36,
        backgroundColor: UI.colors.historyIconBg,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },

    historyTitle: { fontWeight: '700', color: UI.brand.primaryText },
    historyDesc: { fontSize: 13, color: 'rgba(0,0,0,0.65)', marginTop: 2 },
    historyDate: { fontSize: 12, color: 'rgba(0,0,0,0.40)', marginTop: 2 },

    historyDivider: {
        position: 'absolute',
        left: UI.spacing.screenX,
        right: UI.spacing.screenX,
        bottom: 0,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.08)',
    },

    emptyHistoryBox: {
        paddingHorizontal: UI.spacing.screenX,
        paddingVertical: 18,
        alignItems: 'center',
        gap: 10,
    },

    emptyHistoryText: {
        color: 'rgba(0,0,0,0.55)',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
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

    partnersHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
    },

    partnerCard: {
        width: 220,
        marginRight: 18,
        paddingRight: 18,
        position: 'relative',
    },

    partnerImage: {
        height: 140,
        borderRadius: UI.radius.input,
        marginBottom: 12,
        backgroundColor: 'rgba(0,0,0,0.05)',
    },

    partnerPill: {
        position: 'absolute',
        left: 10,
        top: 10,
        maxWidth: 175,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: 'rgba(20,20,20,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
    },

    partnerPillText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.2,
    },

    partnerBody: { flex: 1, minHeight: 128 },

    partnerName: {
        fontSize: 16,
        fontWeight: '600',
        color: UI.brand.primaryText,
    },

    partnerDesc: {
        marginTop: 6,
        fontSize: 12,
        fontWeight: '700',
        color: 'rgba(0,0,0,0.55)',
        lineHeight: 16,
        minHeight: 32,
    },

    partnerFooter: { marginTop: 10, flex: 1, justifyContent: 'flex-end' },

    partnerDivider: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 1,
        backgroundColor: 'rgba(0,0,0,0.10)',
    },
});
