import { createHmac, timingSafeEqual } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { buildAppointmentCalendarEvent } from '@/lib/calendar/build-appointment-calendar-event';
import { generateIcs } from '@/lib/calendar/generate-ics';

function jsonErr(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeString(value: unknown): string {
    return String(value ?? '').trim();
}

function getInviteSecret() {
    return normalizeString(process.env.CALENDAR_INVITE_TOKEN_SECRET);
}

function buildInviteToken(appointmentId: string) {
    const secret = getInviteSecret();
    if (!secret) return '';

    return createHmac('sha256', secret).update(appointmentId).digest('hex');
}

function isValidInviteToken(appointmentId: string, token: string) {
    const expected = buildInviteToken(appointmentId);
    const received = normalizeString(token);

    if (!expected || !received) return false;
    if (expected.length !== received.length) return false;

    try {
        return timingSafeEqual(
            Buffer.from(expected, 'utf8'),
            Buffer.from(received, 'utf8')
        );
    } catch {
        return false;
    }
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ appointmentId: string }> }
) {
    try {
        const { appointmentId } = await context.params;
        const cleanAppointmentId = normalizeString(appointmentId);

        if (!cleanAppointmentId) {
            return jsonErr('Agendamento inválido.', 400);
        }

        const inviteToken = normalizeString(
            request.nextUrl.searchParams.get('token')
        );

        const secret = getInviteSecret();
        if (!secret) {
            console.error(
                '[public/calendar/invite][GET] missing CALENDAR_INVITE_TOKEN_SECRET'
            );
            return jsonErr('Invite indisponível no momento.', 500);
        }

        if (!isValidInviteToken(cleanAppointmentId, inviteToken)) {
            return jsonErr('Token de invite inválido.', 401);
        }

        const appointment = await prisma.appointment.findUnique({
            where: { id: cleanAppointmentId },
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
                'Este invite não está disponível para este tipo de agendamento.',
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
        console.error('[public/calendar/invite][GET] error:', error);
        return jsonErr('Não foi possível gerar o invite.', 500);
    }
}
