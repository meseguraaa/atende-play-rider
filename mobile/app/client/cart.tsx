// app/client/cart.tsx
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
    StyleSheet,
    Pressable,
    FlatList,
    ActivityIndicator,
    Alert,
    Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    useLocalSearchParams,
    useRouter,
    usePathname,
    useFocusEffect,
} from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

import { UI } from '../../src/theme/client-theme';
import { api } from '../../src/services/api';
import { trackEvent } from '../../src/services/analytics'; // ✅ analytics global

import { ScreenGate } from '../../src/components/layout/ScreenGate';
import { CartSkeleton } from '../../src/components/loading/CartSkeleton';

const STICKY_ROW_H = 74;

type CartItem = {
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    product: null | {
        id: string;
        name: string;
        imageUrl: string | null;
        category: string | null;

        // ✅ enriquecido pelo backend (novo)
        basePrice?: number; // preço "cheio" (BRONZE)
        finalPrice?: number; // preço do motor (pode ser o mesmo do unitPrice)
        hasDiscount?: boolean;
        badge?: null | { type: 'BIRTHDAY' | 'LEVEL'; label: string };
    };
};

type CartOrder = {
    id: string;
    status: string;
    createdAt: string;
    reservedUntil: string | null; // ✅ vencimento pronto do backend
    totalAmount: number;
    unitId: string;
    unitName: string;
    items: CartItem[];
};

type CartResponse = {
    ok?: boolean;
    order?: CartOrder;
    item?: CartOrder;
    error?: string;
    orders?: CartOrder[];
    items?: CartOrder[];
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

function formatDateTimeBR(value?: string | null) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function pickParam(raw: unknown): string {
    if (!raw) return '';
    if (Array.isArray(raw)) return String(raw[0] ?? '').trim();
    return String(raw).trim();
}

function statusLabel(status?: string | null) {
    const s = String(status ?? '')
        .toUpperCase()
        .trim();
    if (s === 'PENDING_CHECKIN') return 'Pendente de retirada';
    if (s === 'COMPLETED') return 'Retirado (checkout concluído)';
    if (s === 'CANCELED') return 'Cancelado';
    if (!s) return '—';
    return s;
}

// ✅ normaliza página pra não gerar "/x/" e "/x" como coisas diferentes
function normalizePage(pathname: string) {
    const p = (pathname || '/').trim();
    const noQuery = p.split('?')[0].split('#')[0];
    return noQuery.length > 1 && noQuery.endsWith('/')
        ? noQuery.slice(0, -1)
        : noQuery || '/';
}

/* ---------------------------------------------------------
 * 🖼️ Image URL helper (igual tela de produtos)
 * - aceita http/https
 * - resolve paths relativos tipo "/uploads/..."
 * ---------------------------------------------------------*/
function resolveImageUri(raw: unknown): string | null {
    const v = String(raw ?? '').trim();
    if (!v) return null;

    // já é absoluta
    if (/^https?:\/\//i.test(v)) return v;

    // tenta usar baseURL do client api
    const base =
        String((api as any)?.defaults?.baseURL ?? '')
            .trim()
            .replace(/\/+$/, '') || '';

    if (!base) return v.startsWith('/') ? v : `/${v}`;

    // path relativo => absolutiza
    const path = v.startsWith('/') ? v : `/${v}`;
    return `${base}${path}`.replace(/([^:]\/)\/+/g, '$1'); // remove // duplicado
}

const Row = memo(function Row({
    icon,
    label,
    value,
}: {
    icon: any;
    label: string;
    value: string;
}) {
    return (
        <View style={S.row}>
            <View style={S.rowIcon}>
                <FontAwesome
                    name={icon}
                    size={14}
                    color={UI.brand.primaryText}
                />
            </View>
            <Text style={S.rowLabel}>{label}</Text>
            <Text style={S.rowValue} numberOfLines={1}>
                {value}
            </Text>
        </View>
    );
});

export default function CartScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const pathname = usePathname();
    const params = useLocalSearchParams<{
        orderId?: string | string[];
        id?: string | string[];
    }>();

    const orderId = useMemo(() => {
        const fromOrderId = pickParam(params?.orderId);
        if (fromOrderId) return fromOrderId;
        return pickParam(params?.id);
    }, [params?.orderId, params?.id]);

    const [loading, setLoading] = useState(true);
    const [order, setOrder] = useState<CartOrder | null>(null);
    const [failed, setFailed] = useState(false);
    const [dataReady, setDataReady] = useState(false);

    const [removingId, setRemovingId] = useState<string>('');

    const goBack = useCallback(() => {
        router.back();
    }, [router]);

    const goHome = useCallback(() => {
        router.replace('/');
    }, [router]);

    const goHistory = useCallback(() => {
        try {
            router.push('/history' as any);
        } catch {
            router.back();
        }
    }, [router]);

    // ✅ page_viewed (dedupe por foco)
    const lastViewedKeyRef = useRef<string>('');
    const trackPageViewed = useCallback(() => {
        const page = normalizePage(pathname || '/');
        const key = `${page}|${orderId || 'no-order'}`;
        if (lastViewedKeyRef.current === key) return;
        lastViewedKeyRef.current = key;
        try {
            trackEvent('page_viewed', {
                page,
                platform: 'mobile',
                orderId: orderId || null,
            });
        } catch {}
    }, [pathname, orderId]);

    const load = useCallback(async () => {
        setDataReady(false);

        if (!orderId) {
            setLoading(false);
            setOrder(null);
            setFailed(false);
            setDataReady(true);
            return;
        }

        try {
            setFailed(false);
            setLoading(true);

            const res: CartResponse = (await api.get(
                `/api/mobile/orders/${encodeURIComponent(orderId)}`
            )) as any;

            const direct = (res?.order ??
                res?.item ??
                null) as CartOrder | null;
            const list = (res?.orders ?? res?.items ?? []) as CartOrder[];

            const fromList =
                Array.isArray(list) && list.length
                    ? (list.find((o) => String(o?.id) === String(orderId)) ??
                      null)
                    : null;

            const o = direct ?? fromList;

            if (!res?.ok || !o?.id) {
                throw new Error('invalid_response');
            }

            setOrder(o);
        } catch (e: any) {
            console.log('[cart] load error:', e?.data ?? e?.message ?? e);
            Alert.alert(
                'Ops',
                'Não foi possível carregar sua sacolinha agora.'
            );
            setOrder(null);
            setFailed(true);
        } finally {
            setLoading(false);
            setDataReady(true);
        }
    }, [orderId]);

    useEffect(() => {
        load();
    }, [load]);

    // ✅ dispara view ao entrar na tela (e reseta ao sair)
    useFocusEffect(
        useCallback(() => {
            trackPageViewed();
            return () => {
                lastViewedKeyRef.current = '';
            };
        }, [trackPageViewed])
    );

    const items = order?.items ?? [];

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    const listPadTop = useMemo(
        () => insets.top + STICKY_ROW_H + 10,
        [insets.top]
    );

    const footerPadBottom = useMemo(
        () => Math.max(12, insets.bottom + 10),
        [insets.bottom]
    );

    const isPendingPickup = useMemo(() => {
        const s = String(order?.status ?? '')
            .toUpperCase()
            .trim();
        return s === 'PENDING_CHECKIN';
    }, [order?.status]);

    const isCompleted = useMemo(() => {
        const s = String(order?.status ?? '')
            .toUpperCase()
            .trim();
        return s === 'COMPLETED';
    }, [order?.status]);

    const isCanceled = useMemo(() => {
        const s = String(order?.status ?? '')
            .toUpperCase()
            .trim();
        return s === 'CANCELED';
    }, [order?.status]);

    // ✅ remove item (por produto)
    const removeItemFromCart = useCallback(
        async (item: CartItem) => {
            if (!order || !isPendingPickup) return;
            if (!item?.id) return;
            if (removingId) return;

            Alert.alert(
                'Remover item',
                'Tem certeza que deseja remover este produto da sua reserva?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Remover',
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                setRemovingId(String(item.id));

                                // ✅ endpoint esperado (ajuste aqui se o seu for diferente)
                                const res: any = await api.delete(
                                    `/api/mobile/cart/items/${encodeURIComponent(
                                        String(item.id)
                                    )}`
                                );

                                if (!res?.ok) {
                                    throw new Error(
                                        res?.error || 'remove_failed'
                                    );
                                }

                                // recarrega pedido e total
                                await load();
                            } catch (e: any) {
                                console.log(
                                    '[cart] remove item error:',
                                    e?.data ?? e?.message ?? e
                                );
                                Alert.alert(
                                    'Ops',
                                    'Não foi possível remover esse item agora.'
                                );
                            } finally {
                                setRemovingId('');
                            }
                        },
                    },
                ]
            );
        },
        [order, isPendingPickup, removingId, load]
    );

    const Header = useMemo(() => {
        const reservedUntilLabel = order?.reservedUntil
            ? formatDateTimeBR(order.reservedUntil)
            : '—';

        return (
            <View style={S.listHeader}>
                {!orderId ? (
                    <View style={S.emptyHero}>
                        <FontAwesome
                            name="shopping-bag"
                            size={18}
                            color={UI.brand.primary}
                        />
                        <Text style={S.emptyTitle}>Sacolinha vazia</Text>
                        <Text style={S.emptyText}>
                            Volte para Produtos e toque em Reservar para
                            adicionar itens.
                        </Text>
                    </View>
                ) : loading ? (
                    <View style={S.emptyHero}>
                        <ActivityIndicator />
                        <Text style={S.emptyText}>
                            Carregando sua sacolinha…
                        </Text>
                    </View>
                ) : failed || !order ? (
                    <View style={S.emptyHero}>
                        <FontAwesome
                            name="warning"
                            size={18}
                            color={UI.brand.primary}
                        />
                        <Text style={S.emptyTitle}>
                            Não foi possível abrir a sacolinha
                        </Text>
                        <Pressable style={S.primaryBtn} onPress={load}>
                            <Text style={S.primaryBtnText}>
                                Tentar novamente
                            </Text>
                        </Pressable>
                    </View>
                ) : (
                    <>
                        <View style={S.card}>
                            <Row
                                icon="shopping-bag"
                                label="Pedido"
                                value={order.id}
                            />
                            <Row
                                icon="map-marker"
                                label="Unidade"
                                value={order.unitName}
                            />
                            <Row
                                icon="info-circle"
                                label="Status"
                                value={statusLabel(order.status)}
                            />
                            <Row
                                icon="clock-o"
                                label="Reservado em"
                                value={formatDateTimeBR(order.createdAt)}
                            />

                            {/* ✅ EXIBIÇÃO DO VENCIMENTO (sem contagem regressiva) */}
                            {isPendingPickup ? (
                                <View style={S.expireBox}>
                                    <View style={S.expireTop}>
                                        <View style={S.expireIcon}>
                                            <FontAwesome
                                                name="hourglass-end"
                                                size={14}
                                                color={UI.brand.primaryText}
                                            />
                                        </View>
                                        <Text style={S.expireTitle}>
                                            Retire até
                                        </Text>
                                        <Text style={S.expireValue}>
                                            {reservedUntilLabel}
                                        </Text>
                                    </View>
                                    <Text style={S.expireText}>
                                        Após esse prazo, a reserva expira e o
                                        pedido é cancelado automaticamente. Ele
                                        sai da sacolinha e aparece no seu
                                        histórico como cancelado.
                                    </Text>
                                </View>
                            ) : null}
                        </View>

                        {isCompleted || isCanceled ? (
                            <View style={[S.card, { marginTop: 10 }]}>
                                <View style={S.statusBox}>
                                    <View style={S.statusDot} />
                                    <Text style={S.statusTitle}>
                                        {isCompleted
                                            ? 'Este pedido já foi retirado ✅'
                                            : 'Este pedido foi cancelado'}
                                    </Text>
                                </View>
                                <Text style={S.statusText}>
                                    {isCompleted
                                        ? 'Quando fizer o checkout, ele sai da sacolinha e aparece no seu histórico.'
                                        : 'Se precisar, você pode fazer uma nova reserva na lista de produtos.'}
                                </Text>
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        gap: 10,
                                        marginTop: 12,
                                    }}
                                >
                                    <Pressable
                                        style={[S.secondaryBtn]}
                                        onPress={goHome}
                                    >
                                        <Text style={S.secondaryBtnText}>
                                            Ir pra Home
                                        </Text>
                                    </Pressable>
                                    {isCompleted ? (
                                        <Pressable
                                            style={[S.primaryBtn, { flex: 1 }]}
                                            onPress={goHistory}
                                        >
                                            <Text style={S.primaryBtnText}>
                                                Ir pro histórico
                                            </Text>
                                        </Pressable>
                                    ) : null}
                                </View>
                            </View>
                        ) : (
                            <View style={S.sectionHeader}>
                                <Text style={S.sectionTitle}>Itens</Text>
                                <Text style={S.sectionSubtitle}>
                                    Seus itens estão{' '}
                                    <Text style={{ fontWeight: '900' }}>
                                        pendentes de retirada
                                    </Text>
                                    . A confirmação final acontece no
                                    estabelecimento.
                                </Text>
                            </View>
                        )}
                    </>
                )}
            </View>
        );
    }, [
        failed,
        load,
        loading,
        order,
        orderId,
        goHistory,
        goHome,
        isCompleted,
        isCanceled,
        isPendingPickup,
    ]);

    const renderItem = useCallback(
        ({ item }: { item: CartItem }) => {
            const name = item.product?.name ?? 'Produto';
            const category = item.product?.category ?? null;

            // ✅ resolve URL absoluto (igual tela de produtos)
            const imageUri = resolveImageUri(item.product?.imageUrl);

            // ✅ visibilidade do motor (com fallback)
            const base = Number(item.product?.basePrice ?? NaN);
            const final = Number.isFinite(Number(item.product?.finalPrice))
                ? Number(item.product?.finalPrice)
                : Number(item.unitPrice); // fallback: preço salvo no item

            const hasDiscount =
                typeof item.product?.hasDiscount === 'boolean'
                    ? item.product.hasDiscount
                    : Number.isFinite(base) &&
                      Number.isFinite(final) &&
                      final < base;

            const badge = item.product?.badge ?? null;

            const lineTotal = Number(item.totalPrice); // já vem calculado no backend

            const canRemove = !!order && isPendingPickup;
            const isRemovingThis = removingId === String(item.id);

            return (
                <View style={S.itemCard}>
                    <View style={S.itemImageWrap}>
                        {imageUri ? (
                            <Image
                                source={{ uri: imageUri }}
                                style={S.itemImage}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={S.itemImagePlaceholder}>
                                <FontAwesome
                                    name="image"
                                    size={18}
                                    color={UI.colors.black45}
                                />
                            </View>
                        )}
                    </View>

                    <View style={{ flex: 1 }}>
                        <View style={S.itemTopRow}>
                            <Text style={S.itemName} numberOfLines={2}>
                                {name}
                            </Text>

                            {badge ? (
                                <View style={S.badgePill}>
                                    <Text
                                        style={S.badgePillText}
                                        numberOfLines={1}
                                    >
                                        {badge.label}
                                    </Text>
                                </View>
                            ) : null}
                        </View>

                        {category ? (
                            <Text style={S.itemMeta} numberOfLines={1}>
                                {category}
                            </Text>
                        ) : null}

                        {/* preços */}
                        <View style={S.pricesRow}>
                            <Text style={S.unitFinalPrice}>
                                {formatMoneySmartBRL(final)}
                            </Text>
                            {hasDiscount && Number.isFinite(base) ? (
                                <Text style={S.unitBasePrice}>
                                    {formatMoneySmartBRL(base)}
                                </Text>
                            ) : null}
                        </View>

                        <View style={S.itemBottomRow}>
                            <Text style={S.itemQty}>Qtd: {item.quantity}</Text>

                            <View style={S.itemActionsRow}>
                                {canRemove ? (
                                    <Pressable
                                        style={[
                                            S.removeBtn,
                                            isRemovingThis
                                                ? S.removeBtnDisabled
                                                : null,
                                        ]}
                                        onPress={() => removeItemFromCart(item)}
                                        disabled={isRemovingThis}
                                        hitSlop={10}
                                    >
                                        {isRemovingThis ? (
                                            <ActivityIndicator />
                                        ) : (
                                            <>
                                                <FontAwesome
                                                    name="trash"
                                                    size={14}
                                                    color={UI.colors.white}
                                                />
                                                <Text style={S.removeBtnText}>
                                                    Remover
                                                </Text>
                                            </>
                                        )}
                                    </Pressable>
                                ) : null}

                                <Text style={S.itemPrice}>
                                    {formatMoneySmartBRL(lineTotal)}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>
            );
        },
        [order, isPendingPickup, removingId, removeItemFromCart]
    );

    const onPressEntendi = useCallback(() => {
        Alert.alert(
            'Pendente de retirada',
            'Quando você for buscar, faremos o checkout e esse pedido vai direto pro seu histórico.',
            [{ text: 'Ok', onPress: goHome }]
        );
    }, [goHome]);

    return (
        <ScreenGate dataReady={dataReady} skeleton={<CartSkeleton />}>
            <View style={S.page}>
                <View style={S.fixedTop}>
                    <View style={safeTopStyle} />
                    <View style={S.stickyRow}>
                        <Pressable style={S.backBtn} onPress={goBack}>
                            <FontAwesome
                                name="angle-left"
                                size={22}
                                color="#FFFFFF"
                            />
                        </Pressable>

                        <View style={S.centerTitleWrap} pointerEvents="none">
                            <Text style={S.centerTitle}>Sacolinha</Text>
                        </View>

                        <View style={{ width: 42, height: 42 }} />
                    </View>
                </View>

                <FlatList
                    data={order ? items : []}
                    keyExtractor={(it) => it.id}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                    style={S.list}
                    contentContainerStyle={[
                        S.listContent,
                        { paddingTop: listPadTop },
                    ]}
                    ListHeaderComponent={Header}
                    ListEmptyComponent={
                        order && !loading ? (
                            <View style={S.emptyHero}>
                                <Text style={S.emptyTitle}>Sem itens</Text>
                                <Text style={S.emptyText}>
                                    Sua sacolinha está vazia. Volte para
                                    Produtos e reserve um item.
                                </Text>
                            </View>
                        ) : null
                    }
                    removeClippedSubviews
                    initialNumToRender={8}
                    maxToRenderPerBatch={10}
                    windowSize={9}
                />

                {order && !loading && isPendingPickup ? (
                    <View
                        style={[S.footer, { paddingBottom: footerPadBottom }]}
                    >
                        <View style={S.totalRow}>
                            <Text style={S.totalLabel}>Total</Text>
                            <Text style={S.totalValue}>
                                {formatMoneySmartBRL(order.totalAmount)}
                            </Text>
                        </View>

                        <Pressable
                            style={S.allProductsBtn}
                            onPress={onPressEntendi}
                        >
                            <View style={S.btnCenterRow}>
                                <Text style={S.allProductsBtnText}>
                                    Entendi
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
                ) : null}
            </View>
        </ScreenGate>
    );
}

const S = StyleSheet.create({
    page: {
        flex: 1,
        backgroundColor: UI.colors.bg,
    },

    fixedTop: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        zIndex: 999,
    },

    stickyRow: {
        height: STICKY_ROW_H,
        backgroundColor: UI.colors.bg,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
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

    centerTitleWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    centerTitle: {
        color: UI.colors.white,
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.2,
    },

    list: { flex: 1, backgroundColor: UI.colors.white },

    listContent: { paddingBottom: 140 },

    listHeader: {
        paddingHorizontal: UI.spacing.screenX,
        paddingBottom: 12,
        backgroundColor: UI.colors.white,
    },

    emptyHero: {
        paddingTop: 16,
        paddingBottom: 8,
        alignItems: 'center',
        gap: 10,
    },

    emptyTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: UI.brand.primaryText,
        textAlign: 'center',
    },

    emptyText: {
        color: 'rgba(0,0,0,0.55)',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: 18,
    },

    card: {
        marginTop: 6,
        backgroundColor: UI.colors.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: UI.colors.black10,
        padding: 12,
        gap: 10,
    },

    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },

    rowIcon: {
        width: 28,
        height: 28,
        borderRadius: 10,
        backgroundColor: UI.colors.black05,
        alignItems: 'center',
        justifyContent: 'center',
    },

    rowLabel: {
        width: 92,
        fontSize: 12,
        color: UI.colors.black45,
        fontWeight: '700',
    },

    rowValue: {
        flex: 1,
        fontSize: 12,
        fontWeight: '700',
        color: UI.colors.black,
    },

    // ✅ bloco de vencimento
    expireBox: {
        marginTop: 2,
        borderRadius: 14,
        backgroundColor: UI.colors.black05,
        borderWidth: 1,
        borderColor: UI.colors.black10,
        padding: 10,
        gap: 8,
    },

    expireTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    expireIcon: {
        width: 26,
        height: 26,
        borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    expireTitle: {
        fontSize: 12,
        fontWeight: '900',
        color: UI.brand.primaryText,
    },

    expireValue: {
        marginLeft: 'auto',
        fontSize: 12,
        fontWeight: '900',
        color: UI.brand.primaryText,
    },

    expireText: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(0,0,0,0.55)',
        lineHeight: 17,
    },

    sectionHeader: {
        paddingTop: 18,
        paddingBottom: 10,
        backgroundColor: UI.colors.white,
    },

    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: UI.brand.primaryText,
    },

    sectionSubtitle: {
        marginTop: 4,
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(0,0,0,0.50)',
    },

    statusBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },

    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: UI.brand.primary,
    },

    statusTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: UI.brand.primaryText,
    },

    statusText: {
        marginTop: 6,
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(0,0,0,0.55)',
        lineHeight: 18,
    },

    itemCard: {
        marginHorizontal: UI.spacing.screenX,
        marginBottom: 10,
        flexDirection: 'row',
        gap: 12,
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: UI.colors.black10,
        backgroundColor: UI.colors.white,
    },

    itemImageWrap: {
        width: 62,
        height: 62,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: UI.colors.black05,
    },

    itemImage: { width: '100%', height: '100%' },

    itemImagePlaceholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    itemTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
    },

    itemName: {
        flex: 1,
        fontSize: 14,
        fontWeight: '700',
        color: UI.brand.primaryText,
    },

    // ✅ badge do motor
    badgePill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: 'rgba(124,108,255,0.14)',
        borderWidth: 1,
        borderColor: 'rgba(124,108,255,0.22)',
        maxWidth: 160,
    },

    badgePillText: {
        color: UI.brand.primaryText,
        fontSize: 11,
        fontWeight: '800',
    },

    itemMeta: {
        marginTop: 2,
        fontSize: 12,
        color: UI.colors.black45,
        fontWeight: '600',
    },

    // ✅ linha de preços (unitário)
    pricesRow: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
    },

    unitFinalPrice: {
        fontSize: 14,
        fontWeight: '900',
        color: UI.brand.primaryText,
    },

    unitBasePrice: {
        fontSize: 12,
        fontWeight: '700',
        color: UI.colors.black45,
        textDecorationLine: 'line-through',
    },

    itemBottomRow: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },

    itemQty: { fontSize: 12, color: UI.colors.black45, fontWeight: '700' },

    itemActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginLeft: 'auto',
    },

    removeBtn: {
        height: 32,
        borderRadius: 999,
        paddingHorizontal: 12,
        backgroundColor: '#141414',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },

    removeBtnDisabled: {
        opacity: 0.55,
    },

    removeBtnText: {
        color: UI.colors.white,
        fontSize: 12,
        fontWeight: '800',
    },

    itemPrice: {
        fontSize: 13,
        fontWeight: '900',
        color: UI.brand.primaryText,
    },

    footer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: UI.colors.white,
        borderTopWidth: 1,
        borderTopColor: UI.colors.black10,
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 12,
        gap: 10,
    },

    totalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

    totalLabel: { fontSize: 13, color: UI.colors.black45, fontWeight: '800' },

    totalValue: {
        fontSize: 16,
        color: UI.brand.primaryText,
        fontWeight: '900',
    },

    primaryBtn: {
        height: 48,
        borderRadius: 16,
        backgroundColor: UI.brand.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },

    primaryBtnText: { color: UI.colors.white, fontWeight: '800', fontSize: 14 },

    secondaryBtn: {
        height: 48,
        borderRadius: 16,
        backgroundColor: UI.colors.black05,
        borderWidth: 1,
        borderColor: UI.colors.black10,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 14,
        flex: 1,
    },

    secondaryBtnText: {
        color: UI.brand.primaryText,
        fontWeight: '800',
        fontSize: 14,
    },

    allProductsBtn: {
        height: 44,
        borderRadius: 999,
        paddingHorizontal: 14,
        backgroundColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
    },

    allProductsBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

    btnCenterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
