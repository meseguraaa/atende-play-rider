// src/app/api/admin/finance/expenses/[expenseId]/paid/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';

type Payload = {
    isPaid?: boolean; // se vier, seta; se não vier, faz toggle
};

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}
function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ expenseId: string }> }
) {
    // ✅ API gate: precisa estar logado e ter FINANCE
    const auth = await requireAdminForModuleApi('FINANCE');
    if (auth instanceof NextResponse) return auth;
    const session = auth as any;

    // 🔒 Hard lock multi-tenant
    const companyId: string | null = session?.companyId ?? null;
    if (!companyId) return jsonErr('missing_company', 403);

    // (opcional mas útil pra validar AdminUnitAccess)
    const userId: string | null = session?.userId ?? null;

    const { expenseId } = await ctx.params;
    const id = String(expenseId || '').trim();
    if (!id) return jsonErr('expense_id_required', 400);

    // body é opcional (toggle), então se vier inválido não explode
    let body: Payload | null = null;
    try {
        body = (await req.json()) as Payload;
    } catch {
        body = null;
    }

    // carrega despesa e valida tenant
    const expense = await prisma.expense.findFirst({
        where: { id, companyId },
        select: { id: true, unitId: true, isPaid: true },
    });

    if (!expense) return jsonErr('expense_not_found', 404);

    // 🔒 Permissão por unidade (alinhada com o POST/DELETE):
    // - Se session.canSeeAllUnits = true, pode atualizar em qualquer unidade da empresa.
    // - Caso contrário, valida via AdminUnitAccess (preferencial) e fallback no session.unitId.
    const canSeeAllUnits = !!session?.canSeeAllUnits;

    if (!canSeeAllUnits) {
        if (userId) {
            const access = await prisma.adminUnitAccess.findFirst({
                where: { companyId, userId, unitId: expense.unitId },
                select: { id: true },
            });

            if (!access?.id) {
                const adminUnitId: string | null = session?.unitId ?? null;
                if (!adminUnitId) return jsonErr('missing_admin_unit', 403);
                if (expense.unitId !== adminUnitId) {
                    return jsonErr('forbidden_unit', 403);
                }
            }
        } else {
            const adminUnitId: string | null = session?.unitId ?? null;
            if (!adminUnitId) return jsonErr('missing_admin_unit', 403);
            if (expense.unitId !== adminUnitId) {
                return jsonErr('forbidden_unit', 403);
            }
        }
    }

    const nextIsPaid =
        typeof body?.isPaid === 'boolean' ? body.isPaid : !expense.isPaid;

    try {
        const updated = await prisma.expense.update({
            where: { id: expense.id },
            data: { isPaid: nextIsPaid },
            select: { id: true, isPaid: true },
        });

        return jsonOk({ expenseId: updated.id, isPaid: updated.isPaid });
    } catch {
        return jsonErr('internal_error', 500);
    }
}
