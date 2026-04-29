// src/app/professional/dashboard/professional-appointments-client.tsx
'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

import type {
    UnitOption,
    ClientOption,
    ProfessionalOption,
    ServiceOption,
} from '@/components/admin/appointment/edit-appointment-dialog/edit-appointment-dialog';

import ProfessionalNewAppointmentDialog from '@/components/professional/professional-new-appointment-dialog/professional-new-appointment-dialog';

import ProfessionalAppointmentsResponsiveList, {
    type AppointmentItem,
    type AppointmentsGroup,
} from '@/components/professional/professional-appointments-responsive-list/professional-appointments-responsive-list';

export type UnitPickerOption = {
    id: string;
    name: string;
};

export type ProfessionalAppointmentsClientProps = {
    date?: string;
    unitId: string;
    professionalId: string;
    calendarSyncUrl?: string | null;

    units: UnitPickerOption[];
    professionals: ProfessionalOption[];
    services: ServiceOption[];
    clients: ClientOption[];
    appointments: AppointmentItem[];
};

function safeLocaleCompare(a: string, b: string): number {
    try {
        return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
    } catch {
        return a.localeCompare(b);
    }
}

function SyncCalendarDialog({ calendarSyncUrl }: { calendarSyncUrl: string }) {
    const [copied, setCopied] = React.useState(false);

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(calendarSyncUrl);
            setCopied(true);

            window.setTimeout(() => {
                setCopied(false);
            }, 2000);
        } catch {
            setCopied(false);
        }
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="brand">Sincronizar com minha agenda</Button>
            </DialogTrigger>

            <DialogContent
                variant="appointment"
                overlayVariant="blurred"
                showCloseButton
                className="w-[calc(100vw-2rem)] max-w-2xl overflow-x-hidden"
            >
                <DialogHeader>
                    <DialogTitle size="modal">
                        Sincronizar com minha agenda
                    </DialogTitle>
                    <DialogDescription size="modal" className="pr-8">
                        Copie o link abaixo para assinar sua agenda do
                        AtendePlay no calendário do seu celular ou computador.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 min-w-0">
                    <div className="min-w-0 rounded-xl border border-border-primary bg-background-secondary p-3">
                        <p className="w-full min-w-0 wrap-break-word text-sm text-content-secondary">
                            {calendarSyncUrl}
                        </p>
                    </div>

                    <div className="space-y-4 min-w-0">
                        <div className="min-w-0 rounded-xl border border-border-primary bg-background-secondary p-3 space-y-1">
                            <p className="text-sm font-medium text-content-primary">
                                iPhone / Apple Calendar
                            </p>
                            <p className="w-full min-w-0 wrap-break-word text-xs text-content-secondary">
                                Copie o link e adicione uma agenda assinada no
                                app Calendário.
                            </p>
                        </div>

                        <div className="min-w-0 rounded-xl border border-border-primary bg-background-secondary p-3 space-y-1">
                            <p className="text-sm font-medium text-content-primary">
                                Google Agenda
                            </p>
                            <p className="w-full min-w-0 wrap-break-word text-xs text-content-secondary">
                                Copie o link e adicione uma agenda por URL na
                                sua conta do Google Calendar.
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button
                            type="button"
                            variant="brand"
                            onClick={handleCopy}
                        >
                            {copied ? 'Link copiado!' : 'Copiar link da agenda'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function ProfessionalAppointmentsClient({
    date, // mantido por compatibilidade
    unitId,
    professionalId,
    calendarSyncUrl,
    units,
    professionals,
    services,
    clients,
    appointments,
}: ProfessionalAppointmentsClientProps) {
    const groups = React.useMemo<AppointmentsGroup[]>(() => {
        const myProfessional =
            professionals.find((p) => p.id === professionalId) ?? null;

        const professionalName = myProfessional?.name ?? 'Profissional';
        const professionalImageUrl =
            (myProfessional as { imageUrl?: string | null } | null)?.imageUrl ??
            null;

        const groupKey = professionalId || 'no-professional';

        const result: AppointmentsGroup[] = [
            {
                key: groupKey,
                professionalId: professionalId || null,
                professionalName,
                professionalImageUrl,
                appointments: [...appointments],
            },
        ];

        result.sort((a, b) =>
            safeLocaleCompare(a.professionalName, b.professionalName)
        );

        for (const group of result) {
            group.appointments.sort(
                (a: AppointmentItem, b: AppointmentItem) => {
                    const timeA = new Date(a.scheduleAt).getTime();
                    const timeB = new Date(b.scheduleAt).getTime();
                    return timeA - timeB;
                }
            );
        }

        return result;
    }, [appointments, professionals, professionalId]);

    const unitOptions = React.useMemo<UnitOption[]>(
        () => units.map((unit) => ({ id: unit.id, name: unit.name })),
        [units]
    );

    return (
        <section className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-title text-content-primary">
                        Agendamentos do dia
                    </h2>
                    <p className="text-paragraph-medium-size text-content-secondary">
                        Visualize sua agenda organizada por horário.
                    </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    {calendarSyncUrl ? (
                        <SyncCalendarDialog calendarSyncUrl={calendarSyncUrl} />
                    ) : null}

                    <ProfessionalNewAppointmentDialog
                        forcedUnitId={unitId}
                        forcedProfessionalId={professionalId}
                        units={unitOptions}
                        clients={clients}
                        professionals={professionals}
                        services={services}
                    >
                        <Button variant="brand">Agendar</Button>
                    </ProfessionalNewAppointmentDialog>
                </div>
            </div>

            <ProfessionalAppointmentsResponsiveList
                groups={groups}
                forcedUnitId={unitId}
                forcedProfessionalId={professionalId}
                units={unitOptions}
                clients={clients}
                professionals={professionals}
                services={services}
            />
        </section>
    );
}
