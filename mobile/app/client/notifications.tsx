import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    Pressable,
    StyleSheet,
    SectionList,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, usePathname } from 'expo-router';

import { UI } from '../../src/theme/client-theme';
import { api } from '../../src/services/api';
import { trackEvent } from '../../src/services/analytics';

import { ScreenGate } from '../../src/components/layout/ScreenGate';
import { HistorySkeleton } from '../../src/components/loading/HistorySkeleton';

const STICKY_ROW_H = 74;

type NotificationsResponse = {
    ok: boolean;
    items: NotificationItem[];
    unreadCount?: number;
    error?: string;
};

type NotificationItem =
    | {
          id: string;
          title: string;
          description: string;
          date: string;
          icon: 'star';
          appointmentId: string;
          notificationId: null;
          isRead: false;
          type: 'PENDING_REVIEW';
      }
    | {
          id: string;
          title: string;
          description: string;
          date: string;
          icon: 'bell';
          appointmentId: null;
          notificationId: string;
          isRead: boolean;
          type: 'PUSH_MESSAGE';
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

function getPrimaryActionLabel(item: NotificationItem) {
    if (item.type === 'PENDING_REVIEW') return 'Avaliar';
    return 'Ver';
}

const NotificationRow = memo(function NotificationRow({
    item,
    showDivider,
    onPressItem,
    onDismissReview,
    dismissing,
}: {
    item: NotificationItem;
    showDivider: boolean;
    onPressItem: (item: NotificationItem) => void;
    onDismissReview: (appointmentId: string) => void;
    dismissing: boolean;
}) {
    const isReview = item.type === 'PENDING_REVIEW';

    return (
        <View style={S.historyItem}>
            <Pressable
                onPress={() => onPressItem(item)}
                style={S.rowPressArea}
                android_ripple={{}}
            >
                <View style={S.historyLeft}>
                    <View style={S.historyIcon}>
                        <FontAwesome
                            name={item.icon as any}
                            size={18}
                            color={UI.brand.primary}
                        />
                    </View>

                    <View style={{ flex: 1 }}>
                        <View style={S.titleRow}>
                            <Text style={S.historyTitle} numberOfLines={1}>
                                {item.title}
                            </Text>

                            {!item.isRead && item.type === 'PUSH_MESSAGE' ? (
                                <View style={S.unreadDot} />
                            ) : null}
                        </View>

                        <Text style={S.historyDesc} numberOfLines={2}>
                            {item.description}
                        </Text>
                        <Text style={S.historyDate} numberOfLines={1}>
                            {formatPtBRDateTime(item.date)}
                        </Text>

                        <View style={S.actionsRow}>
                            <Pressable
                                style={S.primaryActionBtn}
                                onPress={() => onPressItem(item)}
                                hitSlop={8}
                            >
                                <Text style={S.primaryActionText}>
                                    {getPrimaryActionLabel(item)}
                                </Text>
                            </Pressable>

                            {isReview ? (
                                <Pressable
                                    style={S.secondaryActionBtn}
                                    onPress={() =>
                                        onDismissReview(item.appointmentId)
                                    }
                                    hitSlop={8}
                                    disabled={dismissing}
                                >
                                    {dismissing ? (
                                        <ActivityIndicator color="#141414" />
                                    ) : (
                                        <Text style={S.secondaryActionText}>
                                            Agora não
                                        </Text>
                                    )}
                                </Pressable>
                            ) : null}
                        </View>
                    </View>
                </View>

                <FontAwesome
                    name="angle-right"
                    size={18}
                    color="rgba(0,0,0,0.25)"
                />
            </Pressable>

            {showDivider ? <View style={S.historyDivider} /> : null}
        </View>
    );
});

export default function ClientNotifications() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const pathname = usePathname();

    const [items, setItems] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [dismissingId, setDismissingId] = useState<string | null>(null);

    const fetchingRef = useRef(false);

    const didRef = useRef(false);
    const [dataReady, setDataReady] = useState(false);

    const recomputeReady = useCallback(() => {
        if (didRef.current) setDataReady(true);
    }, []);

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

    const fetchNotifications = useCallback(async () => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        try {
            setLoading(true);

            const raw = await api.get<NotificationsResponse>(
                '/api/mobile/notifications'
            );

            const res = unwrapApiData<NotificationsResponse>(raw);

            if (!res?.ok) {
                console.log(
                    '[notifications] api error:',
                    res?.error ?? 'unknown'
                );
                setItems([]);
                return;
            }

            const list = Array.isArray(res?.items) ? res.items : [];
            setItems(list);
        } catch (err: any) {
            console.log(
                '[notifications] fetch error:',
                err?.data ?? err?.message ?? err
            );
            setItems([]);
        } finally {
            setLoading(false);
            fetchingRef.current = false;

            didRef.current = true;
            recomputeReady();
        }
    }, [recomputeReady]);

    useFocusEffect(
        useCallback(() => {
            trackPageViewed();

            return () => {
                lastViewedKeyRef.current = '';
            };
        }, [trackPageViewed])
    );

    useFocusEffect(
        useCallback(() => {
            fetchNotifications();
        }, [fetchNotifications])
    );

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    const goBack = useCallback(() => router.back(), [router]);

    const openReview = useCallback(
        (appointmentId: string) => {
            router.push({
                pathname: '/client/review',
                params: { appointmentId },
            });
        },
        [router]
    );

    const openPushMessage = useCallback(
        (item: Extract<NotificationItem, { type: 'PUSH_MESSAGE' }>) => {
            if (!item.notificationId) {
                Alert.alert('Erro', 'Notificação inválida.');
                return;
            }

            router.push({
                pathname: '/client/notifications/[id]',
                params: { id: item.notificationId },
            });
        },
        [router]
    );

    const handlePressItem = useCallback(
        (item: NotificationItem) => {
            if (item.type === 'PENDING_REVIEW') {
                openReview(item.appointmentId);
                return;
            }

            openPushMessage(item);
        },
        [openPushMessage, openReview]
    );

    const dismiss = useCallback(async (appointmentId: string) => {
        try {
            setDismissingId(appointmentId);

            const raw = await api.post<{ ok: boolean; error?: string }>(
                '/api/mobile/reviews/dismiss',
                { appointmentId }
            );

            const res = unwrapApiData<{ ok: boolean; error?: string }>(raw);

            if (!res?.ok) {
                Alert.alert(
                    'Não foi possível atualizar',
                    res?.error || 'Tente novamente.'
                );
                return;
            }

            setItems((prev) =>
                prev.filter(
                    (x) =>
                        !(
                            x.type === 'PENDING_REVIEW' &&
                            x.appointmentId === appointmentId
                        )
                )
            );
        } catch (err: any) {
            console.log(
                '[notifications] dismiss error:',
                err?.data ?? err?.message ?? err
            );
            Alert.alert('Erro', 'Não foi possível atualizar. Tente novamente.');
        } finally {
            setDismissingId(null);
        }
    }, []);

    const sections = useMemo(() => {
        return [
            {
                title: 'Notificações',
                subtitle: 'Tudo o que precisa da sua atenção.',
                data: items,
            },
        ] as Array<{
            title: string;
            subtitle: string;
            data: NotificationItem[];
        }>;
    }, [items]);

    const hasAny = useMemo(() => items.length > 0, [items.length]);

    const renderSectionHeader = useCallback(
        ({
            section,
        }: {
            section: {
                title: string;
                subtitle: string;
                data: NotificationItem[];
            };
        }) => (
            <View style={S.sectionHeader}>
                <Text style={S.sectionTitle}>{section.title}</Text>
                <Text style={S.sectionSubtitle}>{section.subtitle}</Text>

                {section.data.length === 0 && !loading ? (
                    <View style={S.sectionEmptyPill}>
                        <Text style={S.sectionEmptyText}>Nada por aqui</Text>
                    </View>
                ) : null}
            </View>
        ),
        [loading]
    );

    const renderItem = useCallback(
        ({
            item,
            index,
            section,
        }: {
            item: NotificationItem;
            index: number;
            section: { data: NotificationItem[] };
        }) => (
            <NotificationRow
                item={item}
                showDivider={index < section.data.length - 1}
                onPressItem={handlePressItem}
                onDismissReview={dismiss}
                dismissing={
                    item.type === 'PENDING_REVIEW' &&
                    dismissingId === item.appointmentId
                }
            />
        ),
        [dismiss, dismissingId, handlePressItem]
    );

    const keyExtractor = useCallback((item: NotificationItem) => item.id, []);

    const listPadTop = useMemo(
        () => insets.top + STICKY_ROW_H + 10,
        [insets.top]
    );

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
                            <Text style={S.centerTitle}>Notificações</Text>
                        </View>

                        <View style={{ width: 42, height: 42 }} />
                    </View>
                </View>

                <SectionList
                    sections={sections}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    renderSectionHeader={renderSectionHeader}
                    stickySectionHeadersEnabled={false}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[
                        S.listContent,
                        { paddingTop: listPadTop },
                    ]}
                    style={S.list}
                    ListEmptyComponent={
                        !loading && !hasAny ? (
                            <View style={S.emptyBox}>
                                <FontAwesome
                                    name="bell-o"
                                    size={18}
                                    color={UI.brand.primary}
                                />
                                <Text style={S.emptyText}>
                                    Nada novo por aqui.
                                </Text>
                            </View>
                        ) : null
                    }
                    removeClippedSubviews
                    initialNumToRender={10}
                    maxToRenderPerBatch={12}
                    windowSize={9}
                />
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

    refreshBtn: {
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

    list: { flex: 1, backgroundColor: UI.colors.white },
    listContent: { paddingBottom: 28 },

    sectionHeader: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 18,
        paddingBottom: 10,
        backgroundColor: UI.colors.white,
    },

    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: UI.brand.primaryText,
    },

    sectionSubtitle: {
        marginTop: 4,
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(0,0,0,0.50)',
    },

    sectionEmptyPill: {
        alignSelf: 'flex-start',
        marginTop: 10,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
    },

    sectionEmptyText: {
        fontSize: 12,
        fontWeight: '700',
        color: UI.brand.primaryText,
    },

    historyItem: {
        backgroundColor: UI.colors.white,
    },

    rowPressArea: {
        paddingVertical: 16,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },

    historyLeft: {
        flexDirection: 'row',
        gap: 14,
        flex: 1,
        alignItems: 'flex-start',
        paddingRight: 12,
    },

    historyIcon: {
        width: 36,
        height: 36,
        backgroundColor: 'rgba(124,108,255,0.12)',
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },

    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: UI.brand.primary,
        marginTop: 1,
    },

    historyTitle: { fontWeight: '700', color: UI.brand.primaryText },
    historyDesc: { fontSize: 13, color: 'rgba(0,0,0,0.65)', marginTop: 2 },
    historyDate: { fontSize: 12, color: 'rgba(0,0,0,0.40)', marginTop: 2 },

    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },

    primaryActionBtn: {
        height: 44,
        borderRadius: 999,
        paddingHorizontal: 14,
        backgroundColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryActionText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },

    secondaryActionBtn: {
        height: 40,
        borderRadius: 999,
        paddingHorizontal: 12,
        backgroundColor: UI.colors.white,
        borderWidth: 1,
        borderColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryActionText: {
        color: '#141414',
        fontSize: 13,
        fontWeight: '600',
    },

    historyDivider: {
        position: 'absolute',
        left: UI.spacing.screenX,
        right: UI.spacing.screenX,
        bottom: 0,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.08)',
    },

    emptyBox: {
        paddingHorizontal: UI.spacing.screenX,
        paddingVertical: 18,
        alignItems: 'center',
        gap: 10,
    },

    emptyText: {
        color: 'rgba(0,0,0,0.55)',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
});
