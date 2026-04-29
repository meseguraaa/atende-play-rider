// mobile/src/components/loading/HomeSkeleton.tsx
import React, { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI } from '../../theme/client-theme';
import { ShimmerBlock } from './ShimmerBlock';

const STICKY_ROW_H = 74;

type Props = {
    /**
     * Controla se o shimmer anima ou fica "estático".
     * O ScreenGate usa isso pra desligar o shimmer durante o fade-out.
     */
    active?: boolean;
};

function HomeSkeletonBase({ active = true }: Props) {
    const insets = useSafeAreaInsets();

    const TOP_OFFSET = insets.top + STICKY_ROW_H;

    const headerSpacerStyle = useMemo(
        () => ({ height: TOP_OFFSET, backgroundColor: UI.colors.bg }),
        [TOP_OFFSET]
    );

    return (
        <View style={S.page}>
            {/* Topo fixo (barra roxa + sticky row) */}
            <View style={S.fixedTop}>
                <View
                    style={{
                        height: insets.top,
                        backgroundColor: UI.brand.primary,
                    }}
                />

                <View style={S.stickyRow}>
                    {/* Avatar + textos */}
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

                    {/* Botões direita */}
                    {/* ✅ Home atual: Level + Bag + Bell (aniversário NÃO deve aparecer no skeleton) */}
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

            {/* Conteúdo */}
            <View style={S.list}>
                {/* Espaçador pra respeitar o header fixo */}
                <View style={headerSpacerStyle} />

                {/* Área escura com card principal */}
                <View style={S.darkShell}>
                    <View style={S.darkInner}>
                        <View style={S.heroCard}>
                            <ShimmerBlock
                                width={'85%'}
                                height={14}
                                radius={8}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'70%'}
                                height={18}
                                radius={10}
                                style={{ marginTop: 12 }}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'55%'}
                                height={16}
                                radius={10}
                                style={{ marginTop: 10 }}
                                active={active}
                            />

                            <View style={S.metaRow}>
                                <ShimmerBlock
                                    width={'50%'}
                                    height={14}
                                    radius={8}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={110}
                                    height={26}
                                    radius={999}
                                    active={active}
                                />
                            </View>

                            <View style={S.actionsRow}>
                                <ShimmerBlock
                                    width={'48%'}
                                    height={42}
                                    radius={999}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'48%'}
                                    height={42}
                                    radius={999}
                                    active={active}
                                />
                            </View>
                        </View>
                    </View>
                </View>

                {/* Área branca */}
                <View style={S.whiteArea}>
                    <View style={S.whiteContent}>
                        {/* Título Produtos */}
                        <ShimmerBlock
                            width={120}
                            height={18}
                            radius={10}
                            style={{ marginBottom: 14 }}
                            active={active}
                        />

                        {/* Cards Produtos (2 visíveis no skeleton, como antes) */}
                        <View style={S.productsRow}>
                            <View style={S.productCard}>
                                <ShimmerBlock
                                    width={'100%'}
                                    height={140}
                                    radius={12}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'90%'}
                                    height={14}
                                    radius={8}
                                    style={{ marginTop: 12 }}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'60%'}
                                    height={10}
                                    radius={8}
                                    style={{ marginTop: 10 }}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'50%'}
                                    height={18}
                                    radius={10}
                                    style={{ marginTop: 10 }}
                                    active={active}
                                />
                            </View>

                            <View style={S.productCard}>
                                <ShimmerBlock
                                    width={'100%'}
                                    height={140}
                                    radius={12}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'85%'}
                                    height={14}
                                    radius={8}
                                    style={{ marginTop: 12 }}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'55%'}
                                    height={10}
                                    radius={8}
                                    style={{ marginTop: 10 }}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'45%'}
                                    height={18}
                                    radius={10}
                                    style={{ marginTop: 10 }}
                                    active={active}
                                />
                            </View>
                        </View>

                        {/* Botão "Ver todos" */}
                        <ShimmerBlock
                            width={'100%'}
                            height={40}
                            radius={999}
                            style={{ marginTop: 18 }}
                            active={active}
                        />

                        {/* Header Histórico */}
                        <View style={S.historyHeaderRow}>
                            <ShimmerBlock
                                width={110}
                                height={18}
                                radius={10}
                                active={active}
                            />
                            <ShimmerBlock
                                width={90}
                                height={30}
                                radius={999}
                                active={active}
                            />
                        </View>
                    </View>

                    {/* Itens do histórico */}
                    <View style={{ paddingTop: 6 }}>
                        <View style={S.historyItem}>
                            <ShimmerBlock
                                width={36}
                                height={36}
                                radius={10}
                                active={active}
                            />
                            <View style={{ flex: 1, marginLeft: 14 }}>
                                <ShimmerBlock
                                    width={'55%'}
                                    height={14}
                                    radius={8}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'85%'}
                                    height={12}
                                    radius={8}
                                    style={{ marginTop: 8 }}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'35%'}
                                    height={10}
                                    radius={8}
                                    style={{ marginTop: 8 }}
                                    active={active}
                                />
                            </View>
                        </View>

                        <View style={S.historyDivider} />

                        <View style={S.historyItem}>
                            <ShimmerBlock
                                width={36}
                                height={36}
                                radius={10}
                                active={active}
                            />
                            <View style={{ flex: 1, marginLeft: 14 }}>
                                <ShimmerBlock
                                    width={'50%'}
                                    height={14}
                                    radius={8}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'80%'}
                                    height={12}
                                    radius={8}
                                    style={{ marginTop: 8 }}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'30%'}
                                    height={10}
                                    radius={8}
                                    style={{ marginTop: 8 }}
                                    active={active}
                                />
                            </View>
                        </View>

                        <View style={S.historyDivider} />

                        <View style={S.historyItem}>
                            <ShimmerBlock
                                width={36}
                                height={36}
                                radius={10}
                                active={active}
                            />
                            <View style={{ flex: 1, marginLeft: 14 }}>
                                <ShimmerBlock
                                    width={'58%'}
                                    height={14}
                                    radius={8}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'78%'}
                                    height={12}
                                    radius={8}
                                    style={{ marginTop: 8 }}
                                    active={active}
                                />
                                <ShimmerBlock
                                    width={'32%'}
                                    height={10}
                                    radius={8}
                                    style={{ marginTop: 8 }}
                                    active={active}
                                />
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </View>
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

    heroCard: {
        marginTop: 14,
        backgroundColor: UI.colors.heroCardBg,
        borderRadius: UI.radius.card,
        padding: UI.spacing.cardPad,
        borderWidth: 1,
        borderColor: UI.colors.heroCardBorder,
    },

    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 14,
        alignItems: 'center',
        gap: 12,
    },

    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },

    whiteArea: { backgroundColor: UI.colors.white },
    whiteContent: { paddingHorizontal: UI.spacing.screenX, paddingTop: 18 },

    productsRow: { flexDirection: 'row', gap: 18 },
    productCard: { width: 220 },

    historyHeaderRow: {
        marginTop: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },

    historyItem: {
        paddingVertical: 16,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        alignItems: 'center',
    },

    historyDivider: {
        height: 1,
        marginLeft: UI.spacing.screenX,
        marginRight: UI.spacing.screenX,
        backgroundColor: 'rgba(0,0,0,0.08)',
    },
});

export const HomeSkeleton = memo(HomeSkeletonBase);
