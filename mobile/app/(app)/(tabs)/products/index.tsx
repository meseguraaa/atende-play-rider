import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
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
    Dimensions,
    NativeScrollEvent,
    NativeSyntheticEvent,
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
import { ProductsSkeleton } from '../../../../src/components/loading/ProductsSkeleton';
import {
    AppTopBar,
    STICKY_ROW_H as TOPBAR_H,
} from '../../../../src/components/layout/AppTopBar';

const STICKY_ROW_H = TOPBAR_H;

type Category = { id: string; label: string };

type ProductBadge =
    | { type: 'BIRTHDAY'; label: string }
    | { type: 'LEVEL'; label: string }
    | null;

type ApiProduct = {
    id: string;
    name: string;
    imageUrl: string | null;
    description: string;

    // ✅ novo modelo
    category: string | null; // compat legado
    categoryNames?: string[];
    categories?: Array<{ id: string; name: string }>;

    stockQuantity: number;
    isOutOfStock: boolean;
    pickupDeadlineDays: number;
    unitId: string;
    unitName: string;

    // ✅ motor de preço
    price: number; // preço final (compat)
    basePrice?: number;
    finalPrice?: number;
    hasDiscount?: boolean;
    badge?: ProductBadge;
};

type Product = {
    id: string;
    name: string;

    // ✅ agora numérico
    price: number;
    basePrice?: number;
    finalPrice?: number;
    hasDiscount?: boolean;
    badge?: ProductBadge;

    image: string;
    isOutOfStock: boolean;

    // ✅ novo modelo
    category: string | null; // compat legado
    categoryNames: string[];
};

type FeaturedApiProduct = {
    id: string;
    name: string;
    imageUrl: string | null;
    price: number;
    basePrice?: number;
    finalPrice?: number;
    hasDiscount?: boolean;
    badge?: ProductBadge;
    unitName?: string;
};

type FeaturedProduct = {
    id: string;
    title: string;
    image: string | null;
    price: number;
    basePrice?: number;
    finalPrice?: number;
    hasDiscount?: boolean;
    badge?: ProductBadge;
    unitName?: string;
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

    // eslint-disable-next-line no-restricted-globals
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

function sumQtyFromOrder(order: any): number {
    const items = Array.isArray(order?.items) ? order.items : [];
    const total = items.reduce((acc: number, it: any) => {
        const q = Number(it?.quantity ?? 0);
        return acc + (Number.isFinite(q) ? q : 0);
    }, 0);
    return total > 0 ? total : 0;
}

// ✅ normaliza página (evita "/x/" e "/x" contarem diferente)
function normalizePage(pathname: string) {
    const p = (pathname || '/').trim();
    const noQuery = p.split('?')[0].split('#')[0];
    return noQuery.length > 1 && noQuery.endsWith('/')
        ? noQuery.slice(0, -1)
        : noQuery || '/';
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

type FeaturedCarouselProps = {
    items: FeaturedProduct[];
    loading: boolean;
    onOpen: (id: string) => void;
    onImpression?: (id: string) => void;
};

const FeaturedCarousel = memo(function FeaturedCarousel({
    items,
    loading,
    onOpen,
    onImpression,
}: FeaturedCarouselProps) {
    const listRef = useRef<FlatList<FeaturedProduct> | null>(null);
    const intervalRef = useRef<any>(null);

    const screenW = Dimensions.get('window').width;
    const gap = 12;
    const cardWidth = Math.max(280, screenW - UI.spacing.screenX * 2);
    const snap = cardWidth + gap;

    const count = items.length;

    // ✅ 3 blocos pra loop invisível
    const loopData = useMemo(() => {
        if (count < 2) return items;
        return ([] as FeaturedProduct[]).concat(items, items, items);
    }, [count, items]);

    // Começa no “meio”
    const startIndex = useMemo(() => (count < 2 ? 0 : count), [count]);
    const currentIndexRef = useRef(startIndex);

    const setListRef = useCallback((r: FlatList<FeaturedProduct> | null) => {
        listRef.current = r;
    }, []);

    const stopAuto = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const scrollToIndexNoAnim = useCallback(
        (idx: number) => {
            try {
                listRef.current?.scrollToOffset({
                    offset: idx * snap,
                    animated: false,
                });
            } catch {}
        },
        [snap]
    );

    const startAuto = useCallback(() => {
        stopAuto();
        if (count < 2) return;

        intervalRef.current = setInterval(() => {
            const next = currentIndexRef.current + 1;
            currentIndexRef.current = next;

            try {
                listRef.current?.scrollToOffset({
                    offset: next * snap,
                    animated: true,
                });
            } catch {}
        }, 5000);
    }, [count, snap, stopAuto]);

    useFocusEffect(
        useCallback(() => {
            if (count >= 2) {
                currentIndexRef.current = startIndex;
                requestAnimationFrame(() => scrollToIndexNoAnim(startIndex));
            }
            startAuto();

            // ✅ impressão inicial do destaque (1 item)
            if (count === 1 && items[0]?.id) {
                try {
                    onImpression?.(items[0].id);
                } catch {}
            }

            return () => stopAuto();
        }, [
            count,
            scrollToIndexNoAnim,
            startAuto,
            stopAuto,
            startIndex,
            items,
            onImpression,
        ])
    );

    const normalizeLoopIndex = useCallback(
        (idx: number) => {
            if (count < 2) return idx;

            if (idx < count) return idx + count;
            if (idx >= count * 2) return idx - count;

            return idx;
        },
        [count]
    );

    const onScrollEnd = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (count < 2) return;

            const x = e.nativeEvent.contentOffset.x;
            const idx = Math.round(x / snap);

            currentIndexRef.current = idx;

            const normalized = normalizeLoopIndex(idx);
            if (normalized !== idx) {
                currentIndexRef.current = normalized;
                requestAnimationFrame(() => scrollToIndexNoAnim(normalized));
            }

            // ✅ impressão do item “central”
            try {
                const realIndex =
                    ((currentIndexRef.current % count) + count) % count;
                const id = items?.[realIndex]?.id;
                if (id) onImpression?.(id);
            } catch {}

            startAuto();
        },
        [
            count,
            normalizeLoopIndex,
            scrollToIndexNoAnim,
            snap,
            startAuto,
            items,
            onImpression,
        ]
    );

    const renderFeatured = useCallback(
        ({ item }: ListRenderItemInfo<FeaturedProduct>) => {
            const base = safeNumber(item.basePrice, NaN);
            const final = safeNumber(item.finalPrice, NaN);

            const pricing = (() => {
                if (Number.isFinite(base) && Number.isFinite(final)) {
                    const hasDiscount = !!item.hasDiscount && final < base;
                    const economyPct =
                        hasDiscount && base > 0
                            ? Math.round(((base - final) / base) * 100)
                            : 0;

                    return { base, final, hasDiscount, economyPct };
                }
                const p = safeNumber(item.price, 0);
                return { base: p, final: p, hasDiscount: false, economyPct: 0 };
            })();

            const baseLabel = formatMoneySmartBRL(pricing.base);
            const finalLabel = formatMoneySmartBRL(pricing.final);

            const economyPctLabel =
                pricing.hasDiscount && pricing.economyPct > 0
                    ? `${Math.max(0, Math.min(99, Math.round(pricing.economyPct)))}%`
                    : null;

            return (
                <Pressable
                    onPress={() => onOpen(item.id)}
                    style={[S.featureCard, { width: cardWidth }]}
                >
                    <View style={S.featureRow}>
                        <View style={S.featureLeft}>
                            <View style={S.featureTopLine}>
                                {/* ✅ ANIVERSÁRIO NÃO APARECE AQUI (só no topo) */}
                                {item.badge?.label ? (
                                    <View style={[S.featureBadge]}>
                                        <Text
                                            style={S.featureBadgeText}
                                            numberOfLines={1}
                                        >
                                            {item.badge.label}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>

                            <Text style={S.featureTitle} numberOfLines={2}>
                                {item.title}
                            </Text>

                            {pricing.hasDiscount ? (
                                <View style={{ marginTop: 8 }}>
                                    <Text
                                        style={S.featureOldPrice}
                                        numberOfLines={1}
                                    >
                                        De: {baseLabel}
                                    </Text>

                                    <Text
                                        style={S.featurePrice}
                                        numberOfLines={1}
                                    >
                                        Por: {finalLabel}
                                    </Text>

                                    {economyPctLabel ? (
                                        <Text
                                            style={S.featureEconomy}
                                            numberOfLines={1}
                                        >
                                            Economia: {economyPctLabel}
                                        </Text>
                                    ) : null}
                                </View>
                            ) : (
                                <Text
                                    style={[S.featurePrice, { marginTop: 10 }]}
                                    numberOfLines={1}
                                >
                                    {finalLabel}
                                </Text>
                            )}

                            {item.unitName ? (
                                <Text style={S.featureUnit} numberOfLines={1}>
                                    {item.unitName}
                                </Text>
                            ) : null}

                            <View style={S.featureBtn}>
                                <Text style={S.featureBtnText}>
                                    Ver produto
                                </Text>
                                <FontAwesome
                                    name="arrow-right"
                                    size={14}
                                    color={UI.colors.white}
                                />
                            </View>
                        </View>

                        <View style={S.featureThumb}>
                            {item.image ? (
                                <Image
                                    source={{ uri: item.image }}
                                    style={S.featureThumbImg}
                                    fadeDuration={0}
                                />
                            ) : (
                                <View style={S.featureThumbFallback}>
                                    <FontAwesome
                                        name="shopping-bag"
                                        size={26}
                                        color={UI.colors.white}
                                    />
                                </View>
                            )}
                        </View>
                    </View>
                </Pressable>
            );
        },
        [cardWidth, onOpen]
    );

    if (!loading && count === 0) return null;

    if (loading) {
        return (
            <View style={[S.featureCard, S.featureCardLoading]}>
                <View style={S.featureRow}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                        <View style={S.skelLineSmall} />
                        <View style={S.skelLineBig} />
                        <View style={S.skelLineMid} />
                        <View style={S.skelBtn} />
                    </View>
                    <View style={S.skelThumb} />
                </View>
            </View>
        );
    }

    if (count === 1) {
        return (
            <View style={{ marginTop: 14 }}>
                {renderFeatured({
                    item: items[0],
                    index: 0,
                    separators: null as any,
                })}
            </View>
        );
    }

    return (
        <View style={{ marginTop: 14 }}>
            <FlatList
                ref={setListRef}
                data={loopData}
                keyExtractor={(_, idx) => `featured_loop_${idx}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                renderItem={renderFeatured}
                contentContainerStyle={S.featureListContent}
                snapToInterval={snap}
                decelerationRate="fast"
                pagingEnabled={false}
                disableIntervalMomentum={false}
                onMomentumScrollEnd={onScrollEnd}
                getItemLayout={(_, index) => ({
                    length: snap,
                    offset: snap * index,
                    index,
                })}
                initialScrollIndex={startIndex}
                removeClippedSubviews={false}
                initialNumToRender={5}
                maxToRenderPerBatch={6}
                windowSize={7}
            />
        </View>
    );
});

// ✅ normaliza url de imagem vinda da API:
// - aceita http/https
// - se vier "/uploads/..." vira "<API_BASE_URL>/uploads/..."
// - se vier "uploads/..." também vira "<API_BASE_URL>/uploads/..."
// - se vier vazia, retorna null
function normalizeApiImageUrl(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();

    // ✅ 1) absoluta: mantém como veio (API já devolve origin correto)
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
        return s;
    }

    // ✅ 2) relativa: usa baseURL do axios (quando existir)
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

type ProductsHeaderProps = {
    topBounceHeight: number;
    topOffset: number;
    categories: Category[];
    activeCategoryId: string;
    onSelectCategory: (id: string) => void;
    search: string;
    onChangeSearch: (v: string) => void;
    loading: boolean;
    totalCount: number;

    featured: FeaturedProduct[];
    featuredLoading: boolean;
    onOpenFeatured: (id: string) => void;
    onImpressionFeatured?: (id: string) => void;
};

const CategoryChip = memo(function CategoryChip({
    label,
    active,
    onPress,
}: {
    label: string;
    active: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={[S.chip, active ? S.chipActive : null]}
        >
            <Text style={[S.chipText, active ? S.chipTextActive : null]}>
                {label}
            </Text>
        </Pressable>
    );
});

const ProductTile = memo(function ProductTile({
    item,
    onOpen,
    onReserve,
    reserving,
}: {
    item: Product;
    onOpen: (id: string) => void;
    onReserve: (id: string) => void;
    reserving: boolean;
}) {
    const pricing = useMemo(() => {
        const base = safeNumber(item.basePrice, NaN);
        const final = safeNumber(item.finalPrice, NaN);

        if (Number.isFinite(base) && Number.isFinite(final)) {
            const hasDiscount = !!item.hasDiscount && final < base;
            const economyPct =
                hasDiscount && base > 0
                    ? Math.round(((base - final) / base) * 100)
                    : 0;

            return { base, final, hasDiscount, economyPct };
        }

        const p = safeNumber(item.price, 0);
        return { base: p, final: p, hasDiscount: false, economyPct: 0 };
    }, [item.basePrice, item.finalPrice, item.hasDiscount, item.price]);

    const baseLabel = useMemo(
        () => formatMoneySmartBRL(pricing.base),
        [pricing]
    );
    const finalLabel = useMemo(
        () => formatMoneySmartBRL(pricing.final),
        [pricing]
    );

    const economyPctLabel = useMemo(() => {
        const v = Number(pricing.economyPct ?? 0);
        if (!pricing.hasDiscount || !Number.isFinite(v) || v <= 0) return null;
        return `${Math.max(0, Math.min(99, Math.round(v)))}%`;
    }, [pricing.economyPct, pricing.hasDiscount]);

    return (
        <Pressable style={S.productCard} onPress={() => onOpen(item.id)}>
            <View style={S.productImgWrap}>
                <Image
                    source={{ uri: item.image }}
                    style={S.productImage}
                    fadeDuration={0}
                />

                {/* ✅ ANIVERSÁRIO NÃO APARECE AQUI (só no topo). Mantém LEVEL se vier */}
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

            <Text numberOfLines={2} style={S.productName}>
                {item.name}
            </Text>

            {pricing.hasDiscount ? (
                <View style={S.priceStack}>
                    <Text style={S.productOldPriceBig} numberOfLines={1}>
                        De: {baseLabel}
                    </Text>

                    <Text style={S.productPrice} numberOfLines={1}>
                        Por: {finalLabel}
                    </Text>

                    {economyPctLabel ? (
                        <Text style={S.economyText} numberOfLines={1}>
                            Economia: {economyPctLabel}
                        </Text>
                    ) : null}
                </View>
            ) : (
                <View style={S.priceRow}>
                    <Text style={S.productPrice} numberOfLines={1}>
                        {finalLabel}
                    </Text>
                </View>
            )}

            <View style={S.tileFooter}>
                {item.isOutOfStock ? (
                    <Pressable
                        onPress={() => onOpen(item.id)}
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
                ) : (
                    <Pressable
                        onPress={() => onReserve(item.id)}
                        disabled={reserving}
                        style={[
                            S.reserveBtn,
                            reserving ? S.reserveBtnDisabled : null,
                        ]}
                    >
                        {reserving ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <FontAwesome
                                name="shopping-bag"
                                size={14}
                                color="#FFFFFF"
                            />
                        )}
                        <Text style={S.reserveBtnText}>
                            {reserving ? 'Reservando…' : 'Reservar'}
                        </Text>
                    </Pressable>
                )}
            </View>
        </Pressable>
    );
});

const ProductsHeader = memo(function ProductsHeader({
    topBounceHeight,
    topOffset,
    categories,
    activeCategoryId,
    onSelectCategory,
    search,
    onChangeSearch,
    loading,
    totalCount,

    featured,
    featuredLoading,
    onOpenFeatured,
    onImpressionFeatured,
}: ProductsHeaderProps) {
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
                                placeholder="Buscar por nome…"
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

                        <FlatList
                            data={categories}
                            keyExtractor={(c) => c.id}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={S.chipsContent}
                            renderItem={({
                                item,
                            }: ListRenderItemInfo<Category>) => (
                                <CategoryChip
                                    label={item.label}
                                    active={item.id === activeCategoryId}
                                    onPress={() => onSelectCategory(item.id)}
                                />
                            )}
                            removeClippedSubviews
                            initialNumToRender={6}
                            maxToRenderPerBatch={8}
                            windowSize={5}
                        />
                    </View>

                    <FeaturedCarousel
                        items={featured}
                        loading={featuredLoading}
                        onOpen={onOpenFeatured}
                        onImpression={onImpressionFeatured}
                    />
                </View>
            </View>

            <View style={S.whiteArea}>
                <View style={S.whiteContent}>
                    <View style={S.sectionRow}>
                        <Text style={S.sectionTitle}>Catálogo</Text>
                        <Text style={S.sectionMeta}>
                            {loading
                                ? 'Carregando…'
                                : `${totalCount} produto(s)`}
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    );
});

const ProductsFooter = memo(function ProductsFooter({
    onGoCart,
}: {
    onGoCart: () => void;
}) {
    return (
        <View style={S.footerWrap}>
            <View style={S.bottomCTA}>
                <Pressable style={S.goCartBtn} onPress={onGoCart}>
                    <View style={S.btnCenterRow}>
                        <Text style={S.goCartBtnText}>
                            Ir para o a sacolinha
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
    );
});

export default function Products() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const pathname = usePathname();

    // ✅ multi-tenant
    const { user, meLoading, companyId, refreshMe } = useAuth();
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
            text: { color: c.text },
            icon: { color: c.text },
        } as const;
    }, [userLevelKey]);

    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    const [featured, setFeatured] = useState<FeaturedProduct[]>([]);
    const [featuredLoading, setFeaturedLoading] = useState(true);

    const [reservingId, setReservingId] = useState<string | null>(null);

    const [pendingCartOrderId, setPendingCartOrderId] = useState<string | null>(
        null
    );
    const [pendingCartCount, setPendingCartCount] = useState<number>(0);

    const [unreadNotificationsCount, setUnreadNotificationsCount] =
        useState<number>(0);

    // ✅ aniversário (apenas 1x no topo)
    const [birthdayBadgeLabel, setBirthdayBadgeLabel] = useState<string | null>(
        null
    );

    const fetchingRef = useRef(false);
    const cartFetchingRef = useRef(false);
    const notificationsFetchingRef = useRef(false);
    const featuredFetchingRef = useRef(false);

    const didProductsRef = useRef(false);
    const didCartRef = useRef(false);
    const didNotificationsRef = useRef(false);
    const [dataReady, setDataReady] = useState(false);

    // ============================
    // 👀 Impressions (anti-spam)
    // ============================
    const seenProductIdsRef = useRef<Set<string>>(new Set());
    const seenFeaturedIdsRef = useRef<Set<string>>(new Set());

    // ✅ page_viewed (dedupe por foco)
    const lastViewedKeyRef = useRef<string>('');

    const trackPageViewed = useCallback(() => {
        // ✅ multi-tenant: sem companyId não trackeia
        if (!companyId) return;

        const page = normalizePage(pathname || '/');
        const key = page;

        if (lastViewedKeyRef.current === key) return;
        lastViewedKeyRef.current = key;

        try {
            trackEvent('page_viewed', {
                page,
                platform: 'mobile',
                companyId,
            });
        } catch {}
    }, [pathname, companyId]);

    const recomputeReady = useCallback(() => {
        if (dataReady) return;
        if (
            didProductsRef.current &&
            didCartRef.current &&
            didNotificationsRef.current
        ) {
            setDataReady(true);
        }
    }, [dataReady]);

    const TOP_OFFSET = insets.top + STICKY_ROW_H;

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

    const openProduct = useCallback(
        (id: string) => {
            // ✅ multi-tenant: só track se tiver tenant
            if (companyId) {
                try {
                    trackEvent('product_click', {
                        page: normalizePage(pathname || '/'),
                        from: 'products',
                        productId: id,
                        companyId,
                    });
                } catch {}
            }

            router.push({
                pathname: '/(app)/(tabs)/products/[id]',
                params: { id },
            });
        },
        [router, pathname, companyId]
    );

    const fetchPendingCart = useCallback(async () => {
        if (!companyId) return { id: null as string | null, count: 0 };

        if (cartFetchingRef.current)
            return { id: null as string | null, count: 0 };
        cartFetchingRef.current = true;

        try {
            const res: any = await api.get(
                '/api/mobile/orders?view=bag&limit=1'
            );

            const list = (res?.orders ?? res?.items ?? []) as any[];
            const first = Array.isArray(list) && list.length ? list[0] : null;

            const id = first?.id ? String(first.id) : null;
            const count = first ? sumQtyFromOrder(first) : 0;

            setPendingCartOrderId(id);
            setPendingCartCount(count);

            return { id, count };
        } catch (err: any) {
            setPendingCartOrderId(null);
            setPendingCartCount(0);
            return { id: null as string | null, count: 0 };
        } finally {
            cartFetchingRef.current = false;

            didCartRef.current = true;
            recomputeReady();
        }
    }, [recomputeReady, companyId]);

    const fetchUnreadNotificationsCount = useCallback(async () => {
        if (!companyId) return 0;

        if (notificationsFetchingRef.current) return 0;
        notificationsFetchingRef.current = true;

        try {
            const res = await api.get<NotificationsSummaryResponse>(
                '/api/mobile/notifications'
            );

            const count =
                res?.ok && Number.isFinite(Number(res?.unreadCount))
                    ? Number(res.unreadCount)
                    : 0;

            setUnreadNotificationsCount(count);
            return count;
        } catch (err: any) {
            setUnreadNotificationsCount(0);
            return 0;
        } finally {
            notificationsFetchingRef.current = false;

            didNotificationsRef.current = true;
            recomputeReady();
        }
    }, [recomputeReady, companyId]);

    const goCart = useCallback(async () => {
        if (companyId) {
            try {
                trackEvent('nav_click', {
                    page: normalizePage(pathname || '/'),
                    from: 'products',
                    to: '/client/cart',
                    companyId,
                });
            } catch {}
        }

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
    }, [fetchPendingCart, pendingCartOrderId, router, pathname, companyId]);

    const goNotifications = useCallback(() => {
        if (companyId) {
            try {
                trackEvent('nav_click', {
                    page: normalizePage(pathname || '/'),
                    from: 'products',
                    to: '/client/notifications',
                    companyId,
                });
            } catch {}
        }

        router.push('/client/notifications');
    }, [router, pathname, companyId]);

    const reserveProduct = useCallback(
        async (productId: string) => {
            if (!productId) return;
            if (reservingId) return;

            // ✅ multi-tenant: não cria order sem tenant
            if (!companyId) {
                Alert.alert(
                    'Atenção',
                    'Não foi possível identificar o estabelecimento (companyId). Faça login novamente.'
                );
                return;
            }

            try {
                setReservingId(productId);

                try {
                    trackEvent('add_to_cart_attempt', {
                        page: normalizePage(pathname || '/'),
                        from: 'products',
                        productId,
                        quantity: 1,
                        companyId,
                    });
                } catch {}

                const res = await api.post<{
                    ok: boolean;
                    orderId?: string;
                    reservedUntil?: string;
                }>('/api/mobile/orders', { productId, quantity: 1 });

                const orderId = res?.orderId;

                if (!res?.ok || !orderId) throw new Error('invalid_response');

                try {
                    trackEvent('add_to_cart_success', {
                        page: normalizePage(pathname || '/'),
                        from: 'products',
                        productId,
                        quantity: 1,
                        orderId: String(orderId),
                        companyId,
                    });
                } catch {}

                setPendingCartOrderId(String(orderId));
                await fetchPendingCart();

                router.push({ pathname: '/client/cart', params: { orderId } });
            } catch (err) {
                try {
                    trackEvent('add_to_cart_error', {
                        page: normalizePage(pathname || '/'),
                        from: 'products',
                        productId,
                        message: String((err as any)?.message ?? 'error'),
                        companyId,
                    });
                } catch {}

                console.log('[reserve] error:', err);
                Alert.alert(
                    'Erro',
                    'Não foi possível reservar agora. Tente novamente.'
                );
            } finally {
                setReservingId(null);
            }
        },
        [fetchPendingCart, reservingId, router, pathname, companyId]
    );

    const fetchAllProducts = useCallback(async () => {
        if (!companyId) return;

        if (fetchingRef.current) return;
        fetchingRef.current = true;

        try {
            setLoading(true);

            const all: ApiProduct[] = [];
            let cursor: string | null = null;

            const MAX = 300;

            while (true) {
                const url: string =
                    '/api/mobile/products' +
                    `?limit=50` +
                    (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');

                const res = (await api.get(url)) as {
                    items?: ApiProduct[];
                    nextCursor?: string | null;
                };

                const page: ApiProduct[] = Array.isArray(res?.items)
                    ? res.items
                    : [];

                all.push(...page);

                cursor = (res as any)?.nextCursor ?? null;

                if (!cursor) break;
                if (all.length >= MAX) break;
            }

            // ✅ pega 1 label de aniversário (se vier), mas NÃO mostra nos cards
            const birthdayFromApi = all.find(
                (p: any) =>
                    p?.badge?.type === 'BIRTHDAY' &&
                    String(p?.badge?.label ?? '')
            ) as any;

            const birthdayLabel = birthdayFromApi?.badge?.label
                ? String(birthdayFromApi.badge.label).trim()
                : null;

            setBirthdayBadgeLabel(birthdayLabel || null);

            const mapped: Product[] = all
                .map((p) => {
                    const image: string =
                        normalizeApiImageUrl(p.imageUrl) ||
                        'https://picsum.photos/seed/product-placeholder/600/420';

                    const basePrice = safeNumber((p as any)?.basePrice, NaN);
                    const finalPrice = safeNumber((p as any)?.finalPrice, NaN);

                    const hasDiscount =
                        !!(p as any)?.hasDiscount &&
                        Number.isFinite(basePrice) &&
                        Number.isFinite(finalPrice) &&
                        finalPrice < basePrice;

                    const rawBadge: ProductBadge =
                        (p as any)?.badge &&
                        typeof (p as any).badge === 'object'
                            ? {
                                  type:
                                      (p as any).badge.type === 'BIRTHDAY'
                                          ? 'BIRTHDAY'
                                          : 'LEVEL',
                                  label: String(
                                      (p as any).badge.label ?? ''
                                  ).trim(),
                              }
                            : null;

                    // ✅ regra: BIRTHDAY não vai pro card
                    const badge: ProductBadge =
                        rawBadge?.type === 'BIRTHDAY' ? null : rawBadge;

                    const final = Number.isFinite(finalPrice)
                        ? finalPrice
                        : safeNumber(p.price, 0);

                    const categoryNames = Array.isArray(p.categoryNames)
                        ? p.categoryNames
                              .map((c) => String(c ?? '').trim())
                              .filter(Boolean)
                        : Array.isArray(p.categories)
                          ? p.categories
                                .map((c) => String(c?.name ?? '').trim())
                                .filter(Boolean)
                          : p.category
                            ? [String(p.category).trim()].filter(Boolean)
                            : [];

                    return {
                        id: String(p.id),
                        name: String(p.name ?? 'Produto'),

                        price: final,
                        basePrice: Number.isFinite(basePrice)
                            ? basePrice
                            : undefined,
                        finalPrice: Number.isFinite(finalPrice)
                            ? finalPrice
                            : undefined,
                        hasDiscount,
                        badge: badge?.label ? badge : null,

                        image,
                        isOutOfStock: !!p.isOutOfStock,
                        category: p.category ? String(p.category) : null,
                        categoryNames,
                    };
                })
                .filter((p) => !!p.id);

            setProducts(mapped);

            const activeExists =
                activeCategory === 'all' ||
                mapped.some((p) => {
                    const names = Array.isArray(p.categoryNames)
                        ? p.categoryNames
                              .map((c) =>
                                  String(c ?? '')
                                      .trim()
                                      .toLowerCase()
                              )
                              .filter(Boolean)
                        : [];

                    const legacy = (p.category || '').trim().toLowerCase();

                    return (
                        names.includes(activeCategory.toLowerCase()) ||
                        (!!legacy && legacy === activeCategory.toLowerCase())
                    );
                });

            if (!activeExists) setActiveCategory('all');
        } catch (err: any) {
            const msg =
                err?.data?.error ||
                err?.message ||
                'Não foi possível carregar os produtos.';
            Alert.alert('Erro', String(msg));
            setProducts([]);
            setBirthdayBadgeLabel(null);
        } finally {
            setLoading(false);
            fetchingRef.current = false;

            didProductsRef.current = true;
            recomputeReady();
        }
    }, [activeCategory, recomputeReady, companyId]);

    const fetchFeaturedProducts = useCallback(async () => {
        if (!companyId) return;

        if (featuredFetchingRef.current) return;
        featuredFetchingRef.current = true;

        try {
            setFeaturedLoading(true);

            const res = (await api.get('/api/mobile/products/featured')) as {
                items?: FeaturedApiProduct[];
                products?: FeaturedApiProduct[];
            };

            const list: FeaturedApiProduct[] = Array.isArray(
                (res as any)?.items
            )
                ? ((res as any).items as FeaturedApiProduct[])
                : Array.isArray((res as any)?.products)
                  ? ((res as any).products as FeaturedApiProduct[])
                  : [];

            const mapped: FeaturedProduct[] = list
                .map((p) => {
                    const basePrice = safeNumber((p as any)?.basePrice, NaN);
                    const finalPrice = safeNumber((p as any)?.finalPrice, NaN);

                    const hasDiscount =
                        !!(p as any)?.hasDiscount &&
                        Number.isFinite(basePrice) &&
                        Number.isFinite(finalPrice) &&
                        finalPrice < basePrice;

                    const rawBadge: ProductBadge =
                        (p as any)?.badge &&
                        typeof (p as any).badge === 'object'
                            ? {
                                  type:
                                      (p as any).badge.type === 'BIRTHDAY'
                                          ? 'BIRTHDAY'
                                          : 'LEVEL',
                                  label: String(
                                      (p as any).badge.label ?? ''
                                  ).trim(),
                              }
                            : null;

                    // ✅ regra: BIRTHDAY não vai pro carrossel
                    const badge: ProductBadge =
                        rawBadge?.type === 'BIRTHDAY' ? null : rawBadge;

                    const final = Number.isFinite(finalPrice)
                        ? finalPrice
                        : safeNumber(p.price, 0);

                    // ✅ imagem: normaliza + fallback pra garantir que algo apareça
                    const img = normalizeApiImageUrl((p as any)?.imageUrl);

                    return {
                        id: String((p as any)?.id ?? ''),
                        title: String((p as any)?.name ?? 'Produto'),
                        image: img,

                        price: final,
                        basePrice: Number.isFinite(basePrice)
                            ? basePrice
                            : undefined,
                        finalPrice: Number.isFinite(finalPrice)
                            ? finalPrice
                            : undefined,
                        hasDiscount,
                        badge: badge?.label ? badge : null,

                        unitName: (p as any)?.unitName
                            ? String((p as any).unitName)
                            : undefined,
                    };
                })
                .filter((p) => !!p.id);

            setFeatured(mapped);
        } catch (err: any) {
            setFeatured([]);
        } finally {
            setFeaturedLoading(false);
            featuredFetchingRef.current = false;
        }
    }, [companyId]);

    useFocusEffect(
        useCallback(() => {
            let alive = true;

            (async () => {
                // ✅ reset dedupe por sessão de tela
                seenProductIdsRef.current = new Set();
                seenFeaturedIdsRef.current = new Set();
                lastViewedKeyRef.current = '';

                // ✅ multi-tenant gate: tenta garantir companyId antes de qualquer request
                if (!companyId) {
                    try {
                        await refreshMe();
                    } catch {}

                    if (alive && !companyId) {
                        if (!warnedMissingCompanyRef.current) {
                            warnedMissingCompanyRef.current = true;
                            Alert.alert(
                                'Atenção',
                                'Não foi possível identificar o estabelecimento (companyId). Faça login novamente ou tente atualizar seu perfil.'
                            );
                        }
                        return;
                    }
                }

                // ✅ page_viewed padrão (rota real)
                trackPageViewed();

                fetchAllProducts();
                fetchPendingCart();
                fetchUnreadNotificationsCount();
                fetchFeaturedProducts();
            })();

            return () => {
                alive = false;
                // ao sair, permite registrar de novo quando voltar
                lastViewedKeyRef.current = '';
            };
        }, [
            companyId,
            refreshMe,
            fetchAllProducts,
            fetchPendingCart,
            fetchUnreadNotificationsCount,
            fetchFeaturedProducts,
            trackPageViewed,
        ])
    );

    const categories = useMemo<Category[]>(() => {
        const normalize = (s: string) => s.trim().toLowerCase();

        const uniq = Array.from(
            new Set(
                products.flatMap((p) =>
                    Array.isArray(p.categoryNames)
                        ? p.categoryNames
                              .map((c) => String(c ?? '').trim())
                              .filter(Boolean)
                        : []
                )
            )
        )
            .map((c) => normalize(c))
            .sort((a, b) =>
                a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
            );

        const prettify = (s: string) =>
            s
                .split(' ')
                .filter(Boolean)
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');

        return [{ id: 'all', label: 'Todos' }].concat(
            uniq.map((c) => ({ id: c, label: prettify(c) }))
        );
    }, [products]);

    const filteredProducts = useMemo(() => {
        const q = search.trim().toLowerCase();

        return products.filter((p) => {
            const nameOk = !q || p.name.toLowerCase().includes(q);

            const normalizedCategories = Array.isArray(p.categoryNames)
                ? p.categoryNames
                      .map((c) =>
                          String(c ?? '')
                              .trim()
                              .toLowerCase()
                      )
                      .filter(Boolean)
                : [];

            const legacyCat = (p.category || '').trim().toLowerCase();

            const categoryOk =
                activeCategory === 'all' ||
                normalizedCategories.includes(activeCategory) ||
                (!!legacyCat && legacyCat === activeCategory);

            return nameOk && categoryOk;
        });
    }, [products, search, activeCategory]);

    const keyProduct = useCallback((item: Product) => item.id, []);

    const renderProduct = useCallback(
        ({ item }: ListRenderItemInfo<Product>) => (
            <ProductTile
                item={item}
                onOpen={openProduct}
                onReserve={reserveProduct}
                reserving={reservingId === item.id}
            />
        ),
        [openProduct, reserveProduct, reservingId]
    );

    const onSelectCategory = useCallback(
        (id: string) => {
            setActiveCategory(id);

            if (!companyId) return;
            try {
                trackEvent('filter_category', {
                    page: normalizePage(pathname || '/'),
                    category: id,
                    companyId,
                });
            } catch {}
        },
        [pathname, companyId]
    );

    // ✅ search tracking com debounce
    const searchTimerRef = useRef<any>(null);
    const onChangeSearch = useCallback(
        (v: string) => {
            setSearch(v);

            if (!companyId) return;

            try {
                if (searchTimerRef.current)
                    clearTimeout(searchTimerRef.current);
                searchTimerRef.current = setTimeout(() => {
                    trackEvent('search_change', {
                        page: normalizePage(pathname || '/'),
                        queryLen: String(v ?? '').trim().length,
                        companyId,
                    });
                }, 600);
            } catch {}
        },
        [pathname, companyId]
    );

    // ✅ Impressions na grid (só quando aparece na tela)
    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 60,
        minimumViewTime: 250,
    }).current;

    const onViewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
            // ✅ multi-tenant: sem tenant não trackeia impression
            if (!companyId) return;

            try {
                for (const v of viewableItems) {
                    const item = v?.item as Product | undefined;
                    if (!item?.id) continue;
                    if (!v?.isViewable) continue;

                    if (!seenProductIdsRef.current.has(item.id)) {
                        seenProductIdsRef.current.add(item.id);

                        trackEvent('product_impression', {
                            page: normalizePage(pathname || '/'),
                            productId: item.id,
                            placement: 'grid',
                            isOutOfStock: !!item.isOutOfStock,
                            category:
                                Array.isArray(item.categoryNames) &&
                                item.categoryNames.length > 0
                                    ? item.categoryNames.join(', ')
                                    : (item.category ?? null),
                            companyId,
                        });
                    }
                }
            } catch {}
        }
    ).current;

    const onImpressionFeatured = useCallback(
        (id: string) => {
            if (!companyId) return;

            try {
                if (!id) return;
                if (seenFeaturedIdsRef.current.has(id)) return;
                seenFeaturedIdsRef.current.add(id);

                trackEvent('product_impression', {
                    page: normalizePage(pathname || '/'),
                    productId: id,
                    placement: 'featured',
                    companyId,
                });
            } catch {}
        },
        [pathname, companyId]
    );

    const ListHeader = useMemo(
        () => (
            <ProductsHeader
                topBounceHeight={topBounceHeight}
                topOffset={TOP_OFFSET}
                categories={categories}
                activeCategoryId={activeCategory}
                onSelectCategory={onSelectCategory}
                search={search}
                onChangeSearch={onChangeSearch}
                loading={loading}
                totalCount={filteredProducts.length}
                featured={featured}
                featuredLoading={featuredLoading}
                onOpenFeatured={openProduct}
                onImpressionFeatured={onImpressionFeatured}
            />
        ),
        [
            TOP_OFFSET,
            categories,
            filteredProducts.length,
            loading,
            search,
            onChangeSearch,
            topBounceHeight,
            activeCategory,
            onSelectCategory,
            featured,
            featuredLoading,
            openProduct,
            onImpressionFeatured,
        ]
    );

    const onPressBirthday = useCallback(() => {
        if (!birthdayBadgeLabel) return;
        if (!companyId) return;

        try {
            trackEvent('action_click', {
                page: normalizePage(pathname || '/'),
                action: 'birthday_badge',
                companyId,
            });
        } catch {}

        Alert.alert(
            'Parabéns pra você! 🎂',
            'Aproveite os descontos especiais\npara aniversariantes!'
        );
    }, [birthdayBadgeLabel, pathname, companyId]);

    return (
        <ScreenGate dataReady={dataReady} skeleton={<ProductsSkeleton />}>
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
                    data={filteredProducts}
                    keyExtractor={keyProduct}
                    renderItem={renderProduct}
                    numColumns={2}
                    columnWrapperStyle={S.gridRow}
                    showsVerticalScrollIndicator={false}
                    style={S.list}
                    contentContainerStyle={S.listContent}
                    ListHeaderComponent={ListHeader}
                    ListFooterComponent={<ProductsFooter onGoCart={goCart} />}
                    ListEmptyComponent={
                        <View style={{ padding: 18 }}>
                            <Text
                                style={{
                                    color: UI.colors.black45,
                                    textAlign: 'center',
                                    fontWeight: '600',
                                }}
                            >
                                Nenhum produto encontrado.
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

    filtersCard: {
        padding: UI.spacing.cardPad,
        marginTop: 14,
    },

    profileRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    hello: { color: UI.colors.textMuted, fontSize: 12, fontWeight: '700' },
    name: { color: UI.colors.text, fontSize: 16, fontWeight: '700' },

    topRightRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },

    levelBtn: {
        paddingTop: 7,
    },
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

    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
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

    chipsContent: { paddingRight: 8 },

    chip: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: UI.radius.pill,
        backgroundColor: UI.colors.overlay08,
        borderWidth: 1,
        borderColor: UI.colors.overlay10,
        marginRight: 10,
    },
    chipActive: {
        backgroundColor: UI.brand.primary,
        borderColor: UI.colors.overlay18,
    },
    chipText: {
        color: UI.colors.categoryChipText,
        fontWeight: '600',
        fontSize: 13,
    },
    chipTextActive: { color: UI.colors.categoryChipTextActive },

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

    productCard: {
        width: '48.2%',
        marginBottom: 14,
        borderRadius: UI.radius.card,
        backgroundColor: UI.colors.white,
        borderWidth: 1,
        borderColor: UI.colors.black08,
        padding: 12,
    },

    productImgWrap: {
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: UI.colors.black05,
        position: 'relative',
    },
    productImage: { height: 124, width: '100%' },

    badgePill: {
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
        zIndex: 3,
    },
    outOfStockText: {
        color: UI.colors.white,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.4,
    },

    productName: {
        marginTop: 10,
        fontSize: 14,
        fontWeight: '700',
        color: UI.brand.primaryText,
        lineHeight: 18,
        minHeight: 36,
    },

    priceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
    },

    priceStack: {
        marginTop: 8,
        gap: 2,
    },

    productPrice: {
        fontSize: 16,
        fontWeight: '800',
        color: UI.brand.primaryText,
    },

    productOldPriceBig: {
        textDecorationLine: 'line-through',
        color: UI.colors.black45,
        fontWeight: '800',
        fontSize: 12,
    },

    economyText: {
        marginTop: 1,
        fontSize: 12,
        fontWeight: '900',
        color: UI.colors.black45,
    },

    tileFooter: {
        marginTop: 12,
        gap: 10,
    },

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

    reserveBtn: {
        height: 40,
        borderRadius: 999,
        paddingHorizontal: 12,
        backgroundColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 10,
    },
    reserveBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    reserveBtnDisabled: {
        opacity: 0.75,
    },

    footerWrap: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 8,
        paddingBottom: 24,
        backgroundColor: UI.colors.white,
    },

    bottomCTA: { gap: 10 },

    goCartBtn: {
        height: 44,
        borderRadius: 999,
        paddingHorizontal: 14,
        backgroundColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
    },
    goCartBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },

    // =========================
    // ⭐ Destaques (carrossel)
    // =========================
    featureListContent: {
        paddingRight: UI.spacing.screenX,
    },

    featureCard: {
        backgroundColor: UI.colors.heroCardBg,
        borderRadius: UI.radius.card,
        padding: UI.spacing.cardPad,
        borderWidth: 1,
        borderColor: UI.colors.heroCardBorder,
        marginRight: 12,
    },

    featureCardLoading: {
        marginTop: 14,
    },

    featureRow: { flexDirection: 'row', justifyContent: 'space-between' },

    featureLeft: { flex: 1, paddingRight: 12 },

    featureTopLine: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },

    featureKicker: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 12,
        fontWeight: '800',
    },

    featureTitle: {
        color: UI.colors.text,
        fontSize: 20,
        fontWeight: '500',
        marginTop: 8,
    },

    featurePrice: {
        color: UI.colors.text,
        fontSize: 18,
        fontWeight: '500',
    },

    featureOldPrice: {
        textDecorationLine: 'line-through',
        color: 'rgba(255,255,255,0.75)',
        fontWeight: '900',
        fontSize: 12,
        marginBottom: 2,
    },

    featureEconomy: {
        marginTop: 2,
        color: 'rgba(255,255,255,0.75)',
        fontWeight: '900',
        fontSize: 12,
    },

    featureUnit: {
        marginTop: 8,
        color: 'rgba(255,255,255,0.70)',
        fontSize: 12,
        fontWeight: '700',
    },

    featureBtn: {
        marginTop: 14,
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: UI.radius.pill,
        backgroundColor: 'rgba(20,20,20,0.35)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.20)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    featureBtnText: { color: UI.colors.white, fontSize: 14, fontWeight: '800' },

    featureThumb: {
        width: 78,
        height: 78,
        borderRadius: UI.radius.card,
        overflow: 'hidden',
        backgroundColor: UI.colors.overlay08,
        borderWidth: 1,
        borderColor: UI.colors.cardBorder,
        alignItems: 'center',
        justifyContent: 'center',
    },

    featureThumbImg: { width: '100%', height: '100%' },

    featureThumbFallback: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },

    featureBadge: {
        maxWidth: 150,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: 'rgba(20,20,20,0.70)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
    },
    featureBadgeText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 0.2,
    },

    skelLineSmall: {
        height: 10,
        width: '45%',
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    skelLineBig: {
        marginTop: 10,
        height: 18,
        width: '85%',
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    skelLineMid: {
        marginTop: 10,
        height: 14,
        width: '60%',
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    skelBtn: {
        marginTop: 14,
        height: 38,
        width: 140,
        borderRadius: 999,
        backgroundColor: 'rgba(20,20,20,0.25)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    skelThumb: {
        width: 78,
        height: 78,
        borderRadius: UI.radius.card,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    avatarFallback42: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: UI.brand.primary,
        borderWidth: 2,
        borderColor: UI.brand.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
