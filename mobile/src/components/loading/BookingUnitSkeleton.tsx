// mobile/src/components/loading/BookingUnitSkeleton.tsx
import React, { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI } from '../../theme/client-theme';
import { ShimmerBlock } from './ShimmerBlock';

const STICKY_ROW_H = 74;

function BookingUnitSkeletonBase() {
    const insets = useSafeAreaInsets();

    const TOP_OFFSET = insets.top + STICKY_ROW_H;
    const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    const headerSpacerStyle = useMemo(
        () => ({ height: TOP_OFFSET, backgroundColor: UI.colors.bg }),
        [TOP_OFFSET]
    );

    return (
        <View style={S.page}>
            <View style={S.fixedTop}>
                <View style={safeTopStyle} />

                <View style={S.stickyRow}>
                    <ShimmerBlock width={42} height={42} radius={21} />
                    <ShimmerBlock width={160} height={14} radius={8} />
                    <View style={{ width: 42, height: 42 }} />
                </View>
            </View>

            <View
                pointerEvents="none"
                style={[S.topBounceDark, { height: topBounceHeight }]}
            />

            <View style={headerSpacerStyle} />

            <View style={S.darkShell}>
                <View style={S.darkInner}>
                    <View style={S.heroCard}>
                        <ShimmerBlock width={160} height={18} radius={10} />
                        <ShimmerBlock
                            width={'85%'}
                            height={12}
                            radius={8}
                            style={{ marginTop: 10 }}
                        />
                        <ShimmerBlock
                            width={'72%'}
                            height={12}
                            radius={8}
                            style={{ marginTop: 8 }}
                        />
                    </View>
                </View>
            </View>

            <View style={S.whiteArea}>
                <View style={S.whiteContent}>
                    <ShimmerBlock
                        width={110}
                        height={18}
                        radius={10}
                        style={{ marginBottom: 12 }}
                    />

                    <View style={S.row}>
                        <View style={S.rowLeft}>
                            <ShimmerBlock width={38} height={38} radius={12} />
                            <View style={{ flex: 1 }}>
                                <ShimmerBlock
                                    width={'60%'}
                                    height={14}
                                    radius={8}
                                />
                                <ShimmerBlock
                                    width={'45%'}
                                    height={12}
                                    radius={8}
                                    style={{ marginTop: 8 }}
                                />
                            </View>
                        </View>
                        <ShimmerBlock width={14} height={14} radius={7} />
                        <View style={S.divider} />
                    </View>

                    <View style={S.row}>
                        <View style={S.rowLeft}>
                            <ShimmerBlock width={38} height={38} radius={12} />
                            <View style={{ flex: 1 }}>
                                <ShimmerBlock
                                    width={'55%'}
                                    height={14}
                                    radius={8}
                                />
                                <ShimmerBlock
                                    width={'40%'}
                                    height={12}
                                    radius={8}
                                    style={{ marginTop: 8 }}
                                />
                            </View>
                        </View>
                        <ShimmerBlock width={14} height={14} radius={7} />
                        <View style={S.divider} />
                    </View>

                    <View style={S.row}>
                        <View style={S.rowLeft}>
                            <ShimmerBlock width={38} height={38} radius={12} />
                            <View style={{ flex: 1 }}>
                                <ShimmerBlock
                                    width={'58%'}
                                    height={14}
                                    radius={8}
                                />
                                <ShimmerBlock
                                    width={'42%'}
                                    height={12}
                                    radius={8}
                                    style={{ marginTop: 8 }}
                                />
                            </View>
                        </View>
                        <ShimmerBlock width={14} height={14} radius={7} />
                    </View>
                </View>
            </View>
        </View>
    );
}

const S = StyleSheet.create({
    // ✅ CHAVE: fundo branco atrás do darkShell (pra recorte aparecer)
    page: { flex: 1, backgroundColor: UI.colors.white },

    fixedTop: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 999 },

    stickyRow: {
        height: STICKY_ROW_H,
        backgroundColor: UI.colors.bg,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

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

    heroCard: {
        marginTop: 14,
        backgroundColor: UI.colors.heroCardBg,
        borderRadius: UI.radius.card,
        padding: UI.spacing.cardPad,
        borderWidth: 1,
        borderColor: UI.colors.heroCardBorder,
    },

    whiteArea: { flex: 1, backgroundColor: UI.colors.white },
    whiteContent: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 18,
        flex: 1,
    },

    row: {
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
    },
    rowLeft: { flexDirection: 'row', gap: 12, flex: 1, alignItems: 'center' },

    divider: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.08)',
    },
});

export const BookingUnitSkeleton = memo(BookingUnitSkeletonBase);
