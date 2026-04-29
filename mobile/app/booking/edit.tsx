import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
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

const STICKY_ROW_H = 74;

type Unit = { id: string; name: string };

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
    units: Unit[];
    rules: { canReschedule: boolean; reason: string | null };
};

const UnitRow = memo(function UnitRow({
    item,
    onPress,
    showDivider,
    selected,
}: {
    item: Unit;
    onPress: () => void;
    showDivider: boolean;
    selected: boolean;
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
                    <Text style={S.rowMeta}>
                        {selected
                            ? 'Unidade atual'
                            : 'Selecione para continuar'}
                    </Text>
                </View>
            </View>

            {selected ? (
                <FontAwesome name="check" size={16} color={UI.brand.primary} />
            ) : (
                <FontAwesome
                    name="chevron-right"
                    size={14}
                    color={UI.colors.black45}
                />
            )}

            {showDivider ? <View style={S.divider} /> : null}
        </Pressable>
    );
});

export default function BookingEdit() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const params = useLocalSearchParams<{
        appointmentId?: string;
        planMode?: string;
        clientPlanId?: string;
        suggestedServiceId?: string;
        suggestedBalanceId?: string;
        planType?: string;
    }>();

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

    const [loading, setLoading] = useState(true);
    const [units, setUnits] = useState<Unit[]>([]);
    const [currentUnitId, setCurrentUnitId] = useState<string | null>(null);
    const [currentUnitName, setCurrentUnitName] = useState<string | null>(null);

    const TOP_OFFSET = insets.top + STICKY_ROW_H;

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

    const goBack = useCallback(() => router.back(), [router]);

    const goService = useCallback(
        (u: Unit) => {
            router.push({
                pathname: '/booking/service',
                params: {
                    unitId: u.id,
                    unitName: u.name,
                    appointmentId,
                    mode: 'edit',
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
            isPlanFlow,
            planType,
            router,
            suggestedBalanceId,
            suggestedServiceId,
        ]
    );

    const fetchEdit = useCallback(async () => {
        if (!appointmentId) {
            Alert.alert('Ops', 'appointmentId ausente.');
            router.back();
            return;
        }

        try {
            setLoading(true);

            const resp = await api.get<EditPayload>(
                `/api/mobile/me/appointments/${appointmentId}/edit`
            );
            const res = (resp as any)?.data ?? resp;

            if (!res?.ok) {
                Alert.alert('Erro', 'Não foi possível preparar a edição.');
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

            const list: Unit[] = Array.isArray(res.units) ? res.units : [];
            setUnits(list);

            setCurrentUnitId(res.appointment?.unitId ?? null);
            setCurrentUnitName(res.appointment?.unitName ?? null);

            if (list.length === 1) {
                goService(list[0]);
                return;
            }

            if (__DEV__) console.log('[booking/edit] units:', list.length);
            if (__DEV__ && res.appointment?.unitId) {
                console.log(
                    '[booking/edit] currentUnit:',
                    res.appointment.unitId
                );
            }
        } catch (err: any) {
            const msg =
                err?.response?.data?.error ||
                err?.data?.error ||
                err?.message ||
                'Não foi possível carregar os dados de edição. Tente novamente.';

            console.log(
                '[booking/edit] error:',
                err?.response?.data ?? err?.data ?? err?.message ?? err
            );

            Alert.alert('Erro', msg);
            router.back();
        } finally {
            setLoading(false);
        }
    }, [appointmentId, goService, router]);

    useEffect(() => {
        void fetchEdit();
    }, [fetchEdit]);

    const key = useCallback((item: Unit) => item.id, []);

    const render = useCallback(
        ({ item, index }: ListRenderItemInfo<Unit>) => (
            <UnitRow
                item={item}
                selected={!!currentUnitId && item.id === currentUnitId}
                onPress={() => goService(item)}
                showDivider={index < units.length - 1}
            />
        ),
        [currentUnitId, goService, units.length]
    );

    return (
        <View style={S.page}>
            <View style={S.fixedTop}>
                <View style={safeTopStyle} />
                <View style={S.stickyRow}>
                    <Pressable onPress={goBack} style={S.backBtn}>
                        <FontAwesome
                            name="angle-left"
                            size={20}
                            color={UI.colors.white}
                        />
                    </Pressable>

                    <Text style={S.title}>Alterar agendamento</Text>
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
                            Unidade atual:{' '}
                            <Text style={{ fontWeight: '700' }}>
                                {currentUnitName || '—'}
                            </Text>
                            {isPlanFlow
                                ? `\nFluxo preservado: ${
                                      planType === 'SUBSCRIPTION'
                                          ? 'assinatura'
                                          : 'plano'
                                  }`
                                : ''}
                        </Text>
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
                                onPress={fetchEdit}
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
    );
}

const S = StyleSheet.create({
    page: { flex: 1, backgroundColor: UI.colors.bg },

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
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: UI.colors.cardBorder,
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
