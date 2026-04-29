import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getCurrentPainelUser } from '@/lib/painel-session';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET() {
    try {
        const session = await getCurrentPainelUser();

        if (!session || session.role !== 'ADMIN') {
            return jsonError('Não autorizado.', 401);
        }

        const userId = String((session as any).sub || '').trim();
        const companyId = String((session as any).companyId || '').trim();

        if (!userId || !companyId) {
            return jsonError('Sessão inválida.', 401);
        }

        const membership = await prisma.companyMember.findFirst({
            where: {
                userId,
                companyId,
                isActive: true,
                role: { in: ['OWNER', 'ADMIN'] },
            },
            select: { role: true },
        });

        if (!membership?.role) {
            return jsonError('Sem permissão.', 403);
        }

        const pendingCheckoutsCount = await prisma.order.count({
            where: {
                companyId,
                status: {
                    in: ['PENDING', 'PENDING_CHECKIN'],
                },
            },
        });

        return NextResponse.json({
            ok: true,
            pendingCheckoutsCount,
        });
    } catch (error) {
        console.error('[admin/checkout/pending-count][GET]', error);
        return jsonError('Erro interno ao buscar contador.', 500);
    }
}
