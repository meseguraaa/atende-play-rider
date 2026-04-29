// mobile/src/components/loading/CartSkeleton.tsx
import React, { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI } from '../../theme/client-theme';
import { ShimmerBlock } from './ShimmerBlock';

const STICKY_ROW_H = 74;

function CartSkeletonBase() {
    const insets = useSafeAreaInsets();

    const TOP_OFFSET = insets.top + STICKY_ROW_H;

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    const headerSpacerStyle = useMemo(
        () => ({ height: TOP_OFFSET + 10, backgroundColor: UI.colors.bg }),
        [TOP_OFFSET]
    );

    const footerPadBottom = useMemo(
        () => Math.max(12, insets.bottom + 10),
        [insets.bottom]
    );

    const ItemRow = ({ withDivider }: { withDivider?: boolean }) => (
        <View style={S.itemCard}>
            <View style={S.itemImageWrap}>
                <ShimmerBlock width={'100%'} height={62} radius={14} />
            </View>

            <View style={{ flex: 1 }}>
                <ShimmerBlock width={'82%'} height={14} radius={9} />
                <ShimmerBlock
                    width={'46%'}
                    height={10}
                    radius={8}
                    style={{ marginTop: 8 }}
                />

                <View style={S.itemBottomRow}>
                    <ShimmerBlock width={68} height={10} radius={8} />
                    <ShimmerBlock width={84} height={12} radius={9} />
                </View>
            </View>

            {withDivider ? <View style={S.itemDivider} /> : null}
        </View>
    );

    return (
        <View style={S.page}>
            {/* Topo fixo */}
            <View style={S.fixedTop}>
                <View style={safeTopStyle} />

                <View style={S.stickyRow}>
                    <ShimmerBlock width={42} height={42} radius={21} />
                    <View style={S.titleWrap}>
                        <ShimmerBlock width={86} height={14} radius={8} />
                    </View>
                    <View style={{ width: 42, height: 42 }} />
                </View>
            </View>

            {/* Conteúdo */}
            <View style={S.list}>
                <View style={headerSpacerStyle} />

                <View style={S.whiteArea}>
                    {/* card resumo do pedido */}
                    <View style={S.headerBlock}>
                        <View style={S.card}>
                            <View style={S.row}>
                                <ShimmerBlock
                                    width={28}
                                    height={28}
                                    radius={10}
                                />
                                <ShimmerBlock
                                    width={88}
                                    height={10}
                                    radius={8}
                                />
                                <ShimmerBlock
                                    width={'48%'}
                                    height={10}
                                    radius={8}
                                />
                            </View>

                            <View style={S.row}>
                                <ShimmerBlock
                                    width={28}
                                    height={28}
                                    radius={10}
                                />
                                <ShimmerBlock
                                    width={88}
                                    height={10}
                                    radius={8}
                                />
                                <ShimmerBlock
                                    width={'58%'}
                                    height={10}
                                    radius={8}
                                />
                            </View>

                            <View style={S.row}>
                                <ShimmerBlock
                                    width={28}
                                    height={28}
                                    radius={10}
                                />
                                <ShimmerBlock
                                    width={88}
                                    height={10}
                                    radius={8}
                                />
                                <ShimmerBlock
                                    width={'40%'}
                                    height={10}
                                    radius={8}
                                />
                            </View>

                            <View style={S.row}>
                                <ShimmerBlock
                                    width={28}
                                    height={28}
                                    radius={10}
                                />
                                <ShimmerBlock
                                    width={88}
                                    height={10}
                                    radius={8}
                                />
                                <ShimmerBlock
                                    width={'52%'}
                                    height={10}
                                    radius={8}
                                />
                            </View>
                        </View>

                        {/* header da seção itens */}
                        <View style={S.sectionHeader}>
                            <ShimmerBlock width={70} height={16} radius={10} />
                            <ShimmerBlock
                                width={'92%'}
                                height={12}
                                radius={9}
                                style={{ marginTop: 8 }}
                            />
                            <ShimmerBlock
                                width={'72%'}
                                height={12}
                                radius={9}
                                style={{ marginTop: 6 }}
                            />
                        </View>
                    </View>

                    {/* itens */}
                    <ItemRow withDivider />
                    <ItemRow withDivider />
                    <ItemRow />

                    {/* footer fixo (total + botão) */}
                    <View
                        style={[S.footer, { paddingBottom: footerPadBottom }]}
                    >
                        <View style={S.totalRow}>
                            <ShimmerBlock width={54} height={10} radius={8} />
                            <ShimmerBlock width={92} height={14} radius={9} />
                        </View>
                        <ShimmerBlock width={'100%'} height={48} radius={16} />
                    </View>
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

    stickyRow: {
        height: STICKY_ROW_H,
        backgroundColor: UI.colors.bg,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },

    titleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    list: { flex: 1, backgroundColor: UI.colors.white },

    whiteArea: { flex: 1, backgroundColor: UI.colors.white },

    headerBlock: {
        paddingHorizontal: UI.spacing.screenX,
        paddingBottom: 12,
        backgroundColor: UI.colors.white,
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

    sectionHeader: {
        paddingTop: 18,
        paddingBottom: 6,
        backgroundColor: UI.colors.white,
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
        position: 'relative',
    },

    itemImageWrap: {
        width: 62,
        height: 62,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: UI.colors.black05,
    },

    itemBottomRow: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },

    itemDivider: {
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: -6,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.06)',
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
});

export const CartSkeleton = memo(CartSkeletonBase);
