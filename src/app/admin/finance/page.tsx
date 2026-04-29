// src/app/admin/finance/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';
import AdminFinanceClient, {
    type AdminFinanceSummaryUI,
    type ProfessionalMonthlyEarningsUI,
    type ExpenseRowUI,
} from './admin-finance-client';

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
        unit?: string;
    }>;
};

function parseMonthParam(month?: string): Date {
    if (!month) return startOfMonth(new Date());
    const parsed = parse(month, 'yyyy-MM', new Date());
    if (!isValid(parsed)) return startOfMonth(new Date());
    return startOfMonth(parsed);
}

function capitalizeFirst(v: string) {
    if (!v) return v;
    return v.charAt(0).toUpperCase() + v.slice(1);
}

function buildFinanceRedirect(params: { month?: string; unit?: string }) {
    const sp = new URLSearchParams();

    if (params.month) sp.set('month', params.month);
    if (params.unit) sp.set('unit', params.unit);

    const qs = sp.toString();
    return qs ? `/admin/finance?${qs}` : '/admin/finance';
}

function clampDayToMonth(day: number, monthDate: Date): number {
    const last = endOfMonth(monthDate).getDate();
    if (day <= 1) return 1;
    if (day >= last) return last;
    return day;
}

async function ensureRecurringExpensesForMonth(args: {
    companyId: string;
    unitId: string;
    monthDate: Date;
}) {
    const { companyId, unitId, monthDate } = args;

    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);

    const prevMonth = startOfMonth(addMonths(monthDate, -1));
    const prevStart = startOfMonth(prevMonth);
    const prevEnd = endOfMonth(prevMonth);

    const prevRecurring = await prisma.expense.findMany({
        where: {
            companyId,
            unitId,
            isRecurring: true,
            dueDate: { gte: prevStart, lte: prevEnd },
        },
        select: {
            id: true,
            description: true,
            category: true,
            amount: true,
            dueDate: true,
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    if (prevRecurring.length === 0) return;

    const currentRecurring = await prisma.expense.findMany({
        where: {
            companyId,
            unitId,
            isRecurring: true,
            dueDate: { gte: monthStart, lte: monthEnd },
        },
        select: {
            description: true,
            category: true,
            amount: true,
            dueDate: true,
        },
    });

    const existingKey = new Set(
        currentRecurring.map((e) => {
            const day = e.dueDate.getDate();
            return [
                companyId,
                unitId,
                'REC',
                e.category,
                e.description.trim().toLowerCase(),
                Number(e.amount).toFixed(2),
                String(day),
            ].join('|');
        })
    );

    const toCreate = prevRecurring
        .map((src) => {
            const day = src.dueDate.getDate();
            const clampedDay = clampDayToMonth(day, monthDate);
            const dueDate = new Date(
                monthDate.getFullYear(),
                monthDate.getMonth(),
                clampedDay
            );

            const key = [
                companyId,
                unitId,
                'REC',
                src.category,
                src.description.trim().toLowerCase(),
                Number(src.amount).toFixed(2),
                String(clampedDay),
            ].join('|');

            return {
                key,
                data: {
                    companyId,
                    unitId,
                    description: src.description,
                    category: src.category,
                    amount: Number(src.amount).toFixed(2),
                    dueDate,
                    isRecurring: true,
                    isPaid: false,
                },
            };
        })
        .filter((x) => !existingKey.has(x.key));

    if (toCreate.length === 0) return;

    await prisma.expense.createMany({
        data: toCreate.map((x) => x.data),
        skipDuplicates: false,
    });
}

function safeNumber(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export default async function AdminFinancePage({
    searchParams,
}: AdminFinancePageProps) {
    const session = await requireAdminForModule('FINANCE');

    const companyId = session.companyId;
    if (!companyId) redirect('/admin');

    const userId = session.id;
    if (!userId) redirect('/admin');

    const canSeeAllUnits = !!(session as any)?.canSeeAllUnits;

    const { month: monthParam, unit: unitParam } = await searchParams;

    const referenceDate = parseMonthParam(monthParam);
    const monthStart = startOfMonth(referenceDate);
    const monthEnd = endOfMonth(referenceDate);

    const yearStart = startOfYear(referenceDate);
    const yearEnd = monthEnd;

    const monthQuery = format(referenceDate, 'yyyy-MM');
    const monthLabel = capitalizeFirst(
        format(referenceDate, "MMMM 'de' yyyy", { locale: ptBR })
    );

    const units = canSeeAllUnits
        ? await prisma.unit.findMany({
              where: { companyId, isActive: true },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
          })
        : await (async () => {
              const access = await prisma.adminUnitAccess.findMany({
                  where: { companyId, userId },
                  select: { unitId: true },
              });

              const unitIds = access.map((a) => a.unitId).filter(Boolean);

              if (!unitIds.length) return [];

              return prisma.unit.findMany({
                  where: {
                      companyId,
                      isActive: true,
                      id: { in: unitIds },
                  },
                  select: { id: true, name: true },
                  orderBy: { name: 'asc' },
              });
          })();

    const defaultUnitId = units.length > 0 ? units[0].id : null;

    if (!defaultUnitId) {
        const summary: AdminFinanceSummaryUI = {
            netRevenueMonth: 'R$ 0,00',
            servicesNetMonth: 'R$ 0,00',
            productsNetMonth: 'R$ 0,00',
            totalExpenses: 'R$ 0,00',
            totalCardFees: 'R$ 0,00',
            netIncome: 'R$ 0,00',
            netIncomeIsPositive: true,
            netIncomeYear: 'R$ 0,00',
            netIncomeYearIsPositive: true,
        };

        return (
            <AdminFinanceClient
                scopeLabel="Nenhuma unidade disponível"
                monthLabel={monthLabel}
                monthQuery={monthQuery}
                summary={summary}
                professionalEarnings={[]}
                expenses={[]}
                newExpenseDisabled={true}
            />
        );
    }

    if (!unitParam || unitParam === 'all') {
        redirect(
            buildFinanceRedirect({ month: monthQuery, unit: defaultUnitId })
        );
    }

    const activeUnitId: string = unitParam;

    const inAllowedList = units.some((u) => u.id === activeUnitId);

    if (!inAllowedList) {
        redirect(
            buildFinanceRedirect({ month: monthQuery, unit: defaultUnitId })
        );
    }

    const ok = await prisma.unit.findFirst({
        where: { id: activeUnitId, companyId, isActive: true },
        select: { id: true },
    });

    if (!ok) {
        redirect(
            buildFinanceRedirect({ month: monthQuery, unit: defaultUnitId })
        );
    }

    await ensureRecurringExpensesForMonth({
        companyId,
        unitId: activeUnitId,
        monthDate: monthStart,
    });

    const scopeLabel =
        units.find((u) => u.id === activeUnitId)?.name ?? 'unidade selecionada';

    const newExpenseDisabled = !activeUnitId;

    const currencyFormatter = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

    const expensesDb = await prisma.expense.findMany({
        where: {
            companyId,
            unitId: activeUnitId,
            dueDate: { gte: monthStart, lte: monthEnd },
        } as any,
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

    const expenses: ExpenseRowUI[] = expensesDb.map((e) => ({
        id: e.id,
        description: e.description,
        dueDate: format(e.dueDate, 'dd/MM/yyyy', { locale: ptBR }),
        amount: currencyFormatter.format(Number(e.amount)),
        isRecurring: !!e.isRecurring,
        statusLabel: e.isPaid ? 'Pago' : 'Em aberto',
        statusTone: e.isPaid ? 'success' : 'warning',
    }));

    const totalExpensesNumber = expensesDb.reduce((sum, e) => {
        if (!e.isPaid) return sum;
        return sum + Number(e.amount);
    }, 0);

    const expensesYearDb = await prisma.expense.findMany({
        where: {
            companyId,
            unitId: activeUnitId,
            isPaid: true,
            dueDate: { gte: yearStart, lte: yearEnd },
        } as any,
        select: {
            amount: true,
        },
    });

    const totalExpensesYearNumber = expensesYearDb.reduce((sum, e) => {
        return sum + Number(e.amount);
    }, 0);

    /*
     * Financeiro temporário:
     * Checkout/Appointment foi removido do tenant admin por enquanto.
     * Quando o financeiro novo nascer em cima de Rides/Orders, ligamos aqui.
     */
    const totalCardFeesNumber = 0;
    const totalReceivedNetMonth = 0;
    const totalReceivedNetYear = 0;

    const servicesCommissionMonthNumber = 0;
    const servicesCommissionYearNumber = 0;

    const productsCommissionMonthNumber = 0;
    const productsCommissionYearNumber = 0;

    const servicesEarningsByProfessional = new Map<string, number>();
    const productsEarningsByProfessional = new Map<string, number>();

    const allProfessionalIds = new Set<string>([
        ...Array.from(servicesEarningsByProfessional.keys()),
        ...Array.from(productsEarningsByProfessional.keys()),
    ]);

    const professionalEarnings: ProfessionalMonthlyEarningsUI[] = Array.from(
        allProfessionalIds
    )
        .map((pid) => {
            const services = servicesEarningsByProfessional.get(pid) ?? 0;
            const products = productsEarningsByProfessional.get(pid) ?? 0;
            const total = services + products;

            return {
                professionalId: pid,
                name: 'Profissional',
                servicesEarnings: currencyFormatter.format(services),
                productsEarnings: currencyFormatter.format(products),
                total: currencyFormatter.format(total),
            };
        })
        .sort((a, b) => {
            const na = safeNumber(
                a.total
                    .replace(/[^\d,.-]/g, '')
                    .replace('.', '')
                    .replace(',', '.')
            );
            const nb = safeNumber(
                b.total
                    .replace(/[^\d,.-]/g, '')
                    .replace('.', '')
                    .replace(',', '.')
            );
            return nb - na;
        });

    const totalCommissionMonthNumber =
        servicesCommissionMonthNumber + productsCommissionMonthNumber;

    const totalCommissionYearNumber =
        servicesCommissionYearNumber + productsCommissionYearNumber;

    const netRevenueMonthNumber =
        totalReceivedNetMonth - totalCommissionMonthNumber;

    const netRevenueYearNumber =
        totalReceivedNetYear - totalCommissionYearNumber;

    const servicesNetMonthNumber =
        Math.max(0, totalReceivedNetMonth - totalCardFeesNumber) -
        servicesCommissionMonthNumber;

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
            scopeLabel={scopeLabel}
            monthLabel={monthLabel}
            monthQuery={monthQuery}
            summary={summary}
            professionalEarnings={professionalEarnings}
            expenses={expenses}
            newExpenseDisabled={newExpenseDisabled}
        />
    );
}
