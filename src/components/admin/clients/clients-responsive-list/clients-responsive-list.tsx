'use client';

import * as React from 'react';

import {
    AdminClientRow,
    AdminClientRowMobile,
} from '@/components/admin/clients/admin-client-row/admin-client-row';

export type AdminClientRowData = {
    id: string;
    name: string;
    email: string;
    phone: string;
    createdAt: Date;
    image: string | null;
    totalAppointments: number;
    doneCount: number;
    canceledCount: number;
    canceledWithFeeCount: number;
    totalCancelFee: number;
    totalPlans: number;
    hasActivePlan: boolean;
    frequencyLabel: string;
    lastDoneDate: Date | null;
    totalSpent: number;
    whatsappUrl: string | null;
};

type ClientsResponsiveListProps = {
    rows: AdminClientRowData[];
};

function useIsDesktopMd() {
    const [isDesktop, setIsDesktop] = React.useState<boolean>(() => true);

    React.useEffect(() => {
        const mq = window.matchMedia('(min-width: 768px)'); // md
        const apply = () => setIsDesktop(mq.matches);

        apply();

        // Safari old fallback
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', apply);
            return () => mq.removeEventListener('change', apply);
        }

        mq.addListener(apply);
        return () => mq.removeListener(apply);
    }, []);

    return isDesktop;
}

export function ClientsResponsiveList({ rows }: ClientsResponsiveListProps) {
    const isDesktop = useIsDesktopMd();

    if (!rows || rows.length === 0) {
        return (
            <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                <p className="text-center text-paragraph-small text-content-secondary">
                    Nenhum cliente encontrado.
                </p>
            </div>
        );
    }

    // ✅ DESKTOP: tabela
    if (isDesktop) {
        return (
            <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-border-primary bg-background-secondary">
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Cliente
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Criado em
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                                Agend.
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                                Concl.
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                                Canc.
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                                Canc. c/ taxa
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                                Taxas
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                                Planos
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                                Plano ativo
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Frequência
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Último
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                                Total gasto
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                                Ações
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {rows.map((row) => (
                            <AdminClientRow key={row.id} row={row} />
                        ))}
                    </tbody>
                </table>
            </section>
        );
    }

    // ✅ MOBILE: cards
    return (
        <div className="space-y-2">
            {rows.map((row) => (
                <AdminClientRowMobile key={row.id} row={row} />
            ))}
        </div>
    );
}
