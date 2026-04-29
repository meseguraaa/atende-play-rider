'use client';

import { useEffect, useState } from 'react';

import type {
    AppointmentItem,
    ClientItem,
    ProfessionalItem,
    ServiceItem,
    UnitPickerOption,
} from '@/app/admin/rides/admin-rides-client';

import {
    AdminAppointmentRow,
    AdminAppointmentRowMobile,
} from '@/components/admin/appointment/admin-appointment-row/admin-appointment-row';

type Props = {
    appointments: AppointmentItem[];
    forcedUnitId?: string | null;
    units?: UnitPickerOption[];
    clients?: ClientItem[];
    professionals?: ProfessionalItem[];
    services?: ServiceItem[];
};

export function AppointmentsResponsiveList({
    appointments,
    forcedUnitId = null,
    units = [],
    clients = [],
    professionals = [],
    services = [],
}: Props) {
    const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 768px)');

        const update = () => setIsDesktop(mq.matches);
        update();

        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', update);
            return () => mq.removeEventListener('change', update);
        }

        // eslint-disable-next-line deprecation/deprecation
        mq.addListener(update);
        // eslint-disable-next-line deprecation/deprecation
        return () => mq.removeListener(update);
    }, []);

    const list = Array.isArray(appointments) ? appointments : [];

    if (isDesktop === null) return null;

    if (!isDesktop) {
        return (
            <div className="space-y-2">
                {list.map((appt) => (
                    <AdminAppointmentRowMobile
                        key={appt.id}
                        appt={appt}
                        forcedUnitId={forcedUnitId}
                        units={units}
                        clients={clients}
                        professionals={professionals}
                        services={services}
                    />
                ))}
            </div>
        );
    }

    return (
        <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
            <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                    <col className="w-24" />
                    <col className="w-56" />
                    <col className="w-32" />
                    <col className="w-44" />
                    <col className="w-56" />
                    <col className="w-36" />
                    <col className="w-40" />
                    <col className="w-72" />
                </colgroup>

                <thead>
                    <tr className="border-b border-border-primary bg-background-secondary">
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Hora
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Cliente
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Nível
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Telefone
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Serviço
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Confirmação
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                            Ações
                        </th>
                    </tr>
                </thead>

                <tbody className="[&>tr>td]:align-middle">
                    {list.map((appt) => (
                        <AdminAppointmentRow
                            key={appt.id}
                            appt={appt}
                            forcedUnitId={forcedUnitId}
                            units={units}
                            clients={clients}
                            professionals={professionals}
                            services={services}
                        />
                    ))}
                </tbody>
            </table>
        </section>
    );
}
