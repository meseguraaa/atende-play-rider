// app/booking/category.tsx
import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
    ListRenderItemInfo,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI } from '../../src/theme/client-theme';
import { api } from '../../src/services/api';

import { ScreenGate } from '../../src/components/layout/ScreenGate';
import { BookingServiceSkeleton } from '../../src/components/loading/BookingServiceSkeleton';

const STICKY_ROW_H = 74;

type Category = {
    id: string;
    name: string;
    serviceIds?: string[];
};

type AppointmentGetResponse = {
    ok: boolean;
    appointment: {
        id: string;
        status: string;

        unitId: string | null;
        unitName: string | null;

        serviceId: string | null;
        serviceName: string | null;

        barberId: string | null;
        barberName: string | null;

        dateISO: string;
        startTime: string;

        canReschedule?: boolean;
    };
};

const CategoryRow = memo(function CategoryRow({
    item,
    onPress,
    showDivider,
    isCurrent,
}: {
    item: Category;
    onPress: () => void;
    showDivider: boolean;
    isCurrent: boolean;
}) {
    return (
        <Pressable onPress={onPress} style={S.row}>
            <View style={S.rowLeft}>
                <View style={S.avatar}>
                    <FontAwesome
                        name="bookmark-o"
                        size={16}
                        color={UI.colors.historyIconColor}
                    />
                </View>

                <View style={{ flex: 1 }}>
                    <View style={S.rowTitleLine}>
                        <Text style={S.rowTitle} numberOfLines={1}>
                            {item.name}
                        </Text>

                        {isCurrent ? (
                            <View style={S.currentBadge}>
                                <Text style={S.currentBadgeText}>Atual</Text>
                            </View>
                        ) : null}
                    </View>

                    <Text style={S.rowMeta}>
                        Toque para escolher a categoria
                    </Text>
                </View>
            </View>

            <FontAwesome
                name="chevron-right"
                size={14}
                color={UI.colors.black45}
            />

            {showDivider ? <View style={S.divider} /> : null}
        </Pressable>
    );
});

export default function BookingCategory() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const params = useLocalSearchParams<{
        unitId?: string;
        unitName?: string;

        professionalId?: string;
        professionalName?: string;

        mode?: string;
        appointmentId?: string;

        planMode?: string;
        clientPlanId?: string;
        suggestedServiceId?: string;
        suggestedBalanceId?: string;
        planType?: string;
    }>();

    const unitId = useMemo(
        () => String(params.unitId ?? '').trim(),
        [params.unitId]
    );
    const unitName = useMemo(
        () => String(params.unitName ?? '').trim(),
        [params.unitName]
    );

    const professionalId = useMemo(
        () => String(params.professionalId ?? '').trim(),
        [params.professionalId]
    );
    const professionalName = useMemo(
        () => String(params.professionalName ?? '').trim(),
        [params.professionalName]
    );

    const isEdit = String(params.mode ?? '') === 'edit';
    const appointmentId = useMemo(
        () => String(params.appointmentId ?? '').trim(),
        [params.appointmentId]
    );

    const planMode = useMemo(
        () => String(params.planMode ?? '').trim(),
        [params.planMode]
    );

    const clientPlanId = useMemo(
        () => String(params.clientPlanId ?? '').trim(),
        [params.clientPlanId]
    );

    const suggestedServiceId = useMemo(
        () => String(params.suggestedServiceId ?? '').trim(),
        [params.suggestedServiceId]
    );

    const suggestedBalanceId = useMemo(
        () => String(params.suggestedBalanceId ?? '').trim(),
        [params.suggestedBalanceId]
    );

    const planType = useMemo(
        () =>
            String(params.planType ?? '')
                .trim()
                .toUpperCase(),
        [params.planType]
    );

    const isPlanFlow = useMemo(() => planMode === 'credit', [planMode]);
    const isSubscription = useMemo(
        () => planType === 'SUBSCRIPTION',
        [planType]
    );

    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState<Category[]>([]);
    const [currentServiceId, setCurrentServiceId] = useState<string>('');

    const didEditRef = useRef(false);
    const didListRef = useRef(false);
    const [dataReady, setDataReady] = useState(false);

    const TOP_OFFSET = insets.top + STICKY_ROW_H;
    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );
    const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

    const goBack = useCallback(() => router.back(), [router]);

    const recomputeReady = useCallback(() => {
        const ok = (isEdit ? didEditRef.current : true) && didListRef.current;
        if (ok) setDataReady(true);
    }, [isEdit]);

    const fetchCurrentAppointmentIfNeeded = useCallback(async () => {
        if (!isEdit) return;

        if (!appointmentId) {
            Alert.alert('Ops', 'appointmentId ausente no modo alterar.');
            router.back();
            return;
        }

        try {
            const res = await api.get<AppointmentGetResponse>(
                `/api/mobile/me/appointments/${encodeURIComponent(
                    appointmentId
                )}`
            );

            if (!res?.ok || !res?.appointment) {
                Alert.alert(
                    'Erro',
                    'Não foi possível carregar o agendamento para edição.'
                );
                router.back();
                return;
            }

            if (res.appointment.canReschedule === false) {
                Alert.alert(
                    'Não é possível alterar',
                    'Este agendamento não pode ser alterado agora.'
                );
                router.back();
                return;
            }

            setCurrentServiceId(String(res.appointment.serviceId ?? '').trim());
        } catch (err: any) {
            const msg =
                err?.data?.error ||
                err?.message ||
                'Não foi possível carregar o agendamento para edição.';
            Alert.alert('Erro', String(msg));
            router.back();
        } finally {
            didEditRef.current = true;
            recomputeReady();
        }
    }, [appointmentId, isEdit, recomputeReady, router]);

    const fetchCategories = useCallback(async () => {
        if (!unitId || !professionalId) {
            Alert.alert(
                'Ops',
                'Parâmetros incompletos. Volte e tente novamente.'
            );
            router.back();
            return;
        }

        try {
            setLoading(true);

            const res = await api.get<{
                ok?: boolean;
                categories?: Category[];
                error?: string;
            }>(
                `/api/mobile/categories?unitId=${encodeURIComponent(
                    unitId
                )}&professionalId=${encodeURIComponent(professionalId)}`
            );

            if (res && res.ok === false) {
                throw new Error(
                    String(
                        (res as any)?.error ?? 'Falha ao carregar categorias'
                    )
                );
            }

            const list = (Array.isArray(res?.categories) ? res.categories : [])
                .slice()
                .sort((a, b) =>
                    String(a?.name ?? '').localeCompare(String(b?.name ?? ''))
                );

            setCategories(list);

            if (list.length === 1) {
                console.log('[booking/category][auto-goService]', {
                    unitId,
                    unitName,
                    professionalId,
                    professionalName,
                    categoryId: list[0].id,
                    categoryName: list[0].name,
                    isPlanFlow,
                    clientPlanId: isPlanFlow ? clientPlanId : undefined,
                    suggestedServiceId: isPlanFlow
                        ? suggestedServiceId
                        : undefined,
                    suggestedBalanceId: isPlanFlow
                        ? suggestedBalanceId
                        : undefined,
                    planType: isPlanFlow ? planType : undefined,
                });

                router.replace({
                    pathname: '/booking/service',
                    params: {
                        unitId,
                        unitName,
                        professionalId,
                        professionalName,
                        categoryId: list[0].id,
                        categoryName: list[0].name,
                        ...(isEdit ? { mode: 'edit', appointmentId } : {}),
                        ...(isPlanFlow
                            ? {
                                  planMode: 'credit',
                                  clientPlanId,
                                  suggestedServiceId,
                                  suggestedBalanceId,
                                  planType,
                              }
                            : {}),
                    },
                });
                return;
            }
        } catch (err: any) {
            console.log(
                '[booking/category] error:',
                err?.data ?? err?.message ?? err
            );
            Alert.alert(
                'Erro',
                'Não foi possível carregar as categorias. Tente novamente.'
            );
            setCategories([]);
        } finally {
            setLoading(false);
            didListRef.current = true;
            recomputeReady();
        }
    }, [
        appointmentId,
        clientPlanId,
        isEdit,
        isPlanFlow,
        planType,
        professionalId,
        professionalName,
        recomputeReady,
        router,
        suggestedBalanceId,
        suggestedServiceId,
        unitId,
        unitName,
    ]);

    useEffect(() => {
        let alive = true;

        (async () => {
            if (isEdit) await fetchCurrentAppointmentIfNeeded();
            if (!alive) return;
            await fetchCategories();
        })();

        return () => {
            alive = false;
        };
    }, [fetchCurrentAppointmentIfNeeded, fetchCategories, isEdit]);

    const goService = useCallback(
        (category: Category) => {
            console.log('[booking/category][goService]', {
                unitId,
                unitName,
                professionalId,
                professionalName,
                categoryId: category.id,
                categoryName: category.name,
                isPlanFlow,
                clientPlanId: isPlanFlow ? clientPlanId : undefined,
                suggestedServiceId: isPlanFlow ? suggestedServiceId : undefined,
                suggestedBalanceId: isPlanFlow ? suggestedBalanceId : undefined,
                planType: isPlanFlow ? planType : undefined,
            });

            router.push({
                pathname: '/booking/service',
                params: {
                    unitId,
                    unitName,
                    professionalId,
                    professionalName,
                    categoryId: category.id,
                    categoryName: category.name,
                    ...(isEdit ? { mode: 'edit', appointmentId } : {}),
                    ...(isPlanFlow
                        ? {
                              planMode: 'credit',
                              clientPlanId,
                              suggestedServiceId,
                              suggestedBalanceId,
                              planType,
                          }
                        : {}),
                },
            });
        },
        [
            appointmentId,
            clientPlanId,
            isEdit,
            isPlanFlow,
            planType,
            professionalId,
            professionalName,
            router,
            suggestedBalanceId,
            suggestedServiceId,
            unitId,
            unitName,
        ]
    );

    const key = useCallback((item: Category) => item.id, []);
    const render = useCallback(
        ({ item, index }: ListRenderItemInfo<Category>) => (
            <CategoryRow
                item={item}
                isCurrent={
                    !!currentServiceId &&
                    Array.isArray(item.serviceIds) &&
                    item.serviceIds.includes(currentServiceId)
                }
                onPress={() => goService(item)}
                showDivider={index < categories.length - 1}
            />
        ),
        [categories.length, currentServiceId, goService]
    );

    return (
        <ScreenGate dataReady={dataReady} skeleton={<BookingServiceSkeleton />}>
            <View style={S.page}>
                <View style={S.fixedTop}>
                    <View style={safeTopStyle} />

                    <View style={S.stickyRow}>
                        <Pressable
                            onPress={goBack}
                            style={S.backBtn}
                            hitSlop={8}
                        >
                            <FontAwesome
                                name="angle-left"
                                size={20}
                                color={UI.colors.white}
                            />
                        </Pressable>

                        <Text style={S.title}>
                            {isEdit ? 'Alterar agendamento' : 'Agendamento'}
                        </Text>

                        <View style={{ width: 42, height: 42 }} />
                    </View>
                </View>

                <View
                    pointerEvents="none"
                    style={[S.topBounceDark, { height: topBounceHeight }]}
                />
                <View style={{ height: TOP_OFFSET }} />

                <View style={S.darkShell}>
                    <View style={S.darkInner}>
                        <View style={S.heroCard}>
                            <Text style={S.heroTitle}>Escolha a categoria</Text>

                            <Text style={S.heroDesc}>
                                {unitName ? `Unidade: ${unitName}` : ' '}
                                {professionalName
                                    ? `\nProfissional: ${professionalName}`
                                    : ''}
                                {isPlanFlow
                                    ? `\nAgendamento com créditos ${
                                          isSubscription
                                              ? 'da assinatura'
                                              : 'do plano'
                                      }.`
                                    : ''}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={S.whiteArea}>
                    <View style={S.whiteContent}>
                        <Text style={S.sectionTitle}>Categorias</Text>

                        {loading ? (
                            <View style={S.centerBox}>
                                <ActivityIndicator />
                                <Text style={S.centerText}>Carregando…</Text>
                            </View>
                        ) : categories.length === 0 ? (
                            <View style={S.centerBox}>
                                <Text style={S.emptyTitle}>
                                    Nenhuma categoria disponível
                                </Text>
                                <Text style={S.centerText}>
                                    Não encontramos categorias de serviços para
                                    esse profissional.
                                </Text>

                                <Pressable
                                    style={S.secondaryBtn}
                                    onPress={fetchCategories}
                                >
                                    <Text style={S.secondaryBtnText}>
                                        Tentar novamente
                                    </Text>
                                </Pressable>
                            </View>
                        ) : (
                            <FlatList
                                data={categories}
                                keyExtractor={key}
                                renderItem={render}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingBottom: 18 }}
                            />
                        )}
                    </View>
                </View>
            </View>
        </ScreenGate>
    );
}

const S = StyleSheet.create({
    page: { flex: 1, backgroundColor: UI.colors.white },

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
        justifyContent: 'space-between',
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

    title: { color: UI.colors.text, fontSize: 16, fontWeight: '700' },

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

    heroCard: {
        marginTop: 14,
        backgroundColor: UI.colors.heroCardBg,
        borderRadius: UI.radius.card,
        padding: UI.spacing.cardPad,
        borderWidth: 1,
        borderColor: UI.colors.heroCardBorder,
    },
    heroTitle: { color: UI.colors.text, fontSize: 18, fontWeight: '600' },
    heroDesc: {
        marginTop: 8,
        color: UI.colors.textDim,
        fontSize: 13,
        fontWeight: '500',
        lineHeight: 18,
    },

    whiteArea: { flex: 1, backgroundColor: UI.colors.white },
    whiteContent: {
        paddingHorizontal: UI.spacing.screenX,
        paddingTop: 18,
        flex: 1,
    },

    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
        color: UI.brand.primaryText,
    },

    centerBox: { paddingVertical: 18, alignItems: 'center', gap: 10 },
    centerText: {
        color: 'rgba(0,0,0,0.55)',
        fontWeight: '600',
        textAlign: 'center',
    },
    emptyTitle: {
        color: UI.brand.primaryText,
        fontWeight: '700',
        fontSize: 16,
        textAlign: 'center',
    },

    secondaryBtn: {
        marginTop: 8,
        height: 52,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
    },
    secondaryBtnText: { color: UI.brand.primaryText, fontWeight: '700' },

    row: {
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
    },
    rowLeft: { flexDirection: 'row', gap: 12, flex: 1, alignItems: 'center' },

    avatar: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: UI.colors.historyIconBg,
        alignItems: 'center',
        justifyContent: 'center',
    },

    rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },

    rowTitle: {
        fontWeight: '700',
        color: UI.brand.primaryText,
        fontSize: 14,
    },
    rowMeta: { marginTop: 3, fontSize: 12, color: 'rgba(0,0,0,0.55)' },

    currentBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: 'rgba(124,108,255,0.16)',
        borderWidth: 1,
        borderColor: 'rgba(124,108,255,0.28)',
    },
    currentBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: UI.brand.primaryText,
    },

    divider: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.08)',
    },
});
