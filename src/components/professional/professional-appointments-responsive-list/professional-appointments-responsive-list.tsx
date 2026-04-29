// src/components/professional/professional-appointments-responsive-list/professional-appointments-responsive-list.tsx
'use client';

import * as React from 'react';

import ProfessionalAppointmentRow, {
    ProfessionalAppointmentRowMobile,
    type ProfessionalAppointmentRowItem,
} from '@/components/professional/professional-appointment-row/professional-appointment-row';

import type {
    UnitOption,
    ClientOption,
    ProfessionalOption,
    ServiceOption,
} from '@/components/admin/appointment/edit-appointment-dialog/edit-appointment-dialog';

/**
 * Tipos exportados porque o client importa eles.
 * Mantemos "aberto" com Record<string, unknown> pra não travar o app
 * caso o shape tenha mais campos.
 */
export type AppointmentItem = {
    id: string;
    scheduleAt: string | Date;
} & Record<string, unknown>;

export type AppointmentsGroup = {
    key: string;
    professionalId: string | null;
    professionalName: string;
    professionalImageUrl: string | null;
    appointments: AppointmentItem[];
};

export type ProfessionalAppointmentsResponsiveListProps = {
    groups: AppointmentsGroup[];

    forcedUnitId?: string;
    forcedProfessionalId?: string;

    units: UnitOption[];
    clients: ClientOption[];
    professionals: ProfessionalOption[];
    services: ServiceOption[];

    breakpointPx?: number; // default 768
};

type AppointmentStatus = 'PENDING' | 'DONE' | 'CANCELED';
type AppointmentConfirmationStatus =
    | 'PENDING'
    | 'CONFIRMED'
    | 'CANCELED'
    | 'NOT_REQUIRED';
type CustomerLevel = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';

function getInitials(name: string): string {
    return String(name ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

/**
 * Mesmo padrão usado no admin:
 * no desktop renderiza tabela
 * no mobile renderiza cards
 */
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

        const legacy = mq as MediaQueryList & {
            addListener?: (listener: () => void) => void;
            removeListener?: (listener: () => void) => void;
        };

        if (typeof legacy.addListener === 'function') {
            legacy.addListener(onChange);
            return () => legacy.removeListener?.(onChange);
        }

        return;
    }, [minWidthPx]);

    return isDesktop;
}

function readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown): string | null {
    const v = readString(value);
    return v.length > 0 ? v : null;
}

function readStatus(value: unknown): AppointmentStatus {
    if (value === 'DONE' || value === 'CANCELED') return value;
    return 'PENDING';
}

function readConfirmationStatus(
    value: unknown
): AppointmentConfirmationStatus | null {
    if (
        value === 'PENDING' ||
        value === 'CONFIRMED' ||
        value === 'CANCELED' ||
        value === 'NOT_REQUIRED'
    ) {
        return value;
    }

    return null;
}

function readCustomerLevel(value: unknown): CustomerLevel {
    if (
        value === 'BRONZE' ||
        value === 'PRATA' ||
        value === 'OURO' ||
        value === 'DIAMANTE'
    ) {
        return value;
    }

    return 'BRONZE';
}

function resolveDescription(
    appt: AppointmentItem,
    services: ServiceOption[]
): string {
    const serviceId = readNullableString(appt.serviceId);

    if (serviceId) {
        const service = services.find((s) => s.id === serviceId);
        if (service?.name) return service.name;
    }

    return readString(appt.description) || 'Serviço não informado';
}

function mapToProfessionalAppointment(
    appt: AppointmentItem,
    services: ServiceOption[],
    forcedUnitId?: string
): ProfessionalAppointmentRowItem {
    return {
        id: String(appt.id ?? ''),
        unitId: readString(appt.unitId) || String(forcedUnitId ?? ''),
        clientId: readString(appt.clientId),
        clientName: readString(appt.clientName) || 'Cliente não informado',
        phone: readString(appt.phone) || '—',
        clientLevel: readCustomerLevel(appt.clientLevel),
        description: resolveDescription(appt, services),
        scheduleAt: appt.scheduleAt,
        status: readStatus(appt.status),
        confirmationStatus: readConfirmationStatus(appt.confirmationStatus),
        professionalId: readNullableString(appt.professionalId),
        serviceId: readNullableString(appt.serviceId),
    };
}

export default function ProfessionalAppointmentsResponsiveList({
    groups,
    forcedUnitId,
    units,
    clients,
    professionals,
    services,
    breakpointPx = 768,
}: ProfessionalAppointmentsResponsiveListProps) {
    const isDesktop = useIsDesktop(breakpointPx);

    return (
        <section className="space-y-4">
            {groups.map((group) => {
                const initials = getInitials(group.professionalName);

                return (
                    <div
                        key={group.key}
                        className="overflow-hidden rounded-xl border border-border-primary bg-background-tertiary"
                    >
                        <div className="flex flex-col gap-1 border-b border-border-primary bg-muted/40 px-4 py-3 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-primary bg-background-secondary text-[11px] font-medium text-content-secondary">
                                    {group.professionalImageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={group.professionalImageUrl}
                                            alt={group.professionalName}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <span>{initials || '?'}</span>
                                    )}
                                </div>

                                <div className="flex flex-col">
                                    <h2 className="text-label-large text-content-primary">
                                        {group.professionalName}
                                    </h2>
                                    <p className="text-paragraph-small text-content-secondary">
                                        Agendamento(s):{' '}
                                        {group.appointments.length}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {group.appointments.length === 0 ? (
                            <div className="p-6 text-center text-paragraph-small text-content-secondary">
                                Nenhum agendamento para este profissional.
                            </div>
                        ) : isDesktop ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border-primary text-content-secondary">
                                            <th className="px-4 py-3 text-left font-medium">
                                                Hora
                                            </th>
                                            <th className="px-4 py-3 text-left font-medium">
                                                Cliente
                                            </th>
                                            <th className="px-4 py-3 text-left font-medium">
                                                Nível
                                            </th>
                                            <th className="px-4 py-3 text-left font-medium">
                                                Telefone
                                            </th>
                                            <th className="px-4 py-3 text-left font-medium">
                                                Serviço
                                            </th>
                                            <th className="px-4 py-3 text-left font-medium">
                                                Status
                                            </th>
                                            <th className="px-4 py-3 text-left font-medium">
                                                Confirmação
                                            </th>
                                            <th className="px-4 py-3 text-right font-medium">
                                                Ações
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {group.appointments.map((appt) => (
                                            <ProfessionalAppointmentRow
                                                key={appt.id}
                                                appt={mapToProfessionalAppointment(
                                                    appt,
                                                    services,
                                                    forcedUnitId
                                                )}
                                                forcedUnitId={
                                                    forcedUnitId ?? null
                                                }
                                                units={units}
                                                clients={clients}
                                                professionals={professionals}
                                                services={services}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="divide-y divide-border-primary/60">
                                {group.appointments.map((appt) => (
                                    <ProfessionalAppointmentRowMobile
                                        key={appt.id}
                                        appt={mapToProfessionalAppointment(
                                            appt,
                                            services,
                                            forcedUnitId
                                        )}
                                        forcedUnitId={forcedUnitId ?? null}
                                        units={units}
                                        clients={clients}
                                        professionals={professionals}
                                        services={services}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </section>
    );
}
