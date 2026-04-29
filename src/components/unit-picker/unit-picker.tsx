// src/components/unit-picker/unit-picker.tsx
'use client';

import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

export type UnitPickerOption = {
    id: string;
    name: string;
};

type UnitPickerProps = {
    /**
     * Lista de unidades disponíveis para seleção.
     * Normalmente vem do server (page.tsx) baseado na empresa e permissões.
     */
    units: UnitPickerOption[];

    /**
     * Quando true, mostra a opção "Todas" (unit=all) no topo.
     * Útil pra admins que podem ver todas as unidades.
     */
    allowAll?: boolean;

    /**
     * Label exibida para a opção "Todas".
     */
    allLabel?: string;

    /**
     * Desabilita o seletor inteiro (ex: admin sem permissão para trocar).
     */
    disabled?: boolean;

    /**
     * Nome do query param usado na URL.
     * Default: "unit"
     */
    paramName?: string;

    /**
     * Valor usado para representar "todas".
     * Default: "all"
     */
    allValue?: string;

    /**
     * Placeholder exibido quando não há unidade selecionada.
     * Default: "Selecione a unidade"
     */
    placeholder?: string;

    /**
     * Se true, ao trocar a unidade, reseta "page" para 1 (se existir).
     * Default: true
     */
    resetPageOnChange?: boolean;
};

export function UnitPicker({
    units,
    allowAll = true,
    allLabel = 'Todas as unidades',
    disabled = false,
    paramName = 'unit',
    allValue = 'all',
    placeholder = 'Selecione a unidade',
    resetPageOnChange = true,
}: UnitPickerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const selectedParam = searchParams.get(paramName); // "all" | unitId | null
    const [isOpen, setIsOpen] = useState(false);

    const unitMap = useMemo(() => {
        const m = new Map<string, UnitPickerOption>();
        for (const u of units) m.set(u.id, u);
        return m;
    }, [units]);

    const resolvedSelected = useMemo(() => {
        if (!selectedParam) return null;
        if (selectedParam === allValue) return { id: allValue, name: allLabel };
        return unitMap.get(selectedParam) ?? null;
    }, [selectedParam, allValue, allLabel, unitMap]);

    const updateURLWithUnit = useCallback(
        (nextValue: string) => {
            const newParams = new URLSearchParams(searchParams.toString());

            newParams.set(paramName, nextValue);

            if (resetPageOnChange && newParams.has('page')) {
                newParams.set('page', '1');
            }

            router.push(`${pathname}?${newParams.toString()}`);
        },
        [paramName, pathname, resetPageOnChange, router, searchParams]
    );

    const options = useMemo(() => {
        const base: Array<{ value: string; label: string }> = [];

        if (allowAll) base.push({ value: allValue, label: allLabel });
        for (const u of units) base.push({ value: u.id, label: u.name });

        return base;
    }, [allowAll, allLabel, allValue, units]);

    const label = resolvedSelected?.name ?? placeholder;

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                        'min-w-[220px] justify-between text-left font-normal bg-transparent',
                        'border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary',
                        'focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand',
                        disabled && 'opacity-60 cursor-not-allowed'
                    )}
                >
                    <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-content-brand" />
                        <span className="truncate">{label}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>

            <PopoverContent className="w-[272px] p-0 rounded-xl border border-border-primary bg-background-secondary">
                <div className="flex items-center justify-between border-b border-border-primary px-3 py-2">
                    <span className="text-label-small text-content-secondary">
                        Selecione uma unidade
                    </span>
                </div>

                <div className="max-h-80 overflow-auto p-2">
                    <div className="grid gap-2">
                        {options.map((opt) => {
                            const isSelected = selectedParam
                                ? selectedParam === opt.value
                                : false;

                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        updateURLWithUnit(opt.value);
                                        setIsOpen(false);
                                    }}
                                    className={cn(
                                        'w-full rounded-md border px-3 py-2 text-left transition-colors',
                                        'border-border-primary text-content-secondary hover:bg-background-tertiary hover:text-content-primary',
                                        isSelected &&
                                            'border-border-brand text-content-primary font-semibold bg-background-tertiary/60 shadow-sm'
                                    )}
                                >
                                    <span className="text-label-small">
                                        {opt.label}
                                    </span>
                                </button>
                            );
                        })}

                        {options.length === 0 && (
                            <div className="px-3 py-4 text-paragraph-small text-content-secondary">
                                Nenhuma unidade disponível.
                            </div>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
