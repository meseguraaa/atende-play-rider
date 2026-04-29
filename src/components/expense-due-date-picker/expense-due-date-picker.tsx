'use client';

import * as React from 'react';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

type ExpenseDueDatePickerProps = {
    name: string;
    id?: string;
    /** yyyy-MM-dd */
    defaultValue?: string;
};

export function ExpenseDueDatePicker({
    name,
    id,
    defaultValue,
}: ExpenseDueDatePickerProps) {
    const initialDate = React.useMemo(() => {
        if (!defaultValue) return undefined;

        const parsed = new Date(defaultValue);
        return isValid(parsed) ? parsed : undefined;
    }, [defaultValue]);

    const [date, setDate] = React.useState<Date | undefined>(initialDate);
    const [open, setOpen] = React.useState(false);

    const handleSelect = (selected?: Date) => {
        if (!selected) return;
        setDate(selected);
        setOpen(false);
    };

    return (
        <>
            {/* campo real enviado no form */}
            <input
                type="hidden"
                name={name}
                value={date ? format(date, 'yyyy-MM-dd') : ''}
            />

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        type="button"
                        variant="outline"
                        className={cn(
                            'w-full justify-between text-left font-normal',
                            'bg-transparent border-border-primary text-content-primary',
                            'hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary',
                            'focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand',
                            'focus:border-border-brand focus-visible:border-border-brand'
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-content-brand" />
                            {date ? (
                                <span>
                                    {format(date, 'dd/MM/yyyy', {
                                        locale: ptBR,
                                    })}
                                </span>
                            ) : (
                                <span className="text-content-secondary">
                                    dd/mm/aaaa
                                </span>
                            )}
                        </div>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent className="w-auto p-0 rounded-xl border border-border-primary bg-background-secondary">
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={handleSelect}
                        autoFocus
                        locale={ptBR}
                    />
                </PopoverContent>
            </Popover>
        </>
    );
}
