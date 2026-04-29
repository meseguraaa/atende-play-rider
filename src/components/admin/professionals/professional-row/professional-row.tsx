// src/components/admin/professionals/professional-row/professional-row.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import {
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';

import { ProfessionalEditDialog } from '@/components/admin/professionals/professional-edit-dialog';
import { updateProfessional } from '@/lib/admin-professionals-api';

type UnitOption = {
    id: string;
    name: string;
    isActive: boolean;
};

const WEEKDAY_SHORT = [
    'Dom',
    'Seg',
    'Ter',
    'Qua',
    'Qui',
    'Sex',
    'Sáb',
] as const;

const WEEKDAY_FULL = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
] as const;

type WeeklyAvailabilityRow = {
    weekday: number;
    isActive: boolean;
    intervals: { startTime: string; endTime: string }[];
};

type DailyAvailabilityRow = {
    date: Date;
    type: 'DAY_OFF' | 'CUSTOM';
    intervals: { startTime: string; endTime: string }[];
};

type ProfessionalReviewStats = {
    avgRating: number;
    totalReviews: number;
    ratingsCount: { rating: number; count: number }[];
    topTags: { label: string; count: number }[];
};

export type ProfessionalRowUIData = {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    isActive?: boolean;

    imageUrl?: string | null;

    weeklyScheduleLabel?: string;
    exceptionsLabel?: string;

    selectedUnitIds?: string[];
    unitsSummaryLabel?: string;
    linkedUnits?: { id: string; name: string }[];

    createdAt?: Date;
    updatedAt?: Date;
    userId?: string | null;

    weeklyAvailabilities?: WeeklyAvailabilityRow[];
    dailyAvailabilities?: DailyAvailabilityRow[];
    reviewStats?: ProfessionalReviewStats | null;
};

type ProfessionalRowProps = {
    row: ProfessionalRowUIData;
    units: UnitOption[];
    defaultUnitId?: string | null;
    canSeeAllUnits?: boolean;
};

function initials(name: string) {
    return (name || '?')
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

function sortTimeIntervals(a: { startTime: string }, b: { startTime: string }) {
    return String(a.startTime ?? '').localeCompare(String(b.startTime ?? ''));
}

function normalizeWeekdayTo0_6(v: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return -1;

    if (n >= 0 && n <= 6) return n;
    if (n >= 1 && n <= 7) return n - 1;

    return -1;
}

function buildWeeklyMap(weekly: WeeklyAvailabilityRow[]) {
    const map = new Map<number, WeeklyAvailabilityRow>();

    for (const w of weekly ?? []) {
        const key = normalizeWeekdayTo0_6(w.weekday);
        if (key < 0) continue;
        map.set(key, w);
    }

    return map;
}

/**
 * SSR-safe
 */
function normalizeAdminImageUrl(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) return s;

    return s.startsWith('/') ? s : `/${s}`;
}

function DetailsContent({
    weeklyMap,
    review,
    avgRatingDisplay,
    linkedUnitsActive,
    daily,
}: {
    weeklyMap: Map<number, WeeklyAvailabilityRow>;
    review: ProfessionalReviewStats | null;
    avgRatingDisplay: string;
    linkedUnitsActive: { id: string; name: string }[];
    daily: DailyAvailabilityRow[];
}) {
    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-border-primary bg-background-secondary p-4 space-y-3">
                <div>
                    <h2 className="text-label-small text-content-primary">
                        Unidades vinculadas
                    </h2>
                    <p className="text-paragraph-small text-content-secondary">
                        Onde este profissional pode atuar (vínculos ativos).
                    </p>
                </div>

                {linkedUnitsActive.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border-primary bg-background-tertiary px-4 py-6 text-center text-paragraph-small text-content-secondary">
                        Nenhuma unidade vinculada ainda.
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {linkedUnitsActive.map((u) => (
                            <span
                                key={u.id}
                                className="rounded-full border border-border-primary bg-background-tertiary px-3 py-1 text-[11px] text-content-secondary"
                            >
                                {u.name}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-2xl border border-border-primary bg-background-secondary p-4 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                        <h2 className="text-label-small text-content-primary">
                            Reputação do profissional
                        </h2>
                        <p className="text-paragraph-small text-content-secondary">
                            Visão geral das avaliações feitas pelos clientes nos
                            atendimentos deste profissional.
                        </p>
                    </div>

                    {review && (
                        <div className="text-right">
                            <p className="text-paragraph-small text-content-secondary">
                                Nota média
                            </p>

                            <p className="text-title font-semibold text-content-primary">
                                {avgRatingDisplay}
                                <span className="ml-2 text-yellow-500 align-middle">
                                    {'★'.repeat(
                                        Math.max(
                                            0,
                                            Math.min(
                                                5,
                                                Math.round(review.avgRating)
                                            )
                                        )
                                    )}
                                </span>
                            </p>

                            <p className="text-paragraph-small text-content-secondary">
                                {review.totalReviews}{' '}
                                {review.totalReviews === 1
                                    ? 'avaliação'
                                    : 'avaliações'}
                            </p>
                        </div>
                    )}
                </div>

                {!review ? (
                    <div className="mt-2 rounded-xl border border-dashed border-border-primary bg-background-tertiary px-4 py-6 text-center text-paragraph-small text-content-secondary">
                        Ainda não há avaliações registradas para este
                        profissional.
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-[2fr,3fr]">
                        <div className="space-y-2">
                            <p className="text-label-small text-content-primary">
                                Distribuição de notas
                            </p>

                            <div className="space-y-1 text-[11px] text-content-secondary">
                                {review.ratingsCount.map((r) => (
                                    <div
                                        key={r.rating}
                                        className="flex items-center justify-between gap-2"
                                    >
                                        <span className="flex items-center gap-1">
                                            <span className="text-yellow-500">
                                                {r.rating}★
                                            </span>
                                        </span>

                                        <span className="text-content-primary font-medium">
                                            {r.count}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-label-small text-content-primary">
                                Principais motivos citados
                            </p>

                            {review.topTags.length === 0 ? (
                                <p className="text-[11px] text-content-secondary">
                                    Ainda não há tags suficientes para exibir
                                    aqui.
                                </p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {review.topTags.map((tag) => (
                                        <span
                                            key={tag.label}
                                            className="rounded-full border border-border-primary bg-background-tertiary px-3 py-1 text-[11px] text-content-secondary"
                                        >
                                            {tag.label}{' '}
                                            <span className="text-content-tertiary">
                                                · {tag.count}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="rounded-2xl border border-border-primary bg-background-secondary p-4 space-y-4">
                <div>
                    <h2 className="text-label-small text-zinc-100">
                        Disponibilidade
                    </h2>
                    <p className="text-paragraph-small text-zinc-400">
                        Visualização dos horários salvos pelo profissional.
                        Alterações devem ser feitas no painel dele.
                    </p>
                </div>

                <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                    {WEEKDAY_SHORT.map((short, index) => {
                        const full = WEEKDAY_FULL[index];

                        const data = weeklyMap.get(index) ?? {
                            weekday: index,
                            isActive: false,
                            intervals: [],
                        };

                        const isDayActive =
                            Boolean(data.isActive) &&
                            (data.intervals?.length ?? 0) > 0;

                        return (
                            <div
                                key={index}
                                className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-3 space-y-3"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-zinc-400">
                                            {short}
                                        </p>
                                        <p className="text-paragraph-small text-zinc-100 font-medium">
                                            {full}
                                        </p>
                                    </div>

                                    <span
                                        className={[
                                            'text-[11px] px-2 py-0.5 rounded-full border',
                                            isDayActive
                                                ? 'border-emerald-500/60 text-emerald-300'
                                                : 'border-zinc-700 text-zinc-300',
                                        ].join(' ')}
                                    >
                                        {isDayActive ? 'Sim' : 'Não'}
                                    </span>
                                </div>

                                <div className="space-y-1 text-[11px] text-zinc-100">
                                    {isDayActive ? (
                                        (data.intervals ?? [])
                                            .slice()
                                            .sort(sortTimeIntervals)
                                            .map((it, idx) => (
                                                <p key={idx}>
                                                    Das{' '}
                                                    <span className="font-medium">
                                                        {it.startTime}
                                                    </span>{' '}
                                                    até{' '}
                                                    <span className="font-medium">
                                                        {it.endTime}
                                                    </span>
                                                </p>
                                            ))
                                    ) : (
                                        <p className="text-zinc-400">
                                            Sem horário definido.
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <p className="text-[11px] text-zinc-400">
                    As exceções por dia (folgas, eventos, ajustes pontuais)
                    estão listadas abaixo.
                </p>
            </div>

            <div className="space-y-2">
                <h3 className="text-label-small text-content-primary">
                    Exceções por dia
                </h3>
                <p className="text-paragraph-small text-content-secondary">
                    Visualização de dias com horários diferentes do padrão
                    semanal.
                </p>

                {daily.length === 0 ? (
                    <div className="mt-2 rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 py-6 text-center text-paragraph-small text-content-secondary">
                        Este profissional ainda não possui nenhuma exceção
                        cadastrada.
                    </div>
                ) : (
                    <div className="mt-2 space-y-2">
                        {daily
                            .slice()
                            .sort(
                                (a, b) =>
                                    new Date(a.date).getTime() -
                                    new Date(b.date).getTime()
                            )
                            .map((ex, idx) => {
                                const dateObj =
                                    ex.date instanceof Date
                                        ? ex.date
                                        : new Date(ex.date);

                                return (
                                    <div
                                        key={idx}
                                        className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                                    >
                                        <div className="space-y-1">
                                            <p className="text-paragraph-small text-content-primary font-medium">
                                                {format(dateObj, 'dd/MM/yyyy', {
                                                    locale: ptBR,
                                                })}
                                            </p>

                                            <p className="text-[11px] text-content-secondary">
                                                {ex.type === 'DAY_OFF'
                                                    ? 'Dia de folga'
                                                    : 'Horário personalizado'}
                                            </p>
                                        </div>

                                        <div className="text-[11px] text-content-primary">
                                            {ex.type === 'DAY_OFF' ? (
                                                <p>
                                                    Sem atendimento neste dia.
                                                </p>
                                            ) : (ex.intervals ?? []).length ===
                                              0 ? (
                                                <p className="text-content-secondary">
                                                    Sem intervalos definidos.
                                                </p>
                                            ) : (
                                                (ex.intervals ?? []).map(
                                                    (it, intervalIdx) => (
                                                        <p key={intervalIdx}>
                                                            Das{' '}
                                                            <span className="font-medium">
                                                                {it.startTime}
                                                            </span>{' '}
                                                            até{' '}
                                                            <span className="font-medium">
                                                                {it.endTime}
                                                            </span>
                                                        </p>
                                                    )
                                                )
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * DESKTOP
 */
export function ProfessionalRow({
    row,
    units,
    defaultUnitId = null,
    canSeeAllUnits = true,
}: ProfessionalRowProps) {
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);

    const avatarToShow = useMemo(() => {
        if (!row.imageUrl) return null;
        return normalizeAdminImageUrl(row.imageUrl);
    }, [row.imageUrl]);

    const isActive = Boolean(row.isActive);
    const selectedUnitIds = row.selectedUnitIds ?? [];

    const unitsSummary = useMemo(() => {
        if (row.unitsSummaryLabel) return row.unitsSummaryLabel;

        const linkedUnits = row.linkedUnits ?? [];
        if (linkedUnits.length === 0) return 'Sem unidade';

        if (linkedUnits.length <= 2) {
            return linkedUnits.map((u) => u.name).join(' • ');
        }

        return `${linkedUnits.length} unidades`;
    }, [row.unitsSummaryLabel, row.linkedUnits]);

    const linkedUnitsActive = useMemo(() => {
        return (row.linkedUnits ?? [])
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }, [row.linkedUnits]);

    const weekly = row.weeklyAvailabilities ?? [];
    const daily = row.dailyAvailabilities ?? [];
    const review = row.reviewStats ?? null;

    const weeklyMap = useMemo(() => buildWeeklyMap(weekly), [weekly]);
    const avgRatingDisplay = review ? review.avgRating.toFixed(2) : '—';

    async function handleToggleActive() {
        if (isPending) return;
        setIsPending(true);

        const res = await updateProfessional(row.id, {
            isActive: !isActive,
        });

        setIsPending(false);

        if (!res.ok) {
            toast.error(res.error);
            return;
        }

        toast.success(
            isActive ? 'Profissional desativado.' : 'Profissional ativado.'
        );

        router.refresh();
    }

    return (
        <AccordionItem
            value={row.id}
            className="border border-border-primary rounded-xl bg-background-tertiary"
        >
            <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)_auto] items-center gap-6 px-4 py-3">
                <AccordionTrigger className="flex items-center gap-3 min-w-0 hover:no-underline px-0 py-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border-primary bg-background-secondary flex items-center justify-center">
                            {avatarToShow ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={avatarToShow}
                                    alt={row.name}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <span className="text-xs font-medium text-content-secondary">
                                    {initials(row.name)}
                                </span>
                            )}
                        </div>

                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <p className="text-paragraph-medium-size font-semibold text-content-primary truncate">
                                    {row.name}
                                </p>
                            </div>

                            <p className="text-xs text-content-secondary truncate">
                                {row.email || 'Sem e-mail'}{' '}
                                <span className="mx-1 text-content-tertiary">
                                    •
                                </span>{' '}
                                <span className="text-content-secondary">
                                    {unitsSummary}
                                </span>
                            </p>
                        </div>
                    </div>
                </AccordionTrigger>

                <div className="min-w-0 whitespace-nowrap text-xs text-content-primary truncate">
                    <span className="text-content-secondary mr-1">
                        Escala semanal:
                    </span>
                    {row.weeklyScheduleLabel ?? '—'}
                </div>

                <div className="min-w-0 whitespace-nowrap text-xs text-content-primary truncate">
                    <span className="text-content-secondary mr-1">
                        Exceções:
                    </span>
                    {row.exceptionsLabel ?? '—'}
                </div>

                <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                    <ProfessionalEditDialog
                        barber={{
                            id: row.id,
                            name: row.name,
                            email: row.email ?? '',
                            phone: row.phone ?? null,
                            isActive: isActive,
                            createdAt: row.createdAt ?? new Date(),
                            updatedAt: row.updatedAt ?? new Date(),
                            userId: row.userId ?? null,
                            imageUrl: row.imageUrl ?? null,
                        }}
                        units={units}
                        selectedUnitIds={selectedUnitIds}
                        defaultUnitId={defaultUnitId}
                        canSeeAllUnits={canSeeAllUnits}
                    />

                    <Button
                        type="button"
                        variant={isActive ? 'destructive' : 'active'}
                        size="sm"
                        className="border-border-primary hover:bg-muted/40"
                        disabled={isPending}
                        onClick={handleToggleActive}
                    >
                        {isPending
                            ? 'Salvando...'
                            : isActive
                              ? 'Desativar'
                              : 'Ativar'}
                    </Button>
                </div>
            </div>

            <AccordionContent className="border-t border-border-primary px-4 py-4">
                <DetailsContent
                    weeklyMap={weeklyMap}
                    review={review}
                    avgRatingDisplay={avgRatingDisplay}
                    linkedUnitsActive={linkedUnitsActive}
                    daily={daily}
                />
            </AccordionContent>
        </AccordionItem>
    );
}

/**
 * MOBILE
 */
export function ProfessionalRowMobile({
    row,
    units,
    defaultUnitId = null,
    canSeeAllUnits = true,
}: ProfessionalRowProps) {
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);
    const [open, setOpen] = useState(false);

    const avatarToShow = useMemo(() => {
        if (!row.imageUrl) return null;
        return normalizeAdminImageUrl(row.imageUrl);
    }, [row.imageUrl]);

    const isActive = Boolean(row.isActive);
    const selectedUnitIds = row.selectedUnitIds ?? [];

    const unitsSummary = useMemo(() => {
        if (row.unitsSummaryLabel) return row.unitsSummaryLabel;

        const linkedUnits = row.linkedUnits ?? [];
        if (linkedUnits.length === 0) return 'Sem unidade';

        if (linkedUnits.length <= 2) {
            return linkedUnits.map((u) => u.name).join(' • ');
        }

        return `${linkedUnits.length} unidades`;
    }, [row.unitsSummaryLabel, row.linkedUnits]);

    const linkedUnitsActive = useMemo(() => {
        return (row.linkedUnits ?? [])
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }, [row.linkedUnits]);

    const weekly = row.weeklyAvailabilities ?? [];
    const daily = row.dailyAvailabilities ?? [];
    const review = row.reviewStats ?? null;

    const weeklyMap = useMemo(() => buildWeeklyMap(weekly), [weekly]);
    const avgRatingDisplay = review ? review.avgRating.toFixed(2) : '—';

    async function handleToggleActive() {
        if (isPending) return;
        setIsPending(true);

        const res = await updateProfessional(row.id, {
            isActive: !isActive,
        });

        setIsPending(false);

        if (!res.ok) {
            toast.error(res.error);
            return;
        }

        toast.success(
            isActive ? 'Profissional desativado.' : 'Profissional ativado.'
        );

        router.refresh();
    }

    return (
        <div className="rounded-xl border border-border-primary bg-background-tertiary overflow-hidden">
            <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border-primary bg-background-secondary flex items-center justify-center">
                            {avatarToShow ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={avatarToShow}
                                    alt={row.name}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <span className="text-xs font-medium text-content-secondary">
                                    {initials(row.name)}
                                </span>
                            )}
                        </div>

                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-paragraph-medium-size font-semibold text-content-primary truncate">
                                    {row.name}
                                </p>
                            </div>

                            <p className="text-xs text-content-secondary truncate">
                                {row.email || 'Sem e-mail'}
                            </p>

                            <p className="text-xs text-content-tertiary truncate">
                                {unitsSummary}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-2 text-xs">
                    <div>
                        <p className="text-content-tertiary">Escala semanal</p>
                        <p className="text-content-secondary">
                            {row.weeklyScheduleLabel ?? '—'}
                        </p>
                    </div>

                    <div>
                        <p className="text-content-tertiary">Exceções</p>
                        <p className="text-content-secondary">
                            {row.exceptionsLabel ?? '—'}
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-xs text-content-tertiary">Ações</p>

                    <div className="flex flex-wrap gap-2">
                        <ProfessionalEditDialog
                            barber={{
                                id: row.id,
                                name: row.name,
                                email: row.email ?? '',
                                phone: row.phone ?? null,
                                isActive: isActive,
                                createdAt: row.createdAt ?? new Date(),
                                updatedAt: row.updatedAt ?? new Date(),
                                userId: row.userId ?? null,
                                imageUrl: row.imageUrl ?? null,
                            }}
                            units={units}
                            selectedUnitIds={selectedUnitIds}
                            defaultUnitId={defaultUnitId}
                            canSeeAllUnits={canSeeAllUnits}
                        />

                        <Button
                            type="button"
                            variant={isActive ? 'destructive' : 'active'}
                            size="sm"
                            className="border-border-primary hover:bg-muted/40"
                            disabled={isPending}
                            onClick={handleToggleActive}
                        >
                            {isPending
                                ? 'Salvando...'
                                : isActive
                                  ? 'Desativar'
                                  : 'Ativar'}
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setOpen((v) => !v)}
                        >
                            {open ? 'Fechar detalhes' : 'Ver detalhes'}
                        </Button>
                    </div>
                </div>
            </div>

            {open ? (
                <div className="border-t border-border-primary px-4 py-4">
                    <DetailsContent
                        weeklyMap={weeklyMap}
                        review={review}
                        avgRatingDisplay={avgRatingDisplay}
                        linkedUnitsActive={linkedUnitsActive}
                        daily={daily}
                    />
                </div>
            ) : null}
        </div>
    );
}
