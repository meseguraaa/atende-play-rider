// src/app/api/admin/finance/expenses/[expenseId]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}
function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

type DeleteExpenseResponse =
    | {
          ok: true;
          data: {
              deleted: boolean;
              deletedCount: number;
              mode: 'single' | 'series';
          };
      }
    | { ok: false; error: string };

export async function DELETE(
    _req: Request,
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

    // 🔒 Carrega a despesa e valida ownership por company
    const expense = await prisma.expense.findFirst({
        where: { id, companyId },
        select: {
            id: true,
            companyId: true,
            unitId: true,
            description: true,
            category: true,
            amount: true,
            dueDate: true,
            isRecurring: true,
        },
    });

    if (!expense) return jsonErr('expense_not_found', 404);

    // 🔒 Permissão por unidade (alinhada com o POST):
    // - Se session.canSeeAllUnits = true, pode deletar em qualquer unidade da empresa.
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

    try {
        const result = await prisma.$transaction(async (tx) => {
            if (!expense.isRecurring) {
                // ✅ Deleta apenas esta despesa
                await tx.expense.delete({ where: { id: expense.id } });

                return {
                    deleted: true,
                    deletedCount: 1,
                    mode: 'single' as const,
                };
            }

            // ✅ Recorrente: deleta "deste mês em diante" (>= dueDate atual)
            // Sem tabela de template no schema, usamos uma assinatura prática da "série".
            const deletedMany = await tx.expense.deleteMany({
                where: {
                    companyId: expense.companyId,
                    unitId: expense.unitId,
                    isRecurring: true,
                    category: expense.category,
                    description: expense.description,
                    amount: expense.amount,
                    dueDate: { gte: expense.dueDate },
                },
            });

            return {
                deleted: deletedMany.count > 0,
                deletedCount: deletedMany.count,
                mode: 'series' as const,
            };
        });

        const payload: DeleteExpenseResponse = jsonOk(result) as any;
        return payload as any;
    } catch {
        return jsonErr('internal_error', 500);
    }
}
