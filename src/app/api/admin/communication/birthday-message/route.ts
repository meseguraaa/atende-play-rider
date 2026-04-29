import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';

function jsonError(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
    const session = await requireAdminForModuleApi('COMMUNICATION');
    if (session instanceof NextResponse) return session;

    const companyId = String(session.companyId ?? '').trim();
    if (!companyId) {
        return jsonError('Empresa não encontrada na sessão.', 401);
    }

    const formData = await request.formData().catch(() => null);
    const message = String(formData?.get('message') ?? '').trim();

    if (!message) {
        return jsonError('A mensagem de aniversário é obrigatória.');
    }

    const settings = await prisma.companyCommunicationSettings.findUnique({
        where: { companyId },
        select: {
            id: true,
            birthdayMessageEnabled: true,
        },
    });

    if (!settings?.id) {
        return jsonError('Configuração de comunicação não encontrada.', 404);
    }

    if (!settings.birthdayMessageEnabled) {
        return jsonError(
            'A automação de aniversário não está habilitada para esta empresa.',
            403
        );
    }

    await prisma.companyCommunicationSettings.update({
        where: { companyId },
        data: {
            birthdayMessageContent: message,
        },
    });

    return NextResponse.json({ ok: true });
}
