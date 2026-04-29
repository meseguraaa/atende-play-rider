// src/components/professional/daily-exception-modal/daily-exception-modal.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type ExceptionInterval = {
    id: string;
    startTime: string;
    endTime: string;
};

type DailyExceptionModalProps = {
    professionalId: string;

    /**
     * Hook opcional (UI):
     * útil se você quiser reagir no pai sem mudar o visual.
     */
    onSubmitUIAction?: (payload: {
        professionalId: string;
        dateISO: string;
        mode: 'FULL_DAY' | 'PARTIAL';
        intervals: { startTime: string; endTime: string }[];
    }) => void;
};

type ApiResponse = { ok: true; data?: any } | { ok: false; error?: string };

const EXCEPTIONS_CHANGED_EVENT = 'professional-exceptions:changed';

// ✅ 00:00 → 23:45 (15 em 15)
const TIME_OPTIONS = (() => {
    const times: string[] = [];
    for (let hour = 0; hour <= 23; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
            times.push(
                `${String(hour).padStart(2, '0')}:${String(minute).padStart(
                    2,
                    '0'
                )}`
            );
        }
    }
    return times;
})();

export function DailyExceptionModal({
    professionalId,
    onSubmitUIAction,
}: DailyExceptionModalProps) {
    const router = useRouter();

    const [isOpen, setIsOpen] = useState(false);
    const [date, setDate] = useState<Date | undefined>();
    const [mode, setMode] = useState<'FULL_DAY' | 'PARTIAL'>('FULL_DAY');
    const [intervals, setIntervals] = useState<ExceptionInterval[]>([
        { id: '1', startTime: '09:00', endTime: '19:00' },
    ]);

    const [isSaving, setIsSaving] = useState(false);

    function resetState() {
        setDate(undefined);
        setMode('FULL_DAY');
        setIntervals([{ id: '1', startTime: '09:00', endTime: '18:45' }]);
    }

    function handleAddInterval() {
        const nextId = String(Date.now());
        setIntervals((prev) => [
            ...prev,
            { id: nextId, startTime: '09:00', endTime: '17:45' },
        ]);
    }

    function handleRemoveInterval(id: string) {
        setIntervals((prev) => prev.filter((i) => i.id !== id));
    }

    function updateInterval(
        id: string,
        field: 'startTime' | 'endTime',
        value: string
    ) {
        setIntervals((prev) =>
            prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
        );
    }

    function timeToMinutes(hhmm: string) {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    }

    function hasOverlap(list: { startTime: string; endTime: string }[]) {
        const sorted = [...list].sort(
            (a, b) =>
                timeToMinutes(a.startTime) - timeToMinutes(b.startTime) ||
                timeToMinutes(a.endTime) - timeToMinutes(b.endTime)
        );

        for (let i = 1; i < sorted.length; i++) {
            const prevEnd = timeToMinutes(sorted[i - 1].endTime);
            const currStart = timeToMinutes(sorted[i].startTime);

            if (currStart < prevEnd) return true;
        }

        return false;
    }

    const hasAnyInvalidInterval = useMemo(() => {
        if (mode !== 'PARTIAL') return false;

        const invalid = intervals.some(
            (i) => !i.startTime || !i.endTime || i.startTime >= i.endTime
        );

        if (invalid) return true;

        return hasOverlap(intervals);
    }, [intervals, mode]);

    const canSubmit = useMemo(() => {
        if (!date) return false;
        if (mode === 'PARTIAL') {
            if (!intervals.length) return false;
            if (hasAnyInvalidInterval) return false;
        }
        return true;
    }, [date, mode, intervals.length, hasAnyInvalidInterval]);

    async function handleSubmit() {
        if (!canSubmit) {
            toast.error('Selecione uma data válida para salvar a exceção.');
            return;
        }

        setIsSaving(true);

        // ✅ Sempre envia a “data do calendário” como yyyy-MM-dd (sem hora / sem timezone)
        const payload =
            mode === 'FULL_DAY'
                ? {
                      dateISO: format(date!, 'yyyy-MM-dd'),
                      mode: 'FULL_DAY' as const,
                      intervals: [] as { startTime: string; endTime: string }[],
                  }
                : {
                      dateISO: format(date!, 'yyyy-MM-dd'),
                      mode: 'PARTIAL' as const,
                      intervals: intervals.map((i) => ({
                          startTime: i.startTime,
                          endTime: i.endTime,
                      })),
                  };

        try {
            const res = await fetch(
                '/api/professional/availability/exceptions',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                }
            );

            const json = (await res.json()) as ApiResponse;

            if (!res.ok || !json?.ok) {
                const msg =
                    (json && 'error' in json && json.error) ||
                    'Erro ao salvar exceção.';
                toast.error(msg);
                return;
            }

            toast.success('Exceção criada com sucesso!');

            onSubmitUIAction?.({
                professionalId,
                ...payload,
            });

            resetState();
            setIsOpen(false);

            // ✅ avisa a lista pra recarregar na hora
            window.dispatchEvent(new Event(EXCEPTIONS_CHANGED_EVENT));

            // ✅ atualiza server components/caches
            router.refresh();
        } catch {
            toast.error('Falha ao salvar exceção. Tente novamente.');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                setIsOpen(open);
                if (!open) resetState();
            }}
        >
            <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                    Criar exceção
                </Button>
            </DialogTrigger>

            <DialogContent
                variant="appointment"
                overlayVariant="blurred"
                showCloseButton
            >
                <DialogHeader>
                    <DialogTitle size="modal">
                        Criar exceção na agenda
                    </DialogTitle>
                    <DialogDescription size="modal">
                        Bloqueie um dia inteiro ou faixas de horário
                        específicas. A agenda vai respeitar essas exceções acima
                        do padrão semanal.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* DATA */}
                    <div className="space-y-2">
                        <span className="text-label-medium-size text-content-primary">
                            Dia da exceção
                        </span>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    disabled={isSaving}
                                    className={cn(
                                        'w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand',
                                        !date && 'text-content-secondary'
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <CalendarIcon
                                            className="text-content-brand"
                                            size={20}
                                        />
                                        {date ? (
                                            <span>
                                                {format(
                                                    date,
                                                    "EEEE, dd 'de' MMMM",
                                                    { locale: ptBR }
                                                )}
                                            </span>
                                        ) : (
                                            <span>Selecione uma data</span>
                                        )}
                                    </div>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-auto p-0"
                                align="start"
                            >
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={(d) => setDate(d ?? undefined)}
                                    disabled={(d) => d < startOfToday()}
                                    locale={ptBR}
                                />
                            </PopoverContent>
                        </Popover>

                        {!date ? (
                            <p className="text-[11px] text-content-tertiary">
                                Selecione uma data para habilitar o salvar.
                            </p>
                        ) : null}
                    </div>

                    {/* MODO */}
                    <div className="space-y-2">
                        <span className="text-label-medium-size text-content-primary">
                            Tipo de exceção
                        </span>
                        <Select
                            value={mode}
                            onValueChange={(v: 'FULL_DAY' | 'PARTIAL') =>
                                setMode(v)
                            }
                            disabled={isSaving}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="FULL_DAY">
                                    Dia inteiro indisponível
                                </SelectItem>
                                <SelectItem value="PARTIAL">
                                    Disponível em horários específicos
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* INTERVALOS (só se PARTIAL) */}
                    {mode === 'PARTIAL' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-label-medium-size text-content-primary">
                                    Horários disponíveis
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleAddInterval}
                                    disabled={isSaving}
                                >
                                    + Adicionar intervalo
                                </Button>
                            </div>

                            <div className="space-y-2">
                                {intervals.map((interval) => {
                                    const hasError =
                                        !interval.startTime ||
                                        !interval.endTime ||
                                        interval.startTime >= interval.endTime;

                                    return (
                                        <div
                                            key={interval.id}
                                            className="grid grid-cols-[1fr,1fr,auto] items-center gap-2"
                                        >
                                            <div className="space-y-1">
                                                <span className="text-label-small text-content-secondary">
                                                    Início
                                                </span>
                                                <Select
                                                    value={interval.startTime}
                                                    onValueChange={(v) =>
                                                        updateInterval(
                                                            interval.id,
                                                            'startTime',
                                                            v
                                                        )
                                                    }
                                                    disabled={isSaving}
                                                >
                                                    <SelectTrigger
                                                        className={cn(
                                                            hasError &&
                                                                'border-destructive focus-visible:ring-destructive/40'
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Clock className="h-4 w-4 text-content-brand" />
                                                            <SelectValue placeholder="Horário inicial" />
                                                        </div>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {TIME_OPTIONS.map(
                                                            (t) => (
                                                                <SelectItem
                                                                    key={t}
                                                                    value={t}
                                                                >
                                                                    {t}
                                                                </SelectItem>
                                                            )
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-1">
                                                <span className="text-label-small text-content-secondary">
                                                    Fim
                                                </span>
                                                <Select
                                                    value={interval.endTime}
                                                    onValueChange={(v) =>
                                                        updateInterval(
                                                            interval.id,
                                                            'endTime',
                                                            v
                                                        )
                                                    }
                                                    disabled={isSaving}
                                                >
                                                    <SelectTrigger
                                                        className={cn(
                                                            hasError &&
                                                                'border-destructive focus-visible:ring-destructive/40'
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Clock className="h-4 w-4 text-content-brand" />
                                                            <SelectValue placeholder="Horário final" />
                                                        </div>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {TIME_OPTIONS.map(
                                                            (t) => (
                                                                <SelectItem
                                                                    key={t}
                                                                    value={t}
                                                                >
                                                                    {t}
                                                                </SelectItem>
                                                            )
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex items-end justify-end pb-0.5">
                                                {intervals.length > 1 && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() =>
                                                            handleRemoveInterval(
                                                                interval.id
                                                            )
                                                        }
                                                        disabled={isSaving}
                                                    >
                                                        ✕
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <p className="text-paragraph-small-size text-content-secondary">
                                Apenas esses horários estarão disponíveis neste
                                dia. Fora deles, não será possível agendar.
                            </p>

                            {hasAnyInvalidInterval ? (
                                <p className="text-[11px] text-destructive">
                                    Os horários não podem se sobrepor e o
                                    horário inicial deve ser menor que o final.
                                </p>
                            ) : null}
                        </div>
                    )}

                    {/* AÇÕES */}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={isSaving}
                            onClick={() => {
                                resetState();
                                setIsOpen(false);
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="brand"
                            onClick={handleSubmit}
                            disabled={isSaving || !canSubmit}
                        >
                            {isSaving && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Salvar exceção
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
