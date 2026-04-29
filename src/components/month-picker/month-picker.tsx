// components/month-picker.tsx
'use client';

import {
    Calendar as CalendarIcon,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { addMonths, format, isValid, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { NavigationButton } from './navigation-button';
import { cn } from '@/lib/utils';

export const MonthPicker = () => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const monthParam = searchParams.get('month'); // yyyy-MM

    const getInitialMonth = useCallback(() => {
        if (!monthParam) return startOfMonth(new Date());

        const [year, month] = monthParam.split('-').map(Number);
        const parsed = new Date(year, month - 1, 1);

        return isValid(parsed)
            ? startOfMonth(parsed)
            : startOfMonth(new Date());
    }, [monthParam]);

    const [monthDate, setMonthDate] = useState<Date>(() => getInitialMonth());
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const updateURLWithMonth = (selected: Date) => {
        // ✅ Preserva TODOS os query params atuais (incluindo unit),
        // e só altera o "month".
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('month', format(selected, 'yyyy-MM'));

        // ✅ Seguro e genérico:
        // se a tela usa paginação via query param "page", ao trocar o mês volta pra página 1
        if (newParams.has('page')) {
            newParams.set('page', '1');
        }

        const qs = newParams.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
    };

    const handleNavigateMonth = (delta: number) => {
        const base = monthDate ?? startOfMonth(new Date());
        const newMonth = startOfMonth(addMonths(base, delta));

        setMonthDate(newMonth);
        updateURLWithMonth(newMonth);
    };

    const handleSelectMonth = (monthIndex: number) => {
        const base = monthDate ?? startOfMonth(new Date());
        const newMonth = startOfMonth(
            new Date(base.getFullYear(), monthIndex, 1)
        );

        setMonthDate(newMonth);
        updateURLWithMonth(newMonth);
        setIsPopoverOpen(false);
    };

    useEffect(() => {
        setMonthDate(getInitialMonth());
    }, [getInitialMonth]);

    const currentYear = monthDate.getFullYear();
    const selectedMonthIndex = monthDate.getMonth();

    const monthLabel = format(monthDate, "MMMM 'de' yyyy", { locale: ptBR });
    const formattedLabel =
        monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

    const months = Array.from({ length: 12 }, (_, i) => i);

    return (
        <div className="flex items-center gap-2">
            <NavigationButton
                tooltipText="Mês anterior"
                onClick={() => handleNavigateMonth(-1)}
            >
                <ChevronLeft className="h-4 w-4" />
            </NavigationButton>

            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="min-w-55 justify-between text-left font-normal bg-transparent border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand"
                    >
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-content-brand" />
                            <span className="truncate">{formattedLabel}</span>
                        </div>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent className="w-68 p-0 rounded-xl border border-border-primary bg-background-secondary">
                    {/* Cabeçalho do popover (parecido com o Calendar) */}
                    <div className="flex items-center justify-between border-b border-border-primary px-3 py-2">
                        <span className="text-label-small text-content-secondary">
                            Selecione um mês de {currentYear}
                        </span>
                    </div>

                    {/* Grid de meses */}
                    <div className="grid grid-cols-3 gap-2 p-3">
                        {months.map((monthIndex) => {
                            const dateForMonth = new Date(
                                currentYear,
                                monthIndex,
                                1
                            );
                            const label = format(dateForMonth, 'MMM', {
                                locale: ptBR,
                            });
                            const isSelected =
                                monthIndex === selectedMonthIndex;

                            return (
                                <button
                                    key={monthIndex}
                                    type="button"
                                    onClick={() =>
                                        handleSelectMonth(monthIndex)
                                    }
                                    className={cn(
                                        'flex h-9 items-center justify-center rounded-md border text-label-small transition-colors',
                                        'border-border-primary text-content-secondary hover:bg-background-tertiary hover:text-content-primary',
                                        isSelected &&
                                            'border-border-brand text-content-primary font-semibold bg-background-tertiary/60 shadow-sm'
                                    )}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </PopoverContent>
            </Popover>

            <NavigationButton
                tooltipText="Próximo mês"
                onClick={() => handleNavigateMonth(1)}
            >
                <ChevronRight className="h-4 w-4" />
            </NavigationButton>
        </div>
    );
};
