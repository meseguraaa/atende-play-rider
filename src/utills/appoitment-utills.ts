import {
    Appointment,
    AppointmentPeriod,
    AppointmentPeriodDay,
} from '@/types/appointment';

interface AppointmentPrisma {
    id: string;
    petName: string;
    description: string;
    tutorName: string;
    phone: string;
    scheduleAt: Date;
}

/* ===== Helpers de timezone (São Paulo) ===== */

const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';

function getSaoPauloHour(date: Date): number {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: SAO_PAULO_TIMEZONE,
        hour: 'numeric',
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');

    // fallback só por segurança
    if (!hourPart) {
        const raw = date.getUTCHours() - 3; // SP geralmente UTC-3
        return ((raw % 24) + 24) % 24;
    }

    return Number(hourPart.value);
}

function formatTimeSaoPaulo(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: SAO_PAULO_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

/* ===== Periodização (manhã / tarde / noite) ===== */

export const getPeriod = (hour: number): AppointmentPeriodDay => {
    if (hour >= 9 && hour < 12) return 'morning';
    if (hour >= 13 && hour < 18) return 'afternoon';
    return 'evening';
};

export function groupAppointmentByPeriod(
    appointments: AppointmentPrisma[]
): AppointmentPeriod[] {
    const transformedAppointments: Appointment[] = appointments?.map((apt) => {
        // Hora já convertida para fuso de São Paulo
        const saoPauloHour = getSaoPauloHour(apt.scheduleAt);

        return {
            ...apt,
            time: formatTimeSaoPaulo(apt.scheduleAt), // mostra 09:00 certinho
            service: apt.description,
            period: getPeriod(saoPauloHour), // classifica usando hora de São Paulo
        };
    });

    const morningAppointments = transformedAppointments.filter(
        (apt) => apt.period === 'morning'
    );
    const afternoonAppointments = transformedAppointments.filter(
        (apt) => apt.period === 'afternoon'
    );
    const eveningAppointments = transformedAppointments.filter(
        (apt) => apt.period === 'evening'
    );

    return [
        {
            title: 'Manhã',
            type: 'morning',
            timeRange: '09h-12h',
            appointments: morningAppointments,
        },
        {
            title: 'Tarde',
            type: 'afternoon',
            timeRange: '13h-18h',
            appointments: afternoonAppointments,
        },
        {
            title: 'Noite',
            type: 'evening',
            // se quiser alinhar com a lógica e cobrir 18h também, pode mudar para '18h-21h'
            timeRange: '19h-21h',
            appointments: eveningAppointments,
        },
    ];
}
