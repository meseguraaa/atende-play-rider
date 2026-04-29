// src/app/api/internal/jobs/customer-levels/monthly/inspect/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function jsonErr(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * Endpoint interno para INSPECIONAR o resultado do job.
 * Segurança: exige token via "x-cron-token" ou ?token=
 *
 * Uso:
 *   GET /api/internal/jobs/customer-levels/monthly/inspect?companyId=...&periodKey=2026-01&token=...
 */
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);

        const headerToken = request.headers.get('x-cron-token')?.trim();
        const queryToken = url.searchParams.get('token')?.trim();
        const token = headerToken || queryToken;

        const expected = process.env.CRON_TOKEN?.trim();
        if (!expected) return jsonErr('CRON_TOKEN não configurado.', 500);
        if (!token || token !== expected)
            return jsonErr('Não autorizado.', 401);

        const companyId = url.searchParams.get('companyId')?.trim();
        const periodKey = url.searchParams.get('periodKey')?.trim();

        if (!companyId) return jsonErr('companyId é obrigatório.', 400);
        if (!periodKey) return jsonErr('periodKey é obrigatório.', 400);

        const periods = await prisma.customerLevelPeriod.findMany({
            where: { companyId, periodKey },
            select: {
                unitId: true,
                userId: true,
                appointmentsDone: true,
                earnedLevel: true,
                computedAt: true,
            },
            orderBy: [{ userId: 'asc' }, { unitId: 'asc' }],
            take: 50,
        });

        const states = await prisma.customerLevelState.findMany({
            where: { companyId },
            select: {
                unitId: true,
                userId: true,
                levelCurrent: true,
                levelEarnedLastPeriod: true,
                levelEffectiveFrom: true,
                updatedAt: true,
            },
            orderBy: [{ userId: 'asc' }, { unitId: 'asc' }],
            take: 50,
        });

        return NextResponse.json(
            {
                ok: true,
                companyId,
                periodKey,
                periodsCount: periods.length,
                statesCount: states.length,
                periods,
                states,
            },
            { status: 200 }
        );
    } catch (err: any) {
        console.error('[customer-levels][inspect] failed', err);
        return jsonErr('Falha ao inspecionar resultados.', 500);
    }
}
