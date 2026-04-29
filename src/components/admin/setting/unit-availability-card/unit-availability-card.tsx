'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';

import { Calendar as UICalendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Calendar as CalendarIcon, ChevronDown, Clock } from 'lucide-react';
import { toast } from 'sonner';

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
    'Segunda',
    'Terça',
    'Quarta',
    'Quinta',
    'Sexta',
    'Sábado',
] as const;

export type WeeklyDayUI = {
    isActive: boolean;
    startTime: string;
    endTime: string;
};

type Props = {
    unitId: string;

    weekly: Record<number, WeeklyDayUI> | undefined;

    setWeeklyByUnitIdAction: React.Dispatch<
        React.SetStateAction<Record<string, Record<number, WeeklyDayUI>>>
    >;

    onSubmitWeeklyAction: (
        unitId: string,
        e: React.FormEvent<HTMLFormElement>
    ) => void;

    onCreateExceptionAction?: () => void;
};

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type UnitExceptionApi = {
    id: string;
    date: string;
    isClosed: boolean;
    intervals: Array<{
        id: string;
        startTime: string;
        endTime: string;
    }>;
};

type ExceptionMode = 'FULL_DAY' | 'INTERVALS';

type IntervalUI = {
    startTime: string;
    endTime: string;
};

const TIME_OPTIONS = (() => {
    const times: string[] = [];
    for (let hour = 0; hour <= 23; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
            times.push(
                `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
            );
        }
    }
    return times;
})();

function safeApiError(json: unknown): string {
    if (
        json &&
        typeof json === 'object' &&
        'ok' in json &&
        (json as any).ok === false &&
        typeof (json as any).error === 'string'
    ) {
        return String((json as any).error);
    }
    return 'internal_error';
}

function toExceptionMessage(code: string) {
    const map: Record<string, string> = {
        forbidden_owner_only: 'Somente o dono pode criar exceções.',
        unit_not_found: 'Não foi possível encontrar essa unidade.',
        unit_id_required: 'Unidade inválida.',
        exception_id_required: 'Exceção inválida.',
        invalid_json: 'Erro ao enviar dados. Tente novamente.',
        date_required: 'Informe uma data válida.',
        invalid_time_format: 'Informe horário no formato correto (HH:mm).',
        invalid_time_range: 'O horário final deve ser maior que o inicial.',
        intervals_overlap: 'Os intervalos não podem se sobrepor.',
        unauthorized: 'Você não tem permissão para realizar esta ação.',
        internal_error: 'Erro interno. Tente novamente.',
        exception_not_found: 'Exceção não encontrada.',
    };

    return map[code] ?? 'Algo deu errado. Tente novamente.';
}

function isValidHHmm(v: string) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v.trim());
}

function timeToMinutes(hhmm: string) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseISODateToDate(dateISO: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
    const [y, m, d] = dateISO.split('-').map(Number);
    if (!y || !m || !d) return null;
    const parsed = new Date(y, m - 1, d);
    return isValid(parsed) ? parsed : null;
}

function formatDateBR(iso: string) {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    try {
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        }).format(new Date(y, m - 1, d));
    } catch {
        return iso;
    }
}

function sortExceptionsDesc(list: UnitExceptionApi[]) {
    return [...list].sort((a, b) => {
        if (a.date === b.date) return 0;
        return a.date < b.date ? 1 : -1;
    });
}

function weekdayFromISODate(dateISO: string): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
    const [y, m, d] = dateISO.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    const wd = dt.getDay();
    return Number.isFinite(wd) ? wd : null;
}

function sortIntervalsAsc<T extends { startTime: string; endTime: string }>(
    list: T[]
) {
    return [...list].sort(
        (a, b) =>
            timeToMinutes(a.startTime) - timeToMinutes(b.startTime) ||
            timeToMinutes(a.endTime) - timeToMinutes(b.endTime)
    );
}

function hasOverlap(list: Array<{ startTime: string; endTime: string }>) {
    const sorted = sortIntervalsAsc(list);
    for (let i = 1; i < sorted.length; i++) {
        const prevEnd = timeToMinutes(sorted[i - 1].endTime);
        const currStart = timeToMinutes(sorted[i].startTime);
        if (currStart < prevEnd) return true;
    }
    return false;
}

export function UnitAvailabilityCard({
    unitId,
    weekly,
    setWeeklyByUnitIdAction,
    onSubmitWeeklyAction,
}: Props) {
    const days = React.useMemo(() => {
        const w = weekly || {};
        return Array.from({ length: 7 }).map((_, weekday) => {
            const d = w[weekday] || {
                isActive: false,
                startTime: '',
                endTime: '',
            };

            return {
                weekday,
                short: WEEKDAY_SHORT[weekday] ?? `Dia ${weekday}`,
                full: WEEKDAY_FULL[weekday] ?? `Dia ${weekday}`,
                isActive: d.isActive,
                startTime: d.startTime,
                endTime: d.endTime,
            };
        });
    }, [weekly]);

    const hasAnyWeeklyError = React.useMemo(() => {
        return days.some((d) => {
            if (!d.isActive) return false;
            const s = String(d.startTime || '').trim();
            const e = String(d.endTime || '').trim();
            if (!isValidHHmm(s) || !isValidHHmm(e)) return false;
            return timeToMinutes(s) >= timeToMinutes(e);
        });
    }, [days]);

    const [exceptions, setExceptions] = React.useState<UnitExceptionApi[]>([]);
    const [exceptionsLoading, setExceptionsLoading] = React.useState(true);
    const [exceptionsError, setExceptionsError] = React.useState<string | null>(
        null
    );

    const exceptionsAbortRef = React.useRef<AbortController | null>(null);

    const fetchExceptions = React.useCallback(async () => {
        setExceptionsLoading(true);
        setExceptionsError(null);

        if (exceptionsAbortRef.current) exceptionsAbortRef.current.abort();
        const controller = new AbortController();
        exceptionsAbortRef.current = controller;

        try {
            const res = await fetch(
                `/api/admin/settings/units/${unitId}/exceptions`,
                {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                }
            );

            let json: ApiResp<UnitExceptionApi[]> | null = null;
            try {
                json = (await res.json()) as ApiResp<UnitExceptionApi[]>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                const msg = toExceptionMessage(code);
                setExceptions([]);
                setExceptionsError(msg);
                return;
            }

            const data = Array.isArray(json.data) ? json.data : [];
            setExceptions(sortExceptionsDesc(data));
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
            setExceptions([]);
            setExceptionsError(
                'Não foi possível carregar as exceções. Verifique sua conexão.'
            );
        } finally {
            setExceptionsLoading(false);
        }
    }, [unitId]);

    React.useEffect(() => {
        fetchExceptions();
        return () => {
            if (exceptionsAbortRef.current) exceptionsAbortRef.current.abort();
        };
    }, [fetchExceptions]);

    const [deletingExceptionId, setDeletingExceptionId] = React.useState<
        string | null
    >(null);

    async function handleDeleteException(exceptionId: string) {
        if (!exceptionId) return;

        setDeletingExceptionId(exceptionId);
        try {
            const res = await fetch(
                `/api/admin/settings/units/${unitId}/exceptions/${exceptionId}`,
                {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                }
            );

            let json: ApiResp<unknown> | null = null;
            try {
                json = (await res.json()) as ApiResp<unknown>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                toast.error(toExceptionMessage(code));
                return;
            }

            toast.success('Exceção removida ✅');
            await fetchExceptions();
        } catch {
            toast.error(
                'Não foi possível remover a exceção. Verifique a conexão.'
            );
        } finally {
            setDeletingExceptionId(null);
        }
    }

    const [exceptionOpen, setExceptionOpen] = React.useState(false);
    const [exceptionSaving, setExceptionSaving] = React.useState(false);

    const [datePopoverOpen, setDatePopoverOpen] = React.useState(false);

    const [exceptionForm, setExceptionForm] = React.useState<{
        date: string;
        mode: ExceptionMode;
        intervals: IntervalUI[];
    }>({
        date: todayISO(),
        mode: 'INTERVALS',
        intervals: [{ startTime: '12:00', endTime: '14:00' }],
    });

    const selectedDate = React.useMemo(() => {
        return parseISODateToDate(exceptionForm.date) ?? new Date();
    }, [exceptionForm.date]);

    function resetExceptionForm() {
        setExceptionForm({
            date: todayISO(),
            mode: 'INTERVALS',
            intervals: [{ startTime: '12:00', endTime: '14:00' }],
        });
        setDatePopoverOpen(false);
    }

    function openExceptionModal() {
        resetExceptionForm();
        setExceptionOpen(true);
    }

    function closeExceptionModal() {
        if (exceptionSaving) return;
        setExceptionOpen(false);
        setDatePopoverOpen(false);
    }

    function addInterval() {
        setExceptionForm((p) => ({
            ...p,
            mode: 'INTERVALS',
            intervals: [
                ...p.intervals,
                { startTime: '12:00', endTime: '14:00' },
            ],
        }));
    }

    function removeInterval(idx: number) {
        setExceptionForm((p) => {
            const next = [...p.intervals];
            next.splice(idx, 1);
            return {
                ...p,
                intervals: next.length
                    ? next
                    : [{ startTime: '12:00', endTime: '14:00' }],
            };
        });
    }

    function updateInterval(idx: number, patch: Partial<IntervalUI>) {
        setExceptionForm((p) => {
            const next = [...p.intervals];
            next[idx] = { ...next[idx], ...patch };
            return { ...p, intervals: next };
        });
    }

    function resolveFullDayRange(
        dateISO: string
    ): { startTime: string; endTime: string } | null {
        const wd = weekdayFromISODate(dateISO);
        if (wd === null) return null;

        const day = weekly?.[wd];
        if (!day?.isActive) return null;

        const startTime = String(day.startTime || '').trim();
        const endTime = String(day.endTime || '').trim();

        if (!isValidHHmm(startTime) || !isValidHHmm(endTime)) return null;

        const sMin = timeToMinutes(startTime);
        const eMin = timeToMinutes(endTime);
        if (eMin <= sMin) return null;

        return { startTime, endTime };
    }

    async function handleCreateException(e: React.FormEvent) {
        e.preventDefault();

        const date = String(exceptionForm.date || '').trim();
        const mode = exceptionForm.mode;

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            toast.error('Informe uma data válida.');
            return;
        }

        let intervalsToSend: IntervalUI[] = [];

        if (mode === 'FULL_DAY') {
            const range = resolveFullDayRange(date);
            if (!range) {
                const wd = weekdayFromISODate(date);
                const dayName =
                    wd !== null ? (WEEKDAY_FULL[wd] ?? `Dia ${wd}`) : 'o dia';
                toast.error(
                    `Não dá pra bloquear o dia inteiro: ${dayName} não está com horário válido no padrão semanal.`
                );
                return;
            }

            intervalsToSend = [range];
        } else {
            const intervals = exceptionForm.intervals.map((it) => ({
                startTime: String(it.startTime || '').trim(),
                endTime: String(it.endTime || '').trim(),
            }));

            for (let i = 0; i < intervals.length; i++) {
                const it = intervals[i];

                if (!isValidHHmm(it.startTime) || !isValidHHmm(it.endTime)) {
                    toast.error(`Intervalo #${i + 1}: horários inválidos.`);
                    return;
                }

                const sMin = timeToMinutes(it.startTime);
                const eMin = timeToMinutes(it.endTime);
                if (eMin <= sMin) {
                    toast.error(
                        `Intervalo #${i + 1}: o horário final deve ser maior que o inicial.`
                    );
                    return;
                }
            }

            if (hasOverlap(intervals)) {
                toast.error('Os intervalos não podem se sobrepor.');
                return;
            }

            intervalsToSend = sortIntervalsAsc(intervals);
        }

        setExceptionSaving(true);
        try {
            const res = await fetch(
                `/api/admin/settings/units/${unitId}/exceptions`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date,
                        mode,
                        intervals: intervalsToSend,
                    }),
                }
            );

            let json: ApiResp<unknown> | null = null;
            try {
                json = (await res.json()) as ApiResp<unknown>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                toast.error(toExceptionMessage(code));
                return;
            }

            toast.success(
                mode === 'FULL_DAY'
                    ? 'Exceção criada (dia inteiro) ✅'
                    : 'Exceção criada ✅'
            );
            setExceptionOpen(false);
            await fetchExceptions();
        } catch {
            toast.error(
                'Não foi possível criar a exceção. Verifique a conexão.'
            );
        } finally {
            setExceptionSaving(false);
        }
    }

    return (
        <div className="rounded-2xl border border-border-primary bg-background-secondary p-4 space-y-4">
            <Dialog
                open={exceptionOpen}
                onOpenChange={(v) =>
                    v ? setExceptionOpen(true) : closeExceptionModal()
                }
            >
                <DialogContent
                    variant="appointment"
                    overlayVariant="blurred"
                    showCloseButton
                    className="sm:max-w-180"
                >
                    <DialogHeader>
                        <DialogTitle size="modal">Criar exceção</DialogTitle>
                        <DialogDescription size="modal">
                            Bloqueie o dia inteiro (com base no padrão semanal)
                            ou crie pausas por intervalos.
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        onSubmit={handleCreateException}
                        className="space-y-4"
                    >
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Data
                                </label>

                                <Popover
                                    open={datePopoverOpen}
                                    onOpenChange={setDatePopoverOpen}
                                >
                                    <PopoverTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full justify-between text-left font-normal bg-transparent border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand"
                                            disabled={exceptionSaving}
                                        >
                                            <div className="flex items-center gap-2">
                                                <CalendarIcon className="h-4 w-4 text-content-brand" />
                                                {selectedDate ? (
                                                    format(
                                                        selectedDate,
                                                        'dd/MM/yyyy',
                                                        {
                                                            locale: ptBR,
                                                        }
                                                    )
                                                ) : (
                                                    <span>
                                                        Selecione uma data
                                                    </span>
                                                )}
                                            </div>
                                            <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>

                                    <PopoverContent className="w-auto p-0">
                                        <UICalendar
                                            mode="single"
                                            selected={selectedDate}
                                            onSelect={(d) => {
                                                if (!d) return;
                                                setExceptionForm((p) => ({
                                                    ...p,
                                                    date: format(
                                                        d,
                                                        'yyyy-MM-dd'
                                                    ),
                                                }));
                                                setDatePopoverOpen(false);
                                            }}
                                            autoFocus
                                            locale={ptBR}
                                        />
                                    </PopoverContent>
                                </Popover>

                                <p className="text-[11px] text-content-secondary/70">
                                    Selecione uma data para criar o bloqueio.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Tipo de bloqueio
                                </label>

                                <Select
                                    value={exceptionForm.mode}
                                    onValueChange={(v) =>
                                        setExceptionForm((p) => ({
                                            ...p,
                                            mode: v as ExceptionMode,
                                        }))
                                    }
                                    disabled={exceptionSaving}
                                >
                                    <SelectTrigger className="h-10 w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-content-brand" />
                                            <SelectValue placeholder="Selecione" />
                                        </div>
                                    </SelectTrigger>

                                    <SelectContent>
                                        <SelectItem value="FULL_DAY">
                                            Dia inteiro
                                        </SelectItem>
                                        <SelectItem value="INTERVALS">
                                            Intervalos
                                        </SelectItem>
                                    </SelectContent>
                                </Select>

                                <p className="text-[11px] text-content-secondary/70">
                                    {exceptionForm.mode === 'FULL_DAY'
                                        ? 'Vai bloquear o período de atendimento do dia, baseado no padrão semanal.'
                                        : 'Você pode adicionar vários intervalos de pausa/bloqueio.'}
                                </p>
                            </div>
                        </div>

                        {exceptionForm.mode === 'FULL_DAY' ? (
                            <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-2">
                                {(() => {
                                    const wd = weekdayFromISODate(
                                        exceptionForm.date
                                    );
                                    const name =
                                        wd !== null
                                            ? (WEEKDAY_FULL[wd] ?? `Dia ${wd}`)
                                            : '—';
                                    const range = resolveFullDayRange(
                                        exceptionForm.date
                                    );

                                    return (
                                        <>
                                            <p className="text-[11px] text-content-secondary">
                                                Dia selecionado:{' '}
                                                <span className="text-content-primary font-medium">
                                                    {name}
                                                </span>
                                            </p>

                                            {range ? (
                                                <p className="text-[11px] text-content-secondary">
                                                    Horário do padrão semanal:{' '}
                                                    <span className="text-content-primary">
                                                        {range.startTime} às{' '}
                                                        {range.endTime}
                                                    </span>
                                                </p>
                                            ) : (
                                                <p className="text-[11px] text-destructive">
                                                    Esse dia não tem horário
                                                    válido no padrão semanal (ou
                                                    está desativado).
                                                </p>
                                            )}

                                            <p className="text-[11px] text-content-secondary/70">
                                                Dica: ajuste o padrão semanal se
                                                quiser que “dia inteiro”
                                                funcione nesse dia.
                                            </p>
                                        </>
                                    );
                                })()}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-label-medium-size text-content-primary">
                                            Intervalos
                                        </p>
                                        <p className="text-[11px] text-content-secondary/70">
                                            Adicione pausas/bloqueios no dia
                                            selecionado.
                                        </p>
                                    </div>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={addInterval}
                                        disabled={exceptionSaving}
                                    >
                                        + Adicionar intervalo
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    {exceptionForm.intervals.map((it, idx) => (
                                        <div
                                            key={`${idx}-${it.startTime}-${it.endTime}`}
                                            className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-[11px] text-content-secondary">
                                                    Intervalo #{idx + 1}
                                                </p>

                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        removeInterval(idx)
                                                    }
                                                    disabled={
                                                        exceptionSaving ||
                                                        exceptionForm.intervals
                                                            .length <= 1
                                                    }
                                                >
                                                    Remover
                                                </Button>
                                            </div>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <div className="space-y-2">
                                                    <label className="text-label-medium-size text-content-primary">
                                                        Início
                                                    </label>

                                                    <Select
                                                        value={
                                                            it.startTime || ''
                                                        }
                                                        onValueChange={(
                                                            value
                                                        ) =>
                                                            updateInterval(
                                                                idx,
                                                                {
                                                                    startTime:
                                                                        value,
                                                                }
                                                            )
                                                        }
                                                        disabled={
                                                            exceptionSaving
                                                        }
                                                    >
                                                        <SelectTrigger
                                                            className={cn(
                                                                'h-10 w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand'
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <Clock className="h-4 w-4 text-content-brand" />
                                                                <SelectValue placeholder="00:00" />
                                                            </div>
                                                        </SelectTrigger>

                                                        <SelectContent>
                                                            {TIME_OPTIONS.map(
                                                                (time) => (
                                                                    <SelectItem
                                                                        key={
                                                                            time
                                                                        }
                                                                        value={
                                                                            time
                                                                        }
                                                                    >
                                                                        {time}
                                                                    </SelectItem>
                                                                )
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-label-medium-size text-content-primary">
                                                        Fim
                                                    </label>

                                                    <Select
                                                        value={it.endTime || ''}
                                                        onValueChange={(
                                                            value
                                                        ) =>
                                                            updateInterval(
                                                                idx,
                                                                {
                                                                    endTime:
                                                                        value,
                                                                }
                                                            )
                                                        }
                                                        disabled={
                                                            exceptionSaving
                                                        }
                                                    >
                                                        <SelectTrigger
                                                            className={cn(
                                                                'h-10 w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand'
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <Clock className="h-4 w-4 text-content-brand" />
                                                                <SelectValue placeholder="00:00" />
                                                            </div>
                                                        </SelectTrigger>

                                                        <SelectContent>
                                                            {TIME_OPTIONS.map(
                                                                (time) => (
                                                                    <SelectItem
                                                                        key={
                                                                            time
                                                                        }
                                                                        value={
                                                                            time
                                                                        }
                                                                    >
                                                                        {time}
                                                                    </SelectItem>
                                                                )
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>

                                            <p className="text-[11px] text-content-secondary/70">
                                                Exemplo: <strong>12:00</strong>{' '}
                                                até <strong>14:00</strong> para
                                                a pausa do almoço. 🥪
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <DialogFooter className="gap-2 sm:gap-3">
                            <Button
                                type="submit"
                                variant="edit2"
                                size="sm"
                                disabled={exceptionSaving}
                            >
                                {exceptionSaving ? 'Criando…' : 'Criar exceção'}
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={closeExceptionModal}
                                disabled={exceptionSaving}
                            >
                                Cancelar
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <form
                onSubmit={(e) => onSubmitWeeklyAction(unitId, e)}
                className="space-y-4"
            >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h3 className="text-label-small text-content-primary">
                            Disponibilidade da unidade
                        </h3>
                        <p className="text-paragraph-small text-content-secondary">
                            Ajuste o padrão semanal de atendimento desta
                            unidade.
                        </p>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                        <Button
                            type="submit"
                            variant="edit2"
                            size="sm"
                            disabled={hasAnyWeeklyError}
                            title={
                                hasAnyWeeklyError
                                    ? 'Corrija os horários inválidos antes de salvar.'
                                    : undefined
                            }
                        >
                            Salvar padrão semanal
                        </Button>

                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={openExceptionModal}
                        >
                            Criar exceção
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                    {days.map((d) => {
                        const startOk = isValidHHmm(String(d.startTime || ''));
                        const endOk = isValidHHmm(String(d.endTime || ''));
                        const hasError =
                            d.isActive &&
                            startOk &&
                            endOk &&
                            timeToMinutes(d.startTime) >=
                                timeToMinutes(d.endTime);

                        return (
                            <div
                                key={d.weekday}
                                className={cn(
                                    'flex flex-col rounded-xl border px-3 py-3 text-paragraph-small-size transition-colors',
                                    d.isActive
                                        ? 'border-border-brand bg-background-tertiary/80'
                                        : 'border-border-secondary bg-background-tertiary'
                                )}
                            >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <div className="flex flex-col">
                                        <span className="text-content-primary font-medium">
                                            {d.short}
                                        </span>
                                        <span className="text-[11px] text-content-primary">
                                            {d.full}
                                        </span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            const nextActive = !d.isActive;

                                            setWeeklyByUnitIdAction((prev) => ({
                                                ...prev,
                                                [unitId]: {
                                                    ...(prev[unitId] || {}),
                                                    [d.weekday]: {
                                                        ...(prev[unitId]?.[
                                                            d.weekday
                                                        ] || {
                                                            isActive: false,
                                                            startTime: '',
                                                            endTime: '',
                                                        }),
                                                        isActive: nextActive,
                                                    },
                                                },
                                            }));
                                        }}
                                        className={cn(
                                            'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                                            d.isActive
                                                ? 'bg-background-brand text-content-on-brand'
                                                : 'bg-background-primary text-content-secondary border border-border-secondary'
                                        )}
                                    >
                                        {d.isActive ? 'Sim' : 'Não'}
                                    </button>
                                </div>

                                <div className="mt-auto space-y-2">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[11px] text-content-primary">
                                            Das
                                        </span>

                                        <Select
                                            value={d.startTime || ''}
                                            onValueChange={(value) => {
                                                setWeeklyByUnitIdAction(
                                                    (prev) => ({
                                                        ...prev,
                                                        [unitId]: {
                                                            ...(prev[unitId] ||
                                                                {}),
                                                            [d.weekday]: {
                                                                ...(prev[
                                                                    unitId
                                                                ]?.[
                                                                    d.weekday
                                                                ] || {
                                                                    isActive: false,
                                                                    startTime:
                                                                        '',
                                                                    endTime: '',
                                                                }),
                                                                startTime:
                                                                    value,
                                                            },
                                                        },
                                                    })
                                                );
                                            }}
                                            disabled={!d.isActive}
                                        >
                                            <SelectTrigger
                                                className={cn(
                                                    'h-9 w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand',
                                                    hasError &&
                                                        'border-destructive focus-visible:ring-destructive/40'
                                                )}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Clock className="h-4 w-4 text-content-brand" />
                                                    <SelectValue placeholder="00:00" />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {TIME_OPTIONS.map((time) => (
                                                    <SelectItem
                                                        key={time}
                                                        value={time}
                                                    >
                                                        {time}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <span className="text-[11px] text-content-primary">
                                            Até
                                        </span>

                                        <Select
                                            value={d.endTime || ''}
                                            onValueChange={(value) => {
                                                setWeeklyByUnitIdAction(
                                                    (prev) => ({
                                                        ...prev,
                                                        [unitId]: {
                                                            ...(prev[unitId] ||
                                                                {}),
                                                            [d.weekday]: {
                                                                ...(prev[
                                                                    unitId
                                                                ]?.[
                                                                    d.weekday
                                                                ] || {
                                                                    isActive: false,
                                                                    startTime:
                                                                        '',
                                                                    endTime: '',
                                                                }),
                                                                endTime: value,
                                                            },
                                                        },
                                                    })
                                                );
                                            }}
                                            disabled={!d.isActive}
                                        >
                                            <SelectTrigger
                                                className={cn(
                                                    'h-9 w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand',
                                                    hasError &&
                                                        'border-destructive focus-visible:ring-destructive/40'
                                                )}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Clock className="h-4 w-4 text-content-brand" />
                                                    <SelectValue placeholder="00:00" />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {TIME_OPTIONS.map((time) => (
                                                    <SelectItem
                                                        key={time}
                                                        value={time}
                                                    >
                                                        {time}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {hasError && (
                                    <p className="mt-2 text-[11px] text-destructive">
                                        Em dias ativos, o horário inicial deve
                                        ser menor que o final.
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>

                {hasAnyWeeklyError && (
                    <p className="text-[11px] text-destructive">
                        Existem dias ativos com horário inválido (início
                        maior/igual ao fim).
                    </p>
                )}

                <div className="pt-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-label-small text-content-primary">
                                Exceções
                            </p>
                            <p className="text-[11px] text-content-secondary">
                                Pausas/bloqueios em datas específicas.
                            </p>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={fetchExceptions}
                            disabled={exceptionsLoading}
                        >
                            {exceptionsLoading ? 'Atualizando…' : 'Atualizar'}
                        </Button>
                    </div>

                    {exceptionsError ? (
                        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
                            <p className="text-[11px] text-destructive">
                                {exceptionsError}
                            </p>
                        </div>
                    ) : exceptionsLoading ? (
                        <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-2">
                            <div className="h-9 w-full rounded-lg bg-background-secondary/60" />
                            <div className="h-9 w-full rounded-lg bg-background-secondary/60" />
                            <p className="text-[11px] text-content-secondary">
                                Carregando exceções…
                            </p>
                        </div>
                    ) : exceptions.length === 0 ? (
                        <div className="rounded-xl border border-border-primary bg-background-tertiary p-4">
                            <p className="text-paragraph-small text-content-secondary">
                                Nenhuma exceção cadastrada ainda.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {exceptions.map((ex) => {
                                const isDeleting =
                                    deletingExceptionId === ex.id;

                                const intervals = Array.isArray(ex.intervals)
                                    ? ex.intervals
                                    : [];

                                return (
                                    <div
                                        key={ex.id}
                                        className="rounded-xl border border-border-primary bg-background-tertiary p-4"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-paragraph-small text-content-primary font-medium">
                                                    {formatDateBR(ex.date)}
                                                </p>

                                                {ex.isClosed ? (
                                                    <p className="text-[11px] text-content-secondary mt-1">
                                                        Dia fechado (sem
                                                        atendimento)
                                                    </p>
                                                ) : intervals.length ? (
                                                    <div className="mt-1 space-y-1">
                                                        {intervals.map((it) => (
                                                            <p
                                                                key={it.id}
                                                                className="text-[11px] text-content-secondary"
                                                            >
                                                                Pausa:{' '}
                                                                <span className="text-content-primary">
                                                                    {
                                                                        it.startTime
                                                                    }{' '}
                                                                    às{' '}
                                                                    {it.endTime}
                                                                </span>
                                                            </p>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-[11px] text-content-secondary mt-1">
                                                        Exceção sem intervalos
                                                        (vazia)
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="shrink-0 rounded-full border border-border-primary px-3 py-1 text-[11px] text-content-secondary">
                                                    Bloqueio
                                                </span>

                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={isDeleting}
                                                    onClick={() =>
                                                        handleDeleteException(
                                                            ex.id
                                                        )
                                                    }
                                                >
                                                    {isDeleting
                                                        ? 'Removendo…'
                                                        : 'Remover'}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </form>
        </div>
    );
}
