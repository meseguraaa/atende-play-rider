'use client';

import * as React from 'react';
import AdminEditAppointmentDialog, {
    type AppointmentToEdit,
    type UnitOption,
    type ClientOption,
    type ProfessionalOption,
    type ServiceOption,
} from '@/components/admin/appointment/edit-appointment-dialog/edit-appointment-dialog';

type Props = {
    children?: React.ReactNode;
    appt: AppointmentToEdit;
    forcedUnitId?: string | null;
    forcedProfessionalId?: string | null;
    units?: UnitOption[];
    clients?: ClientOption[];
    professionals?: ProfessionalOption[];
    services?: ServiceOption[];
};

export type {
    AppointmentToEdit,
    UnitOption,
    ClientOption,
    ProfessionalOption,
    ServiceOption,
};

export default function ProfessionalEditAppointmentDialog({
    children,
    appt,
    forcedUnitId = null,
    forcedProfessionalId = null,
    units = [],
    clients = [],
    professionals = [],
    services = [],
}: Props) {
    return (
        <AdminEditAppointmentDialog
            appt={appt}
            forcedUnitId={forcedUnitId}
            forcedProfessionalId={forcedProfessionalId}
            apiNamespace="professional"
            units={units}
            clients={clients}
            professionals={professionals}
            services={services}
        >
            {children}
        </AdminEditAppointmentDialog>
    );
}
