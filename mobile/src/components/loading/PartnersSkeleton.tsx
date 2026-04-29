import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI, styles } from '../../theme/client-theme';

const STICKY_ROW_H = 74;

/**
 * Skeleton independente do theme:
 * - blocos com pulse (opacity)
 * - não depende de styles.skeletonBlock
 */
const SkeletonBlock = memo(function SkeletonBlock({ style }: { style?: any }) {
    const opacity = useRef(new Animated.Value(0.55)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 900,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.55,
                    duration: 900,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ])
        );

        loop.start();
        return () => loop.stop();
    }, [opacity]);

    return <Animated.View style={[S.skeletonBase, { opacity }, style]} />;
});

export const PartnersSkeleton = memo(function PartnersSkeleton() {
    const insets = useSafeAreaInsets();

    const topOffset = useMemo(() => insets.top + STICKY_ROW_H, [insets.top]);

    return (
        <View style={S.page}>
            {/* topo escuro "esticado" */}
            <View style={[S.topBounceDark, { height: topOffset + 520 }]} />

            {/* safe area */}
            <View
                style={{
                    height: insets.top,
                    backgroundColor: UI.brand.primary,
                }}
            />

            {/* sticky row */}
            <View style={S.stickyRow}>
                <View style={S.profileRow}>
                    <SkeletonBlock style={S.avatar} />
                    <View style={{ gap: 6 }}>
                        <SkeletonBlock style={S.lineSm} />
                        <SkeletonBlock style={S.lineMd} />
                    </View>
                </View>

                <View style={S.topRightRow}>
                    <SkeletonBlock style={S.iconBtn} />
                    <SkeletonBlock style={S.iconBtn} />
                    <SkeletonBlock style={S.iconBtn} />
                    <SkeletonBlock style={S.iconBtn} />
                </View>
            </View>

            {/* filtros/busca */}
            <View style={S.darkShell}>
                <View style={S.darkInner}>
                    <View style={[styles.glassCard, S.filtersCard]}>
                        <View style={S.searchRow}>
                            <SkeletonBlock style={S.searchIcon} />
                            <SkeletonBlock style={S.searchInputFake} />
                        </View>
                    </View>
                </View>
            </View>

            {/* área branca */}
            <View style={S.whiteArea}>
                <View style={S.whiteContent}>
                    <View style={S.sectionRow}>
                        <SkeletonBlock style={S.sectionTitleFake} />
                        <SkeletonBlock style={S.sectionMetaFake} />
                    </View>
                </View>

                {/* grid 2 colunas */}
                <View style={S.gridWrap}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <View key={i} style={S.card}>
                            <SkeletonBlock style={S.cardTop} />
                            <SkeletonBlock style={S.cardTitle} />
                            <SkeletonBlock style={S.cardDesc} />
                            <SkeletonBlock style={S.cardBtn} />
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
});

const S = StyleSheet.create({
    page: { flex: 1, backgroundColor: UI.colors.bg },

    topBounceDark: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        backgroundColor: UI.colors.bg,
    },

    stickyRow: {
        height: STICKY_ROW_H,
        backgroundColor: UI.colors.bg,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },

    profileRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },

    topRightRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },

    avatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
    },

    lineSm: {
        width: 56,
        height: 10,
        borderRadius: 8,
    },

    lineMd: {
        width: 120,
        height: 14,
        borderRadius: 10,
    },

    iconBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
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

    filtersCard: {
        padding: UI.spacing.cardPad,
        marginTop: 14,
    },

    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },

    searchIcon: {
        width: 36,
        height: 36,
        borderRadius: UI.radius.input,
    },

    searchInputFake: {
        flex: 1,
        height: 40,
        borderRadius: UI.radius.input,
    },

    whiteArea: { flex: 1, backgroundColor: UI.colors.white },
    whiteContent: { paddingHorizontal: UI.spacing.screenX, paddingTop: 18 },

    sectionRow: {
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
    },

    sectionTitleFake: {
        width: 120,
        height: 18,
        borderRadius: 10,
    },

    sectionMetaFake: {
        width: 90,
        height: 12,
        borderRadius: 8,
    },

    gridWrap: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 2,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },

    card: {
        width: '48.2%',
        marginBottom: 14,
        borderRadius: UI.radius.card,
    },

    cardTop: {
        height: 124,
        borderRadius: 14,
    },

    cardTitle: {
        marginTop: 10,
        height: 16,
        borderRadius: 10,
        width: '92%',
    },

    cardDesc: {
        marginTop: 8,
        height: 12,
        borderRadius: 10,
        width: '96%',
    },

    cardBtn: {
        marginTop: 14,
        height: 40,
        borderRadius: 999,
        width: '100%',
    },

    // base do bloco skeleton
    skeletonBase: {
        backgroundColor: 'rgba(0,0,0,0.08)',
        overflow: 'hidden',
    },
});
