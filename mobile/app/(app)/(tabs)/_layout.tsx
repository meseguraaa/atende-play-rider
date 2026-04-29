import React from 'react';
import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI } from '../../../src/theme/client-theme';
import { trackEvent } from '../../../src/services/analytics';
import { useAuth } from '../../../src/auth/auth-context';

function FloatingIcon({
    name,
    bottomLift = 0,
}: {
    name: any;
    bottomLift?: number;
}) {
    const isAndroid = Platform.OS === 'android';

    return (
        <View
            style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: UI.brand.primary,
                alignItems: 'center',
                justifyContent: 'center',

                // ✅ Android: sobe um pouco mais pra ficar "perfeito" quando ativo
                // iOS mantém como estava.
                marginBottom: isAndroid ? 35 : 40 + bottomLift,

                shadowOffset: { width: 0, height: 6 },
                elevation: 10,
            }}
        >
            <FontAwesome name={name} size={22} color="#FFF" />
        </View>
    );
}

export default function TabsLayout() {
    const insets = useSafeAreaInsets();
    const { companyId } = useAuth();

    const bottomInset = Platform.OS === 'android' ? insets.bottom : 0;
    const BASE_TABBAR_HEIGHT = 64;

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarShowLabel: true,
                tabBarActiveTintColor: UI.brand.primary,
                tabBarInactiveTintColor: '#fff',
                tabBarStyle: {
                    backgroundColor: UI.colors.bg,
                    borderTopWidth: 0,
                    height: BASE_TABBAR_HEIGHT + bottomInset,
                    paddingBottom: bottomInset,
                    paddingTop: 6,
                },
                tabBarLabelStyle: {
                    fontSize: 12,
                    fontWeight: '600',
                    marginBottom: Platform.OS === 'android' ? 0 : 6,
                },
            }}
        >
            {/* ✅ 1) Home */}
            <Tabs.Screen
                name="home"
                options={{
                    title: 'Início',
                    tabBarIcon: ({ focused }) =>
                        focused ? (
                            <FloatingIcon
                                name="home"
                                bottomLift={bottomInset}
                            />
                        ) : (
                            <FontAwesome name="home" size={20} color="#fff" />
                        ),
                }}
            />

            {/* ✅ 2) Produtos */}
            <Tabs.Screen
                name="products"
                options={{
                    title: 'Produtos',
                    tabBarIcon: ({ focused }) =>
                        focused ? (
                            <FloatingIcon
                                name="shopping-bag"
                                bottomLift={bottomInset}
                            />
                        ) : (
                            <FontAwesome
                                name="shopping-bag"
                                size={20}
                                color="#fff"
                            />
                        ),
                }}
            />

            {/* ✅ esconde detalhe de produto */}
            <Tabs.Screen
                name="products/[id]"
                options={{
                    href: null,
                }}
            />

            {/* ✅ 3) Parceiros (ABA APONTA PARA partners/index) */}
            <Tabs.Screen
                name="partners/index"
                options={{
                    title: 'Parceiros',
                    tabBarIcon: ({ focused }) =>
                        focused ? (
                            <FloatingIcon
                                name="handshake-o"
                                bottomLift={bottomInset}
                            />
                        ) : (
                            <FontAwesome
                                name="handshake-o"
                                size={20}
                                color="#fff"
                            />
                        ),
                }}
                listeners={{
                    tabPress: () => {
                        try {
                            trackEvent('partners_menu_open', {
                                page: 'tabs',
                                placement: 'tabbar',
                                companyId: companyId ?? null,
                            });
                        } catch {}
                    },
                }}
            />

            {/* ✅ esconde rota "partners" se existir */}
            <Tabs.Screen
                name="partners"
                options={{
                    href: null,
                }}
            />

            {/* ✅ esconde detalhe do parceiro */}
            <Tabs.Screen
                name="partners/[id]"
                options={{
                    href: null,
                }}
            />

            {/* ✅ 4) Perfil */}
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Perfil',
                    tabBarIcon: ({ focused }) =>
                        focused ? (
                            <FloatingIcon
                                name="user"
                                bottomLift={bottomInset}
                            />
                        ) : (
                            <FontAwesome name="user" size={20} color="#fff" />
                        ),
                }}
            />
        </Tabs>
    );
}
