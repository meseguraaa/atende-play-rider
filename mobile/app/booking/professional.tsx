// app/booking/professional.tsx
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
    Image,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI } from '../../src/theme/client-theme';
import { api } from '../../src/services/api';

import { ScreenGate } from '../../src/components/layout/ScreenGate';
import { BookingServiceSkeleton } from '../../src/components/loading/BookingServiceSkeleton';

const STICKY_ROW_H = 74;

type Professional = {
    id: string;
    name: string;
    imageUrl?: string | null;
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

        barberId: string | null; // legado (profissional)
        barberName: string | null;

        dateISO: string;
        startTime: string;

        canReschedule?: boolean;
    };
};

// ✅ mesmo padrão da Home: corrige urls vindas da API (inclui localhost)
function normalizeApiImageUrl(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    const isHttp = lower.startsWith('http://') || lower.startsWith('https://');

    const getRealHostOrigin = () => {
        try {
            const full = (api as any)?.getUri
                ? (api as any).getUri({ url: '/api/health' })
                : null;

            if (typeof full === 'string' && full.includes('://')) {
                const u = new URL(full);
                return `${u.protocol}//${u.host}`;
            }
        } catch {}

        return null as string | null;
    };

    // data uri (base64)
    if (lower.startsWith('data:image/')) return s;

    if (isHttp) {
        try {
            const u = new URL(s);
            const host = u.hostname;

            if (host === 'localhost' || host === '127.0.0.1') {
                const real = getRealHostOrigin();
                if (!real) return s;
                return `${real}${u.pathname}${u.search}`;
            }

            return s;
        } catch {
            return s;
        }
    }

    const baseFromApi =
        (api as any)?.defaults?.baseURL ||
        (api as any)?.defaults?.baseUrl ||
        '';

    const base = String(baseFromApi ?? '').trim();
    const path = s.startsWith('/') ? s : `/${s}`;

    if (!base) return path;

    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}${path}`;
}

const ProfessionalRow = memo(function ProfessionalRow({
    item,
    onPress,
    showDivider,
    isCurrent,
}: {
    item: Professional;
    onPress: () => void;
    showDivider: boolean;
    isCurrent: boolean;
}) {
    const [imgOk, setImgOk] = useState(true);

    useEffect(() => {
        setImgOk(true);
    }, [item.imageUrl]);

    return (
        <Pressable onPress={onPress} style={S.row}>
            <View style={S.rowLeft}>
                <View style={S.avatar}>
                    {item.imageUrl && imgOk ? (
                        <Image
                            source={{ uri: item.imageUrl }}
                            style={S.avatarImg}
                            fadeDuration={0}
                            onError={() => setImgOk(false)}
                        />
                    ) : (
                        <FontAwesome
                            name="user"
                            size={40}
                            color={UI.colors.historyIconColor}
                        />
                    )}
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
                        Toque para escolher o profissional
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

export default function BookingProfessional() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const params = useLocalSearchParams<{
        unitId?: string;
        unitName?: string;

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
    const [professionals, setProfessionals] = useState<Professional[]>([]);

    const [currentProfessionalId, setCurrentProfessionalId] =
        useState<string>('');
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

            // legado -> profissional atual
            setCurrentProfessionalId(
                String(res.appointment.barberId ?? '').trim()
            );
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

    const fetchProfessionals = useCallback(async () => {
        if (!unitId) {
            Alert.alert(
                'Ops',
                'Unidade não informada. Volte e tente novamente.'
            );
            router.back();
            return;
        }

        try {
            setLoading(true);

            const res = await api.get<{
                ok: boolean;
                professionals: Professional[];
            }>(`/api/mobile/professional?unitId=${encodeURIComponent(unitId)}`);

            const list = (res?.professionals ?? [])
                .map((p) => ({
                    ...p,
                    imageUrl: normalizeApiImageUrl(p?.imageUrl) || null,
                }))
                .slice()
                .sort((a, b) =>
                    String(a?.name ?? '').localeCompare(String(b?.name ?? ''))
                );

            setProfessionals(list);

            // ✅ bypass: se tiver só 1
            if (list.length === 1) {
                router.replace({
                    pathname: '/booking/category',
                    params: {
                        unitId,
                        unitName,
                        professionalId: list[0].id,
                        professionalName: list[0].name,
                        ...(isEdit ? { mode: 'edit', appointmentId } : {}),
                        ...(isPlanFlow
                            ? {
                                  planMode: 'credit',
                                  clientPlanId,
                                  suggestedServiceId,
                                  suggestedBalanceId,
                              }
                            : {}),
                    },
                });
                return;
            }

            // ✅ bypass: edit com profissional atual (se existir na lista)
            if (isEdit && currentProfessionalId) {
                const cur = list.find((p) => p.id === currentProfessionalId);
                if (cur) {
                    router.replace({
                        pathname: '/booking/category',
                        params: {
                            unitId,
                            unitName,
                            professionalId: cur.id,
                            professionalName: cur.name,
                            mode: 'edit',
                            appointmentId,
                            ...(isPlanFlow
                                ? {
                                      planMode: 'credit',
                                      clientPlanId,
                                      suggestedServiceId,
                                      suggestedBalanceId,
                                  }
                                : {}),
                        },
                    });
                    return;
                }
            }
        } catch (err: any) {
            console.log(
                '[booking/professional] error:',
                err?.data ?? err?.message ?? err
            );
            Alert.alert('Erro', 'Não foi possível carregar os profissionais.');
            setProfessionals([]);
        } finally {
            setLoading(false);
            didListRef.current = true;
            recomputeReady();
        }
    }, [
        appointmentId,
        clientPlanId,
        currentProfessionalId,
        isEdit,
        isPlanFlow,
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
            await fetchProfessionals();
        })();

        return () => {
            alive = false;
        };
    }, [fetchCurrentAppointmentIfNeeded, fetchProfessionals, isEdit]);

    const goCategory = useCallback(
        (p: Professional) => {
            router.push({
                pathname: '/booking/category',
                params: {
                    unitId,
                    unitName,
                    professionalId: p.id,
                    professionalName: p.name,
                    planMode,
                    clientPlanId,
                    suggestedServiceId,
                    suggestedBalanceId,
                    planType,
                    ...(isEdit ? { mode: 'edit', appointmentId } : {}),
                    ...(isPlanFlow
                        ? {
                              planMode: 'credit',
                              clientPlanId,
                              suggestedServiceId,
                              suggestedBalanceId,
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
            router,
            suggestedBalanceId,
            suggestedServiceId,
            unitId,
            unitName,
        ]
    );

    const key = useCallback((item: Professional) => item.id, []);
    const render = useCallback(
        ({ item, index }: ListRenderItemInfo<Professional>) => (
            <ProfessionalRow
                item={item}
                isCurrent={
                    !!currentProfessionalId && item.id === currentProfessionalId
                }
                onPress={() => goCategory(item)}
                showDivider={index < professionals.length - 1}
            />
        ),
        [currentProfessionalId, goCategory, professionals.length]
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
                            <Text style={S.heroTitle}>
                                Escolha o profissional
                            </Text>
                            <Text style={S.heroDesc}>
                                {unitName ? `Unidade: ${unitName}` : ' '}
                                {isPlanFlow
                                    ? '\nAgendamento com créditos do plano.'
                                    : ''}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={S.whiteArea}>
                    <View style={S.whiteContent}>
                        {loading ? (
                            <View style={S.centerBox}>
                                <ActivityIndicator />
                                <Text style={S.centerText}>Carregando…</Text>
                            </View>
                        ) : professionals.length === 0 ? (
                            <View style={S.centerBox}>
                                <Text style={S.emptyTitle}>
                                    Nenhum profissional disponível
                                </Text>
                                <Text style={S.centerText}>
                                    Não encontramos profissionais ativos para
                                    essa unidade.
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={professionals}
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

    row: {
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
    },
    rowLeft: { flexDirection: 'row', gap: 12, flex: 1, alignItems: 'center' },

    avatar: {
        width: 75,
        height: 75,
        borderRadius: 12,
        backgroundColor: UI.colors.historyIconBg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    avatarImg: { width: 75, height: 75, borderRadius: 12 },

    rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowTitle: { fontWeight: '700', color: UI.brand.primaryText, fontSize: 14 },
    rowMeta: { marginTop: 3, fontSize: 12, color: UI.colors.textMuted },

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
        backgroundColor: UI.colors.divider,
    },
});
