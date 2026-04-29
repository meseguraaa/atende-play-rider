// mobile/src/components/loading/ScreenSkeleton.tsx
import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI } from '../../theme/client-theme';
import { ShimmerBlock } from './ShimmerBlock';

type Props = {
    /**
     * Se a tela tem header fixo com altura custom, você pode passar aqui.
     * Se não passar, o skeleton assume um header padrão.
     */
    headerHeight?: number;
};

function ScreenSkeletonBase({ headerHeight }: Props) {
    const insets = useSafeAreaInsets();
    const top = headerHeight ?? insets.top + 64;

    return (
        <View style={S.page}>
            <View style={{ height: top, backgroundColor: UI.colors.bg }} />

            <View style={S.body}>
                {/* título */}
                <ShimmerBlock width={'48%'} height={18} radius={10} />

                {/* card */}
                <View style={{ marginTop: 16 }}>
                    <ShimmerBlock width={'100%'} height={140} radius={16} />
                </View>

                {/* linhas */}
                <View style={{ marginTop: 18, gap: 12 }}>
                    <ShimmerBlock width={'92%'} height={12} radius={8} />
                    <ShimmerBlock width={'78%'} height={12} radius={8} />
                    <ShimmerBlock width={'86%'} height={12} radius={8} />
                    <ShimmerBlock width={'60%'} height={12} radius={8} />
                </View>

                {/* lista */}
                <View style={{ marginTop: 22, gap: 14 }}>
                    <View style={S.row}>
                        <ShimmerBlock width={44} height={44} radius={12} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <ShimmerBlock
                                width={'70%'}
                                height={12}
                                radius={8}
                            />
                            <ShimmerBlock
                                width={'90%'}
                                height={10}
                                radius={8}
                                style={{ marginTop: 8 }}
                            />
                        </View>
                    </View>

                    <View style={S.row}>
                        <ShimmerBlock width={44} height={44} radius={12} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <ShimmerBlock
                                width={'62%'}
                                height={12}
                                radius={8}
                            />
                            <ShimmerBlock
                                width={'84%'}
                                height={10}
                                radius={8}
                                style={{ marginTop: 8 }}
                            />
                        </View>
                    </View>

                    <View style={S.row}>
                        <ShimmerBlock width={44} height={44} radius={12} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <ShimmerBlock
                                width={'68%'}
                                height={12}
                                radius={8}
                            />
                            <ShimmerBlock
                                width={'88%'}
                                height={10}
                                radius={8}
                                style={{ marginTop: 8 }}
                            />
                        </View>
                    </View>
                </View>

                {/* botão */}
                <ShimmerBlock
                    width={'100%'}
                    height={44}
                    radius={999}
                    style={{ marginTop: 22 }}
                />
            </View>
        </View>
    );
}

const S = StyleSheet.create({
    page: { flex: 1, backgroundColor: UI.colors.white },
    body: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 18,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});

export const ScreenSkeleton = memo(ScreenSkeletonBase);
