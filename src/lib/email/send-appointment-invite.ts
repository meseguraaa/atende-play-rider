import { Resend } from 'resend';

import { prisma } from '@/lib/prisma';
import { maybeGenerateAppointmentInvite } from '../calendar/maybe-generate-appointment-invite';

function normalizeString(value: unknown): string {
    return String(value ?? '').trim();
}

function getPublicAppOrigin() {
    return normalizeString(
        process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL
    );
}

function buildAbsoluteInviteUrl(inviteUrl: string) {
    const origin = getPublicAppOrigin();
    if (!origin) return inviteUrl;

    return `${origin.replace(/\/+$/, '')}/${inviteUrl.replace(/^\/+/, '')}`;
}

const resend = new Resend(process.env.RESEND_API_KEY);

export type SendAppointmentInviteEmailResult = {
    step:
        | 'START'
        | 'INVITE_SKIPPED'
        | 'NO_APPOINTMENT'
        | 'NO_EMAIL'
        | 'SENT'
        | 'ERROR';
    email: string | null;
    message: string | null;
};

export async function sendAppointmentInviteEmail(
    appointmentId: string
): Promise<SendAppointmentInviteEmailResult> {
    const invite = await maybeGenerateAppointmentInvite(appointmentId);

    if (
        !invite.shouldSend ||
        !invite.inviteUrl ||
        !invite.icsContent ||
        !invite.icsFileName
    ) {
        return {
            step: 'INVITE_SKIPPED',
            email: null,
            message: null,
        };
    }

    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
            clientName: true,
            scheduleAt: true,
            locationType: true,

            client: {
                select: {
                    email: true,
                },
            },

            service: {
                select: {
                    name: true,
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
                },
            },

            clientAddress: {
                select: {
                    label: true,
                },
            },
        },
    });

    if (!appointment) {
        return {
            step: 'NO_APPOINTMENT',
            email: null,
            message: 'Appointment não encontrado.',
        };
    }

    const email = normalizeString(appointment.client?.email);

    if (!email) {
        return {
            step: 'NO_EMAIL',
            email: null,
            message: 'Cliente sem email cadastrado.',
        };
    }

    const inviteUrl = buildAbsoluteInviteUrl(invite.inviteUrl);

    const subject = 'Seu agendamento foi confirmado 📅';

    const locationText =
        appointment.locationType === 'CLIENT_ADDRESS'
            ? appointment.clientAddress?.label?.trim() || 'Endereço do cliente'
            : appointment.unit?.name?.trim() || 'Unidade';

    const text = `
Olá${appointment.clientName ? `, ${appointment.clientName}` : ''}!

Seu agendamento foi confirmado.

Resumo do agendamento:
- Serviço: ${appointment.service?.name ?? '-'}
- Profissional: ${appointment.professional?.name ?? '-'}
- Data: ${new Date(appointment.scheduleAt).toLocaleString('pt-BR')}
- Local: ${locationText}

Neste email você recebeu um convite de calendário em anexo (.ics).
Ao abrir o anexo, seu app de calendário poderá adicionar o evento e, em alguns casos, tratá-lo como um convite de reunião.

Link do invite:
${inviteUrl}

AtendePlay
`;

    try {
        const result = await resend.emails.send({
            from: 'AtendePlay <naoresponda@atendeplay.com.br>',
            to: [email],
            subject,
            text,
            attachments: [
                {
                    filename: invite.icsFileName,
                    content: Buffer.from(invite.icsContent).toString('base64'),
                    contentType: 'text/calendar; charset=utf-8; method=REQUEST',
                },
            ],
        });

        if (result.error) {
            return {
                step: 'ERROR',
                email,
                message: result.error.message ?? 'Erro ao enviar email',
            };
        }

        return {
            step: 'SENT',
            email,
            message: result.data?.id ?? 'Email enviado.',
        };
    } catch (error: any) {
        return {
            step: 'ERROR',
            email,
            message: error?.message ?? 'Erro ao enviar email',
        };
    }
}
