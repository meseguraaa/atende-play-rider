import { prisma } from '@/lib/prisma';
import { whatsappSendText } from '@/lib/whatsapp-cloud';
import { maybeGenerateAppointmentInvite } from '../calendar/maybe-generate-appointment-invite';

export type SendAppointmentInviteResult = {
    shouldSend: boolean;
    inviteUrl: string | null;
    message: string | null;
};

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

function buildAppointmentInviteMessage(inviteUrl: string): string {
    return ['📅 Adicione seu agendamento ao calendário:', inviteUrl].join('\n');
}

export async function handleAppointmentInvite(
    appointmentId: string
): Promise<SendAppointmentInviteResult> {
    console.log('[whatsapp][appointment-invite][start]', { appointmentId });

    const invite = await maybeGenerateAppointmentInvite(appointmentId);

    if (!invite.shouldSend || !invite.inviteUrl) {
        return {
            shouldSend: false,
            inviteUrl: null,
            message: null,
        };
    }

    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            phone: true,
        },
    });

    const absoluteInviteUrl = buildAbsoluteInviteUrl(invite.inviteUrl);
    const message = buildAppointmentInviteMessage(absoluteInviteUrl);
    const phone = normalizeString(appointment?.phone);

    if (!phone) {
        console.warn('[whatsapp][appointment-invite][missing-phone]', {
            appointmentId,
        });

        return {
            shouldSend: true,
            inviteUrl: absoluteInviteUrl,
            message,
        };
    }

    try {
        const sendResult = await whatsappSendText({
            to: phone,
            text: message,
        });

        if (!sendResult.ok) {
            console.error('[whatsapp][appointment-invite][send-failed]', {
                appointmentId,
                phone,
                error: sendResult.error,
                status: sendResult.status,
                raw: sendResult.raw,
            });
        } else {
            console.log('[whatsapp][appointment-invite][sent]', {
                appointmentId,
                phone,
                inviteUrl: absoluteInviteUrl,
                messageId: sendResult.messageId,
            });
        }
    } catch (error) {
        console.error('[whatsapp][appointment-invite][send-error]', {
            appointmentId,
            phone,
            error: String(error),
        });
    }

    return {
        shouldSend: true,
        inviteUrl: absoluteInviteUrl,
        message,
    };
}
