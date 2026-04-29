// mobile/src/components/loading/BookingServiceSkeleton.tsx
import React, { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI } from '../../theme/client-theme';
import { ShimmerBlock } from './ShimmerBlock';

const STICKY_ROW_H = 74;

function BookingServiceSkeletonBase() {
    const insets = useSafeAreaInsets();

    const TOP_OFFSET = insets.top + STICKY_ROW_H;
    const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    return (
        <View style={S.page}>
            {/* Topo fixo */}
            <View style={S.fixedTop}>
                <View style={safeTopStyle} />
                <View style={S.stickyRow}>
                    <View style={S.backBtnFake}>
                        <ShimmerBlock width={18} height={18} radius={6} />
                    </View>

                    <ShimmerBlock width={160} height={14} radius={8} />
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

            {/* ⬛ darkShell com raio (agora aparece pq page é branco) */}
            <View style={S.darkShell}>
                <View style={S.darkInner}>
                    <View style={S.heroCard}>
                        <ShimmerBlock width={160} height={16} radius={10} />
                        <ShimmerBlock
                            width={'70%'}
                            height={12}
                            radius={8}
                            style={{ marginTop: 10 }}
                        />
                        <ShimmerBlock
                            width={'92%'}
                            height={10}
                            radius={8}
                            style={{ marginTop: 10 }}
                        />
                    </View>
                </View>
            </View>

            {/* White area */}
            <View style={S.whiteArea}>
                <View style={S.whiteContent}>
                    <ShimmerBlock width={120} height={18} radius={10} />

                    <View style={{ marginTop: 12 }}>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <View key={i} style={S.row}>
                                <View style={S.rowLeft}>
                                    <ShimmerBlock
                                        width={38}
                                        height={38}
                                        radius={12}
                                    />
                                    <View style={{ flex: 1 }}>
                                        <ShimmerBlock
                                            width={'68%'}
                                            height={12}
                                            radius={8}
                                        />
                                        <ShimmerBlock
                                            width={'42%'}
                                            height={10}
                                            radius={8}
                                            style={{ marginTop: 8 }}
                                        />
                                    </View>
                                </View>

                                <View style={S.rowRight}>
                                    <ShimmerBlock
                                        width={56}
                                        height={10}
                                        radius={8}
                                    />
                                    <ShimmerBlock
                                        width={14}
                                        height={14}
                                        radius={7}
                                    />
                                </View>

                                {i < 5 ? <View style={S.divider} /> : null}
                            </View>
                        ))}
                    </View>
                </View>
            </View>
        </View>
    );
}

const S = StyleSheet.create({
    // ✅ CHAVE: fundo branco atrás do darkShell (pra recorte aparecer)
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

    backBtnFake: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: UI.colors.cardBorder,
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

    // ⚠️ card NÃO mexe
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

    row: {
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
    },

    rowLeft: { flexDirection: 'row', gap: 12, flex: 1, alignItems: 'center' },

    rowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginLeft: 12,
    },

    divider: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.08)',
    },
});

export const BookingServiceSkeleton = memo(BookingServiceSkeletonBase);
