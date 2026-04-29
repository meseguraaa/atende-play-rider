// app/booking/time.tsx
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
import { BookingTimeSkeleton } from '../../src/components/loading/BookingTimeSkeleton';

const STICKY_ROW_H = 74;

type DayItem = { key: string; label: string; dateISO: string };

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

function dateKey(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(base: Date, days: number) {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
}

/**
 * ISO estável: meio-dia UTC do dia local selecionado.
 */
function toISOAtNoonUTC(d: Date) {
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    return new Date(Date.UTC(y, m, day, 12, 0, 0, 0)).toISOString();
}

function weekdayShortPt(d: Date) {
    const map = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return map[d.getDay()] ?? 'Dia';
}

function isoDayKeyUTC(dateISO: string) {
    const d = new Date(dateISO);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
        d.getUTCDate()
    )}`;
}

function normTime(t: string) {
    const s = String(t ?? '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return s.slice(0, 5);
    return `${pad2(Number(m[1]))}:${m[2]}`;
}

function timeToMinutes(hhmm: string) {
    const m = String(hhmm ?? '').match(/^(\d{2}):(\d{2})$/);
    if (!m) return Number.POSITIVE_INFINITY;
    return Number(m[1]) * 60 + Number(m[2]);
}

function nowMinutesLocal() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

function normalizeDurationMinutesStr(v: string, fallback = 30) {
    const n = Number(String(v ?? '').trim());
    if (!Number.isFinite(n) || n <= 0) return String(fallback);
    return String(Math.round(n));
}

type AppointmentGetResponse = {
    ok: boolean;
    appointment: {
        id: string;
        status: string;
        dateISO: string;
        startTime: string;
        canReschedule: boolean;
    };
    rules?: { canReschedule: boolean; reason: string | null };
    units?: { id: string; name: string }[];
};

const DayChip = memo(function DayChip({
    item,
    active,
    onPress,
}: {
    item: DayItem;
    active: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={[S.dayChip, active ? S.dayChipActive : null]}
        >
            <Text style={[S.dayChipText, active ? S.dayChipTextActive : null]}>
                {item.label}
            </Text>
        </Pressable>
    );
});

const SlotRow = memo(function SlotRow({
    time,
    onPress,
    showDivider,
    isCurrent,
}: {
    time: string;
    onPress: () => void;
    showDivider: boolean;
    isCurrent?: boolean;
}) {
    return (
        <Pressable onPress={onPress} style={S.row}>
            <View style={S.rowLeft}>
                <View style={S.avatar}>
                    <FontAwesome
                        name="clock-o"
                        size={18}
                        color={UI.colors.historyIconColor}
                    />
                </View>

                <View style={{ flex: 1 }}>
                    <View style={S.rowTitleLine}>
                        <Text style={S.rowTitle}>{time}</Text>

                        {isCurrent ? (
                            <View style={S.badgeAtual}>
                                <Text style={S.badgeAtualText}>Atual</Text>
                            </View>
                        ) : null}
                    </View>

                    <Text style={S.rowMeta}>
                        {isCurrent
                            ? 'Horário atual do agendamento'
                            : 'Toque para selecionar'}
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

export default function BookingTime() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const params = useLocalSearchParams<{
        unitId?: string;
        unitName?: string;
        serviceId?: string;
        serviceName?: string;

        professionalId?: string;
        professionalName?: string;

        barberId?: string;
        barberName?: string;

        serviceDurationMinutes?: string;
        bookingWindowDays?: string;

        mode?: string;
        appointmentId?: string;

        currentDateISO?: string;
        currentStartTime?: string;

        planMode?: string;
        clientPlanId?: string;
        suggestedServiceId?: string;
        suggestedBalanceId?: string;
        planType?: string;

        selectedPlanBalanceId?: string;
        selectedPlanServiceId?: string; // compat legado

        selectedPlanCreditsRemaining?: string;
    }>();

    const unitId = useMemo(
        () => String(params.unitId ?? '').trim(),
        [params.unitId]
    );
    const unitName = useMemo(
        () => String(params.unitName ?? '').trim(),
        [params.unitName]
    );
    const serviceId = useMemo(
        () => String(params.serviceId ?? '').trim(),
        [params.serviceId]
    );
    const serviceName = useMemo(
        () => String(params.serviceName ?? '').trim(),
        [params.serviceName]
    );

    const professionalId = useMemo(() => {
        return (
            String(params.professionalId ?? '').trim() ||
            String(params.barberId ?? '').trim()
        );
    }, [params.barberId, params.professionalId]);

    const professionalName = useMemo(() => {
        return (
            String(params.professionalName ?? '').trim() ||
            String(params.barberName ?? '').trim()
        );
    }, [params.barberName, params.professionalName]);

    const serviceDurationMinutes = useMemo(
        () =>
            normalizeDurationMinutesStr(
                String(params.serviceDurationMinutes ?? ''),
                30
            ),
        [params.serviceDurationMinutes]
    );

    const bookingWindowDays = useMemo(() => {
        const raw = Number(String(params.bookingWindowDays ?? '').trim());
        if (!Number.isFinite(raw)) return 30;

        const int = Math.trunc(raw);

        if (int < 1) return 1;
        if (int > 365) return 365;

        return int;
    }, [params.bookingWindowDays]);

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

    const selectedPlanBalanceId = useMemo(() => {
        return (
            String(params.selectedPlanBalanceId ?? '').trim() ||
            String(params.selectedPlanServiceId ?? '').trim()
        );
    }, [params.selectedPlanBalanceId, params.selectedPlanServiceId]);

    const selectedPlanCreditsRemaining = useMemo(
        () => String(params.selectedPlanCreditsRemaining ?? '').trim(),
        [params.selectedPlanCreditsRemaining]
    );

    const isPlanFlow = useMemo(() => planMode === 'credit', [planMode]);
    const isSubscription = useMemo(
        () => planType === 'SUBSCRIPTION',
        [planType]
    );

    const [currentDateISO, setCurrentDateISO] = useState(
        String(params.currentDateISO ?? '').trim()
    );
    const [currentStartTime, setCurrentStartTime] = useState(
        normTime(String(params.currentStartTime ?? ''))
    );

    const [dataReady, setDataReady] = useState(false);
    const didEditFetchRef = useRef(false);
    const didSlotsFetchRef = useRef(false);

    const TOP_OFFSET = insets.top + STICKY_ROW_H;
    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );
    const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

    const goBack = useCallback(() => router.back(), [router]);

    const days = useMemo<DayItem[]>(() => {
        const now = new Date();
        const list: DayItem[] = [];

        for (let i = 0; i < bookingWindowDays; i++) {
            const d = addDays(now, i);
            const key = dateKey(d);
            const label =
                i === 0
                    ? `Hoje (${weekdayShortPt(d)})`
                    : i === 1
                      ? `Amanhã (${weekdayShortPt(d)})`
                      : `${weekdayShortPt(d)} • ${pad2(d.getDate())}/${pad2(
                            d.getMonth() + 1
                        )}`;

            list.push({ key, label, dateISO: toISOAtNoonUTC(d) });
        }

        return list;
    }, [bookingWindowDays]);

    const syncGateReady = useCallback(() => {
        if (!isEdit) {
            if (didSlotsFetchRef.current) setDataReady(true);
            return;
        }

        if (didEditFetchRef.current && didSlotsFetchRef.current) {
            setDataReady(true);
        }
    }, [isEdit]);

    const fetchCurrentAppointmentIfNeeded = useCallback(async () => {
        try {
            if (!isEdit) return;

            if (!appointmentId) {
                Alert.alert('Ops', 'appointmentId ausente no modo alterar.');
                router.back();
                return;
            }

            const res = await api.get<AppointmentGetResponse>(
                `/api/mobile/me/appointments/${encodeURIComponent(appointmentId)}`
            );

            if (!res?.ok || !res?.appointment) return;

            if (res.appointment.canReschedule === false) {
                Alert.alert(
                    'Não é possível alterar',
                    'Este agendamento não pode ser alterado agora.'
                );
                router.back();
                return;
            }

            setCurrentDateISO(String(res.appointment.dateISO ?? '').trim());
            setCurrentStartTime(
                normTime(String(res.appointment.startTime ?? ''))
            );
        } catch (err: any) {
            console.log(
                '[booking/time][edit] get appointment error:',
                err?.data ?? err?.message ?? err
            );
        } finally {
            didEditFetchRef.current = true;
            syncGateReady();
        }
    }, [appointmentId, isEdit, router, syncGateReady]);

    useEffect(() => {
        fetchCurrentAppointmentIfNeeded();
    }, [fetchCurrentAppointmentIfNeeded]);

    const initialSelectedDayKey = useMemo(() => {
        if (!isEdit || !currentDateISO) return days[0]?.key ?? '';
        const currentKey = isoDayKeyUTC(currentDateISO);
        const exists = days.some((d) => d.key === currentKey);
        return exists ? currentKey : (days[0]?.key ?? '');
    }, [currentDateISO, days, isEdit]);

    const [selectedDayKey, setSelectedDayKey] = useState(initialSelectedDayKey);

    useEffect(() => {
        setSelectedDayKey(initialSelectedDayKey);
    }, [initialSelectedDayKey]);

    const selectedDateISO = useMemo(
        () =>
            days.find((d) => d.key === selectedDayKey)?.dateISO ??
            days[0]?.dateISO ??
            '',
        [days, selectedDayKey]
    );

    const isTodaySelected = useMemo(() => {
        return selectedDayKey === dateKey(new Date());
    }, [selectedDayKey]);

    const [loading, setLoading] = useState(true);
    const [slots, setSlots] = useState<string[]>([]);

    const fetchSlots = useCallback(async () => {
        try {
            if (!unitId || !serviceId || !professionalId || !selectedDateISO) {
                Alert.alert(
                    'Ops',
                    'Parâmetros do agendamento estão incompletos.'
                );
                router.back();
                return;
            }

            setLoading(true);

            const url =
                `/api/mobile/availability?professionalId=${encodeURIComponent(professionalId)}` +
                `&unitId=${encodeURIComponent(unitId)}` +
                `&serviceId=${encodeURIComponent(serviceId)}` +
                `&dateISO=${encodeURIComponent(selectedDateISO)}` +
                (serviceDurationMinutes
                    ? `&serviceDurationInMinutes=${encodeURIComponent(serviceDurationMinutes)}`
                    : '') +
                (isEdit && appointmentId
                    ? `&appointmentId=${encodeURIComponent(appointmentId)}`
                    : '');

            const res = await api.get<{
                ok: boolean;
                slots: string[];
                error?: string;
            }>(url);

            if (res && res.ok === false) {
                throw new Error(
                    String((res as any)?.error ?? 'Falha ao carregar horários')
                );
            }

            const normalized = (res?.slots ?? []).map(normTime).filter(Boolean);

            const uniq = Array.from(new Set(normalized)).sort(
                (a, b) => timeToMinutes(a) - timeToMinutes(b)
            );

            setSlots(uniq);
        } catch (err: any) {
            console.log(
                '[booking/time] error:',
                err?.data ?? err?.message ?? err
            );
            setSlots([]);
            Alert.alert(
                'Erro',
                'Não foi possível carregar os horários. Tente novamente.'
            );
        } finally {
            setLoading(false);
            didSlotsFetchRef.current = true;
            syncGateReady();
        }
    }, [
        appointmentId,
        isEdit,
        professionalId,
        router,
        selectedDateISO,
        serviceDurationMinutes,
        serviceId,
        syncGateReady,
        unitId,
    ]);

    useEffect(() => {
        fetchSlots();
    }, [fetchSlots]);

    const sameDayAsCurrent = useMemo(() => {
        if (!isEdit || !currentDateISO || !selectedDateISO) return false;
        return isoDayKeyUTC(currentDateISO) === isoDayKeyUTC(selectedDateISO);
    }, [currentDateISO, isEdit, selectedDateISO]);

    const displaySlots = useMemo(() => {
        const base = slots.slice();
        let mergedBase = base;

        if (isEdit) {
            const t = normTime(currentStartTime);
            if (t && sameDayAsCurrent) {
                mergedBase = mergedBase.includes(t)
                    ? mergedBase
                    : [t, ...mergedBase];
            }
        }

        const uniq = Array.from(new Set(mergedBase)).sort(
            (a, b) => timeToMinutes(a) - timeToMinutes(b)
        );

        if (!isTodaySelected) return uniq;

        const nowMins = nowMinutesLocal();
        const cur = normTime(currentStartTime);
        const keepCurrent =
            !!isEdit && !!sameDayAsCurrent && !!cur && uniq.includes(cur);

        return uniq.filter((t) => {
            const mins = timeToMinutes(t);
            if (!Number.isFinite(mins)) return false;
            if (keepCurrent && t === cur) return true;
            return mins > nowMins;
        });
    }, [currentStartTime, isEdit, isTodaySelected, sameDayAsCurrent, slots]);

    const onPickTime = useCallback(
        (startTime: string) => {
            router.push({
                pathname: '/booking/details',
                params: {
                    unitId,
                    unitName,
                    serviceId,
                    serviceName,
                    professionalId,
                    professionalName,
                    barberId: professionalId,
                    barberName: professionalName,
                    dateISO: selectedDateISO,
                    startTime: normTime(startTime),
                    serviceDurationMinutes: serviceDurationMinutes || '15',
                    bookingWindowDays: String(bookingWindowDays),

                    ...(isEdit ? { mode: 'edit', appointmentId } : {}),
                    ...(isEdit
                        ? {
                              currentDateISO: currentDateISO || '',
                              currentStartTime:
                                  normTime(currentStartTime) || '',
                          }
                        : {}),

                    ...(isPlanFlow
                        ? {
                              planMode: 'credit',
                              clientPlanId,
                              suggestedServiceId,
                              suggestedBalanceId,
                              planType,
                              selectedPlanBalanceId,
                              selectedPlanCreditsRemaining,
                          }
                        : {}),
                },
            });
        },
        [
            appointmentId,
            bookingWindowDays,
            clientPlanId,
            currentDateISO,
            currentStartTime,
            isEdit,
            isPlanFlow,
            planType,
            professionalId,
            professionalName,
            router,
            selectedDateISO,
            selectedPlanBalanceId,
            selectedPlanCreditsRemaining,
            serviceDurationMinutes,
            serviceId,
            serviceName,
            suggestedBalanceId,
            suggestedServiceId,
            unitId,
            unitName,
        ]
    );

    const keyDay = useCallback((item: DayItem) => item.key, []);
    const renderDay = useCallback(
        ({ item }: ListRenderItemInfo<DayItem>) => (
            <DayChip
                item={item}
                active={item.key === selectedDayKey}
                onPress={() => setSelectedDayKey(item.key)}
            />
        ),
        [selectedDayKey]
    );

    const keySlot = useCallback((t: string, idx: number) => `${t}-${idx}`, []);
    const renderSlot = useCallback(
        ({ item, index }: ListRenderItemInfo<string>) => {
            const t = normTime(item);
            const cur = normTime(currentStartTime);

            const isCurrent =
                !!isEdit && !!sameDayAsCurrent && !!cur && t === cur;

            return (
                <SlotRow
                    time={t}
                    onPress={() => onPickTime(t)}
                    showDivider={index < displaySlots.length - 1}
                    isCurrent={isCurrent}
                />
            );
        },
        [
            currentStartTime,
            displaySlots.length,
            isEdit,
            onPickTime,
            sameDayAsCurrent,
        ]
    );

    return (
        <ScreenGate dataReady={dataReady} skeleton={<BookingTimeSkeleton />}>
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
                            <Text style={S.heroTitle}>Escolha o horário</Text>

                            <Text style={S.heroDesc}>
                                {unitName ? `Unidade: ${unitName}` : ' '}
                                {serviceName ? `\nServiço: ${serviceName}` : ''}
                                {professionalName
                                    ? `\nProfissional: ${professionalName}`
                                    : ''}
                                {isPlanFlow
                                    ? `\nAgendamento com créditos ${
                                          isSubscription
                                              ? 'da assinatura'
                                              : 'do plano'
                                      }${
                                          selectedPlanCreditsRemaining
                                              ? `\nCréditos restantes deste serviço: ${selectedPlanCreditsRemaining}`
                                              : ''
                                      }`
                                    : ''}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={S.whiteArea}>
                    <View style={S.whiteContent}>
                        <Text style={S.sectionTitle}>Dia</Text>

                        <FlatList
                            data={days}
                            keyExtractor={keyDay}
                            renderItem={renderDay}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 12 }}
                            style={{ flexGrow: 0 }}
                        />

                        <Text style={[S.sectionTitle, { marginTop: 14 }]}>
                            Horários
                        </Text>

                        {loading ? (
                            <View style={S.centerBox}>
                                <ActivityIndicator />
                                <Text style={S.centerText}>Carregando…</Text>
                            </View>
                        ) : displaySlots.length === 0 ? (
                            <View style={S.emptyInline}>
                                <Text style={S.emptyTitle}>
                                    Esse profissional não está disponível
                                </Text>
                                <Text style={S.centerText}>
                                    Escolha outro profissional ou troque o dia
                                    para ser atendido por esse profissional.
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={displaySlots}
                                keyExtractor={keySlot}
                                renderItem={renderSlot}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={S.slotsContainer}
                                style={{ flexGrow: 0 }}
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

    fixedTop: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 999 },

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
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: UI.brand.primary,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
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

    dayChip: {
        height: 44,
        borderRadius: 999,
        paddingHorizontal: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.06)',
        marginRight: 10,
    },
    dayChipActive: {
        backgroundColor: UI.colors.historyIconBg,
        borderWidth: 1,
        borderColor: UI.colors.historyIconBg,
    },
    dayChipText: {
        color: UI.brand.primaryText,
        fontWeight: '700',
        fontSize: 12,
    },
    dayChipTextActive: { color: UI.colors.historyIconColor },

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

    emptyInline: {
        paddingTop: 16,
        alignItems: 'center',
        gap: 10,
    },

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

    rowTitleLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    rowTitle: { fontWeight: '700', color: UI.brand.primaryText, fontSize: 14 },
    rowMeta: { marginTop: 3, fontSize: 12, color: 'rgba(0,0,0,0.55)' },

    badgeAtual: {
        paddingHorizontal: 10,
        height: 22,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(124,108,255,0.18)',
        borderWidth: 1,
        borderColor: 'rgba(124,108,255,0.35)',
    },
    badgeAtualText: {
        fontSize: 11,
        fontWeight: '900',
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

    slotsContainer: {
        paddingBottom: 18,
    },
});
