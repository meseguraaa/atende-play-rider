// src/app/api/professional/calendar/feed/[professionalId]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function escapeIcsText(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function formatDateUtc(date: Date): string {
    return (
        [
            date.getUTCFullYear(),
            pad(date.getUTCMonth() + 1),
            pad(date.getUTCDate()),
        ].join('') +
        'T' +
        [
            pad(date.getUTCHours()),
            pad(date.getUTCMinutes()),
            pad(date.getUTCSeconds()),
        ].join('') +
        'Z'
    );
}

function buildUid(appointmentId: string) {
    return `appointment-${appointmentId}@atendeplay.com`;
}

export async function GET(
    request: Request,
    context: { params: Promise<{ professionalId: string }> }
) {
    try {
        const { professionalId } = await context.params;

        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token')?.trim();

        if (!token) {
            return new NextResponse('Token inválido', { status: 401 });
        }

        const professional = await prisma.professional.findUnique({
            where: { id: professionalId },
            select: {
                id: true,
                name: true,
                calendarSyncToken: true,
            },
        });

        if (!professional || professional.calendarSyncToken !== token) {
            return new NextResponse('Acesso negado', { status: 403 });
        }

        const appointments = await prisma.appointment.findMany({
            where: {
                professionalId,
            },
            select: {
                id: true,
                scheduleAt: true,
                status: true,
                clientName: true,
                description: true,
                locationType: true,

                service: { select: { name: true, durationMinutes: true } },

                unit: {
                    select: {
                        name: true,
                        address: true,
                        street: true,
                        number: true,
                        complement: true,
                        neighborhood: true,
                        city: true,
                        state: true,
                    },
                },

                clientAddress: {
                    select: {
                        label: true,
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
            orderBy: {
                scheduleAt: 'asc',
            },
        });

        const events: string[] = [];

        for (const appt of appointments) {
            const start = new Date(appt.scheduleAt);
            const end = new Date(
                start.getTime() + (appt.service?.durationMinutes ?? 30) * 60000
            );

            const summary = escapeIcsText(
                `${appt.service?.name ?? 'Agendamento'}`
            );

            const unitAddressParts = [
                appt.unit?.address,
                [appt.unit?.street, appt.unit?.number]
                    .filter(Boolean)
                    .join(', '),
                appt.unit?.complement,
                appt.unit?.neighborhood,
                [appt.unit?.city, appt.unit?.state].filter(Boolean).join(' - '),
            ]
                .map((item) => String(item ?? '').trim())
                .filter(Boolean);

            const unitLocationText = [appt.unit?.name, ...unitAddressParts]
                .map((item) => String(item ?? '').trim())
                .filter(Boolean)
                .join(' - ');

            const clientAddressParts = [
                [appt.clientAddress?.street, appt.clientAddress?.number]
                    .filter(Boolean)
                    .join(', '),
                appt.clientAddress?.complement,
                appt.clientAddress?.neighborhood,
                [appt.clientAddress?.city, appt.clientAddress?.state]
                    .filter(Boolean)
                    .join(' - '),
                appt.clientAddress?.reference
                    ? `Referência: ${appt.clientAddress.reference}`
                    : '',
            ]
                .map((item) => String(item ?? '').trim())
                .filter(Boolean);

            const clientLocationText = [
                appt.clientAddress?.label,
                ...clientAddressParts,
            ]
                .map((item) => String(item ?? '').trim())
                .filter(Boolean)
                .join(' - ');

            const isClientAddress = appt.locationType === 'CLIENT_ADDRESS';

            const locationText = isClientAddress
                ? clientLocationText ||
                  appt.clientAddress?.label ||
                  'Endereço do cliente'
                : unitLocationText || appt.unit?.name || 'AtendePlay';

            const descriptionLines = [
                `Cliente: ${appt.clientName}`,
                appt.service?.name ? `Serviço: ${appt.service.name}` : '',
                isClientAddress
                    ? 'Local: Atendimento no endereço do cliente'
                    : appt.unit?.name
                      ? `Local: ${appt.unit.name}`
                      : 'Local: AtendePlay',
                isClientAddress && clientLocationText
                    ? `Endereço: ${clientLocationText}`
                    : !isClientAddress && unitLocationText
                      ? `Endereço: ${unitLocationText}`
                      : '',
                appt.description ? `Observações: ${appt.description}` : '',
            ].filter(Boolean);

            const description = escapeIcsText(descriptionLines.join('\n'));
            const location = escapeIcsText(locationText);

            const status =
                appt.status === 'CANCELED' ? 'CANCELLED' : 'CONFIRMED';

            const lines = [
                'BEGIN:VEVENT',
                `UID:${buildUid(appt.id)}`,
                `DTSTAMP:${formatDateUtc(new Date())}`,
                `DTSTART:${formatDateUtc(start)}`,
                `DTEND:${formatDateUtc(end)}`,
                `SUMMARY:${summary}`,
                `DESCRIPTION:${description}`,
                `LOCATION:${location}`,
                `STATUS:${status}`,
                'END:VEVENT',
            ];

            events.push(lines.join('\r\n'));
        }

        const calendar = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'CALSCALE:GREGORIAN',
            'PRODID:-//AtendePlay//Professional Calendar//PT-BR',
            `X-WR-CALNAME:Agenda - ${escapeIcsText(professional.name)}`,
            ...events,
            'END:VCALENDAR',
        ].join('\r\n');

        return new NextResponse(calendar, {
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
            },
        });
    } catch (error) {
        console.error('[calendar][professional][feed][error]', error);

        return new NextResponse('Erro ao gerar calendário', {
            status: 500,
        });
    }
}
