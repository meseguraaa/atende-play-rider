import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import { UI } from '../src/theme/client-theme';
import { AuthProvider, useAuth } from '../src/auth/auth-context';
import { api } from '../src/services/api';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

function getPushRouteFromResponse(
    response: Notifications.NotificationResponse | null | undefined
) {
    const data = response?.notification?.request?.content?.data as
        | Record<string, unknown>
        | undefined;

    const type = String(data?.type ?? '').trim();
    const notificationId = String(data?.notificationId ?? '').trim();

    if (type === 'app_notification') {
        // 🎯 caminho inteligente
        if (notificationId) {
            return {
                pathname: '/client/notifications/[id]',
                params: { id: notificationId },
            };
        }

        // fallback
        return {
            pathname: '/client/notifications',
        };
    }

    return null;
}

function PushNavigationBridge() {
    const router = useRouter();
    const handledInitialRef = React.useRef(false);

    React.useEffect(() => {
        const sub = Notifications.addNotificationResponseReceivedListener(
            (response) => {
                const route = getPushRouteFromResponse(response);

                console.log('[push] notification response', {
                    route,
                    notificationId:
                        response?.notification?.request?.content?.data
                            ?.notificationId ?? null,
                    data:
                        response?.notification?.request?.content?.data ?? null,
                });

                if (route) {
                    router.push(route as any);
                }
            }
        );

        return () => {
            sub.remove();
        };
    }, [router]);

    React.useEffect(() => {
        async function checkInitialNotification() {
            if (handledInitialRef.current) return;
            handledInitialRef.current = true;

            try {
                const response =
                    await Notifications.getLastNotificationResponseAsync();

                const route = getPushRouteFromResponse(response);

                console.log('[push] initial notification response', {
                    route,
                    data:
                        response?.notification?.request?.content?.data ?? null,
                });

                if (route) {
                    router.push(route as any);
                }
            } catch (error: any) {
                console.warn('[push] initial notification response:error', {
                    message: error?.message || String(error),
                });
            }
        }

        checkInitialNotification();
    }, [router]);

    return null;
}

function PushBootstrap() {
    const { appToken, isBooting } = useAuth();
    const sentTokenRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        async function run() {
            console.log('[push] bootstrap:start', {
                isBooting,
                hasAppToken: !!appToken,
                isDevice: Device.isDevice,
                platform: Platform.OS,
            });

            if (isBooting) {
                console.log('[push] abort:isBooting');
                return;
            }

            if (!appToken) {
                console.log('[push] abort:no-app-token');
                return;
            }

            if (!Device.isDevice) {
                console.log('[push] abort:not-a-device');
                return;
            }

            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('default', {
                    name: 'default',
                    importance: Notifications.AndroidImportance.MAX,
                });
            }

            const { status: existingStatus } =
                await Notifications.getPermissionsAsync();

            console.log('[push] permissions:existing', {
                existingStatus,
            });

            let finalStatus = existingStatus;

            if (existingStatus !== 'granted') {
                const { status } =
                    await Notifications.requestPermissionsAsync();
                finalStatus = status;

                console.log('[push] permissions:requested', {
                    finalStatus,
                });
            }

            if (finalStatus !== 'granted') {
                console.log('[push] abort:permission-not-granted', {
                    finalStatus,
                });
                return;
            }

            const projectId =
                Constants?.expoConfig?.extra?.eas?.projectId ??
                Constants?.easConfig?.projectId;

            console.log('[push] projectId', { projectId });

            if (!projectId) {
                console.warn('[push] projectId não encontrado');
                return;
            }

            const expoPushToken = (
                await Notifications.getExpoPushTokenAsync({
                    projectId,
                })
            ).data;

            console.log('[push] expoPushToken', {
                hasToken: !!expoPushToken,
                tokenPreview: expoPushToken
                    ? `${expoPushToken.slice(0, 20)}...`
                    : null,
            });

            if (!expoPushToken) {
                console.log('[push] abort:no-expo-push-token');
                return;
            }

            if (sentTokenRef.current === expoPushToken) {
                console.log('[push] abort:token-already-sent');
                return;
            }

            console.log('[push] projectSlug debug', {
                expoConfig: Constants?.expoConfig,
                manifest: (Constants as any)?.manifest,
                manifest2: (Constants as any)?.manifest2,
            });

            const response = await api.post(
                '/api/admin/communication/register-device',
                {
                    deviceToken: expoPushToken,
                    platform: Platform.OS,
                    projectSlug:
                        (Constants as any)?.manifest2?.extra?.scopeKey ||
                        (Constants?.expoConfig?.owner &&
                        Constants?.expoConfig?.slug
                            ? `@${Constants.expoConfig.owner}/${Constants.expoConfig.slug}`
                            : null),
                }
            );

            console.log('[push] register-device:ok', response);

            sentTokenRef.current = expoPushToken;
        }

        run().catch((error) => {
            console.warn('[push] bootstrap:error', {
                message: error?.message || String(error),
                status: error?.status,
                data: error?.data,
                path: error?.path,
            });
        });
    }, [appToken, isBooting]);

    return null;
}

function RootLayoutContent() {
    return (
        <View style={{ flex: 1, backgroundColor: UI.brand.primary }}>
            <PushBootstrap />
            <PushNavigationBridge />

            <StatusBar
                style="light"
                backgroundColor={UI.brand.primary}
                translucent={Platform.OS === 'android' ? false : undefined}
            />

            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(app)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            </Stack>
        </View>
    );
}

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <AuthProvider>
                <RootLayoutContent />
            </AuthProvider>
        </SafeAreaProvider>
    );
}
