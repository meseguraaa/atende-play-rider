// src/app/api/admin/finance/expenses/route.ts
import { NextResponse } from 'next/server';
import { endOfMonth, format, isValid, parse, startOfMonth } from 'date-fns';

import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CreateExpensePayload = {
    month: string;
    category?: string;
    description: string;
    amount: number;
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

function parseMonthParam(month: string): Date | null {
    const parsed = parse(month, 'yyyy-MM', new Date());

    if (!isValid(parsed)) return null;

    return startOfMonth(parsed);
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

function normalizeCategory(input?: string) {
    const value = String(input ?? 'OTHER')
        .trim()
        .toUpperCase();

    if (
        value === 'RENT' ||
        value === 'UTILITIES' ||
        value === 'TAXES' ||
        value === 'SUPPLIES' ||
        value === 'OTHER'
    ) {
        return value as 'RENT' | 'UTILITIES' | 'TAXES' | 'SUPPLIES' | 'OTHER';
    }

    return 'OTHER' as const;
}

export async function POST(req: Request) {
    const auth = await requireAdminForModuleApi('FINANCE');
    if (auth instanceof NextResponse) return auth;

    const session = auth as any;

    const companyId: string | null = session?.companyId ?? null;
    if (!companyId) return jsonErr('missing_company', 403);

    let body: CreateExpensePayload | null = null;

    try {
        body = (await req.json()) as CreateExpensePayload;
    } catch {
        return jsonErr('invalid_json', 400);
    }

    const month = String(body?.month || '').trim();
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

    if (!description) return jsonErr('description_required', 400);

    if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return jsonErr('amount_invalid', 400);
    }

    const amountFixed = amountNum.toFixed(2);

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

    const category = normalizeCategory(body?.category);

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

        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);

        if (parsed < monthStart || parsed > monthEnd) {
            return jsonErr('due_date_out_of_month', 400);
        }

        dueDate = parsed;
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const existing = await tx.expense.findFirst({
                where: {
                    companyId,
                    description,
                    category,
                    dueDate,
                    isRecurring,
                },
                select: {
                    id: true,
                },
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
                    description,
                    category,
                    amount: amountFixed,
                    dueDate,
                    isRecurring,
                    isPaid: false,
                },
                select: {
                    id: true,
                },
            });

            return {
                expenseId: created.id,
                monthQuery: format(monthDate, 'yyyy-MM'),
                created: true as const,
            };
        });

        return jsonOk(result, {
            status: result.created ? 201 : 200,
        });
    } catch (err) {
        console.error('[POST /api/admin/finance/expenses] internal_error', err);
        return jsonErr('internal_error', 500);
    }
}
