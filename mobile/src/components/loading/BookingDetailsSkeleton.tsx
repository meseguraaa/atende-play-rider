// mobile/src/components/loading/BookingDetailsSkeleton.tsx
import React, { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI } from '../../theme/client-theme';
import { ShimmerBlock } from './ShimmerBlock';

const STICKY_ROW_H = 74;

function BookingDetailsSkeletonBase() {
    const insets = useSafeAreaInsets();

    const TOP_OFFSET = insets.top + STICKY_ROW_H;
    const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    return (
        <View style={S.page}>
            <View style={S.fixedTop}>
                <View style={safeTopStyle} />
                <View style={S.stickyRow}>
                    <View style={S.backBtnFake}>
                        <ShimmerBlock width={18} height={18} radius={6} />
                    </View>

                    <ShimmerBlock width={180} height={14} radius={8} />

                    <View style={{ width: 42, height: 42 }} />
                </View>
            </View>

            <View
                pointerEvents="none"
                style={[S.topBounceDark, { height: topBounceHeight }]}
            />
            <View
                style={{ height: TOP_OFFSET, backgroundColor: UI.colors.bg }}
            />

            <View style={S.darkShell}>
                <View style={S.darkInner}>
                    <View style={S.heroCard}>
                        <ShimmerBlock width={120} height={16} radius={10} />
                        <ShimmerBlock
                            width={'86%'}
                            height={12}
                            radius={8}
                            style={{ marginTop: 12 }}
                        />
                        <ShimmerBlock
                            width={'78%'}
                            height={12}
                            radius={8}
                            style={{ marginTop: 8 }}
                        />
                        <ShimmerBlock
                            width={'70%'}
                            height={12}
                            radius={8}
                            style={{ marginTop: 8 }}
                        />
                        <ShimmerBlock
                            width={'55%'}
                            height={10}
                            radius={8}
                            style={{ marginTop: 14 }}
                        />
                    </View>
                </View>
            </View>

            <View style={S.whiteArea}>
                <View style={S.whiteContent}>
                    <ShimmerBlock width={70} height={14} radius={8} />
                    <ShimmerBlock
                        width={'100%'}
                        height={52}
                        radius={14}
                        style={{ marginTop: 10 }}
                    />

                    <ShimmerBlock
                        width={86}
                        height={14}
                        radius={8}
                        style={{ marginTop: 18 }}
                    />
                    <ShimmerBlock
                        width={'100%'}
                        height={52}
                        radius={14}
                        style={{ marginTop: 10 }}
                    />

                    <ShimmerBlock
                        width={'100%'}
                        height={56}
                        radius={999}
                        style={{ marginTop: 18 }}
                    />
                    <ShimmerBlock
                        width={'100%'}
                        height={52}
                        radius={999}
                        style={{ marginTop: 10 }}
                    />
                </View>
            </View>
        </View>
    );
}

const S = StyleSheet.create({
    // ✅ CHAVE: branco pra aparecer o "preto por cima"
    page: { flex: 1, backgroundColor: UI.colors.white },

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
        justifyContent: 'space-between',
    },

    // ✅ back fake roxinho sólido
    backBtnFake: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: UI.brand.primary,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center',
        justifyContent: 'center',
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
        paddingBottom: 28,
    },
});

export const BookingDetailsSkeleton = memo(BookingDetailsSkeletonBase);
