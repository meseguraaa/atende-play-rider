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
        month?: string; // yyyy-MM
        unit?: string; // unitId (mantemos compat com "all", mas redireciona)
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

/**
 * ✅ Auto-criação de despesas recorrentes ao entrar no mês:
 * - Busca recorrentes do mês anterior (mesma unidade)
 * - Cria no mês atual o que estiver faltando
 */
async function ensureRecurringExpensesForMonth(args: {
    companyId: string;
    unitId: string;
    monthDate: Date; // startOfMonth
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

/* -------------------------------------------------------
 * Helpers: cálculo de ganhos e faturamento do mês
 * ------------------------------------------------------*/

function safeNumber(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export default async function AdminFinancePage({
    searchParams,
}: AdminFinancePageProps) {
    const session = await requireAdminForModule('FINANCE');

    const companyId = session.companyId;
    if (!companyId) {
        redirect('/admin');
    }

    const userId = session.id;
    if (!userId) {
        redirect('/admin');
    }

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
                scopeLabel={'Nenhuma unidade disponível'}
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

    const scopeLabel = (() => {
        const found = units.find((u) => u.id === activeUnitId);
        return found?.name ?? 'unidade selecionada';
    })();

    const newExpenseDisabled = !activeUnitId;

    const currencyFormatter = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

    /* -------------------------------------------------------
     * DESPESAS
     * ------------------------------------------------------*/
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

    /* -------------------------------------------------------
     * CHECKOUTS DO MÊS
     * ------------------------------------------------------*/
    const checkedOutAppointmentsMonth = await prisma.appointment.findMany({
        where: {
            companyId,
            unitId: activeUnitId,
            checkedOutAt: { gte: monthStart, lte: monthEnd },
            status: { not: 'CANCELED' },
        },
        select: {
            professionalId: true,
            cardFeeAmount: true,
            netReceivedAmount: true,
        },
    });

    const totalCardFeesNumber = checkedOutAppointmentsMonth.reduce(
        (sum, a) => sum + safeNumber(a.cardFeeAmount),
        0
    );

    const totalReceivedNetMonth = checkedOutAppointmentsMonth.reduce(
        (sum, a) => sum + safeNumber(a.netReceivedAmount),
        0
    );

    const checkedOutAppointmentsYear = await prisma.appointment.findMany({
        where: {
            companyId,
            unitId: activeUnitId,
            checkedOutAt: { gte: yearStart, lte: yearEnd },
            status: { not: 'CANCELED' },
        },
        select: {
            professionalId: true,
            cardFeeAmount: true,
            netReceivedAmount: true,
        },
    });

    const totalReceivedNetYear = checkedOutAppointmentsYear.reduce(
        (sum, a) => sum + safeNumber(a.netReceivedAmount),
        0
    );

    /* -------------------------------------------------------
     * FATURAMENTO / COMISSÕES DO MÊS
     *
     * Regra final:
     * - Faturamento líquido (box 1) = líquido recebido no mês - comissões
     * - Despesas = só pagas
     * - Lucro líquido = faturamento líquido - despesas
     * - Cards dos profissionais = comissões por profissional
     * ------------------------------------------------------*/

    const professionalUnits = await prisma.professionalUnit.findMany({
        where: {
            companyId,
            unitId: activeUnitId,
            isActive: true,
            professional: { isActive: true },
        },
        select: {
            professional: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    const professionalsBase = professionalUnits
        .map((x) => x.professional)
        .filter(Boolean);

    const professionalsById = new Map<string, { id: string; name: string }>();
    for (const p of professionalsBase) {
        if (!p?.id) continue;
        professionalsById.set(p.id, { id: p.id, name: p.name });
    }

    // Serviços do mês via orders COMPLETED
    const completedServiceOrders = await prisma.order.findMany({
        where: {
            companyId,
            unitId: activeUnitId,
            status: 'COMPLETED',
            appointment: {
                is: {
                    checkedOutAt: { gte: monthStart, lte: monthEnd },
                },
            },
        },
        select: {
            appointment: {
                select: {
                    professionalId: true,
                    professionalPercentageAtTheTime: true,
                },
            },
            items: {
                where: {
                    serviceId: { not: null },
                },
                select: {
                    totalPrice: true,
                    service: {
                        select: {
                            professionalPercentage: true,
                        },
                    },
                },
            },
        },
    });

    let servicesCommissionMonthNumber = 0;
    let servicesCommissionYearNumber = 0;
    const servicesEarningsByProfessional = new Map<string, number>();

    for (const order of completedServiceOrders) {
        const pctFromAppointment = safeNumber(
            order.appointment?.professionalPercentageAtTheTime
        );

        const appointmentProfessionalId = String(
            order.appointment?.professionalId ?? ''
        ).trim();

        for (const item of order.items) {
            const itemTotal = safeNumber(item.totalPrice);

            const pctFromService = safeNumber(
                item.service?.professionalPercentage
            );
            const pct =
                pctFromAppointment > 0 ? pctFromAppointment : pctFromService;

            const commission =
                itemTotal > 0 && pct > 0 ? (itemTotal * pct) / 100 : 0;

            servicesCommissionMonthNumber += commission;

            if (!appointmentProfessionalId) continue;

            servicesEarningsByProfessional.set(
                appointmentProfessionalId,
                (servicesEarningsByProfessional.get(
                    appointmentProfessionalId
                ) ?? 0) + commission
            );
        }
    }

    const completedServiceOrdersYear = await prisma.order.findMany({
        where: {
            companyId,
            unitId: activeUnitId,
            status: 'COMPLETED',
            appointment: {
                is: {
                    checkedOutAt: { gte: yearStart, lte: yearEnd },
                },
            },
        },
        select: {
            appointment: {
                select: {
                    professionalId: true,
                    professionalPercentageAtTheTime: true,
                },
            },
            items: {
                where: {
                    serviceId: { not: null },
                },
                select: {
                    totalPrice: true,
                    service: {
                        select: {
                            professionalPercentage: true,
                        },
                    },
                },
            },
        },
    });

    for (const order of completedServiceOrdersYear) {
        const pctFromAppointment = safeNumber(
            order.appointment?.professionalPercentageAtTheTime
        );

        for (const item of order.items) {
            const itemTotal = safeNumber(item.totalPrice);

            const pctFromService = safeNumber(
                item.service?.professionalPercentage
            );
            const pct =
                pctFromAppointment > 0 ? pctFromAppointment : pctFromService;

            const commission =
                itemTotal > 0 && pct > 0 ? (itemTotal * pct) / 100 : 0;

            servicesCommissionYearNumber += commission;
        }
    }

    // Produtos do mês via orders COMPLETED
    const completedOrders = await prisma.order.findMany({
        where: {
            companyId,
            unitId: activeUnitId,
            status: 'COMPLETED',
            appointment: {
                is: {
                    checkedOutAt: { gte: monthStart, lte: monthEnd },
                },
            },
        },
        select: { id: true },
    });

    const orderIds = completedOrders.map((o) => o.id);

    let productsCommissionMonthNumber = 0;
    let productsCommissionYearNumber = 0;
    const productsEarningsByProfessional = new Map<string, number>();

    if (orderIds.length > 0) {
        const productItems = await prisma.orderItem.findMany({
            where: {
                companyId,
                orderId: { in: orderIds },
                productId: { not: null },
            },
            select: {
                professionalId: true,
                totalPrice: true,
                product: { select: { professionalPercentage: true } },
            },
        });

        for (const it of productItems) {
            const pid = String(it.professionalId ?? '').trim();
            if (!pid) continue;

            const total = safeNumber(it.totalPrice);
            const pct = safeNumber(it.product?.professionalPercentage);

            const commission = total > 0 && pct > 0 ? (total * pct) / 100 : 0;

            productsCommissionMonthNumber += commission;

            productsEarningsByProfessional.set(
                pid,
                (productsEarningsByProfessional.get(pid) ?? 0) + commission
            );
        }
    }

    const completedOrdersYear = await prisma.order.findMany({
        where: {
            companyId,
            unitId: activeUnitId,
            status: 'COMPLETED',
            appointment: {
                is: {
                    checkedOutAt: { gte: yearStart, lte: yearEnd },
                },
            },
        },
        select: { id: true },
    });

    const orderIdsYear = completedOrdersYear.map((o) => o.id);

    if (orderIdsYear.length > 0) {
        const productItemsYear = await prisma.orderItem.findMany({
            where: {
                companyId,
                orderId: { in: orderIdsYear },
                productId: { not: null },
            },
            select: {
                totalPrice: true,
                product: { select: { professionalPercentage: true } },
            },
        });

        for (const it of productItemsYear) {
            const total = safeNumber(it.totalPrice);
            const pct = safeNumber(it.product?.professionalPercentage);

            const commission = total > 0 && pct > 0 ? (total * pct) / 100 : 0;

            productsCommissionYearNumber += commission;
        }
    }

    const allProfessionalIds = new Set<string>([
        ...Array.from(professionalsById.keys()),
        ...Array.from(servicesEarningsByProfessional.keys()),
        ...Array.from(productsEarningsByProfessional.keys()),
        ...checkedOutAppointmentsMonth
            .map((a) => String(a.professionalId ?? '').trim())
            .filter(Boolean),
    ]);

    const professionalEarnings: ProfessionalMonthlyEarningsUI[] = Array.from(
        allProfessionalIds
    )
        .map((pid) => {
            const base = professionalsById.get(pid);

            const services = servicesEarningsByProfessional.get(pid) ?? 0;
            const products = productsEarningsByProfessional.get(pid) ?? 0;
            const total = services + products;

            return {
                professionalId: pid,
                name: base?.name ?? 'Profissional',
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

    // Box 1: igual ao dashboard "Lucro real (mês)" sem despesas
    const netRevenueMonthNumber =
        totalReceivedNetMonth - totalCommissionMonthNumber;

    const netRevenueYearNumber =
        totalReceivedNetYear - totalCommissionYearNumber;

    // Para detalhamento visual do box 1
    const servicesNetMonthNumber =
        Math.max(0, totalReceivedNetMonth - totalCardFeesNumber) -
        servicesCommissionMonthNumber;

    const productsNetMonthNumber = 0;

    // Box 3
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
