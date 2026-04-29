// src/app/api/whatsapp/test-send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { normalizeWaPhone, whatsappSendText } from '@/lib/whatsapp-cloud';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/whatsapp/test-send?to=5511999999999&text=Oi%20Bruno
 * ⚠️ Endpoint de teste local. Não usar em produção.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);

    const toRaw = searchParams.get('to') || '';
    const text = searchParams.get('text') || 'Teste AtendePlay ✅';

    const to = normalizeWaPhone(toRaw);

    if (!to) {
        return NextResponse.json(
            { ok: false, error: 'Missing ?to= (ex: 5511999999999)' },
            { status: 400 }
        );
    }

    const result = await whatsappSendText({ to, text });

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
