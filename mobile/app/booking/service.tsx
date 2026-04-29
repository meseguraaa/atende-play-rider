// app/booking/service.tsx
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

type Service = {
    id: string;
    name: string;
    description?: string | null;
    durationMinutes?: number | null;
    priceLabel?: string | null;
    price?: any;

    isPlanEligible?: boolean;
    planCreditsRemaining?: number;
    isSuggestedByPlan?: boolean;
};

type EditPayload = {
    ok: boolean;
    appointment: {
        id: string;
        unitId: string | null;
        unitName: string | null;
        serviceId: string | null;
        serviceName: string | null;

        barberId: string | null;
        barberName: string | null;

        scheduleAt: string | Date;
        status: string;
    };
    units: { id: string; name: string }[];
    rules: { canReschedule: boolean; reason: string | null };
};

type ActivePlanBalance = {
    balanceId: string;
    serviceId: string;
    serviceName: string;
    sortOrder: number;
    creditsTotal: number;
    creditsUsed: number;
    creditsRemaining: number;
};

type ActivePlanResponse = {
    ok: boolean;
    data?: {
        plan: null | {
            id: string;
            clientPlanId: string;
            planId: string;
            name: string;
            type: string;
            planTypeSnapshot?: string;
            isSubscription?: boolean;
            assetLabel?: string;
            assetLabelPlural?: string;
            status: string;
            isPaid: boolean;
            startsAt: string;
            expiresAt: string;
            creditsTotal: number;
            creditsUsed: number;
            creditsRemaining: number;
            creditsLabel: string;
            nextSuggestedService: null | {
                balanceId: string;
                serviceId: string;
                serviceName: string;
                sortOrder: number;
                creditsRemaining: number;
            };
            balances: ActivePlanBalance[];
        };
    };
};

function formatMoneyBRL(value: any): string | null {
    if (value == null) return null;

    const n =
        typeof value === 'number'
            ? value
            : typeof value === 'string'
              ? Number(value)
              : typeof value?.toNumber === 'function'
                ? value.toNumber()
                : Number(value);

    if (Number.isNaN(n)) return null;

    try {
        return n.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });
    } catch {
        return null;
    }
}

function normalizeDurationMinutes(v: any): number {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 30;
    return Math.round(n);
}

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

function splitScheduleAt(scheduleAt: string | Date): {
    dateISO: string;
    startTime: string;
} {
    const d = new Date(scheduleAt);
    if (Number.isNaN(d.getTime())) return { dateISO: '', startTime: '' };

    const hh = pad2(d.getHours());
    const mi = pad2(d.getMinutes());

    const noon = new Date(d);
    noon.setHours(12, 0, 0, 0);

    return { dateISO: noon.toISOString(), startTime: `${hh}:${mi}` };
}

const ServiceRow = memo(function ServiceRow({
    item,
    onPress,
    showDivider,
    isCurrent,
}: {
    item: Service;
    onPress: () => void;
    showDivider: boolean;
    isCurrent: boolean;
}) {
    const price = useMemo(() => {
        if (item.priceLabel) return item.priceLabel;
        const f = formatMoneyBRL(item.price);
        return f ?? '';
    }, [item.price, item.priceLabel]);

    const duration = useMemo(() => {
        const m = item.durationMinutes ?? null;
        if (!m || m <= 0) return '';
        return `${m} min`;
    }, [item.durationMinutes]);

    const description = useMemo(() => {
        const d =
            typeof item.description === 'string' ? item.description.trim() : '';
        return d ? d : null;
    }, [item.description]);

    return (
        <Pressable onPress={onPress} style={S.row}>
            <View style={S.rowLeft}>
                <View style={S.avatar}>
                    <FontAwesome
                        name="star-o"
                        size={16}
                        color={UI.colors.historyIconColor}
                    />
                </View>

                <View style={S.rowTextCol}>
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: 8,
                            flexWrap: 'wrap',
                            flex: 1,
                        }}
                    >
                        <Text style={S.rowTitle}>{item.name}</Text>

                        {isCurrent ? (
                            <View style={S.currentBadge}>
                                <Text style={S.currentBadgeText}>Atual</Text>
                            </View>
                        ) : null}
                    </View>

                    <Text style={S.rowMeta} numberOfLines={1}>
                        {item.isPlanEligible
                            ? `${
                                  duration ? `${duration} • ` : ''
                              }${item.planCreditsRemaining ?? 0} crédito(s) disponível(is)`
                            : duration
                              ? duration
                              : 'Toque para escolher'}
                    </Text>

                    {description ? (
                        <Text style={S.rowDescription}>{description}</Text>
                    ) : null}
                </View>
            </View>

            <View style={S.rowRight}>
                {price ? <Text style={S.rowPrice}>{price}</Text> : null}
                <FontAwesome
                    name="chevron-right"
                    size={14}
                    color={UI.colors.black45}
                />
            </View>

            {showDivider ? <View style={S.divider} /> : null}
        </Pressable>
    );
});

export default function BookingService() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const params = useLocalSearchParams<{
        unitId?: string;
        unitName?: string;

        professionalId?: string;
        professionalName?: string;

        categoryId?: string;
        categoryName?: string;

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

    const categoryId = useMemo(
        () => String(params.categoryId ?? '').trim(),
        [params.categoryId]
    );
    const categoryName = useMemo(
        () => String(params.categoryName ?? '').trim(),
        [params.categoryName]
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

    const planType = useMemo(
        () =>
            String(params.planType ?? '')
                .trim()
                .toUpperCase(),
        [params.planType]
    );

    const [activePlanType, setActivePlanType] = useState<string>(planType);
    const isSubscription = useMemo(
        () => activePlanType === 'SUBSCRIPTION' || planType === 'SUBSCRIPTION',
        [activePlanType, planType]
    );

    const suggestedServiceId = useMemo(
        () => String(params.suggestedServiceId ?? '').trim(),
        [params.suggestedServiceId]
    );

    const suggestedBalanceId = useMemo(
        () => String(params.suggestedBalanceId ?? '').trim(),
        [params.suggestedBalanceId]
    );

    const isPlanFlow = useMemo(() => planMode === 'credit', [planMode]);

    const [loading, setLoading] = useState(true);
    const [services, setServices] = useState<Service[]>([]);
    const [bookingWindowDays, setBookingWindowDays] = useState(30);

    const [activePlanName, setActivePlanName] = useState<string>('');
    const [activePlanCreditsLabel, setActivePlanCreditsLabel] =
        useState<string>('');
    const [planBalances, setPlanBalances] = useState<ActivePlanBalance[]>([]);

    const [currentServiceId, setCurrentServiceId] = useState<string | null>(
        null
    );
    const [currentProfessionalId, setCurrentProfessionalId] = useState<
        string | null
    >(null);
    const [currentScheduleAt, setCurrentScheduleAt] = useState<string>('');
    const [currentDateISO, setCurrentDateISO] = useState<string>('');
    const [currentStartTime, setCurrentStartTime] = useState<string>('');

    const didEditRef = useRef(false);
    const didServicesRef = useRef(false);
    const [dataReady, setDataReady] = useState(false);

    const recomputeReady = useCallback(() => {
        const ok =
            (isEdit ? didEditRef.current : true) && didServicesRef.current;
        if (ok) setDataReady(true);
    }, [isEdit]);

    const TOP_OFFSET = insets.top + STICKY_ROW_H;

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

    const goBack = useCallback(() => router.back(), [router]);

    const fetchEditInfoIfNeeded = useCallback(async () => {
        if (!isEdit) return;

        if (!appointmentId) {
            Alert.alert('Ops', 'appointmentId ausente no modo editar.');
            router.back();
            return;
        }

        try {
            const res = await api.get<EditPayload>(
                `/api/mobile/me/appointments/${encodeURIComponent(
                    appointmentId
                )}/edit`
            );

            if (!res?.ok) {
                Alert.alert('Erro', 'Não foi possível validar a edição.');
                router.back();
                return;
            }

            if (res.rules?.canReschedule === false) {
                Alert.alert(
                    'Não é possível alterar',
                    res.rules?.reason || 'Bloqueado.'
                );
                router.back();
                return;
            }

            const appt = res.appointment;

            const scheduleAtStr =
                appt?.scheduleAt instanceof Date
                    ? appt.scheduleAt.toISOString()
                    : String(appt?.scheduleAt ?? '');

            setCurrentServiceId(appt?.serviceId ?? null);
            setCurrentProfessionalId(appt?.barberId ?? null);
            setCurrentScheduleAt(scheduleAtStr);

            const { dateISO, startTime } = splitScheduleAt(scheduleAtStr);
            setCurrentDateISO(dateISO || '');
            setCurrentStartTime(startTime || '');
        } catch (err: any) {
            console.log(
                '[booking/service][edit] error:',
                err?.data ?? err?.message ?? err
            );
            const msg =
                err?.data?.error ||
                err?.message ||
                'Não foi possível validar a edição do agendamento.';
            Alert.alert('Erro', String(msg));
            router.back();
        } finally {
            didEditRef.current = true;
            recomputeReady();
        }
    }, [appointmentId, isEdit, recomputeReady, router]);

    const fetchActivePlanIfNeeded = useCallback(async () => {
        if (!isPlanFlow) {
            setActivePlanName('');
            setActivePlanCreditsLabel('');
            setActivePlanType(planType);
            setPlanBalances([]);
            return;
        }

        try {
            const res = await api.get<ActivePlanResponse>(
                '/api/mobile/me/plans/active'
            );

            const plan =
                (res as any)?.plan ??
                (res as any)?.data?.plan ??
                res?.data?.plan ??
                null;

            if (!plan) {
                setActivePlanName('');
                setActivePlanCreditsLabel('');
                setActivePlanType(planType);
                setPlanBalances([]);
                return;
            }

            setActivePlanName(String(plan.name ?? '').trim());
            setActivePlanCreditsLabel(String(plan.creditsLabel ?? '').trim());
            setActivePlanType(
                String(
                    plan.planTypeSnapshot ?? plan.type ?? planType ?? 'GENERAL'
                )
                    .trim()
                    .toUpperCase()
            );

            const nextBalances = Array.isArray(plan.balances)
                ? plan.balances
                : [];

            setPlanBalances((prev) => {
                const prevJson = JSON.stringify(prev ?? []);
                const nextJson = JSON.stringify(nextBalances);
                return prevJson === nextJson ? prev : nextBalances;
            });
        } catch {
            setActivePlanName('');
            setActivePlanCreditsLabel('');
            setActivePlanType(planType);
            setPlanBalances([]);
        }
    }, [isPlanFlow]);

    const fetchServices = useCallback(async () => {
        if (!unitId || !professionalId || !categoryId) {
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
                services?: Service[];
                error?: string;
            }>(
                `/api/mobile/services?unitId=${encodeURIComponent(
                    unitId
                )}&professionalId=${encodeURIComponent(
                    professionalId
                )}&categoryId=${encodeURIComponent(categoryId)}`
            );

            if (res && res.ok === false) {
                throw new Error(
                    String((res as any)?.error ?? 'Falha ao carregar serviços')
                );
            }

            const baseList = Array.isArray(res?.services) ? res.services : [];

            const balanceMap = new Map(
                planBalances.map((item) => [item.serviceId, item])
            );

            let list = baseList.map((item) => {
                const balance = balanceMap.get(String(item.id ?? '').trim());

                return {
                    ...item,
                    isPlanEligible:
                        !!balance && Number(balance.creditsRemaining ?? 0) > 0,
                    planCreditsRemaining: balance
                        ? Number(balance.creditsRemaining ?? 0)
                        : 0,
                    isSuggestedByPlan:
                        !!suggestedServiceId &&
                        String(item.id ?? '').trim() === suggestedServiceId,
                };
            });

            if (isPlanFlow) {
                list = list.filter(
                    (item) =>
                        item.isPlanEligible &&
                        Number(item.planCreditsRemaining ?? 0) > 0
                );

                list = list.sort((a, b) => {
                    const aSuggested = a.isSuggestedByPlan ? 1 : 0;
                    const bSuggested = b.isSuggestedByPlan ? 1 : 0;

                    if (aSuggested !== bSuggested)
                        return bSuggested - aSuggested;

                    const aBalance = balanceMap.get(String(a.id ?? '').trim());
                    const bBalance = balanceMap.get(String(b.id ?? '').trim());

                    const aOrder = Number(aBalance?.sortOrder ?? 999999);
                    const bOrder = Number(bBalance?.sortOrder ?? 999999);

                    if (aOrder !== bOrder) return aOrder - bOrder;

                    return String(a?.name ?? '').localeCompare(
                        String(b?.name ?? '')
                    );
                });
            } else {
                list = list
                    .slice()
                    .sort((a, b) =>
                        String(a?.name ?? '').localeCompare(
                            String(b?.name ?? '')
                        )
                    );
            }

            setServices(list);
        } catch (err: any) {
            console.log(
                '[booking/service] error:',
                err?.data ?? err?.message ?? err
            );
            Alert.alert(
                'Erro',
                'Não foi possível carregar os serviços. Tente novamente.'
            );
            setServices([]);
        } finally {
            setLoading(false);
            didServicesRef.current = true;
            recomputeReady();
        }
    }, [
        categoryId,
        isPlanFlow,
        planBalances,
        professionalId,
        recomputeReady,
        router,
        suggestedServiceId,
        unitId,
    ]);

    const fetchUnitConfig = useCallback(async () => {
        if (!unitId) return;

        try {
            const res = await api.get<{
                ok: boolean;
                data?: { bookingWindowDays?: number };
            }>(`/api/mobile/units/${encodeURIComponent(unitId)}`);

            const val = Number(res?.data?.bookingWindowDays ?? 30);

            if (Number.isFinite(val)) {
                if (val < 1) setBookingWindowDays(1);
                else if (val > 365) setBookingWindowDays(365);
                else setBookingWindowDays(Math.trunc(val));
            }
        } catch (err) {
            console.log('[booking/service] fetch unit config error', err);
        }
    }, [unitId]);

    useEffect(() => {
        let alive = true;

        (async () => {
            if (isEdit) await fetchEditInfoIfNeeded();
            if (!alive) return;

            await fetchActivePlanIfNeeded();
            if (!alive) return;

            await fetchUnitConfig();
        })();

        return () => {
            alive = false;
        };
    }, [
        fetchActivePlanIfNeeded,
        fetchEditInfoIfNeeded,
        fetchUnitConfig,
        isEdit,
    ]);

    useEffect(() => {
        fetchServices();
    }, [fetchServices]);

    const pushTime = useCallback(
        (s: Service, replace?: boolean) => {
            const sid = String(s?.id ?? '').trim();
            if (!sid) return;

            const duration = normalizeDurationMinutes(s.durationMinutes);

            const selectedBalanceId =
                planBalances.find((item) => item.serviceId === sid)
                    ?.balanceId ||
                suggestedBalanceId ||
                '';

            const nav = {
                pathname: '/booking/time',
                params: {
                    unitId,
                    unitName,
                    professionalId,
                    professionalName,
                    categoryId,
                    categoryName,
                    serviceId: sid,
                    serviceName: String(s?.name ?? 'Serviço'),
                    serviceDurationMinutes: String(duration),
                    bookingWindowDays: String(bookingWindowDays),

                    ...(isEdit ? { mode: 'edit', appointmentId } : {}),

                    ...(isEdit
                        ? {
                              currentProfessionalId:
                                  currentProfessionalId ?? '',
                              currentServiceId: currentServiceId ?? '',
                              currentScheduleAt: currentScheduleAt ?? '',
                              currentDateISO: currentDateISO ?? '',
                              currentStartTime: currentStartTime ?? '',
                          }
                        : {}),

                    ...(isPlanFlow
                        ? {
                              planMode: 'credit',
                              clientPlanId,
                              suggestedServiceId,
                              suggestedBalanceId,
                              planType: activePlanType || planType,
                              selectedPlanBalanceId: selectedBalanceId,
                              selectedPlanCreditsRemaining: String(
                                  Number(s.planCreditsRemaining ?? 0)
                              ),
                          }
                        : {}),
                },
            } as const;

            if (replace) router.replace(nav);
            else router.push(nav);
        },
        [
            activePlanType,
            appointmentId,
            categoryId,
            categoryName,
            clientPlanId,
            currentDateISO,
            currentProfessionalId,
            currentScheduleAt,
            currentServiceId,
            currentStartTime,
            isEdit,
            isPlanFlow,
            planBalances,
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

    const goTime = useCallback((s: Service) => pushTime(s, false), [pushTime]);

    const key = useCallback((item: Service) => item.id, []);
    const render = useCallback(
        ({ item, index }: ListRenderItemInfo<Service>) => (
            <ServiceRow
                item={item}
                isCurrent={
                    (!!currentServiceId && item.id === currentServiceId) ||
                    (!!suggestedServiceId && item.id === suggestedServiceId)
                }
                onPress={() => goTime(item)}
                showDivider={index < services.length - 1}
            />
        ),
        [currentServiceId, goTime, services.length, suggestedServiceId]
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
                            <Text style={S.heroTitle}>Escolha o serviço</Text>

                            <Text style={S.heroDesc}>
                                {unitName ? `Unidade: ${unitName}` : ' '}
                                {professionalName
                                    ? `\nProfissional: ${professionalName}`
                                    : ''}
                                {categoryName
                                    ? `\nCategoria: ${categoryName}`
                                    : ''}
                                {isPlanFlow
                                    ? `\n${
                                          isSubscription
                                              ? 'Assinatura'
                                              : 'Plano'
                                      }: ${
                                          activePlanName ||
                                          (isSubscription
                                              ? 'Assinatura ativa'
                                              : 'Plano ativo')
                                      }${
                                          activePlanCreditsLabel
                                              ? `\nCréditos: ${activePlanCreditsLabel}`
                                              : ''
                                      }`
                                    : ''}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={S.whiteArea}>
                    <View style={S.whiteContent}>
                        <Text style={S.sectionTitle}>Serviços</Text>

                        {loading ? (
                            <View style={S.centerBox}>
                                <ActivityIndicator />
                                <Text style={S.centerText}>Carregando…</Text>
                            </View>
                        ) : services.length === 0 ? (
                            <View style={S.centerBox}>
                                <Text style={S.emptyTitle}>
                                    Nenhum serviço disponível
                                </Text>
                                <Text style={S.centerText}>
                                    {isPlanFlow
                                        ? isSubscription
                                            ? 'Não encontramos serviços com créditos disponíveis nesta assinatura para essa categoria e profissional.'
                                            : 'Não encontramos serviços com créditos disponíveis neste plano para essa categoria e profissional.'
                                        : 'Não encontramos serviços ativos para essa categoria e profissional.'}
                                </Text>

                                <Pressable
                                    style={S.secondaryBtn}
                                    onPress={fetchServices}
                                >
                                    <Text style={S.secondaryBtnText}>
                                        Tentar novamente
                                    </Text>
                                </Pressable>
                            </View>
                        ) : (
                            <FlatList
                                data={services}
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

    rowTextCol: {
        flex: 1,
        minWidth: 0,
        paddingRight: 96,
    },

    rowTitle: {
        fontWeight: '700',
        color: UI.brand.primaryText,
        fontSize: 14,
        flexShrink: 1,
        lineHeight: 18,
    },
    rowMeta: { marginTop: 3, fontSize: 12, color: 'rgba(0,0,0,0.55)' },

    rowDescription: {
        marginTop: 6,
        fontSize: 12,
        lineHeight: 16,
        color: 'rgba(0,0,0,0.58)',
        fontWeight: '600',
    },

    rowRight: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginLeft: 12,
    },

    rowPrice: {
        color: UI.brand.primaryText,
        fontWeight: '700',
        fontSize: 13,
    },

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
