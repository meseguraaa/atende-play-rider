import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    Pressable,
    StyleSheet,
    TextInput,
    ActivityIndicator,
    Alert,
    Platform,
    KeyboardAvoidingView,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { KeyboardAwareSectionList } from 'react-native-keyboard-aware-scroll-view';

import { UI } from '../../src/theme/client-theme';
import { api } from '../../src/services/api';
import { trackEvent } from '../../src/services/analytics'; // ✅ analytics global

import { ScreenGate } from '../../src/components/layout/ScreenGate';
import { HistorySkeleton } from '../../src/components/loading/HistorySkeleton';

const STICKY_ROW_H = 74;

type PendingReviewResponse = {
    ok: boolean;
    pendings: Array<{
        appointmentId: string;
        scheduleAt: string; // ISO
        barberName: string;
        serviceName: string;
    }>;
    tags: { id: string; label: string }[];
    error?: string;
};

type PendingOne = null | {
    appointmentId: string;
    scheduleAt: string;
    barberName: string;
    serviceName: string;
};

type RowItem =
    | { id: 'appt'; type: 'APPT' }
    | { id: 'stars'; type: 'STARS' }
    | { id: 'tags'; type: 'TAGS' }
    | { id: 'comment'; type: 'COMMENT' }
    | { id: 'actions'; type: 'ACTIONS' };

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

const CardRow = memo(function CardRow({
    icon,
    title,
    desc,
    date,
}: {
    icon: string;
    title: string;
    desc: string;
    date: string;
}) {
    return (
        <View style={S.historyItem}>
            <View style={S.historyLeft}>
                <View style={S.historyIcon}>
                    <FontAwesome
                        name={icon as any}
                        size={18}
                        color={UI.brand.primary}
                    />
                </View>

                <View style={{ flex: 1 }}>
                    <Text style={S.historyTitle} numberOfLines={1}>
                        {title}
                    </Text>
                    <Text style={S.historyDesc} numberOfLines={2}>
                        {desc}
                    </Text>
                    <Text style={S.historyDate} numberOfLines={1}>
                        {date}
                    </Text>
                </View>
            </View>
        </View>
    );
});

export default function ClientReview() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ appointmentId?: string }>();
    const pathname = usePathname();

    const appointmentIdParam = useMemo(() => {
        const v = params?.appointmentId;
        return v ? String(v) : '';
    }, [params?.appointmentId]);

    const [pending, setPending] = useState<PendingOne>(null);
    const [tags, setTags] = useState<{ id: string; label: string }[]>([]);
    const [loading, setLoading] = useState(true);

    const [rating, setRating] = useState(0);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchingRef = useRef(false);

    // gate
    const didRef = useRef(false);
    const [dataReady, setDataReady] = useState(false);

    const recomputeReady = useCallback(() => {
        if (didRef.current) setDataReady(true);
    }, []);

    // ✅ page_viewed (dedupe simples por foco)
    const lastViewedKeyRef = useRef<string>('');

    const trackPageViewed = useCallback(() => {
        const page = normalizePage(pathname || '/');
        const key = `${page}|${appointmentIdParam || ''}`;

        if (lastViewedKeyRef.current === key) return;
        lastViewedKeyRef.current = key;

        try {
            trackEvent('page_viewed', {
                page,
                platform: 'mobile',
                appointmentId: appointmentIdParam
                    ? appointmentIdParam
                    : undefined,
            });
        } catch {}
    }, [appointmentIdParam, pathname]);

    const fetchPending = useCallback(async () => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        try {
            setLoading(true);

            const res = await api.get<PendingReviewResponse>(
                '/api/mobile/reviews/pending'
            );

            if (!res?.ok) {
                setPending(null);
                setTags([]);
                return;
            }

            const list = Array.isArray(res?.pendings) ? res.pendings : [];

            const found = appointmentIdParam
                ? (list.find((p) => p.appointmentId === appointmentIdParam) ??
                  null)
                : (list[0] ?? null);

            setPending(found);
            setTags(Array.isArray(res.tags) ? res.tags : []);
        } catch {
            setPending(null);
            setTags([]);
        } finally {
            setLoading(false);
            fetchingRef.current = false;

            didRef.current = true;
            recomputeReady();
        }
    }, [appointmentIdParam, recomputeReady]);

    useFocusEffect(
        useCallback(() => {
            // ✅ dispara view da página ao entrar na tela
            trackPageViewed();

            // ✅ reseta dedupe ao sair, para contar uma nova visita real depois
            return () => {
                lastViewedKeyRef.current = '';
            };
        }, [trackPageViewed])
    );

    useFocusEffect(
        useCallback(() => {
            fetchPending();
        }, [fetchPending])
    );

    const safeTopStyle = useMemo(
        () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
        [insets.top]
    );

    const goBack = useCallback(() => router.back(), [router]);

    const whenLabel = useMemo(() => {
        if (!pending?.scheduleAt) return '—';
        return formatPtBRDateTime(pending.scheduleAt);
    }, [pending?.scheduleAt]);

    const isNegative = useMemo(() => rating > 0 && rating <= 2, [rating]);

    const toggleTag = useCallback((tagId: string) => {
        setSelectedTagIds((prev) => {
            const has = prev.includes(tagId);
            if (has) return prev.filter((id) => id !== tagId);
            if (prev.length >= 3) return prev;
            return [...prev, tagId];
        });
    }, []);

    const canSubmit = useMemo(
        () => !!pending?.appointmentId && rating >= 1 && !submitting,
        [pending?.appointmentId, rating, submitting]
    );

    const submit = useCallback(async () => {
        if (!pending?.appointmentId) return;

        if (rating < 1) {
            Alert.alert('Avaliação', 'Selecione uma nota de 1 a 5.');
            return;
        }

        try {
            setSubmitting(true);

            const res = await api.post<{ ok: boolean; error?: string }>(
                '/api/mobile/reviews',
                {
                    appointmentId: String(pending.appointmentId),
                    rating,
                    comment: comment.trim() ? comment.trim() : null,
                    tagIds: selectedTagIds,
                    isAnonymousForProfessional: false,
                }
            );

            if (!res?.ok) {
                Alert.alert(
                    'Não foi possível enviar',
                    res?.error || 'Tente novamente.'
                );
                return;
            }

            Alert.alert('Obrigado! ✂️', 'Sua avaliação foi enviada.');
            router.back();
        } catch {
            Alert.alert('Erro', 'Não foi possível enviar. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    }, [comment, pending?.appointmentId, rating, router, selectedTagIds]);

    const dismiss = useCallback(async () => {
        if (!pending?.appointmentId) {
            router.back();
            return;
        }

        try {
            setSubmitting(true);

            const res = await api.post<{ ok: boolean; error?: string }>(
                '/api/mobile/reviews/dismiss',
                { appointmentId: String(pending.appointmentId) }
            );

            if (!res?.ok) {
                Alert.alert(
                    'Não foi possível atualizar',
                    res?.error || 'Tente novamente.'
                );
                return;
            }

            router.back();
        } catch {
            Alert.alert('Erro', 'Não foi possível atualizar. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    }, [pending?.appointmentId, router]);

    const sections = useMemo(() => {
        const base: RowItem[] = [{ id: 'appt', type: 'APPT' }];

        if (!pending) {
            return [
                {
                    title: 'Avaliação',
                    subtitle: 'Nenhum atendimento pendente.',
                    data: base,
                },
            ];
        }

        return [
            {
                title: 'Avaliação do profissional',
                subtitle: 'Leva poucos segundos.',
                data: [
                    { id: 'appt', type: 'APPT' },
                    { id: 'stars', type: 'STARS' },
                    { id: 'tags', type: 'TAGS' },
                    { id: 'comment', type: 'COMMENT' },
                    { id: 'actions', type: 'ACTIONS' },
                ],
            },
        ] as Array<{ title: string; subtitle: string; data: RowItem[] }>;
    }, [pending]);

    const renderSectionHeader = useCallback(
        ({
            section,
        }: {
            section: { title: string; subtitle: string; data: RowItem[] };
        }) => (
            <View style={S.sectionHeader}>
                <Text style={S.sectionTitle}>{section.title}</Text>
                <Text style={S.sectionSubtitle}>{section.subtitle}</Text>
            </View>
        ),
        []
    );

    const renderItem = useCallback(
        ({
            item,
            index,
            section,
        }: {
            item: RowItem;
            index: number;
            section: { data: RowItem[] };
        }) => {
            const showDivider = index < section.data.length - 1;

            if (item.type === 'APPT') {
                if (!pending) {
                    return (
                        <View style={S.emptyBox}>
                            <FontAwesome
                                name="check-circle"
                                size={18}
                                color={UI.brand.primary}
                            />
                            <Text style={S.emptyText}>
                                Nada pendente por aqui.
                            </Text>
                        </View>
                    );
                }

                return (
                    <View>
                        <CardRow
                            icon="star"
                            title={pending.barberName || 'Profissional'}
                            desc={`${pending.serviceName || 'Atendimento'} • ${
                                isNegative && rating
                                    ? 'NEGATIVO (1–2)'
                                    : rating
                                      ? 'POSITIVO (3–5)'
                                      : 'Selecione uma nota'
                            }`}
                            date={whenLabel}
                        />
                        {showDivider ? <View style={S.historyDivider} /> : null}
                    </View>
                );
            }

            if (item.type === 'STARS') {
                return (
                    <View style={S.block}>
                        <Text style={S.blockTitle}>Sua nota</Text>

                        <View style={S.starsRow}>
                            {Array.from({ length: 5 }).map((_, i) => {
                                const v = i + 1;
                                const filled = v <= rating;
                                return (
                                    <Pressable
                                        key={v}
                                        onPress={() => setRating(v)}
                                        style={S.starBtn}
                                        hitSlop={10}
                                    >
                                        <FontAwesome
                                            name={filled ? 'star' : 'star-o'}
                                            size={28}
                                            color={
                                                filled
                                                    ? UI.brand.primary
                                                    : 'rgba(0,0,0,0.30)'
                                            }
                                        />
                                    </Pressable>
                                );
                            })}
                        </View>

                        <Text style={S.blockHint}>
                            {rating
                                ? isNegative
                                    ? 'Conta como negativo (1–2).'
                                    : 'Conta como positivo (3–5).'
                                : 'Toque nas estrelas para avaliar.'}
                        </Text>

                        {showDivider ? <View style={S.historyDivider} /> : null}
                    </View>
                );
            }

            if (item.type === 'TAGS') {
                return (
                    <View style={S.block}>
                        <View style={S.blockHeaderRow}>
                            <Text style={S.blockTitle}>O que mais marcou?</Text>
                            <Text style={S.counterText}>
                                {selectedTagIds.length}/3
                            </Text>
                        </View>

                        {tags.length === 0 ? (
                            <Text style={S.blockHint}>
                                Nenhuma tag ativa no momento (cadastro no
                                admin).
                            </Text>
                        ) : (
                            <View style={S.tagsWrap}>
                                {tags.map((t) => {
                                    const active = selectedTagIds.includes(
                                        t.id
                                    );
                                    return (
                                        <Pressable
                                            key={t.id}
                                            onPress={() => toggleTag(t.id)}
                                            style={[
                                                S.tagChip,
                                                active && S.tagChipActive,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    S.tagText,
                                                    active && S.tagTextActive,
                                                ]}
                                            >
                                                {t.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        )}

                        {showDivider ? <View style={S.historyDivider} /> : null}
                    </View>
                );
            }

            if (item.type === 'COMMENT') {
                return (
                    <View style={S.block}>
                        <Text style={S.blockTitle}>Comentário (opcional)</Text>

                        <TextInput
                            value={comment}
                            onChangeText={setComment}
                            placeholder="Se quiser, conte mais detalhes…"
                            placeholderTextColor={UI.colors.textMuted}
                            multiline
                            maxLength={1000}
                            style={S.input}
                        />

                        {showDivider ? <View style={S.historyDivider} /> : null}
                    </View>
                );
            }

            if (item.type === 'ACTIONS') {
                return (
                    <View style={S.block}>
                        <Pressable
                            style={[
                                S.primaryHomeBtn,
                                !canSubmit && S.primaryHomeBtnDisabled,
                            ]}
                            onPress={submit}
                            disabled={!canSubmit}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={S.primaryHomeBtnText}>
                                    Enviar avaliação
                                </Text>
                            )}
                        </Pressable>

                        <Pressable
                            style={[
                                S.secondaryHomeBtn,
                                submitting && S.secondaryHomeBtnDisabled,
                            ]}
                            onPress={dismiss}
                            disabled={submitting}
                        >
                            <Text style={S.secondaryHomeBtnText}>
                                Agora não
                            </Text>
                        </Pressable>

                        {showDivider ? <View style={S.historyDivider} /> : null}
                    </View>
                );
            }

            return null;
        },
        [
            canSubmit,
            dismiss,
            isNegative,
            pending,
            rating,
            selectedTagIds,
            submitting,
            submit,
            tags,
            toggleTag,
            whenLabel,
            comment,
        ]
    );

    const keyExtractor = useCallback((it: RowItem) => it.id, []);

    const listPadTop = useMemo(
        () => insets.top + STICKY_ROW_H + 10,
        [insets.top]
    );

    // ✅ Android: dá um "respiro" extra pra não ficar espremido entre teclado e nav bar
    const listPadBottom = useMemo(() => {
        const base = 28 + insets.bottom;
        return Platform.OS === 'android' ? base + 16 : base;
    }, [insets.bottom]);

    // ✅ Android: offset da área fixa do topo (safe top + header fixo)
    const androidKeyboardOffset = useMemo(() => {
        if (Platform.OS !== 'android') return 0;
        return insets.top + STICKY_ROW_H;
    }, [insets.top]);

    return (
        <ScreenGate dataReady={dataReady} skeleton={<HistorySkeleton />}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                enabled={Platform.OS === 'android'}
                behavior={Platform.OS === 'android' ? 'height' : undefined}
                keyboardVerticalOffset={androidKeyboardOffset}
            >
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

                            <View
                                style={S.centerTitleWrap}
                                pointerEvents="none"
                            >
                                <Text style={S.centerTitle}>Avaliação</Text>
                            </View>

                            <Pressable
                                style={S.refreshBtn}
                                onPress={fetchPending}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <FontAwesome
                                        name="refresh"
                                        size={18}
                                        color="#FFFFFF"
                                    />
                                )}
                            </Pressable>
                        </View>
                    </View>

                    <KeyboardAwareSectionList
                        sections={sections as any}
                        keyExtractor={keyExtractor as any}
                        renderItem={renderItem as any}
                        renderSectionHeader={renderSectionHeader as any}
                        stickySectionHeadersEnabled={false}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[
                            S.listContent,
                            {
                                paddingTop: listPadTop,
                                paddingBottom: listPadBottom,
                            },
                        ]}
                        style={S.list}
                        removeClippedSubviews={false}
                        initialNumToRender={10}
                        maxToRenderPerBatch={12}
                        windowSize={9}
                        keyboardDismissMode="on-drag"
                        keyboardShouldPersistTaps="handled"
                        enableOnAndroid
                        extraScrollHeight={Platform.OS === 'android' ? 24 : 16}
                        keyboardOpeningTime={0}
                        enableAutomaticScroll
                    />
                </View>
            </KeyboardAvoidingView>
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

    historyItem: {
        paddingVertical: 16,
        paddingHorizontal: UI.spacing.screenX,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: UI.colors.white,
    },

    historyLeft: {
        flexDirection: 'row',
        gap: 14,
        flex: 1,
        alignItems: 'center',
    },

    historyIcon: {
        width: 36,
        height: 36,
        backgroundColor: 'rgba(124,108,255,0.12)',
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },

    historyTitle: { fontWeight: '700', color: UI.brand.primaryText },
    historyDesc: { fontSize: 13, color: 'rgba(0,0,0,0.65)', marginTop: 2 },
    historyDate: { fontSize: 12, color: 'rgba(0,0,0,0.40)', marginTop: 2 },

    historyDivider: {
        position: 'absolute',
        left: UI.spacing.screenX,
        right: UI.spacing.screenX,
        bottom: 0,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.08)',
    },

    block: {
        backgroundColor: UI.colors.white,
        paddingHorizontal: UI.spacing.screenX,
        paddingVertical: 16,
    },

    blockHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

    blockTitle: {
        fontSize: 14,
        fontWeight: '500',
        color: UI.brand.primaryText,
    },
    counterText: { color: 'rgba(0,0,0,0.45)', fontWeight: '900' },
    blockHint: { marginTop: 8, color: 'rgba(0,0,0,0.55)', fontWeight: '500' },

    starsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
    starBtn: { paddingVertical: 4 },

    tagsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 12,
    },

    tagChip: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.16)',
        backgroundColor: UI.colors.white,
    },
    tagChipActive: {
        backgroundColor: UI.brand.primary,
        borderColor: UI.brand.primary,
    },
    tagText: { color: UI.brand.primaryText, fontWeight: '800' },
    tagTextActive: { color: UI.colors.white },

    input: {
        marginTop: 12,
        minHeight: 110,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.10)',
        backgroundColor: UI.colors.white,
        padding: 12,
        color: UI.brand.primaryText,
        textAlignVertical: 'top',
        fontWeight: '600',
    },

    primaryHomeBtn: {
        height: 44,
        borderRadius: 999,
        paddingHorizontal: 14,
        backgroundColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryHomeBtnDisabled: { opacity: 0.6 },
    primaryHomeBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },

    secondaryHomeBtn: {
        marginTop: 12,
        height: 40,
        borderRadius: 999,
        paddingHorizontal: 12,
        backgroundColor: UI.colors.white,
        borderWidth: 1,
        borderColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryHomeBtnDisabled: { opacity: 0.6 },
    secondaryHomeBtnText: {
        color: '#141414',
        fontSize: 13,
        fontWeight: '600',
    },

    emptyBox: {
        paddingHorizontal: UI.spacing.screenX,
        paddingVertical: 18,
        alignItems: 'center',
        gap: 10,
        backgroundColor: UI.colors.white,
    },
    emptyText: {
        color: 'rgba(0,0,0,0.55)',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
});
