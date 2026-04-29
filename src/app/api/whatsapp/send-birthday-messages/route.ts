import { NextResponse } from 'next/server';

import { sendBirthdayMessages } from '@/lib/whatsapp/send-birthday-messages';

function jsonError(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
    try {
        const internalSecret = request.headers.get('x-internal-secret') || '';

        if (
            !process.env.INTERNAL_API_SECRET ||
            internalSecret !== process.env.INTERNAL_API_SECRET
        ) {
            return jsonError('Não autorizado.', 401);
        }

        const result = await sendBirthdayMessages();

        return NextResponse.json({
            ok: true,
            data: result,
        });
    } catch (error) {
        console.error('[send-birthday-messages]', error);
        return jsonError('Erro ao processar envio de aniversários.', 500);
    }
}
