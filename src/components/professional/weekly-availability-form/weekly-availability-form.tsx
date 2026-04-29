'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Clock } from 'lucide-react';

type DayKey = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type DayState = {
    active: boolean;
    startTime: string;
    endTime: string;
};

export type WeeklyAvailabilityState = Record<DayKey, DayState>;

export type WeeklyAvailabilityDayPayload = {
    weekday: number;
    active: boolean;
    startTime: string;
    endTime: string;
};

type WeeklyAvailabilityFormProps = {
    initialValue?: WeeklyAvailabilityState;
    slotIntervalMinutes?: 15 | 30 | 45 | 60;
    onChangeAction?: (value: WeeklyAvailabilityState) => void;
    onSaveAction: (payload: {
        days: WeeklyAvailabilityDayPayload[];
    }) => Promise<void>;
    isSaving?: boolean;
    leftAction?: React.ReactNode;
};

function getDefaultEndTime(slotIntervalMinutes: 15 | 30 | 45 | 60) {
    if (slotIntervalMinutes === 15) return '23:45';
    if (slotIntervalMinutes === 30) return '23:30';
    if (slotIntervalMinutes === 45) return '23:15';
    return '23:00';
}

function createDefaultDayState(
    slotIntervalMinutes: 15 | 30 | 45 | 60
): DayState {
    return {
        active: false,
        startTime: '00:00',
        endTime: getDefaultEndTime(slotIntervalMinutes),
    };
}

const WEEK_DAYS: { key: DayKey; label: string; short: string }[] = [
    { key: 1, label: 'Segunda-feira', short: 'Seg' },
    { key: 2, label: 'Terça-feira', short: 'Ter' },
    { key: 3, label: 'Quarta-feira', short: 'Qua' },
    { key: 4, label: 'Quinta-feira', short: 'Qui' },
    { key: 5, label: 'Sexta-feira', short: 'Sex' },
    { key: 6, label: 'Sábado', short: 'Sáb' },
    { key: 0, label: 'Domingo', short: 'Dom' },
];

function createDefaultState(
    slotIntervalMinutes: 15 | 30 | 45 | 60
): WeeklyAvailabilityState {
    const defaultDayState = createDefaultDayState(slotIntervalMinutes);

    return {
        0: { ...defaultDayState, active: false },
        1: { ...defaultDayState, active: true },
        2: { ...defaultDayState, active: true },
        3: { ...defaultDayState, active: true },
        4: { ...defaultDayState, active: true },
        5: { ...defaultDayState, active: true },
        6: { ...defaultDayState, active: true },
    };
}

function buildTimeOptions(slotIntervalMinutes: 15 | 30 | 45 | 60) {
    const times: string[] = [];

    for (let hour = 0; hour <= 23; hour++) {
        for (let minute = 0; minute < 60; minute += slotIntervalMinutes) {
            times.push(
                `${String(hour).padStart(2, '0')}:${String(minute).padStart(
                    2,
                    '0'
                )}`
            );
        }
    }

    return times;
}

export function WeeklyAvailabilityForm({
    initialValue,
    slotIntervalMinutes = 30,
    onChangeAction,
    onSaveAction,
    isSaving = false,
    leftAction,
}: WeeklyAvailabilityFormProps) {
    const [state, setState] = useState<WeeklyAvailabilityState>(
        initialValue ?? createDefaultState(slotIntervalMinutes)
    );

    const timeOptions = buildTimeOptions(slotIntervalMinutes);

    useEffect(() => {
        if (initialValue) setState(initialValue);
    }, [initialValue]);

    useEffect(() => {
        onChangeAction?.(state);
    }, [state, onChangeAction]);

    const handleToggleDay = (day: DayKey) => {
        setState((prev) => ({
            ...prev,
            [day]: { ...prev[day], active: !prev[day].active },
        }));
    };

    const handleTimeChange = (
        day: DayKey,
        field: 'startTime' | 'endTime',
        value: string
    ) => {
        setState((prev) => ({
            ...prev,
            [day]: { ...prev[day], [field]: value },
        }));
    };

    const handleSave = async () => {
        const daysPayload: WeeklyAvailabilityDayPayload[] = Object.entries(
            state
        ).map(([weekdayStr, dayState]) => {
            const weekday = Number(weekdayStr);
            const d = dayState as DayState;

            return {
                weekday,
                active: d.active,
                startTime: d.startTime,
                endTime: d.endTime,
            };
        });

        await onSaveAction({ days: daysPayload });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-end gap-3">
                {leftAction}

                <Button
                    type="button"
                    variant="edit2"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? 'Salvando...' : 'Salvar padrão semanal'}
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                {WEEK_DAYS.map((day) => {
                    const dayState = state[day.key];

                    const hasError =
                        dayState.active &&
                        dayState.startTime &&
                        dayState.endTime &&
                        dayState.startTime >= dayState.endTime;

                    return (
                        <div
                            key={day.key}
                            className={cn(
                                'flex flex-col rounded-xl border px-3 py-3 text-paragraph-small-size transition-colors',
                                dayState.active
                                    ? 'border-border-brand bg-background-tertiary/80'
                                    : 'border-border-secondary bg-background-tertiary'
                            )}
                        >
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="flex flex-col">
                                    <span className="text-content-primary font-medium">
                                        {day.short}
                                    </span>
                                    <span className="text-[11px] text-content-primary">
                                        {day.label}
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleToggleDay(day.key)}
                                    disabled={isSaving}
                                    className={cn(
                                        'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                                        dayState.active
                                            ? 'bg-background-brand text-content-on-brand'
                                            : 'bg-background-primary text-content-secondary border border-border-secondary',
                                        isSaving &&
                                            'opacity-60 cursor-not-allowed'
                                    )}
                                >
                                    {dayState.active ? 'Sim' : 'Não'}
                                </button>
                            </div>

                            <div className="mt-auto space-y-2">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[11px] text-content-primary">
                                        Das
                                    </span>
                                    <Select
                                        value={dayState.startTime}
                                        onValueChange={(value) =>
                                            handleTimeChange(
                                                day.key,
                                                'startTime',
                                                value
                                            )
                                        }
                                        disabled={!dayState.active || isSaving}
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
                                                <SelectValue placeholder="Horário inicial" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {timeOptions.map((time) => (
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
                                        value={dayState.endTime}
                                        onValueChange={(value) =>
                                            handleTimeChange(
                                                day.key,
                                                'endTime',
                                                value
                                            )
                                        }
                                        disabled={!dayState.active || isSaving}
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
                                                <SelectValue placeholder="Horário final" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {timeOptions.map((time) => (
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
                        </div>
                    );
                })}
            </div>

            <p className="text-[11px] text-content-secondary">
                Marque apenas os dias em que você trabalha e ajuste os horários.
                As exceções por dia (folgas, eventos, etc.) são configuradas
                logo abaixo.
            </p>

            {/* Mantive apenas o aviso visual (UI), sem bloquear salvar */}
            {Object.values(state).some(
                (d) =>
                    d.active &&
                    d.startTime &&
                    d.endTime &&
                    d.startTime >= d.endTime
            ) ? (
                <p className="text-[11px] text-destructive">
                    Em dias ativos, o horário inicial deve ser menor que o
                    final.
                </p>
            ) : null}
        </div>
    );
}
