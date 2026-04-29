// src/app/api/admin/finance/expenses/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';
import { endOfMonth, format, isValid, parse, startOfMonth } from 'date-fns';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CreateExpensePayload = {
    month: string; // "yyyy-MM"
    unitId: string; // obrigatório
    category?: string; // compat (string), default OTHER
    description: string;
    amount: number; // decimal (R$)
    isRecurring?: boolean;
    recurringDay?: number; // 1..31 (se recorrente)
    dueDate?: string; // "yyyy-MM-dd" (se NÃO recorrente)
};

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}
function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function parseMonthParam(month: string): Date | null {
    const parsed = parse(month, 'yyyy-MM', new Date());
    if (!isValid(parsed)) return null;
    return startOfMonth(parsed);
}

function parseDueDateParam(dueDate: string): Date | null {
    // espera "yyyy-MM-dd"
    const parsed = parse(dueDate, 'yyyy-MM-dd', new Date());
    if (!isValid(parsed)) return null;
    return parsed;
}

function clampDayToMonth(day: number, monthDate: Date): number {
    // regra combinada: se day=31 e mês não tem, ajusta pro último dia
    const last = endOfMonth(monthDate).getDate();
    if (day <= 1) return 1;
    if (day >= last) return last;
    return day;
}

function normalizeCategory(input?: string) {
    const v = String(input ?? 'OTHER')
        .trim()
        .toUpperCase();

    // Enum do schema: RENT | UTILITIES | TAXES | SUPPLIES | OTHER
    if (
        v === 'RENT' ||
        v === 'UTILITIES' ||
        v === 'TAXES' ||
        v === 'SUPPLIES' ||
        v === 'OTHER'
    ) {
        return v as 'RENT' | 'UTILITIES' | 'TAXES' | 'SUPPLIES' | 'OTHER';
    }

    return 'OTHER' as const;
}

export async function POST(req: Request) {
    // ✅ API gate: precisa estar logado e ter FINANCE
    const auth = await requireAdminForModuleApi('FINANCE');
    if (auth instanceof NextResponse) return auth;
    const session = auth as any;

    // 🔒 Hard lock multi-tenant
    const companyId: string | null = session?.companyId ?? null;
    if (!companyId) return jsonErr('missing_company', 403);

    // (opcional mas útil pra validar AdminUnitAccess)
    const userId: string | null = session?.userId ?? null;

    let body: CreateExpensePayload | null = null;
    try {
        body = (await req.json()) as CreateExpensePayload;
    } catch {
        return jsonErr('invalid_json', 400);
    }

    const month = String(body?.month || '').trim();
    const unitId = String(body?.unitId || '').trim();
    const description = String(body?.description || '').trim();

    const amountNum = Number(body?.amount);
    const isRecurring = Boolean(body?.isRecurring);

    const recurringDayRaw =
        body?.recurringDay != null ? Number(body.recurringDay) : undefined;

    const dueDateRaw =
        body?.dueDate != null ? String(body.dueDate).trim() : undefined;

    if (!month) return jsonErr('month_required', 400);
    const monthDate = parseMonthParam(month);
    if (!monthDate) return jsonErr('month_invalid', 400);

    // unitId é obrigatório aqui (UI bloqueia, mas a API blinda)
    if (!unitId || unitId === 'all') return jsonErr('unit_required', 400);

    if (!description) return jsonErr('description_required', 400);

    if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return jsonErr('amount_invalid', 400);
    }

    // ✅ fixa 2 casas só depois de validar
    const amountFixed = amountNum.toFixed(2); // Prisma Decimal aceita string

    // validações por modo
    if (isRecurring) {
        if (
            recurringDayRaw == null ||
            !Number.isFinite(recurringDayRaw) ||
            recurringDayRaw < 1 ||
            recurringDayRaw > 31
        ) {
            return jsonErr('recurring_day_invalid', 400);
        }
    } else {
        if (!dueDateRaw) return jsonErr('due_date_required', 400);
        const parsedDue = parseDueDateParam(dueDateRaw);
        if (!parsedDue) return jsonErr('due_date_invalid', 400);
    }

    // 🔒 Unit pertence à empresa e está ativa
    const unitOk = await prisma.unit.findFirst({
        where: { id: unitId, companyId, isActive: true },
        select: { id: true },
    });
    if (!unitOk) return jsonErr('unit_not_found', 404);

    // 🔒 Permissão por unidade (compatível com 2 modos):
    // - Se session.canSeeAllUnits = true, pode criar em qualquer unidade acessível da empresa.
    // - Caso contrário, valida via AdminUnitAccess (preferencial) e fallback no session.unitId.
    const canSeeAllUnits = !!session?.canSeeAllUnits;

    if (!canSeeAllUnits) {
        // Preferência: valida por AdminUnitAccess
        if (userId) {
            const access = await prisma.adminUnitAccess.findFirst({
                where: { companyId, userId, unitId },
                select: { id: true },
            });

            if (!access?.id) {
                // fallback compat: token preso numa única unidade
                const adminUnitId: string | null = session?.unitId ?? null;
                if (!adminUnitId) return jsonErr('missing_admin_unit', 403);
                if (unitId !== adminUnitId)
                    return jsonErr('forbidden_unit', 403);
            }
        } else {
            // sem userId não dá pra checar AdminUnitAccess
            const adminUnitId: string | null = session?.unitId ?? null;
            if (!adminUnitId) return jsonErr('missing_admin_unit', 403);
            if (unitId !== adminUnitId) return jsonErr('forbidden_unit', 403);
        }
    }

    const category = normalizeCategory(body?.category);

    // monta dueDate
    let dueDate: Date;

    if (isRecurring) {
        const dayClamped = clampDayToMonth(recurringDayRaw!, monthDate);
        dueDate = new Date(
            monthDate.getFullYear(),
            monthDate.getMonth(),
            dayClamped
        );
    } else {
        const parsed = parseDueDateParam(dueDateRaw!);
        if (!parsed) return jsonErr('due_date_invalid', 400);

        // blindagem leve: garante que cai dentro do mês selecionado
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        if (parsed < monthStart || parsed > monthEnd) {
            return jsonErr('due_date_out_of_month', 400);
        }

        dueDate = parsed;
    }

    try {
        // ✅ idempotência: se já existir igual, não cria de novo
        const result = await prisma.$transaction(async (tx) => {
            const existing = await tx.expense.findFirst({
                where: {
                    companyId,
                    unitId,
                    description,
                    category,
                    dueDate,
                    isRecurring,
                },
                select: { id: true },
            });

            if (existing?.id) {
                return {
                    expenseId: existing.id,
                    monthQuery: format(monthDate, 'yyyy-MM'),
                    created: false as const,
                };
            }

            const created = await tx.expense.create({
                data: {
                    companyId,
                    unitId,
                    description,
                    category,
                    amount: amountFixed,
                    dueDate,
                    isRecurring,
                    isPaid: false,
                },
                select: { id: true },
            });

            return {
                expenseId: created.id,
                monthQuery: format(monthDate, 'yyyy-MM'),
                created: true as const,
            };
        });

        return jsonOk(result, { status: result.created ? 201 : 200 });
    } catch (err) {
        console.error('[POST /api/admin/finance/expenses] internal_error', err);
        return jsonErr('internal_error', 500);
    }
}
