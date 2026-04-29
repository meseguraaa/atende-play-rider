// src/app/admin/rides/admin-rides-client.tsx
'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import NewRideDialog from '@/components/admin/ride/new-ride-dialog/new-ride-dialog';
import {
    AdminRideRow,
    AdminRideRowMobile,
    type AdminRideRowItem,
} from '@/components/admin/ride/admin-ride-row/admin-ride-row';

export type UnitPickerOption = {
    id: string;
    name: string;
};

type AdminRidesClientProps = {
    scopeLabel: string;
    activeUnitId?: string | null;
    units?: UnitPickerOption[];
    rides?: AdminRideRowItem[];
};

function useIsDesktop(minWidthPx = 768) {
    const [isDesktop, setIsDesktop] = React.useState<boolean>(() => {
        if (typeof window === 'undefined') return true;
        return window.matchMedia(`(min-width: ${minWidthPx}px)`).matches;
    });

    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        const mq = window.matchMedia(`(min-width: ${minWidthPx}px)`);

        const onChange = () => setIsDesktop(mq.matches);
        onChange();

        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', onChange);
            return () => mq.removeEventListener('change', onChange);
        }

        const legacy = mq as any;
        if (typeof legacy.addListener === 'function') {
            legacy.addListener(onChange);
            return () => legacy.removeListener(onChange);
        }
    }, [minWidthPx]);

    return isDesktop;
}

export default function AdminRidesClient({
    scopeLabel,
    activeUnitId,
    units = [],
    rides = [],
}: AdminRidesClientProps) {
    const isDesktop = useIsDesktop(768);

    // 🔥 separação dos rolês
    const activeRides = React.useMemo(
        () =>
            rides.filter(
                (r) => r.status === 'DRAFT' || r.status === 'PUBLISHED'
            ),
        [rides]
    );

    const closedRides = React.useMemo(
        () =>
            rides.filter(
                (r) => r.status === 'FINISHED' || r.status === 'CANCELED'
            ),
        [rides]
    );

    function renderTable(data: AdminRideRowItem[]) {
        return isDesktop ? (
            <section className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                        <col className="w-50" />
                        <col className="w-40" />
                        <col className="w-40" />
                        <col className="w-30" />
                        <col className="w-30" />
                        <col className="w-40" />
                        <col className="w-72" />
                    </colgroup>

                    <thead>
                        <tr className="border-b border-border-primary bg-background-secondary">
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Rolê
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Início
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Fim
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Status
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                                Confirmados
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                                Chegaram em casa
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                                Ações
                            </th>
                        </tr>
                    </thead>

                    <tbody className="[&>tr>td]:align-middle">
                        {data.map((ride) => (
                            <AdminRideRow key={ride.id} ride={ride} />
                        ))}
                    </tbody>
                </table>
            </section>
        ) : (
            <div className="divide-y divide-border-primary/60">
                {data.map((ride) => (
                    <AdminRideRowMobile key={ride.id} ride={ride} />
                ))}
            </div>
        );
    }

    function renderSection(title: string, data: AdminRideRowItem[]) {
        return (
            <section className="overflow-hidden rounded-xl border border-border-primary bg-background-tertiary">
                <div className="flex items-center justify-between border-b border-border-primary bg-muted/40 px-4 py-3">
                    <div>
                        <p className="font-medium text-content-primary">
                            {title}
                        </p>
                        <p className="text-paragraph-small text-content-secondary">
                            Total: {data.length}
                        </p>
                    </div>
                </div>

                {data.length === 0 ? (
                    <div className="p-6 text-center text-paragraph-small text-content-secondary">
                        Nenhum rolê nesta categoria.
                    </div>
                ) : (
                    renderTable(data)
                )}
            </section>
        );
    }

    return (
        <div className="max-w-7xl space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-title text-content-primary">Rolês</h1>
                    <p className="text-paragraph-medium-size text-content-secondary">
                        Gerencie os rolês do grupo, confirmações de presença e
                        chegadas em casa.
                    </p>
                    <p className="text-paragraph-small text-content-tertiary">
                        Escopo atual:{' '}
                        <span className="font-medium">{scopeLabel}</span>
                    </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    <NewRideDialog
                        forcedUnitId={activeUnitId ?? null}
                        units={units}
                    >
                        <Button variant="brand">Novo Rolê</Button>
                    </NewRideDialog>
                </div>
            </div>

            {rides.length === 0 ? (
                <section className="overflow-hidden rounded-xl border border-border-primary bg-background-tertiary">
                    <div className="p-6 text-center text-paragraph-small text-content-secondary">
                        Nenhum rolê encontrado ainda.
                    </div>
                </section>
            ) : (
                <div className="space-y-6">
                    {/* 🔥 Rolês ativos */}
                    {renderSection('Rolês ativos', activeRides)}

                    {/* 🔥 Encerrados */}
                    {renderSection('Encerrados', closedRides)}
                </div>
            )}
        </div>
    );
}
