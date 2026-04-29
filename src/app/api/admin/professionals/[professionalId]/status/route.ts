// src/app/api/admin/professionals/[professionalId]/status/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

async function sanitizeUnitScope(params: {
    companyId: string;
    activeUnitId: string | null;
}) {
    const { companyId, activeUnitId } = params;
    if (!activeUnitId) return null;

    const belongs = await prisma.unit.findFirst({
        where: { id: activeUnitId, companyId },
        select: { id: true },
    });

    return belongs ? activeUnitId : null;
}

type RouteContext = {
    params: Promise<{
        professionalId: string;
    }>;
};

export async function PATCH(request: NextRequest, ctx: RouteContext) {
    try {
        const session = await requireAdminForModule('PROFESSIONALS');
        const companyId = session.companyId;

        const rawActiveUnitId = String(session.unitId ?? '').trim();
        const activeUnitId = await sanitizeUnitScope({
            companyId,
            activeUnitId: rawActiveUnitId || null,
        });

        const { professionalId } = await ctx.params;
        const id = String(professionalId ?? '').trim();

        if (!id) {
            return jsonErr('professionalId é obrigatório.', 400);
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            body = null;
        }

        const isActive = (body as any)?.isActive;
        if (typeof isActive !== 'boolean') {
            return jsonErr('Campo "isActive" deve ser boolean.', 400);
        }

        const exists = await prisma.professional.findFirst({
            where: {
                id,
                companyId,
                ...(activeUnitId
                    ? {
                          units: {
                              some: {
                                  companyId,
                                  unitId: activeUnitId,
                                  isActive: true,
                              },
                          },
                      }
                    : {}),
            },
            select: { id: true },
        });

        if (!exists) {
            return jsonErr('Profissional não encontrado.', 404);
        }

        await prisma.professional.update({
            where: { id },
            data: { isActive },
        });

        return jsonOk({ id, isActive });
    } catch {
        return jsonErr('Não autorizado.', 401);
    }
}
