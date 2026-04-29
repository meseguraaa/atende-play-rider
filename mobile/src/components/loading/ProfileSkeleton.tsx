// mobile/src/components/loading/ProfileSkeleton.tsx
import React, { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI, styles as themeStyles } from '../../theme/client-theme';
import { ShimmerBlock } from './ShimmerBlock';

// ✅ precisa espelhar a tela: header sem linha/título
const STICKY_ROW_H = 0;

type Props = {
    /**
     * Controla se o shimmer anima ou fica "estático".
     * O ScreenGate usa isso pra desligar o shimmer durante o fade-out.
     */
    active?: boolean;
};

function ProfileSkeletonBase({ active = true }: Props) {
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

                {/* ✅ como não existe mais "Perfil", não renderiza shimmer de título */}
                {STICKY_ROW_H > 0 ? (
                    <View style={S.stickyRow}>
                        <ShimmerBlock
                            width={84}
                            height={14}
                            radius={8}
                            active={active}
                        />
                    </View>
                ) : (
                    <View style={S.stickyRow} />
                )}
            </View>

            {/* "Scroll" */}
            <View style={S.scroll}>
                <View
                    pointerEvents="none"
                    style={[S.topBounceDark, { height: topBounceHeight }]}
                />

                <View
                    style={{
                        height: TOP_OFFSET,
                        backgroundColor: UI.colors.bg,
                    }}
                />

                {/* Dark block */}
                <View style={S.darkShell}>
                    <View style={S.darkInner}>
                        <View style={themeStyles.glassCard}>
                            <View style={S.profileHeroRow}>
                                {/* avatar */}
                                <View style={S.avatarWrap}>
                                    <ShimmerBlock
                                        width={74}
                                        height={74}
                                        radius={22}
                                        active={active}
                                    />

                                    {/* ✅ Na sua tela real não tem badge no avatar.
                                        Deixei removido para o skeleton ficar fiel. */}
                                </View>

                                {/* text */}
                                <View style={S.heroTextCol}>
                                    <ShimmerBlock
                                        width={92}
                                        height={10}
                                        radius={8}
                                        active={active}
                                    />
                                    <ShimmerBlock
                                        width={'78%'}
                                        height={16}
                                        radius={10}
                                        style={{ marginTop: 10 }}
                                        active={active}
                                    />
                                    <ShimmerBlock
                                        width={'62%'}
                                        height={12}
                                        radius={9}
                                        style={{ marginTop: 10 }}
                                        active={active}
                                    />
                                </View>
                            </View>
                        </View>

                        {/* hint row */}
                        <View style={S.hintRow}>
                            <ShimmerBlock
                                width={14}
                                height={14}
                                radius={7}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'78%'}
                                height={10}
                                radius={8}
                                active={active}
                            />
                        </View>
                    </View>
                </View>

                {/* White area */}
                <View style={S.whiteArea}>
                    <View style={S.whiteContent}>
                        <ShimmerBlock
                            width={130}
                            height={18}
                            radius={10}
                            active={active}
                        />

                        {/* form card */}
                        <View style={S.formCard}>
                            {/* field 1 */}
                            <ShimmerBlock
                                width={70}
                                height={10}
                                radius={8}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'100%'}
                                height={48}
                                radius={14}
                                style={{ marginTop: 10 }}
                                active={active}
                            />
                            <View style={S.divider} />

                            {/* field 2 */}
                            <ShimmerBlock
                                width={60}
                                height={10}
                                radius={8}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'100%'}
                                height={48}
                                radius={14}
                                style={{ marginTop: 10 }}
                                active={active}
                            />
                            <View style={S.divider} />

                            {/* field 3 */}
                            <ShimmerBlock
                                width={76}
                                height={10}
                                radius={8}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'100%'}
                                height={48}
                                radius={14}
                                style={{ marginTop: 10 }}
                                active={active}
                            />
                            <View style={S.divider} />

                            {/* field 4 */}
                            <ShimmerBlock
                                width={118}
                                height={10}
                                radius={8}
                                active={active}
                            />
                            <ShimmerBlock
                                width={'100%'}
                                height={48}
                                radius={14}
                                style={{ marginTop: 10 }}
                                active={active}
                            />
                        </View>

                        {/* save btn */}
                        <ShimmerBlock
                            width={'100%'}
                            height={56}
                            radius={999}
                            style={{ marginTop: 16 }}
                            active={active}
                        />

                        {/* logout link */}
                        <ShimmerBlock
                            width={110}
                            height={12}
                            radius={8}
                            style={{ marginTop: 16, alignSelf: 'center' }}
                            active={active}
                        />
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
        justifyContent: 'center',
    },

    scroll: { flex: 1, backgroundColor: UI.colors.white },

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

    profileHeroRow: {
        flexDirection: 'row',
        gap: 14,
        alignItems: 'center',
    },

    avatarWrap: { position: 'relative' },

    heroTextCol: {
        flex: 1,
        paddingVertical: 4,
    },

    hintRow: {
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 6,
    },

    whiteArea: { backgroundColor: UI.colors.white },
    whiteContent: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 18,
        paddingBottom: 28,
    },

    formCard: {
        marginTop: 12,
        backgroundColor: UI.colors.white,
        borderWidth: 1,
        borderColor: UI.colors.black08,
        borderRadius: UI.radius.card,
        padding: 14,
    },

    divider: {
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.06)',
        marginVertical: 12,
    },
});

export const ProfileSkeleton = memo(ProfileSkeletonBase);
