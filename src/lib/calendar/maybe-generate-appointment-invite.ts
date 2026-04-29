import { createHmac } from 'crypto';

import { prisma } from '@/lib/prisma';
import { buildAppointmentCalendarEvent } from './build-appointment-calendar-event';
import { generateIcs } from './generate-ics';

function getInviteSecret() {
    return String(process.env.CALENDAR_INVITE_TOKEN_SECRET ?? '').trim();
}

function buildInviteToken(appointmentId: string) {
    const secret = getInviteSecret();
    if (!secret) return '';

    return createHmac('sha256', secret).update(appointmentId).digest('hex');
}

export type MaybeGenerateAppointmentInviteResult = {
    shouldSend: boolean;
    inviteUrl: string | null;
    icsContent: string | null;
    icsFileName: string | null;
};

export async function maybeGenerateAppointmentInvite(
    appointmentId: string
): Promise<MaybeGenerateAppointmentInviteResult> {
    console.log('[calendar][invite][ENTRY]', { appointmentId });

    const fullAppointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            clientName: true,
            description: true,
            scheduleAt: true,
            locationType: true,

            company: {
                select: {
                    name: true,
                },
            },

            client: {
                select: {
                    email: true,
                },
            },

            service: {
                select: {
                    name: true,
                    durationMinutes: true,
                },
            },

            professional: {
                select: {
                    name: true,
                },
            },

            unit: {
                select: {
                    name: true,
                    cep: true,
                    street: true,
                    number: true,
                    complement: true,
                    neighborhood: true,
                    city: true,
                    state: true,
                    address: true,
                },
            },

            clientAddress: {
                select: {
                    label: true,
                    cep: true,
                    street: true,
                    number: true,
                    complement: true,
                    neighborhood: true,
                    city: true,
                    state: true,
                    reference: true,
                },
            },
        },
    });

    if (!fullAppointment) {
        return {
            shouldSend: false,
            inviteUrl: null,
            icsContent: null,
            icsFileName: null,
        };
    }

    const event = buildAppointmentCalendarEvent({
        id: fullAppointment.id,
        clientName: fullAppointment.clientName,
        clientEmail: fullAppointment.client?.email ?? null,

        description: fullAppointment.description,
        scheduleAt: fullAppointment.scheduleAt,
        locationType: fullAppointment.locationType,

        service: fullAppointment.service,
        professional: fullAppointment.professional,
        unit: fullAppointment.unit,
        clientAddress: fullAppointment.clientAddress,

        organizerName: fullAppointment.company.name ?? 'AtendePlay',
        organizerEmail: 'naoresponda@atendeplay.com.br',

        // 🔐 Por enquanto ainda sem persistência própria no banco.
        // Quando criarmos os campos, é aqui que eles entram.
        calendarInviteUid: `appointment-${fullAppointment.id}@atendeplay.com`,
        calendarInviteSequence: Math.floor(Date.now() / 1000),
    });

    // 🎯 regra do MVP
    if (!event.shouldSendToClient) {
        return {
            shouldSend: false,
            inviteUrl: null,
            icsContent: null,
            icsFileName: null,
        };
    }

    const { content, fileName } = generateIcs({
        event,
        companyName: fullAppointment.company.name,
    });

    const token = buildInviteToken(fullAppointment.id);

    const inviteUrl = `/api/public/calendar/invite/${fullAppointment.id}?token=${token}`;

    console.log('[calendar][invite][generated]', {
        appointmentId,
        size: content.length,
        inviteUrl,
    });

    return {
        shouldSend: true,
        inviteUrl,
        icsContent: content,
        icsFileName: fileName,
    };
}
