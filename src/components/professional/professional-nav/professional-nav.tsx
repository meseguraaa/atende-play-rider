// src/components/professional/professional-nav.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    CalendarCheck,
    Wallet,
    Star,
    Building2,
} from 'lucide-react';

type ProfessionalLink = {
    href: string;
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const professionalLinks: ProfessionalLink[] = [
    {
        href: '/professional/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
    },
    {
        href: '/professional/availability',
        label: 'Disponibilidade',
        icon: CalendarCheck,
    },
    {
        href: '/professional/earning',
        label: 'Ganhos',
        icon: Wallet,
    },
    {
        href: '/professional/review',
        label: 'Avaliações',
        icon: Star,
    },
];

type UnitForNav = {
    id: string;
    name: string;
};

export type ProfessionalNavProps = {
    className?: string;

    /**
     * ✅ Opcional: se você já tiver a unidade carregada no server (DB),
     * pode passar aqui e o componente não precisa buscar via API.
     */
    unit?: UnitForNav | null;
};

/**
 * Tenta buscar a unidade do profissional via API (quando `unit` não vier por props).
 * Espera um payload flexível, aceitando variações comuns:
 * - { ok: true, data: { id, name } }
 * - { ok: true, data: { unit: { id, name } } }
 * - { id, name }
 */
async function fetchProfessionalUnit(
    signal?: AbortSignal
): Promise<UnitForNav | null> {
    const candidates = [
        '/api/professional/unit',
        '/api/professional/me',
        '/api/professional/profile',
    ];

    for (const url of candidates) {
        try {
            const res = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                signal,
            });

            if (!res.ok) continue;

            const json: any = await res.json().catch(() => null);
            if (!json) continue;

            // Formatos suportados:
            const direct = json?.id && json?.name ? json : null;
            const data = json?.data ?? null;
            const dataDirect = data?.id && data?.name ? data : null;
            const nested =
                data?.unit?.id && data?.unit?.name ? data.unit : null;
            const altNested =
                json?.unit?.id && json?.unit?.name ? json.unit : null;

            const unit = (direct ??
                dataDirect ??
                nested ??
                altNested) as UnitForNav | null;
            if (unit?.id && unit?.name) return unit;

            // caso a API retorne array ou outra estrutura, ignoramos e tentamos próxima
        } catch {
            // silencioso, tenta próxima rota
        }
    }

    return null;
}

export function ProfessionalNav({ className, unit }: ProfessionalNavProps) {
    const pathname = usePathname();

    const [unitState, setUnitState] = React.useState<UnitForNav | null>(
        unit ?? null
    );

    React.useEffect(() => {
        if (unit) {
            setUnitState(unit);
            return;
        }

        const ctrl = new AbortController();

        fetchProfessionalUnit(ctrl.signal).then((u) => {
            if (u) setUnitState(u);
        });

        return () => ctrl.abort();
    }, [unit]);

    return (
        <nav
            className={cn(
                'group fixed left-0 top-0 z-40 flex h-screen flex-col',
                'border-r border-border-primary bg-background-primary',
                'w-14 hover:w-55 transition-[width] duration-200 ease-in-out',
                'pt-5 overflow-hidden',
                className
            )}
        >
            {/* UNIDADE (do profissional) */}
            {unitState?.name ? (
                <div className="px-2 pb-3">
                    <div className={cn('rounded-xl p-2')}>
                        <div className="flex items-center gap-2 px-2 pb-2">
                            <Building2 className="h-4 w-4 shrink-0 text-content-brand" />
                            <span
                                className={cn(
                                    'text-label-small text-content-secondary whitespace-nowrap',
                                    'opacity-0 -translate-x-1',
                                    'transition-all duration-200',
                                    'group-hover:opacity-100 group-hover:translate-x-0'
                                )}
                            >
                                Unidade
                            </span>
                        </div>

                        <div
                            className={cn(
                                'opacity-0 -translate-x-1 pointer-events-none',
                                'transition-all duration-200',
                                'group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto'
                            )}
                        >
                            <div
                                className={cn(
                                    'h-9 w-full flex items-center px-3 rounded-lg',
                                    'bg-background-secondary border border-border-primary',
                                    'text-content-primary'
                                )}
                                title={unitState.name}
                            >
                                <span className="truncate text-label-small">
                                    {unitState.name}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* LINKS */}
            <div className="flex-1 space-y-1 px-2 pb-4">
                {professionalLinks.map((link) => {
                    const isActive = pathname?.startsWith(link.href);
                    const Icon = link.icon;

                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-lg text-label-small transition-colors',
                                'text-content-secondary hover:bg-background-tertiary/50',
                                isActive &&
                                    'text-content-brand font-medium bg-background-tertiary/50'
                            )}
                        >
                            <Icon
                                className={cn(
                                    'h-4 w-4 shrink-0',
                                    isActive
                                        ? 'text-content-brand'
                                        : 'text-content-secondary'
                                )}
                            />
                            <span
                                className={cn(
                                    'whitespace-nowrap',
                                    'opacity-0 -translate-x-1',
                                    'transition-all duration-200',
                                    'group-hover:opacity-100 group-hover:translate-x-0'
                                )}
                            >
                                {link.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
