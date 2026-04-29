// src/app/api/internal/jobs/customer-levels/monthly/route.ts
import { NextResponse } from 'next/server';

import { runMonthlyCustomerLevelsJob } from '@/jobs/customer-levels/run-monthly-customer-levels';

function jsonErr(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * Chamada por CRON.
 * Segurança: exige token via header "x-cron-token" ou query ?token=
 * Configure CRON_TOKEN no .env.production (e no servidor).
 *
 * Query params:
 * - companyId (opcional): roda só para 1 empresa (debug controlado)
 * - mode (opcional): "skip" (default) ou "upsert" (força recomputar)
 */
export async function POST(request: Request) {
    try {
        const url = new URL(request.url);

        const headerToken = request.headers.get('x-cron-token')?.trim();
        const queryToken = url.searchParams.get('token')?.trim();
        const token = headerToken || queryToken;

        const expected = process.env.CRON_TOKEN?.trim();
        if (!expected)
            return jsonErr('CRON_TOKEN não configurado no servidor.', 500);

        if (!token || token !== expected)
            return jsonErr('Não autorizado.', 401);

        const onlyCompanyId =
            url.searchParams.get('companyId')?.trim() || undefined;

        const modeParam = url.searchParams.get('mode')?.trim();
        const mode = (modeParam === 'upsert' ? 'upsert' : 'skip') as
            | 'upsert'
            | 'skip';

        const result = await runMonthlyCustomerLevelsJob({
            onlyCompanyId,
            mode,
        });

        return NextResponse.json(result, { status: 200 });
    } catch (err: any) {
        console.error('[customer-levels][api] failed', err);
        return jsonErr('Falha ao executar job de customer levels.', 500);
    }
}
