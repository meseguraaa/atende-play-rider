// app/booking/unit.tsx
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
import { BookingUnitSkeleton } from '../../src/components/loading/BookingUnitSkeleton';

const STICKY_ROW_H = 74;

type Unit = { id: string; name: string };

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

const UnitRow = memo(function UnitRow({
    item,
    onPress,
    showDivider,
}: {
    item: Unit;
    onPress: () => void;
    showDivider: boolean;
}) {
    return (
        <Pressable onPress={onPress} style={S.row}>
            <View style={S.rowLeft}>
                <View style={S.rowIcon}>
                    <FontAwesome
                        name="map-marker"
                        size={18}
                        color={UI.colors.historyIconColor}
                    />
                </View>

                <View style={{ flex: 1 }}>
                    <Text style={S.rowTitle} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <Text style={S.rowMeta}>Selecione para continuar</Text>
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

export default function BookingUnit() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const params = useLocalSearchParams<{
        mode?: string;
        appointmentId?: string;
        planMode?: string;
        clientPlanId?: string;
        suggestedServiceId?: string;
        suggestedBalanceId?: string;
        planType?: string; // 👈 NOVO
    }>();

    const isEdit = useMemo(
        () => String(params.mode ?? '') === 'edit',
        [params]
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

    const isSubscription = planType === 'SUBSCRIPTION';

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
    const [units, setUnits] = useState<Unit[]>([]);
    const [currentUnitId, setCurrentUnitId] = useState<string | null>(null);

    const didBootRef = useRef(false);
    const [dataReady, setDataReady] = useState(false);

    const TOP_OFFSET = insets.top + STICKY_ROW_H;

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

    const goBack = useCallback(() => router.back(), [router]);

    const goProfessional = useCallback(
        (u: Unit, replace?: boolean) => {
            const nav = {
                pathname: '/booking/professional',
                params: {
                    unitId: u.id,
                    unitName: u.name,
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
            } as const;

            if (__DEV__) {
                console.log('[booking/unit] goProfessional:', {
                    unitId: u.id,
                    unitName: u.name,
                    isEdit,
                    appointmentId: isEdit ? appointmentId : undefined,
                    isPlanFlow,
                    clientPlanId: isPlanFlow ? clientPlanId : undefined,
                    suggestedServiceId: isPlanFlow
                        ? suggestedServiceId
                        : undefined,
                    suggestedBalanceId: isPlanFlow
                        ? suggestedBalanceId
                        : undefined,
                    planType: isPlanFlow ? planType : undefined,
                    replace: !!replace,
                });
            }

            if (replace) router.replace(nav);
            else router.push(nav);
        },
        [
            appointmentId,
            clientPlanId,
            isEdit,
            isPlanFlow,
            planType,
            router,
            suggestedBalanceId,
            suggestedServiceId,
        ]
    );

    const fetchCurrentAppointmentIfNeeded = useCallback(async () => {
        if (!isEdit) return;

        if (!appointmentId) {
            Alert.alert('Ops', 'appointmentId ausente no modo alterar.');
            router.back();
            return;
        }

        try {
            const res = await api.get<AppointmentGetResponse>(
                `/api/mobile/me/appointments/${encodeURIComponent(appointmentId)}`
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

            setCurrentUnitId(res.appointment.unitId ?? null);
        } catch (err: any) {
            const msg =
                err?.data?.error ||
                err?.message ||
                'Não foi possível carregar o agendamento para edição.';
            Alert.alert('Erro', String(msg));
            router.back();
        }
    }, [appointmentId, isEdit, router]);

    const fetchUnits = useCallback(async () => {
        try {
            setLoading(true);

            const res = await api.get<{
                ok: boolean;
                units: Unit[];
                count?: number;
            }>('/api/mobile/units');

            const list: Unit[] = Array.isArray(res?.units) ? res.units : [];
            setUnits(list);

            if (__DEV__) console.log('[booking/unit] units:', list.length);

            // ✅ bypass: 1 unidade -> PROFESSIONAL
            if (list.length === 1) {
                goProfessional(list[0], true);
                return;
            }

            // ✅ bypass: edit com unit atual -> PROFESSIONAL
            if (isEdit && currentUnitId) {
                const current = list.find((u) => u.id === currentUnitId);
                if (current) {
                    goProfessional(current, true);
                    return;
                }
            }
        } catch (err: any) {
            const msg =
                err?.data?.error ||
                err?.message ||
                'Não foi possível carregar as unidades. Tente novamente.';
            Alert.alert('Erro', String(msg));
            setUnits([]);
        } finally {
            setLoading(false);
        }
    }, [currentUnitId, goProfessional, isEdit]);

    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                await fetchCurrentAppointmentIfNeeded();
                if (!alive) return;

                await fetchUnits();
            } finally {
                didBootRef.current = true;
                if (alive) setDataReady(true);
            }
        })();

        return () => {
            alive = false;
        };
    }, [fetchCurrentAppointmentIfNeeded, fetchUnits]);

    const key = useCallback((item: Unit) => item.id, []);
    const render = useCallback(
        ({ item, index }: ListRenderItemInfo<Unit>) => (
            <UnitRow
                item={item}
                onPress={() => goProfessional(item)}
                showDivider={index < units.length - 1}
            />
        ),
        [goProfessional, units.length]
    );

    return (
        <ScreenGate dataReady={dataReady} skeleton={<BookingUnitSkeleton />}>
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
                            <Text style={S.heroTitle}>Escolha a unidade</Text>
                            <Text style={S.heroDesc}>
                                Se houver apenas uma, a gente pula
                                automaticamente.
                            </Text>

                            {isEdit ? (
                                <Text style={S.heroDesc}>
                                    {'\n'}Estamos abrindo a edição do seu
                                    agendamento.
                                </Text>
                            ) : isPlanFlow ? (
                                <Text style={S.heroDesc}>
                                    {'\n'}Você escolheu agendar usando créditos
                                    do seu plano.
                                </Text>
                            ) : null}
                        </View>
                    </View>
                </View>

                <View style={S.whiteArea}>
                    <View style={S.whiteContent}>
                        <Text style={S.sectionTitle}>Unidades</Text>

                        {loading ? (
                            <View style={S.centerBox}>
                                <ActivityIndicator />
                                <Text style={S.centerText}>Carregando…</Text>
                            </View>
                        ) : units.length === 0 ? (
                            <View style={S.centerBox}>
                                <Text style={S.emptyTitle}>
                                    Nenhuma unidade disponível
                                </Text>
                                <Text style={S.centerText}>
                                    Não encontramos unidades ativas.
                                </Text>

                                <Pressable
                                    style={S.secondaryBtn}
                                    onPress={fetchUnits}
                                >
                                    <Text style={S.secondaryBtnText}>
                                        Tentar novamente
                                    </Text>
                                </Pressable>
                            </View>
                        ) : (
                            <FlatList
                                data={units}
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

    rowIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: UI.colors.historyIconBg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowTitle: { fontWeight: '700', color: UI.brand.primaryText, fontSize: 14 },
    rowMeta: { marginTop: 3, fontSize: 12, color: 'rgba(0,0,0,0.55)' },

    divider: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.08)',
    },
});
