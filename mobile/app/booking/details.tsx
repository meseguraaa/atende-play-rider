// app/booking/details.tsx
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
    StyleSheet,
    Pressable,
    TextInput,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI } from '../../src/theme/client-theme';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/auth/auth-context';

import { ScreenGate } from '../../src/components/layout/ScreenGate';
import { BookingDetailsSkeleton } from '../../src/components/loading/BookingDetailsSkeleton';

const STICKY_ROW_H = 74;

function onlyDigits(v: string) {
    return String(v ?? '').replace(/\D/g, '');
}

function formatPhoneBR(digits: string) {
    const d = onlyDigits(digits).slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10)
        return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

function toMinutes(hhmm: string) {
    const [hh, mm] = String(hhmm ?? '')
        .trim()
        .split(':');
    const h = Number(hh);
    const m = Number(mm);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    return h * 60 + m;
}

function fromMinutes(total: number) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${pad2(h)}:${pad2(m)}`;
}

/**
 * dateISO (meio-dia) + startTime ("HH:mm") -> scheduleAt ISO em São Paulo
 * Usa UTC parts do dateISO pra não “virar dia”.
 */
function buildScheduleAtSaoPauloISO(dateISO: string, startTime: string) {
    const d = new Date(String(dateISO ?? '').trim());
    if (Number.isNaN(d.getTime())) return '';

    const yyyy = d.getUTCFullYear();
    const mm = pad2(d.getUTCMonth() + 1);
    const dd = pad2(d.getUTCDate());

    const raw = String(startTime ?? '').trim();
    const m = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return '';

    const hhNum = Number(m[1]);
    const miNum = Number(m[2]);

    if (
        !Number.isFinite(hhNum) ||
        !Number.isFinite(miNum) ||
        hhNum < 0 ||
        hhNum > 23 ||
        miNum < 0 ||
        miNum > 59
    ) {
        return '';
    }

    return `${yyyy}-${mm}-${dd}T${pad2(hhNum)}:${pad2(miNum)}:00-03:00`;
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
};

export default function BookingDetails() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();

    const params = useLocalSearchParams<{
        unitId?: string;
        unitName?: string;
        serviceId?: string;
        serviceName?: string;
        serviceDurationMinutes?: string;

        professionalId?: string;
        professionalName?: string;

        barberId?: string;
        barberName?: string;

        dateISO?: string;
        startTime?: string;

        mode?: string;
        appointmentId?: string;

        currentDateISO?: string;
        currentStartTime?: string;

        categoryId?: string;
        categoryName?: string;

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

    const barberIdCompat = professionalId;

    const isEdit = useMemo(
        () => String(params.mode ?? '').trim() === 'edit',
        [params.mode]
    );
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

    const selectedPlanBalanceId = useMemo(() => {
        return (
            String(params.selectedPlanBalanceId ?? '').trim() ||
            String(params.selectedPlanServiceId ?? '').trim() ||
            String(params.suggestedBalanceId ?? '').trim()
        );
    }, [
        params.selectedPlanBalanceId,
        params.selectedPlanServiceId,
        params.suggestedBalanceId,
    ]);

    const selectedPlanCreditsRemaining = useMemo(
        () => String(params.selectedPlanCreditsRemaining ?? '').trim(),
        [params.selectedPlanCreditsRemaining]
    );

    const isPlanFlow = useMemo(() => planMode === 'credit', [planMode]);
    const isSubscription = useMemo(
        () => planType === 'SUBSCRIPTION',
        [planType]
    );

    const pickedDateISO = useMemo(
        () => String(params.dateISO ?? '').trim(),
        [params.dateISO]
    );
    const pickedStartTime = useMemo(
        () => String(params.startTime ?? '').trim(),
        [params.startTime]
    );

    const [currentDateISO, setCurrentDateISO] = useState(
        String(params.currentDateISO ?? '').trim()
    );
    const [currentStartTime, setCurrentStartTime] = useState(
        String(params.currentStartTime ?? '').trim()
    );

    const [dataReady, setDataReady] = useState(false);
    const fetchingRef = useRef(false);

    const TOP_OFFSET = insets.top + STICKY_ROW_H;
    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );
    const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

    const [clientName, setClientName] = useState('');
    const [phone, setPhone] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!clientName && (user?.name || user?.email)) {
            setClientName(String(user?.name || user?.email || ''));
        }
        if (!phone && user?.phone) {
            setPhone(onlyDigits(String(user.phone)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.name, user?.email, user?.phone]);

    const goBack = useCallback(() => router.back(), [router]);

    const fetchCurrentIfNeeded = useCallback(async () => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        try {
            if (!isEdit) return;

            if (!appointmentId) {
                Alert.alert('Ops', 'appointmentId ausente no modo alterar.');
                router.back();
                return;
            }

            if (currentDateISO && currentStartTime) return;

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
            setCurrentStartTime(String(res.appointment.startTime ?? '').trim());
        } catch (err: any) {
            console.log(
                '[booking/details][edit] get appointment error:',
                err?.data ?? err?.message ?? err
            );
        } finally {
            setDataReady(true);
            fetchingRef.current = false;
        }
    }, [appointmentId, currentDateISO, currentStartTime, isEdit, router]);

    useEffect(() => {
        if (!isEdit) {
            setDataReady(true);
            return;
        }
        fetchCurrentIfNeeded();
    }, [fetchCurrentIfNeeded, isEdit]);

    const effectiveDateISO = useMemo(() => {
        if (!isEdit) return pickedDateISO;
        return pickedDateISO || currentDateISO;
    }, [currentDateISO, isEdit, pickedDateISO]);

    const effectiveStartTime = useMemo(() => {
        if (!isEdit) return pickedStartTime;
        return pickedStartTime || currentStartTime;
    }, [currentStartTime, isEdit, pickedStartTime]);

    const serviceDurationMin = useMemo(() => {
        const raw = Number(String(params.serviceDurationMinutes ?? '').trim());
        return Number.isFinite(raw) && raw > 0 ? raw : 30;
    }, [params.serviceDurationMinutes]);

    const endTime = useMemo(() => {
        const st = toMinutes(effectiveStartTime);
        if (!Number.isFinite(st)) return '';
        return fromMinutes(st + serviceDurationMin);
    }, [effectiveStartTime, serviceDurationMin]);

    const dateLabel = useMemo(() => {
        const d = new Date(String(effectiveDateISO ?? '').trim());
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('pt-BR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    }, [effectiveDateISO]);

    const scheduleAt = useMemo(
        () => buildScheduleAtSaoPauloISO(effectiveDateISO, effectiveStartTime),
        [effectiveDateISO, effectiveStartTime]
    );

    const confirm = useCallback(async () => {
        try {
            if (!unitId || !serviceId || !barberIdCompat) {
                Alert.alert(
                    'Ops',
                    'Seu agendamento está incompleto. Volte e tente novamente.'
                );
                return;
            }

            if (!effectiveDateISO || !effectiveStartTime || !scheduleAt) {
                Alert.alert(
                    'Ops',
                    isEdit
                        ? 'Não encontramos o horário atual para preservar. Volte e tente novamente.'
                        : 'Selecione um horário para continuar.'
                );
                return;
            }

            if (isEdit && !appointmentId) {
                Alert.alert('Ops', 'appointmentId ausente no modo alterar.');
                return;
            }

            const name = clientName.trim();
            const digits = onlyDigits(phone);

            if (!name) {
                Alert.alert('Faltou o nome', 'Digite seu nome para confirmar.');
                return;
            }

            if (!(digits.length === 10 || digits.length === 11)) {
                Alert.alert('Telefone inválido', 'Use DDD + número.');
                return;
            }

            if (isPlanFlow && (!clientPlanId || !selectedPlanBalanceId)) {
                Alert.alert(
                    'Ops',
                    'Os dados do plano não foram carregados corretamente. Volte e escolha o serviço novamente.'
                );
                return;
            }

            setSaving(true);

            if (isEdit) {
                const payload = {
                    unitId,
                    serviceId,
                    professionalId,
                    barberId: barberIdCompat,
                    dateISO: effectiveDateISO,
                    startTime: effectiveStartTime,
                    scheduleAt,
                };

                if (__DEV__) {
                    console.log(
                        `[booking/details] PATCH /api/mobile/me/appointments/${appointmentId}/edit payload:`,
                        payload
                    );
                }

                const res = await api.patch(
                    `/api/mobile/me/appointments/${encodeURIComponent(
                        appointmentId
                    )}/edit`,
                    payload
                );

                if (res?.ok === false) {
                    throw { status: 409, data: res };
                }

                Alert.alert(
                    'Alterado! ✅',
                    'Seu agendamento foi atualizado com sucesso.',
                    [
                        {
                            text: 'Ok',
                            onPress: () => router.replace('/(app)/(tabs)/home'),
                        },
                    ]
                );
                return;
            }

            const payload = {
                clientName: name,
                phone: digits,
                description: serviceName || 'Agendamento',
                unitId,
                serviceId,
                professionalId,
                barberId: barberIdCompat,
                scheduleAt,
                dateISO: effectiveDateISO,
                startTime: effectiveStartTime,
                ...(isPlanFlow
                    ? {
                          usePlan: true,
                          clientPlanId,
                          planServiceId: selectedPlanBalanceId,
                      }
                    : {}),
            };

            if (__DEV__) {
                console.log(
                    '[booking/details] POST /api/mobile/appointments payload:',
                    payload
                );
            }

            const res = await api.post(`/api/mobile/appointments`, payload);

            if (res?.ok === false) {
                throw { status: 400, data: res };
            }

            Alert.alert(
                'Agendado! ✅',
                'Seu horário foi reservado com sucesso.',
                [
                    {
                        text: 'Ok',
                        onPress: () => router.replace('/(app)/(tabs)/home'),
                    },
                ]
            );
        } catch (err: any) {
            console.log(
                '[booking/details] error:',
                err?.data ?? err?.message ?? err
            );

            const status = err?.status;
            const serverMsg =
                err?.data?.error ??
                err?.data?.message ??
                err?.data?.data?.error ??
                err?.data?.data?.message;

            if (
                isEdit &&
                (status === 409 ||
                    String(serverMsg || '')
                        .toLowerCase()
                        .includes('conflit') ||
                    String(serverMsg || '')
                        .toLowerCase()
                        .includes('indispon'))
            ) {
                Alert.alert(
                    'Horário indisponível',
                    'Esse horário acabou de ser ocupado. Escolha outro.'
                );
                return;
            }

            Alert.alert(
                'Erro',
                serverMsg ||
                    err?.message ||
                    (isEdit
                        ? 'Não foi possível alterar o agendamento.'
                        : 'Não foi possível confirmar o agendamento.')
            );
        } finally {
            setSaving(false);
        }
    }, [
        appointmentId,
        barberIdCompat,
        clientName,
        clientPlanId,
        effectiveDateISO,
        effectiveStartTime,
        isEdit,
        isPlanFlow,
        phone,
        professionalId,
        router,
        scheduleAt,
        selectedPlanBalanceId,
        serviceId,
        serviceName,
        unitId,
    ]);

    return (
        <ScreenGate dataReady={dataReady} skeleton={<BookingDetailsSkeleton />}>
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
                            <Text style={S.heroTitle}>Seus dados</Text>

                            <Text style={S.heroDesc}>
                                {unitName ? `Unidade: ${unitName}` : ' '}
                                {serviceName ? `\nServiço: ${serviceName}` : ''}
                                {professionalName
                                    ? `\nProfissional: ${professionalName}`
                                    : ''}
                                {dateLabel && effectiveStartTime
                                    ? `\nData: ${dateLabel} • ${effectiveStartTime}${
                                          endTime ? ` - ${endTime}` : ''
                                      }`
                                    : ''}
                                {isPlanFlow
                                    ? `\nPagamento: usando créditos ${
                                          isSubscription
                                              ? 'da assinatura'
                                              : 'do plano'
                                      }${
                                          selectedPlanCreditsRemaining
                                              ? `\nCréditos restantes: ${selectedPlanCreditsRemaining}`
                                              : ''
                                      }`
                                    : ''}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={S.whiteArea}>
                    <KeyboardAvoidingView
                        style={S.whiteContent}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <Text style={S.sectionTitle}>Nome</Text>
                        <View style={S.inputWrap}>
                            <TextInput
                                value={clientName}
                                onChangeText={setClientName}
                                placeholder="Seu nome"
                                placeholderTextColor="rgba(0,0,0,0.35)"
                                style={S.input}
                                autoCapitalize="words"
                                returnKeyType="next"
                            />
                        </View>

                        <Text style={[S.sectionTitle, { marginTop: 14 }]}>
                            Telefone
                        </Text>
                        <View style={S.inputWrap}>
                            <TextInput
                                value={formatPhoneBR(phone)}
                                onChangeText={(v) => setPhone(onlyDigits(v))}
                                placeholder="(11) 99999-9999"
                                placeholderTextColor="rgba(0,0,0,0.35)"
                                style={S.input}
                                keyboardType="phone-pad"
                                returnKeyType="done"
                            />
                        </View>

                        <Pressable
                            style={[
                                S.primaryBtn,
                                saving ? { opacity: 0.8 } : null,
                            ]}
                            onPress={confirm}
                            disabled={saving}
                        >
                            {saving ? (
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 10,
                                    }}
                                >
                                    <ActivityIndicator />
                                    <Text style={S.primaryBtnText}>
                                        {isEdit ? 'Alterando…' : 'Confirmando…'}
                                    </Text>
                                </View>
                            ) : (
                                <Text style={S.primaryBtnText}>
                                    {isEdit
                                        ? 'Confirmar alteração'
                                        : isPlanFlow
                                          ? isSubscription
                                              ? 'Confirmar com créditos da assinatura'
                                              : 'Confirmar com créditos do plano'
                                          : 'Confirmar agendamento'}
                                </Text>
                            )}
                        </Pressable>

                        <Pressable
                            style={S.secondaryBtn}
                            onPress={goBack}
                            disabled={saving}
                        >
                            <Text style={S.secondaryBtnText}>Voltar</Text>
                        </Pressable>
                    </KeyboardAvoidingView>
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
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
        color: UI.brand.primaryText,
    },

    inputWrap: {
        height: 52,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.05)',
        paddingHorizontal: 14,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
    },
    input: { fontSize: 15, fontWeight: '600', color: UI.brand.primaryText },

    primaryBtn: {
        marginTop: 18,
        height: 56,
        backgroundColor: UI.brand.primary,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: UI.colors.cardBorder,
    },
    primaryBtnText: { color: UI.colors.text, fontSize: 15, fontWeight: '700' },

    secondaryBtn: {
        marginTop: 10,
        height: 52,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
    },
    secondaryBtnText: { color: UI.brand.primaryText, fontWeight: '700' },
});
