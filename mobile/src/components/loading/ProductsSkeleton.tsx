// mobile/src/components/loading/ProductsSkeleton.tsx
import React, { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI, styles as themeStyles } from '../../theme/client-theme';
import { ShimmerBlock } from './ShimmerBlock';

const STICKY_ROW_H = 74;

type Props = {
    /**
     * Controla se o shimmer anima ou fica "estático".
     * O ScreenGate usa isso pra desligar o shimmer durante o fade-out.
     */
    active?: boolean;
};

function ProductsSkeletonBase({ active = true }: Props) {
    const insets = useSafeAreaInsets();

    const TOP_OFFSET = insets.top + STICKY_ROW_H;

    const headerSpacerStyle = useMemo(
        () => ({ height: TOP_OFFSET, backgroundColor: UI.colors.bg }),
        [TOP_OFFSET]
    );

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    // 2 colunas com gap parecido com a tela real
    const gridGap = 14;
    const cardW = '48.2%';

    return (
        <View style={S.page}>
            {/* Topo fixo */}
            <View style={S.fixedTop}>
                <View style={safeTopStyle} />
                <View
                    style={[
                        themeStyles.stickyRowBase,
                        { height: STICKY_ROW_H },
                    ]}
                >
                    <View style={S.profileRow}>
                        <ShimmerBlock
                            width={42}
                            height={42}
                            radius={21}
                            active={active}
                        />
                        <View style={{ flex: 1 }}>
                            <ShimmerBlock
                                width={44}
                                height={10}
                                radius={6}
                                style={{ marginBottom: 8 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'60%'}
                                height={14}
                                radius={8}
                                active={active}
                            />
                        </View>
                    </View>

                    {/* ✅ Products real: Level + Bag + Bell (aniversário NÃO deve aparecer no skeleton) */}
                    <View style={S.topRightRow}>
                        <ShimmerBlock
                            width={42}
                            height={42}
                            radius={21}
                            active={active}
                        />
                        <ShimmerBlock
                            width={42}
                            height={42}
                            radius={21}
                            active={active}
                        />
                        <ShimmerBlock
                            width={42}
                            height={42}
                            radius={21}
                            active={active}
                        />
                    </View>
                </View>
            </View>

            {/* Conteúdo "scroll" */}
            <View style={S.list}>
                <View style={headerSpacerStyle} />

                {/* Header dark */}
                <View style={S.darkShell}>
                    <View style={S.darkInner}>
                        <View style={[themeStyles.glassCard, S.filtersCard]}>
                            {/* Search row */}
                            <View style={S.searchRow}>
                                <ShimmerBlock
                                    width={36}
                                    height={36}
                                    radius={12}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'70%'}
                                    height={16}
                                    radius={10}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={22}
                                    height={22}
                                    radius={11}
                                    active={active}
                                />
                            </View>

                            {/* ✅ chips de categoria NÃO devem aparecer no carregamento */}
                            {/* (removido) */}
                        </View>

                        {/* Hero card */}
                        <View style={S.heroCard}>
                            <View style={S.heroRow}>
                                <View style={S.heroLeft}>
                                    <ShimmerBlock
                                        width={110}
                                        height={10}
                                        radius={8}
                                        active={active}
                                    />
                                    <ShimmerBlock
                                        width={'85%'}
                                        height={18}
                                        radius={10}
                                        style={{ marginTop: 10 }}
                                        active={active}
                                    />
                                    <ShimmerBlock
                                        width={'92%'}
                                        height={12}
                                        radius={10}
                                        style={{ marginTop: 10 }}
                                        active={active}
                                    />
                                    <ShimmerBlock
                                        width={'70%'}
                                        height={12}
                                        radius={10}
                                        style={{ marginTop: 8 }}
                                        active={active}
                                    />
                                    <ShimmerBlock
                                        width={86}
                                        height={36}
                                        radius={999}
                                        style={{ marginTop: 14 }}
                                        active={active}
                                    />
                                </View>

                                <ShimmerBlock
                                    width={64}
                                    height={64}
                                    radius={16}
                                    active={active}
                                />
                            </View>
                        </View>
                    </View>
                </View>

                {/* White section header */}
                <View style={S.whiteArea}>
                    <View style={S.whiteContent}>
                        <View style={S.sectionRow}>
                            <ShimmerBlock
                                width={120}
                                height={18}
                                radius={10}
                                active={active}
                            />
                            <ShimmerBlock
                                width={84}
                                height={12}
                                radius={8}
                                active={active}
                            />
                        </View>
                    </View>
                </View>

                {/* Grid */}
                <View style={[S.gridWrap, { rowGap: gridGap }]}>
                    <View style={S.gridRow}>
                        <View style={[S.card, { width: cardW }]}>
                            <ShimmerBlock
                                width={'100%'}
                                height={124}
                                radius={14}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'92%'}
                                height={14}
                                radius={10}
                                style={{ marginTop: 10 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'70%'}
                                height={14}
                                radius={10}
                                style={{ marginTop: 8 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'55%'}
                                height={16}
                                radius={10}
                                style={{ marginTop: 10 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'100%'}
                                height={40}
                                radius={999}
                                style={{ marginTop: 12 }}
                                active={active}
                            />
                        </View>

                        <View style={[S.card, { width: cardW }]}>
                            <ShimmerBlock
                                width={'100%'}
                                height={124}
                                radius={14}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'88%'}
                                height={14}
                                radius={10}
                                style={{ marginTop: 10 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'62%'}
                                height={14}
                                radius={10}
                                style={{ marginTop: 8 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'48%'}
                                height={16}
                                radius={10}
                                style={{ marginTop: 10 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'100%'}
                                height={40}
                                radius={999}
                                style={{ marginTop: 12 }}
                                active={active}
                            />
                        </View>
                    </View>

                    <View style={S.gridRow}>
                        <View style={[S.card, { width: cardW }]}>
                            <ShimmerBlock
                                width={'100%'}
                                height={124}
                                radius={14}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'90%'}
                                height={14}
                                radius={10}
                                style={{ marginTop: 10 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'68%'}
                                height={14}
                                radius={10}
                                style={{ marginTop: 8 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'52%'}
                                height={16}
                                radius={10}
                                style={{ marginTop: 10 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'100%'}
                                height={40}
                                radius={999}
                                style={{ marginTop: 12 }}
                                active={active}
                            />
                        </View>

                        <View style={[S.card, { width: cardW }]}>
                            <ShimmerBlock
                                width={'100%'}
                                height={124}
                                radius={14}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'86%'}
                                height={14}
                                radius={10}
                                style={{ marginTop: 10 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'60%'}
                                height={14}
                                radius={10}
                                style={{ marginTop: 8 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'44%'}
                                height={16}
                                radius={10}
                                style={{ marginTop: 10 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'100%'}
                                height={40}
                                radius={999}
                                style={{ marginTop: 12 }}
                                active={active}
                            />
                        </View>
                    </View>
                </View>

                {/* Footer CTA */}
                <View style={S.footerWrap}>
                    <ShimmerBlock
                        width={'100%'}
                        height={40}
                        radius={999}
                        active={active}
                    />
                </View>
            </View>
        </View>
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

    profileRow: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        flex: 1,
        paddingRight: 12,
    },
    topRightRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },

    list: { flex: 1, backgroundColor: UI.colors.white },

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
        // ✅ como removemos os chips, não precisamos de marginBottom grande aqui
        marginBottom: 0,
    },

    heroCard: {
        marginTop: 14,
        backgroundColor: UI.colors.heroCardBg,
        borderRadius: UI.radius.card,
        padding: UI.spacing.cardPad,
        borderWidth: 1,
        borderColor: UI.colors.heroCardBorder,
    },

    heroRow: { flexDirection: 'row', justifyContent: 'space-between' },
    heroLeft: { flex: 1, paddingRight: 12 },

    whiteArea: { backgroundColor: UI.colors.white },
    whiteContent: { paddingHorizontal: UI.spacing.screenX, paddingTop: 18 },

    sectionRow: {
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
    },

    gridWrap: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 4,
    },
    gridRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },

    card: {
        borderRadius: UI.radius.card,
        backgroundColor: UI.colors.white,
        borderWidth: 1,
        borderColor: UI.colors.black08,
        padding: 12,
    },

    footerWrap: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 14,
        paddingBottom: 24,
        backgroundColor: UI.colors.white,
    },
});

export const ProductsSkeleton = memo(ProductsSkeletonBase);
