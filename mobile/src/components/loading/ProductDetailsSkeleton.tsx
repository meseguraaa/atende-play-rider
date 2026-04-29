// mobile/src/components/loading/ProductDetailsSkeleton.tsx
import React, { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI } from '../../theme/client-theme';
import { ShimmerBlock } from './ShimmerBlock';

const HERO_H = 320;

function ProductDetailsSkeletonBase() {
    const insets = useSafeAreaInsets();

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    const headerTop = useMemo(() => insets.top + 10, [insets.top]);

    return (
        <View style={S.page}>
            {/* HERO */}
            <View style={{ height: HERO_H }}>
                <ShimmerBlock width={'100%'} height={HERO_H} radius={0} />

                {/* pill estoque */}
                <View style={S.stockPill}>
                    <ShimmerBlock width={160} height={26} radius={999} />
                </View>
            </View>

            {/* back button flutuante */}
            <View style={[S.headerFloat, { top: headerTop }]}>
                <ShimmerBlock width={42} height={42} radius={21} />
            </View>

            {/* Conteúdo */}
            <View style={S.scrollFake}>
                {/* bloco “main” */}
                <View style={S.mainShell}>
                    <View style={S.mainInner}>
                        <ShimmerBlock width={90} height={12} radius={8} />
                        <ShimmerBlock
                            width={'88%'}
                            height={24}
                            radius={10}
                            style={{ marginTop: 12 }}
                        />
                        <ShimmerBlock
                            width={'70%'}
                            height={24}
                            radius={10}
                            style={{ marginTop: 10 }}
                        />

                        <ShimmerBlock
                            width={120}
                            height={18}
                            radius={10}
                            style={{ marginTop: 16 }}
                        />
                    </View>
                </View>

                {/* white area */}
                <View style={S.whiteArea}>
                    <View style={S.whiteContent}>
                        <ShimmerBlock width={160} height={18} radius={10} />

                        <ShimmerBlock
                            width={'100%'}
                            height={12}
                            radius={10}
                            style={{ marginTop: 14 }}
                        />
                        <ShimmerBlock
                            width={'95%'}
                            height={12}
                            radius={10}
                            style={{ marginTop: 10 }}
                        />
                        <ShimmerBlock
                            width={'88%'}
                            height={12}
                            radius={10}
                            style={{ marginTop: 10 }}
                        />
                        <ShimmerBlock
                            width={'70%'}
                            height={12}
                            radius={10}
                            style={{ marginTop: 10 }}
                        />

                        {/* info grid */}
                        <View style={S.infoGrid}>
                            <View style={S.infoItem}>
                                <ShimmerBlock
                                    width={70}
                                    height={10}
                                    radius={8}
                                />
                                <ShimmerBlock
                                    width={'80%'}
                                    height={14}
                                    radius={10}
                                    style={{ marginTop: 10 }}
                                />
                            </View>

                            <View style={S.infoItem}>
                                <ShimmerBlock
                                    width={70}
                                    height={10}
                                    radius={8}
                                />
                                <ShimmerBlock
                                    width={'60%'}
                                    height={14}
                                    radius={10}
                                    style={{ marginTop: 10 }}
                                />
                            </View>

                            <View style={S.infoItem}>
                                <ShimmerBlock
                                    width={90}
                                    height={10}
                                    radius={8}
                                />
                                <ShimmerBlock
                                    width={'72%'}
                                    height={14}
                                    radius={10}
                                    style={{ marginTop: 10 }}
                                />
                            </View>

                            <View style={S.infoItem}>
                                <ShimmerBlock
                                    width={78}
                                    height={10}
                                    radius={8}
                                />
                                <ShimmerBlock
                                    width={'66%'}
                                    height={14}
                                    radius={10}
                                    style={{ marginTop: 10 }}
                                />
                            </View>
                        </View>
                    </View>
                </View>
            </View>

            {/* CTA bar */}
            <View style={[S.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
                <ShimmerBlock width={'100%'} height={56} radius={999} />
            </View>

            {/* safe top (só pra manter “feeling” do app se precisar) */}
            <View style={[S.safeTop, safeTopStyle]} />
        </View>
    );
}

const S = StyleSheet.create({
    page: { flex: 1, backgroundColor: UI.colors.white },

    stockPill: {
        position: 'absolute',
        left: UI.spacing.screenX,
        bottom: 14,
    },

    headerFloat: {
        position: 'absolute',
        left: UI.spacing.screenX,
        right: UI.spacing.screenX,
        flexDirection: 'row',
        justifyContent: 'space-between',
        zIndex: 20,
    },

    scrollFake: { flex: 1, backgroundColor: UI.colors.white },

    mainShell: {
        backgroundColor: UI.colors.white,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        marginTop: -10,
    },

    mainInner: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 30,
        paddingBottom: 18,
    },

    whiteArea: { backgroundColor: UI.colors.white },
    whiteContent: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 18,
        paddingBottom: 18,
    },

    infoGrid: { marginTop: 20, gap: 12 },

    infoItem: {
        padding: 14,
        borderRadius: UI.radius.card,
        backgroundColor: UI.colors.white,
        borderWidth: 1,
        borderColor: UI.colors.black08,
    },

    ctaBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: UI.colors.white,
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
    },

    // opcional: só pra não “piscar” em devices com status bar diferente
    safeTop: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
    },
});

export const ProductDetailsSkeleton = memo(ProductDetailsSkeletonBase);
