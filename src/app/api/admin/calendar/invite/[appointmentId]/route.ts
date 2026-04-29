import { NextResponse } from 'next/server';

import { buildAppointmentCalendarEvent } from '@/lib/calendar/build-appointment-calendar-event';
import { generateIcs } from '@/lib/calendar/generate-ics';
import { prisma } from '@/lib/prisma';

function jsonErr(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeString(value: unknown): string {
    return String(value ?? '').trim();
}

export async function GET(
    _request: Request,
    context: { params: Promise<{ appointmentId: string }> }
) {
    try {
        const { appointmentId } = await context.params;
        const cleanAppointmentId = normalizeString(appointmentId);

        if (!cleanAppointmentId) {
            return jsonErr('Agendamento inválido.', 400);
        }

        const appointment = await prisma.appointment.findUnique({
            where: {
                id: cleanAppointmentId,
            },
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

        if (!appointment) {
            return jsonErr('Agendamento não encontrado.', 404);
        }

        const event = buildAppointmentCalendarEvent({
            id: appointment.id,
            clientName: appointment.clientName,
            description: appointment.description,
            scheduleAt: appointment.scheduleAt,
            locationType: appointment.locationType,
            service: appointment.service,
            professional: appointment.professional,
            unit: appointment.unit,
            clientAddress: appointment.clientAddress,
        });

        if (!event.shouldSendToClient) {
            return jsonErr(
                'Este invite só é gerado para atendimentos no endereço do cliente.',
                400
            );
        }

        const { content, fileName } = generateIcs({
            event,
            companyName: appointment.company.name,
        });

        return new NextResponse(content, {
            status: 200,
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('[calendar/invite][GET] error:', error);
        return jsonErr('Não foi possível gerar o invite de calendário.', 500);
    }
}
