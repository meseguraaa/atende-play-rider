import React, { memo, useMemo } from 'react';
import {
    View,
    Text,
    Pressable,
    Image,
    StyleSheet,
    ViewStyle,
    TextStyle,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { UI } from '../../theme/client-theme';

type LevelStyle = {
    container?: ViewStyle;
    text?: TextStyle;
    icon?: { color: string };
};

type Props = {
    insetsTop: number;

    displayName: string;
    meLoading?: boolean;

    avatarUrl?: string | null;

    birthdayBadgeLabel?: string | null;
    onPressBirthday?: () => void;

    userLevelLabel?: string | null;
    userLevelIcon?: string;
    userLevelStyle?: LevelStyle | null;
    onPressLevel?: () => void;

    pendingCartCount?: number;
    unreadNotificationsCount?: number;

    onPressCart: () => void;
    onPressNotifications: () => void;
};

export const STICKY_ROW_H = 74;

export const AppTopBar = memo(function AppTopBar({
    insetsTop,
    displayName,
    meLoading,

    avatarUrl,

    birthdayBadgeLabel,
    onPressBirthday,

    userLevelLabel,
    userLevelIcon,
    userLevelStyle,
    onPressLevel,

    pendingCartCount = 0,
    unreadNotificationsCount = 0,

    onPressCart,
    onPressNotifications,
}: Props) {
    const hasAvatar = !!(avatarUrl && String(avatarUrl).trim().length);

    const safeTopStyle = useMemo(
        () => ({ height: insetsTop, backgroundColor: UI.brand.primary }),
        [insetsTop]
    );

    return (
        <View style={S.fixedTop}>
            <View style={safeTopStyle} />

            <View style={S.stickyRow}>
                <View style={S.profileRow}>
                    {hasAvatar ? (
                        <Image
                            source={{ uri: avatarUrl as string }}
                            style={S.avatar}
                        />
                    ) : (
                        <View style={S.avatarFallback}>
                            <FontAwesome
                                name="user"
                                size={18}
                                color={UI.colors.white}
                            />
                        </View>
                    )}

                    <View style={{ flexShrink: 1 }}>
                        <Text style={S.hello}>Olá,</Text>
                        <Text style={S.name} numberOfLines={1}>
                            {displayName}
                            {meLoading ? '…' : ''}
                        </Text>
                    </View>
                </View>

                <View style={S.topRightRow}>
                    {birthdayBadgeLabel ? (
                        <Pressable
                            style={S.iconBtn}
                            onPress={onPressBirthday}
                            hitSlop={8}
                        >
                            <FontAwesome
                                name="birthday-cake"
                                size={18}
                                color={UI.colors.white}
                            />
                            <View style={S.birthdayDot}>
                                <Text style={S.birthdayDotText}>!</Text>
                            </View>
                        </Pressable>
                    ) : null}

                    {userLevelLabel ? (
                        <Pressable
                            style={[
                                S.iconBtn,
                                S.levelBtn,
                                userLevelStyle?.container,
                            ]}
                            onPress={onPressLevel}
                            hitSlop={8}
                        >
                            <FontAwesome
                                name={(userLevelIcon || 'star') as any}
                                size={18}
                                color={
                                    userLevelStyle?.icon?.color ??
                                    UI.colors.white
                                }
                            />
                            <Text
                                style={[S.levelMiniText, userLevelStyle?.text]}
                                numberOfLines={1}
                            >
                                {userLevelLabel}
                            </Text>
                        </Pressable>
                    ) : null}

                    <Pressable
                        style={S.iconBtn}
                        onPress={onPressCart}
                        hitSlop={8}
                    >
                        <FontAwesome
                            name="shopping-bag"
                            size={18}
                            color={UI.colors.white}
                        />
                        {pendingCartCount > 0 ? (
                            <View style={S.badge}>
                                <Text style={S.badgeText}>
                                    {pendingCartCount > 99
                                        ? '99+'
                                        : String(pendingCartCount)}
                                </Text>
                            </View>
                        ) : null}
                    </Pressable>

                    <Pressable
                        style={S.iconBtn}
                        onPress={onPressNotifications}
                        hitSlop={8}
                    >
                        <FontAwesome
                            name="bell-o"
                            size={20}
                            color={UI.colors.white}
                        />
                        {unreadNotificationsCount > 0 ? (
                            <View style={S.badge}>
                                <Text style={S.badgeText}>
                                    {unreadNotificationsCount > 99
                                        ? '99+'
                                        : String(unreadNotificationsCount)}
                                </Text>
                            </View>
                        ) : null}
                    </Pressable>
                </View>
            </View>
        </View>
    );
});

const S = StyleSheet.create({
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
        justifyContent: 'space-between',
        alignItems: 'center',
    },

    profileRow: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        flexShrink: 1,
    },

    avatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 2,
        borderColor: UI.brand.primary,
    },
    avatarFallback: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: UI.brand.primary,
        borderWidth: 2,
        borderColor: UI.brand.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },

    hello: { color: UI.colors.textMuted, fontSize: 12, fontWeight: '700' },
    name: { color: UI.colors.text, fontSize: 16, fontWeight: '700' },

    topRightRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },

    iconBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: UI.colors.overlay08,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: UI.colors.cardBorder,
    },

    levelBtn: { paddingTop: 7 },
    levelMiniText: {
        marginTop: 2,
        fontSize: 9.5,
        fontWeight: '900',
        color: UI.colors.white,
        includeFontPadding: false,
        textAlign: 'center',
        maxWidth: 38,
    },

    badge: {
        position: 'absolute',
        top: -6,
        right: -6,
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        borderRadius: UI.radius.pill,
        backgroundColor: UI.brand.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: UI.colors.bg,
    },
    badgeText: {
        color: UI.colors.white,
        fontSize: 11,
        fontWeight: '900',
        includeFontPadding: false,
        textAlignVertical: 'center',
    },

    birthdayDot: {
        position: 'absolute',
        top: -6,
        right: -6,
        minWidth: 18,
        height: 18,
        paddingHorizontal: 5,
        borderRadius: UI.radius.pill,
        backgroundColor: UI.home.birthdayDotBg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: UI.colors.bg,
    },
    birthdayDotText: {
        color: UI.colors.white,
        fontSize: 11,
        fontWeight: '900',
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
});
