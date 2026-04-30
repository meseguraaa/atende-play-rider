// src/app/api/admin/finance/expenses/[expenseId]/route.ts
import { NextResponse } from 'next/server';
import { endOfMonth, isValid, parse } from 'date-fns';

import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';

type UpdateExpensePayload = {
    description?: string;
    amount?: number;
    isRecurring?: boolean;
    recurringDay?: number;
    dueDate?: string;
};

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function parseDueDateParam(dueDate: string): Date | null {
    const parsed = parse(dueDate, 'yyyy-MM-dd', new Date());

    if (!isValid(parsed)) return null;

    return parsed;
}

function clampDayToMonth(day: number, monthDate: Date): number {
    const last = endOfMonth(monthDate).getDate();

    if (day <= 1) return 1;
    if (day >= last) return last;

    return day;
}

export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ expenseId: string }> }
) {
    const auth = await requireAdminForModuleApi('FINANCE');
    if (auth instanceof NextResponse) return auth;

    const session = auth as any;

    const companyId: string | null = session?.companyId ?? null;
    if (!companyId) return jsonErr('missing_company', 403);

    const { expenseId } = await ctx.params;

    const id = String(expenseId || '').trim();
    if (!id) return jsonErr('expense_id_required', 400);

    let body: UpdateExpensePayload | null = null;

    try {
        body = (await req.json()) as UpdateExpensePayload;
    } catch {
        return jsonErr('invalid_json', 400);
    }

    const expense = await prisma.expense.findFirst({
        where: {
            id,
            companyId,
        },
        select: {
            id: true,
            dueDate: true,
        },
    });

    if (!expense) return jsonErr('expense_not_found', 404);

    const description = String(body?.description || '').trim();
    const amountNum = Number(body?.amount);
    const isRecurring = Boolean(body?.isRecurring);

    const recurringDayRaw =
        body?.recurringDay != null ? Number(body.recurringDay) : undefined;

    const dueDateRaw =
        body?.dueDate != null ? String(body.dueDate).trim() : undefined;

    if (!description) return jsonErr('description_required', 400);

    if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return jsonErr('amount_invalid', 400);
    }

    let dueDate: Date;

    if (isRecurring) {
        if (
            recurringDayRaw == null ||
            !Number.isFinite(recurringDayRaw) ||
            recurringDayRaw < 1 ||
            recurringDayRaw > 31
        ) {
            return jsonErr('recurring_day_invalid', 400);
        }

        const dayClamped = clampDayToMonth(recurringDayRaw, expense.dueDate);

        dueDate = new Date(
            expense.dueDate.getFullYear(),
            expense.dueDate.getMonth(),
            dayClamped
        );
    } else {
        if (!dueDateRaw) return jsonErr('due_date_required', 400);

        const parsedDue = parseDueDateParam(dueDateRaw);
        if (!parsedDue) return jsonErr('due_date_invalid', 400);

        dueDate = parsedDue;
    }

    try {
        const updated = await prisma.expense.update({
            where: {
                id: expense.id,
            },
            data: {
                description,
                amount: amountNum.toFixed(2),
                dueDate,
                isRecurring,
            },
            select: {
                id: true,
            },
        });

        return jsonOk({
            expenseId: updated.id,
            updated: true,
        });
    } catch (err) {
        console.error(
            '[PATCH /api/admin/finance/expenses/[expenseId]] internal_error',
            err
        );

        return jsonErr('internal_error', 500);
    }
}

export async function DELETE(
    _req: Request,
    ctx: { params: Promise<{ expenseId: string }> }
) {
    const auth = await requireAdminForModuleApi('FINANCE');
    if (auth instanceof NextResponse) return auth;

    const session = auth as any;

    const companyId: string | null = session?.companyId ?? null;
    if (!companyId) return jsonErr('missing_company', 403);

    const { expenseId } = await ctx.params;

    const id = String(expenseId || '').trim();
    if (!id) return jsonErr('expense_id_required', 400);

    const expense = await prisma.expense.findFirst({
        where: {
            id,
            companyId,
        },
        select: {
            id: true,
            companyId: true,
            description: true,
            category: true,
            amount: true,
            dueDate: true,
            isRecurring: true,
        },
    });

    if (!expense) return jsonErr('expense_not_found', 404);

    try {
        const result = await prisma.$transaction(async (tx) => {
            if (!expense.isRecurring) {
                await tx.expense.delete({
                    where: {
                        id: expense.id,
                    },
                });

                return {
                    deleted: true,
                    deletedCount: 1,
                    mode: 'single' as const,
                };
            }

            const deletedMany = await tx.expense.deleteMany({
                where: {
                    companyId: expense.companyId,
                    isRecurring: true,
                    category: expense.category,
                    description: expense.description,
                    amount: expense.amount,
                    dueDate: {
                        gte: expense.dueDate,
                    },
                },
            });

            return {
                deleted: deletedMany.count > 0,
                deletedCount: deletedMany.count,
                mode: 'series' as const,
            };
        });

        return jsonOk(result);
    } catch {
        return jsonErr('internal_error', 500);
    }
}
