// src/components/date-picker/index.tsx
'use client';

import {
    Calendar as CalendarIcon,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, addMonths, format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

import { NavigationButton } from './navigation-button';

type DatePickerMode = 'date' | 'month';

type DatePickerProps = {
    /**
     * date  => usa query param "date" no formato yyyy-MM-dd (padrão, mantém telas existentes)
     * month => usa query param "month" no formato yyyy-MM (para telas como avaliações)
     */
    mode?: DatePickerMode;

    /**
     * Caso alguma tela queira esconder as setas.
     * Por padrão: false (mostra)
     */
    hideNavigation?: boolean;
};

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

function formatMonthParam(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function formatDateParam(d: Date) {
    return format(d, 'yyyy-MM-dd');
}

export const DatePicker = ({
    mode = 'date',
    hideNavigation,
}: DatePickerProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const paramKey = mode === 'month' ? 'month' : 'date';
    const rawParam = searchParams.get(paramKey);

    const getInitialDate = useCallback(() => {
        // ✅ month: yyyy-MM
        if (mode === 'month') {
            if (!rawParam) return new Date();

            const [y, m] = rawParam.split('-').map(Number);
            const parsed = new Date(y, (m ?? 1) - 1, 1);

            return isValid(parsed) ? parsed : new Date();
        }

        // ✅ date: yyyy-MM-dd (comportamento antigo)
        if (!rawParam) return new Date();

        const [year, month, day] = rawParam.split('-').map(Number);
        const parsedDate = new Date(year, (month ?? 1) - 1, day ?? 1);

        return isValid(parsedDate) ? parsedDate : new Date();
    }, [mode, rawParam]);

    const [date, setDate] = useState<Date>(() => getInitialDate());
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const displayLabel = useMemo(() => {
        if (!date) return 'Selecione uma data';

        if (mode === 'month') {
            // Ex: 01/2026
            return format(date, 'MM/yyyy', { locale: ptBR });
        }

        return format(date, 'dd/MM/yyyy', { locale: ptBR });
    }, [date, mode]);

    const updateURLWithDate = (selectedDate: Date) => {
        const newParams = new URLSearchParams(searchParams.toString());

        // ✅ evita parâmetros “brigando” entre telas
        if (mode === 'month') {
            newParams.delete('date');
        } else {
            newParams.delete('month');
        }

        if (mode === 'month') {
            // normaliza sempre para o 1º dia do mês
            const monthDate = new Date(
                selectedDate.getFullYear(),
                selectedDate.getMonth(),
                1
            );
            newParams.set('month', formatMonthParam(monthDate));
        } else {
            newParams.set('date', formatDateParam(selectedDate));
        }

        const qs = newParams.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
    };

    const handleNavigate = (delta: number) => {
        const baseDate = date ?? new Date();

        const newDate =
            mode === 'month'
                ? addMonths(baseDate, delta)
                : addDays(baseDate, delta);

        // normaliza mês no state também (pra não ficar com dia “quebrado”)
        const next =
            mode === 'month'
                ? new Date(newDate.getFullYear(), newDate.getMonth(), 1)
                : newDate;

        setDate(next);
        updateURLWithDate(next);
    };

    const handdleDateSelect = (selectedDate: Date | undefined) => {
        if (selectedDate) {
            const next =
                mode === 'month'
                    ? new Date(
                          selectedDate.getFullYear(),
                          selectedDate.getMonth(),
                          1
                      )
                    : selectedDate;

            setDate(next);
            updateURLWithDate(next);
        }
        setIsPopoverOpen(false);
    };

    useEffect(() => {
        setDate(getInitialDate());
    }, [getInitialDate]);

    const prevTooltip = mode === 'month' ? 'Mês anterior' : 'Dia anterior';
    const nextTooltip = mode === 'month' ? 'Próximo mês' : 'Próximo dia';

    return (
        <div className="flex items-center gap-2">
            {!hideNavigation && (
                <NavigationButton
                    tooltipText={prevTooltip}
                    onClick={() => handleNavigate(-1)}
                >
                    <ChevronLeft className="h-4 w-4" />
                </NavigationButton>
            )}

            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="min-w-45 justify-between text-left font-normal bg-transparent border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand"
                    >
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-content-brand" />
                            <span>{displayLabel}</span>
                        </div>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={handdleDateSelect}
                        autoFocus
                        locale={ptBR}
                    />
                </PopoverContent>
            </Popover>

            {!hideNavigation && (
                <NavigationButton
                    tooltipText={nextTooltip}
                    onClick={() => handleNavigate(1)}
                >
                    <ChevronRight className="h-4 w-4" />
                </NavigationButton>
            )}
        </div>
    );
};
