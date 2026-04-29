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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

import { UI, styles } from '../../../../src/theme/client-theme';
import { api } from '../../../../src/services/api';

import { ScreenGate } from '../../../../src/components/layout/ScreenGate';
import { ProductDetailsSkeleton } from '../../../../src/components/loading/ProductDetailsSkeleton';

const HERO_H = 320;

/**
 * ===========================================
 * 📈 Analytics (Produto: detalhe)
 * ===========================================
 * Silencioso, não quebra UX.
 * Preparado para contexto de push (quando existir).
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
    ctx?: AnalyticsContext
) {
    try {
        const context = ctx ?? getAnalyticsContext();

        await api.post(
            '/api/mobile/analytics/events',
            {
                name,
                ts: safeNowISO(),
                context,
                payload,
            },
            {}
        );
    } catch {
        // silencioso: analytics nunca pode quebrar UX
    }
}

type ProductBadge =
    | { type: 'BIRTHDAY'; label: string }
    | { type: 'LEVEL'; label: string }
    | null;

type ApiProduct = {
    id: string;
    name: string;
    imageUrl: string | null;
    description: string;

    // compat: preço final
    price: number;

    // ✅ motor de preço
    basePrice?: number;
    finalPrice?: number;
    hasDiscount?: boolean;
    badge?: ProductBadge;

    category: string | null;
    stockQuantity: number;
    isOutOfStock: boolean;
    pickupDeadlineDays: number;
    unitId: string;
    unitName: string;
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

function safeNumber(v: any, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

// ✅ normaliza url de imagem vinda da API:
// - aceita http/https (mantém como veio)
// - se vier "/uploads/..." vira "<API_BASE_URL>/uploads/..."
// - se vier "uploads/..." também vira "<API_BASE_URL>/uploads/..."
// - se vier vazia, retorna null
function normalizeApiImageUrl(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();

    // ✅ absoluta: mantém como veio (API já devolve origin correto quando precisa)
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
        return s;
    }

    // ✅ relativa: usa baseURL do axios (quando existir)
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

export default function ProductDetails() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id?: string }>();

    const productId = useMemo(() => String(id ?? '').trim(), [id]);

    const [loading, setLoading] = useState(true);
    const [product, setProduct] = useState<ApiProduct | null>(null);
    const [reserving, setReserving] = useState(false);

    const fetchingRef = useRef(false);

    // ✅ gate: libera quando a primeira tentativa terminar (sucesso/erro/vazio)
    const [dataReady, setDataReady] = useState(false);

    // ✅ scroll depth dedupe
    const scrollMarksRef = useRef<Set<number>>(new Set());

    const fetchProduct = useCallback(async () => {
        setDataReady(false);

        if (!productId) {
            setLoading(false);
            setProduct(null);
            setDataReady(true);

            trackEvent('product_not_found', {
                page: 'product_details',
                productId: '',
                reason: 'missing_id',
            });

            return;
        }

        if (fetchingRef.current) return;
        fetchingRef.current = true;

        // ✅ page viewed (primeira tentativa de carregar)
        trackEvent('page_viewed', { page: 'product_details', productId });

        try {
            setLoading(true);

            const res = await api.get<{
                ok?: boolean;
                product?: ApiProduct;
                item?: ApiProduct;
            }>(`/api/mobile/products/${encodeURIComponent(productId)}`);

            const p = (res?.product ?? res?.item ?? null) as any;

            if (!p?.id) {
                setProduct(null);

                trackEvent('product_not_found', {
                    page: 'product_details',
                    productId,
                    reason: 'api_empty',
                });

                return;
            }

            const basePrice = safeNumber(p?.basePrice, NaN);
            const finalPrice = safeNumber(p?.finalPrice, NaN);

            const hasDiscount =
                !!p?.hasDiscount &&
                Number.isFinite(basePrice) &&
                Number.isFinite(finalPrice) &&
                finalPrice < basePrice;

            const badge: ProductBadge =
                p?.badge &&
                typeof p.badge === 'object' &&
                String(p.badge.label ?? '').trim()
                    ? {
                          type:
                              p.badge.type === 'BIRTHDAY'
                                  ? 'BIRTHDAY'
                                  : 'LEVEL',
                          label: String(p.badge.label ?? '').trim(),
                      }
                    : null;

            // ✅ regra: BIRTHDAY não aparece no detalhe também (se quiser consistência total)
            const safeBadge: ProductBadge =
                badge?.type === 'BIRTHDAY' ? null : badge;

            const final = Number.isFinite(finalPrice)
                ? finalPrice
                : safeNumber(p?.price, 0);

            const mapped: ApiProduct = {
                id: String(p.id),
                name: String(p.name ?? 'Produto'),
                imageUrl: normalizeApiImageUrl(
                    typeof p.imageUrl === 'string' ? p.imageUrl : null
                ),

                description: String(p.description ?? ''),

                // compat: price = final
                price: final,

                basePrice: Number.isFinite(basePrice) ? basePrice : undefined,
                finalPrice: Number.isFinite(finalPrice)
                    ? finalPrice
                    : undefined,
                hasDiscount,
                badge: safeBadge,

                category: p.category ? String(p.category) : null,
                stockQuantity: safeNumber(p.stockQuantity, 0),
                isOutOfStock: !!p.isOutOfStock,
                pickupDeadlineDays: safeNumber(p.pickupDeadlineDays, 2),
                unitId: String(p.unitId ?? ''),
                unitName: String(p.unitName ?? '—'),
            };

            setProduct(mapped);

            trackEvent('product_loaded', {
                page: 'product_details',
                productId: mapped.id,
                isOutOfStock: !!mapped.isOutOfStock,
                category: mapped.category ?? null,
                unitId: mapped.unitId ?? '',
                hasDiscount: !!mapped.hasDiscount,
            });
        } catch (err: any) {
            console.log(
                '[product details] error:',
                err?.data ?? err?.message ?? err
            );

            trackEvent('product_load_error', {
                page: 'product_details',
                productId,
                message: String(err?.data?.error ?? err?.message ?? 'error'),
            });

            const msg =
                err?.data?.error ||
                err?.message ||
                'Não foi possível carregar o produto.';

            Alert.alert('Erro', String(msg));
            setProduct(null);
        } finally {
            setLoading(false);
            fetchingRef.current = false;
            setDataReady(true);
        }
    }, [productId]);

    useEffect(() => {
        // a cada troca de produto, reseta scroll marks
        scrollMarksRef.current = new Set();
        fetchProduct();
    }, [fetchProduct]);

    // ✅ regra de exibição: De/Por/Economia quando desconto
    const pricing = useMemo(() => {
        const p = product;
        if (!p) return { base: 0, final: 0, hasDiscount: false, economyPct: 0 };

        const base = safeNumber(p.basePrice, NaN);
        const final = safeNumber(p.finalPrice, NaN);

        if (Number.isFinite(base) && Number.isFinite(final)) {
            const has = !!p.hasDiscount && final < base;

            const economyPct =
                has && base > 0 ? Math.round(((base - final) / base) * 100) : 0;

            return { base, final, hasDiscount: has, economyPct };
        }

        const only = safeNumber(p.price, 0);
        return { base: only, final: only, hasDiscount: false, economyPct: 0 };
    }, [product]);

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
        if (!pricing.hasDiscount || !Number.isFinite(v) || v <= 0) return null;
        return `${Math.max(0, Math.min(99, Math.round(v)))}%`;
    }, [pricing.economyPct, pricing.hasDiscount]);

    const extra = useMemo(() => {
        const p = product;
        if (!p) return [{ label: 'ID', value: productId || '—' }];

        return [
            { label: 'Unidade', value: p.unitName || '—' },
            {
                label: 'Estoque',
                value: p.isOutOfStock ? 'Esgotado' : String(p.stockQuantity),
            },
            {
                label: 'Prazo p/ retirada',
                value: `${p.pickupDeadlineDays} dia(s)`,
            },
            ...(p.category ? [{ label: 'Categoria', value: p.category }] : []),
        ];
    }, [product, productId]);

    const onPressBack = useCallback(() => {
        trackEvent('nav_click', {
            from: 'product_details',
            to: 'back',
            productId: product?.id ?? productId,
        });
        router.back();
    }, [router, product?.id, productId]);

    const onPressReserve = useCallback(async () => {
        if (!product) return;

        if (product.isOutOfStock) {
            trackEvent('add_to_cart_blocked', {
                from: 'product_details',
                productId: product.id,
                reason: 'out_of_stock',
            });

            Alert.alert(
                'Esgotado',
                'Este produto está sem estoque no momento.'
            );
            return;
        }

        if (reserving) return;

        try {
            setReserving(true);

            trackEvent('add_to_cart_attempt', {
                from: 'product_details',
                productId: product.id,
                quantity: 1,
            });

            const res = await api.post<{
                ok: boolean;
                orderId?: string;
                reservedUntil?: string;
            }>('/api/mobile/orders', { productId, quantity: 1 });

            const orderId = res?.orderId;

            if (!res?.ok || !orderId) throw new Error('invalid_response');

            trackEvent('add_to_cart_success', {
                from: 'product_details',
                productId: product.id,
                quantity: 1,
                orderId: String(orderId),
            });

            router.push({ pathname: '/client/cart', params: { orderId } });
        } catch (err: any) {
            trackEvent('add_to_cart_error', {
                from: 'product_details',
                productId: product?.id ?? productId,
                message: String(err?.data?.error ?? err?.message ?? 'error'),
            });

            console.log('[reserve details] error:', err);
            Alert.alert(
                'Erro',
                'Não foi possível reservar agora. Tente novamente.'
            );
        } finally {
            setReserving(false);
        }
    }, [product, reserving, router, productId]);

    const onScroll = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            try {
                const pId = product?.id ?? productId;
                if (!pId) return;

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

                        trackEvent('scroll_depth', {
                            page: 'product_details',
                            productId: pId,
                            depth: m,
                        });
                    }
                }
            } catch {}
        },
        [product?.id, productId]
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
                        Carregando produto…
                    </Text>
                </View>
            ) : !product ? (
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
                            Produto não encontrado
                        </Text>

                        <Text
                            style={{
                                marginTop: 8,
                                color: 'rgba(0,0,0,0.65)',
                                fontSize: 14,
                            }}
                        >
                            Esse produto pode ter sido removido, desativado ou
                            você está sem conexão.
                        </Text>

                        <Pressable
                            onPress={() => {
                                trackEvent('action_click', {
                                    page: 'product_details',
                                    action: 'retry_fetch',
                                    productId,
                                });
                                fetchProduct();
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
                        <Image
                            source={{
                                uri:
                                    product.imageUrl ||
                                    'https://picsum.photos/seed/product-placeholder/900/900',
                            }}
                            style={S.heroImage}
                            fadeDuration={0}
                        />

                        <View style={S.heroOverlay} />

                        {/* 🎂 / ⭐ badge do motor */}
                        {product.badge?.label ? (
                            <View
                                style={[
                                    S.heroBadge,
                                    product.badge.type === 'BIRTHDAY'
                                        ? S.heroBadgeBirthday
                                        : null,
                                ]}
                            >
                                <Text style={S.heroBadgeText} numberOfLines={1}>
                                    {product.badge.label}
                                </Text>
                            </View>
                        ) : null}

                        {/* (opcional) pill de esgotado no hero */}
                        {product.isOutOfStock ? (
                            <View style={S.outPill}>
                                <Text style={S.outPillText}>ESGOTADO</Text>
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
                                <Text style={S.title}>{product.name}</Text>

                                {/* ✅ regra do preço (De/Por/Economia) */}
                                {pricing.hasDiscount ? (
                                    <View style={S.priceStack}>
                                        <Text
                                            style={S.oldPrice}
                                            numberOfLines={1}
                                        >
                                            De: {baseLabel}
                                        </Text>

                                        <Text style={S.price} numberOfLines={1}>
                                            Por: {finalLabel}
                                        </Text>

                                        {economyPctLabel ? (
                                            <Text
                                                style={S.economyText}
                                                numberOfLines={1}
                                            >
                                                Economia: {economyPctLabel}
                                            </Text>
                                        ) : null}
                                    </View>
                                ) : (
                                    <View style={S.priceRow}>
                                        <Text style={S.price} numberOfLines={1}>
                                            {finalLabel}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        <View style={S.whiteArea}>
                            <View style={S.whiteContent}>
                                <Text style={S.sectionTitle}>
                                    Sobre o produto
                                </Text>
                                <Text style={S.description}>
                                    {product.description || 'Sem descrição.'}
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
                                product.isOutOfStock || reserving
                                    ? { opacity: 0.75 }
                                    : null,
                            ]}
                            onPress={onPressReserve}
                            disabled={product.isOutOfStock || reserving}
                        >
                            {reserving ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <FontAwesome
                                    name="shopping-bag"
                                    size={16}
                                    color="#FFFFFF"
                                    style={{ marginRight: 10 }}
                                />
                            )}

                            <Text style={S.reserveBtnText}>
                                {product.isOutOfStock
                                    ? 'Esgotado'
                                    : reserving
                                      ? 'Reservando…'
                                      : 'Reservar'}
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

const S = StyleSheet.create({
    page: { flex: 1, backgroundColor: UI.colors.white },
    scroll: { flex: 1, backgroundColor: UI.colors.white },

    heroImage: { width: '100%', height: '100%' },

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

    // 🎂 / ⭐ pill no hero
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
    heroBadgeBirthday: {
        backgroundColor: 'rgba(124,108,255,0.95)',
        borderColor: 'rgba(255,255,255,0.30)',
    },
    heroBadgeText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.2,
    },

    // (opcional) esgotado
    outPill: {
        position: 'absolute',
        right: UI.spacing.screenX,
        bottom: 16,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: UI.brand.primary,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.30)',
    },
    outPillText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 0.3,
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

    priceRow: {
        marginTop: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },

    // ✅ stack quando tem desconto
    priceStack: {
        marginTop: 14,
        gap: 4,
    },

    oldPrice: {
        textDecorationLine: 'line-through',
        color: 'rgba(0,0,0,0.45)',
        fontSize: 13,
        fontWeight: '800',
    },

    // “Por: …”
    price: { color: UI.brand.primary, fontSize: 20, fontWeight: '600' },

    // ✅ Economia: X%
    economyText: {
        marginTop: 2,
        color: 'rgba(0,0,0,0.45)',
        fontSize: 13,
        fontWeight: '900',
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
