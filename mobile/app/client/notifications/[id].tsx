import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    View,
    Text,
    Pressable,
    StyleSheet,
    ActivityIndicator,
    Alert,
    ScrollView,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { UI } from '../../../src/theme/client-theme';
import { api } from '../../../src/services/api';
import { trackEvent } from '../../../src/services/analytics';
import { ScreenGate } from '../../../src/components/layout/ScreenGate';
import { HistorySkeleton } from '../../../src/components/loading/HistorySkeleton';

const STICKY_ROW_H = 74;

type NotificationDetailResponse = {
    ok: boolean;
    item?: {
        id: string;
        title: string;
        message: string;
        date: string;
        isRead: boolean;
        type: 'PUSH_MESSAGE';
    };
    error?: string;
};

function unwrapApiData<T>(res: unknown): T {
    const anyRes = res as any;
    return (anyRes?.data ?? anyRes) as T;
}

function formatPtBRDateTime(iso: string) {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '—';
    }
}

function normalizePage(pathname: string) {
    const p = (pathname || '/').trim();
    const noQuery = p.split('?')[0].split('#')[0];
    return noQuery.length > 1 && noQuery.endsWith('/')
        ? noQuery.slice(0, -1)
        : noQuery || '/';
}

export default function ClientNotificationDetails() {
    const router = useRouter();
    const pathname = usePathname();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ id?: string }>();

    const notificationId = String(params?.id ?? '').trim();

    const [loading, setLoading] = useState(true);
    const [dataReady, setDataReady] = useState(false);
    const [item, setItem] = useState<NotificationDetailResponse['item'] | null>(
        null
    );

    const fetchingRef = useRef(false);
    const lastViewedKeyRef = useRef<string>('');

    const trackPageViewed = useCallback(() => {
        const page = normalizePage(pathname || '/');
        const key = page;

        if (lastViewedKeyRef.current === key) return;
        lastViewedKeyRef.current = key;

        try {
            trackEvent('page_viewed', {
                page,
                platform: 'mobile',
            });
        } catch {}
    }, [pathname]);

    const fetchDetail = useCallback(async () => {
        if (!notificationId) {
            Alert.alert('Erro', 'Notificação inválida.');
            router.back();
            return;
        }

        if (fetchingRef.current) return;
        fetchingRef.current = true;

        try {
            setLoading(true);

            const raw = await api.get<NotificationDetailResponse>(
                `/api/mobile/notifications/${notificationId}`
            );

            const res = unwrapApiData<NotificationDetailResponse>(raw);

            if (!res?.ok || !res?.item) {
                Alert.alert(
                    'Não foi possível carregar',
                    res?.error || 'Tente novamente.'
                );
                router.back();
                return;
            }

            setItem(res.item);
        } catch (err: any) {
            console.log(
                '[notification-details] fetch error:',
                err?.data ?? err?.message ?? err
            );
            Alert.alert('Erro', 'Não foi possível carregar a notificação.');
            router.back();
        } finally {
            setLoading(false);
            setDataReady(true);
            fetchingRef.current = false;
        }
    }, [notificationId, router]);

    useFocusEffect(
        useCallback(() => {
            trackPageViewed();

            return () => {
                lastViewedKeyRef.current = '';
            };
        }, [trackPageViewed])
    );

    useEffect(() => {
        fetchDetail();
    }, [fetchDetail]);

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    const goBack = useCallback(() => router.back(), [router]);

    return (
        <ScreenGate dataReady={dataReady} skeleton={<HistorySkeleton />}>
            <View style={S.page}>
                <View style={S.fixedTop}>
                    <View style={safeTopStyle} />

                    <View style={S.stickyRow}>
                        <Pressable style={S.backBtn} onPress={goBack}>
                            <FontAwesome
                                name="angle-left"
                                size={22}
                                color="#FFFFFF"
                            />
                        </Pressable>

                        <View style={S.centerTitleWrap} pointerEvents="none">
                            <Text style={S.centerTitle}>Notificação</Text>
                        </View>

                        <View style={{ width: 42, height: 42 }} />
                    </View>
                </View>

                <ScrollView
                    style={S.scroll}
                    contentContainerStyle={{
                        paddingTop: insets.top + STICKY_ROW_H + 18,
                        paddingBottom: 28,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={S.content}>
                        {loading ? (
                            <View style={S.loadingBox}>
                                <ActivityIndicator color={UI.brand.primary} />
                            </View>
                        ) : item ? (
                            <View style={S.card}>
                                <View style={S.iconWrap}>
                                    <FontAwesome
                                        name="bell"
                                        size={18}
                                        color={UI.brand.primary}
                                    />
                                </View>

                                <Text style={S.title}>{item.title}</Text>

                                <Text style={S.date}>
                                    {formatPtBRDateTime(item.date)}
                                </Text>

                                <View style={S.divider} />

                                <Text style={S.message}>{item.message}</Text>
                            </View>
                        ) : (
                            <View style={S.emptyBox}>
                                <Text style={S.emptyText}>
                                    Não foi possível carregar esta notificação.
                                </Text>
                            </View>
                        )}
                    </View>
                </ScrollView>
            </View>
        </ScreenGate>
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

    backBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: UI.brand.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },

    centerTitleWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    centerTitle: {
        color: UI.colors.white,
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.2,
    },

    scroll: {
        flex: 1,
        backgroundColor: UI.colors.white,
    },

    content: {
        paddingHorizontal: UI.spacing.screenX,
    },

    card: {
        backgroundColor: UI.colors.white,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
        padding: 18,
    },

    iconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(124,108,255,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },

    title: {
        fontSize: 18,
        fontWeight: '800',
        color: UI.brand.primaryText,
        lineHeight: 24,
    },

    date: {
        marginTop: 6,
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(0,0,0,0.45)',
    },

    divider: {
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.08)',
        marginVertical: 16,
    },

    message: {
        fontSize: 15,
        lineHeight: 24,
        color: 'rgba(0,0,0,0.78)',
    },

    loadingBox: {
        paddingVertical: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },

    emptyBox: {
        paddingVertical: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },

    emptyText: {
        color: 'rgba(0,0,0,0.55)',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
});
