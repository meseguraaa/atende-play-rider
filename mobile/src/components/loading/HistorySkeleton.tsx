// mobile/src/components/loading/HistorySkeleton.tsx
import React, { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UI } from '../../theme/client-theme';
import { ShimmerBlock } from './ShimmerBlock';

const STICKY_ROW_H = 74;

function HistorySkeletonBase() {
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

    const Section = ({
        titleW,
        subtitleW,
        items = 3,
    }: {
        titleW: number;
        subtitleW: string;
        items?: number;
    }) => {
        return (
            <View style={S.section}>
                <View style={S.sectionHeader}>
                    <ShimmerBlock width={titleW} height={16} radius={10} />
                    <ShimmerBlock
                        width={subtitleW as any}
                        height={12}
                        radius={9}
                        style={{ marginTop: 8 }}
                    />
                    <ShimmerBlock
                        width={96}
                        height={28}
                        radius={999}
                        style={{ marginTop: 10 }}
                    />
                </View>

                {Array.from({ length: items }).map((_, idx) => (
                    <View key={idx} style={S.itemRow}>
                        <ShimmerBlock width={36} height={36} radius={10} />
                        <View style={{ flex: 1, marginLeft: 14 }}>
                            <ShimmerBlock
                                width={'58%'}
                                height={14}
                                radius={9}
                            />
                            <ShimmerBlock
                                width={'86%'}
                                height={12}
                                radius={9}
                                style={{ marginTop: 8 }}
                            />
                            <ShimmerBlock
                                width={'34%'}
                                height={10}
                                radius={8}
                                style={{ marginTop: 8 }}
                            />
                        </View>

                        {idx < items - 1 ? <View style={S.divider} /> : null}
                    </View>
                ))}
            </View>
        );
    };

    return (
        <View style={S.page}>
            {/* Topo fixo */}
            <View style={S.fixedTop}>
                <View style={safeTopStyle} />

                <View style={S.stickyRow}>
                    {/* back button */}
                    <ShimmerBlock width={42} height={42} radius={21} />
                    {/* título central */}
                    <View style={S.titleWrap}>
                        <ShimmerBlock width={94} height={14} radius={8} />
                    </View>
                    {/* spacer direita */}
                    <View style={{ width: 42, height: 42 }} />
                </View>
            </View>

            {/* Conteúdo */}
            <View style={S.list}>
                <View style={headerSpacerStyle} />

                <View style={S.whiteArea}>
                    <Section titleW={170} subtitleW={'58%'} items={3} />
                    <Section titleW={120} subtitleW={'64%'} items={2} />
                    <Section titleW={180} subtitleW={'60%'} items={3} />
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

    titleWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    list: { flex: 1, backgroundColor: UI.colors.white },

    whiteArea: { backgroundColor: UI.colors.white },

    section: { backgroundColor: UI.colors.white },

    sectionHeader: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 18,
        paddingBottom: 10,
    },

    itemRow: {
        paddingVertical: 16,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: UI.colors.white,
        position: 'relative',
    },

    divider: {
        position: 'absolute',
        left: UI.spacing.screenX,
        right: UI.spacing.screenX,
        bottom: 0,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.08)',
    },
});

export const HistorySkeleton = memo(HistorySkeletonBase);
