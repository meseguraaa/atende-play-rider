// src/app/admin/finance/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';
import AdminFinanceClient, {
    type AdminFinanceSummaryUI,
    type ExpenseRowUI,
} from './admin-finance-members';

import {
    addMonths,
    endOfMonth,
    format,
    isValid,
    parse,
    startOfMonth,
    startOfYear,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Financeiro',
};

type AdminFinancePageProps = {
    searchParams: Promise<{
        month?: string;
    }>;
};

function parseMonthParam(month?: string): Date {
    if (!month) return startOfMonth(new Date());

    const parsed = parse(month, 'yyyy-MM', new Date());

    if (!isValid(parsed)) return startOfMonth(new Date());

    return startOfMonth(parsed);
}

function capitalizeFirst(value: string) {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function clampDayToMonth(day: number, monthDate: Date): number {
    const last = endOfMonth(monthDate).getDate();

    if (day <= 1) return 1;
    if (day >= last) return last;

    return day;
}

async function ensureRecurringExpensesForMonth(args: {
    companyId: string;
    monthDate: Date;
}) {
    const { companyId, monthDate } = args;

    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);

    const prevMonth = startOfMonth(addMonths(monthDate, -1));
    const prevStart = startOfMonth(prevMonth);
    const prevEnd = endOfMonth(prevMonth);

    const prevRecurring = await prisma.expense.findMany({
        where: {
            companyId,
            isRecurring: true,
            dueDate: {
                gte: prevStart,
                lte: prevEnd,
            },
        },
        select: {
            description: true,
            category: true,
            amount: true,
            dueDate: true,
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    if (!prevRecurring.length) return;

    const currentRecurring = await prisma.expense.findMany({
        where: {
            companyId,
            isRecurring: true,
            dueDate: {
                gte: monthStart,
                lte: monthEnd,
            },
        },
        select: {
            description: true,
            category: true,
            amount: true,
            dueDate: true,
        },
    });

    const existingKey = new Set(
        currentRecurring.map((expense) =>
            [
                companyId,
                expense.category,
                expense.description.trim().toLowerCase(),
                Number(expense.amount).toFixed(2),
                String(expense.dueDate.getDate()),
            ].join('|')
        )
    );

    const toCreate = prevRecurring
        .map((source) => {
            const clampedDay = clampDayToMonth(
                source.dueDate.getDate(),
                monthDate
            );

            const dueDate = new Date(
                monthDate.getFullYear(),
                monthDate.getMonth(),
                clampedDay
            );

            const key = [
                companyId,
                source.category,
                source.description.trim().toLowerCase(),
                Number(source.amount).toFixed(2),
                String(clampedDay),
            ].join('|');

            return {
                key,
                data: {
                    companyId,
                    description: source.description,
                    category: source.category,
                    amount: Number(source.amount).toFixed(2),
                    dueDate,
                    isRecurring: true,
                    isPaid: false,
                },
            };
        })
        .filter((item) => !existingKey.has(item.key));

    if (!toCreate.length) return;

    await prisma.expense.createMany({
        data: toCreate.map((item) => item.data),
    });
}

export default async function AdminFinancePage({
    searchParams,
}: AdminFinancePageProps) {
    const session = await requireAdminForModule('FINANCE');

    const companyId = session.companyId;
    if (!companyId) redirect('/admin');

    const { month: monthParam } = await searchParams;

    const referenceDate = parseMonthParam(monthParam);
    const monthStart = startOfMonth(referenceDate);
    const monthEnd = endOfMonth(referenceDate);

    const yearStart = startOfYear(referenceDate);
    const yearEnd = monthEnd;

    const monthQuery = format(referenceDate, 'yyyy-MM');

    const monthLabel = capitalizeFirst(
        format(referenceDate, "MMMM 'de' yyyy", { locale: ptBR })
    );

    await ensureRecurringExpensesForMonth({
        companyId,
        monthDate: monthStart,
    });

    const currencyFormatter = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

    const expensesDb = await prisma.expense.findMany({
        where: {
            companyId,
            dueDate: {
                gte: monthStart,
                lte: monthEnd,
            },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        select: {
            id: true,
            description: true,
            dueDate: true,
            amount: true,
            isRecurring: true,
            isPaid: true,
        },
    });

    const expenses: ExpenseRowUI[] = expensesDb.map((expense) => ({
        id: expense.id,
        description: expense.description,
        dueDate: format(expense.dueDate, 'dd/MM/yyyy', { locale: ptBR }),
        amount: currencyFormatter.format(Number(expense.amount)),
        isRecurring: expense.isRecurring,
        statusLabel: expense.isPaid ? 'Pago' : 'Em aberto',
        statusTone: expense.isPaid ? 'success' : 'warning',
    }));

    const totalExpensesNumber = expensesDb.reduce((sum, expense) => {
        return sum + Number(expense.amount);
    }, 0);

    const expensesYearDb = await prisma.expense.findMany({
        where: {
            companyId,
            dueDate: {
                gte: yearStart,
                lte: yearEnd,
            },
        },
        select: {
            amount: true,
        },
    });

    const totalExpensesYearNumber = expensesYearDb.reduce((sum, expense) => {
        return sum + Number(expense.amount);
    }, 0);

    const totalCardFeesNumber = 0;
    const totalReceivedNetMonth = 0;
    const totalReceivedNetYear = 0;

    const servicesCommissionMonthNumber = 0;
    const productsCommissionMonthNumber = 0;

    const netRevenueMonthNumber =
        totalReceivedNetMonth -
        servicesCommissionMonthNumber -
        productsCommissionMonthNumber;

    const netRevenueYearNumber = totalReceivedNetYear;

    const servicesNetMonthNumber = 0;
    const productsNetMonthNumber = 0;

    const netIncomeNumber = netRevenueMonthNumber - totalExpensesNumber;
    const netIncomeYearNumber = netRevenueYearNumber - totalExpensesYearNumber;

    const summary: AdminFinanceSummaryUI = {
        netRevenueMonth: currencyFormatter.format(netRevenueMonthNumber),
        servicesNetMonth: currencyFormatter.format(servicesNetMonthNumber),
        productsNetMonth: currencyFormatter.format(productsNetMonthNumber),
        totalExpenses: currencyFormatter.format(totalExpensesNumber),
        totalCardFees: currencyFormatter.format(totalCardFeesNumber),
        netIncome: currencyFormatter.format(netIncomeNumber),
        netIncomeIsPositive: netIncomeNumber >= 0,
        netIncomeYear: currencyFormatter.format(netIncomeYearNumber),
        netIncomeYearIsPositive: netIncomeYearNumber >= 0,
    };

    return (
        <AdminFinanceClient
            scopeLabel="Empresa"
            monthLabel={monthLabel}
            monthQuery={monthQuery}
            summary={summary}
            expenses={expenses}
            newExpenseDisabled={false}
        />
    );
}
