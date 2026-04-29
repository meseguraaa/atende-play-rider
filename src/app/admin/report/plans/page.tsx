// src/app/admin/report/plans/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import {
    ArrowLeft,
    CreditCard,
    Users,
    CalendarClock,
    Repeat,
} from 'lucide-react';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';
import { MonthPicker } from '@/components/month-picker';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Relatório de Planos',
};

const COMPANY_COOKIE_NAME = 'admin_company_context';
const UNIT_COOKIE_NAME = 'admin_unit_context';
const UNIT_ALL_VALUE = 'all';

type SummaryCardProps = {
    title: string;
    value: string;
    description: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type PlanTypeBucket = 'GENERAL' | 'CUSTOM' | 'SUBSCRIPTION';

function SummaryCard({
    title,
    value,
    description,
    icon: Icon,
}: SummaryCardProps) {
    return (
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-4">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-primary bg-brand-primary/10 text-brand-primary">
                    <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 space-y-1">
                    <p className="text-label-small text-content-secondary">
                        {title}
                    </p>

                    <p className="text-title text-content-primary">{value}</p>

                    <p className="text-paragraph-small text-content-secondary">
                        {description}
                    </p>
                </div>
            </div>
        </div>
    );
}

function getSingleParam(v: string | string[] | undefined) {
    if (v == null) return undefined;
    return Array.isArray(v) ? v[0] : v;
}

function formatNumberBR(value: number) {
    return new Intl.NumberFormat('pt-BR').format(value);
}

function formatCurrencyBR(value: number) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    }).format(value);
}

function formatPercentBR(value: number) {
    return `${value.toFixed(1).replace('.', ',')}%`;
}

function formatTopLabel(value: number, singular: string, plural: string) {
    return `${formatNumberBR(value)} ${value === 1 ? singular : plural}`;
}

function getPlanTypeLabel(type: PlanTypeBucket) {
    switch (type) {
        case 'CUSTOM':
            return 'Personalizado';
        case 'SUBSCRIPTION':
            return 'Assinatura';
        default:
            return 'Geral';
    }
}

function toSafePlanType(value: string | null | undefined): PlanTypeBucket {
    if (value === 'CUSTOM') return 'CUSTOM';
    if (value === 'SUBSCRIPTION') return 'SUBSCRIPTION';
    return 'GENERAL';
}

async function requireCompanyIdFromContext(session: any) {
    const sCompanyId = String(session?.companyId ?? '').trim();
    if (sCompanyId) return sCompanyId;

    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
    if (cookieCompanyId) return cookieCompanyId;

    throw new Error('companyId ausente.');
}

export default async function AdminPlansReportPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await requireAdminForModule('DASHBOARD');
    const companyId = await requireCompanyIdFromContext(session);

    const resolvedSearchParams = await searchParams;

    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(
        now.getUTCMonth() + 1
    ).padStart(2, '0')}`;

    const month = getSingleParam(resolvedSearchParams.month) ?? currentMonth;

    const cookieStore = await cookies();
    const selectedUnit =
        cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

    const [y, m] = month.split('-').map(Number);

    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));

    const activePlansWhere: any = {
        companyId,
        status: 'ACTIVE',
        startsAt: {
            lt: end,
        },
        expiresAt: {
            gte: start,
        },
    };

    const expiredPlansWhere: any = {
        companyId,
        expiresAt: {
            gte: start,
            lt: end,
        },
    };

    const creditUsageWhere: any = {
        companyId,
        planUsageType: 'PLAN_CREDIT',
        planCreditDebitedAt: {
            gte: start,
            lt: end,
        },
    };

    const soldPlansWhere: any = {
        companyId,
        createdAt: {
            gte: start,
            lt: end,
        },
    };

    if (selectedUnit !== UNIT_ALL_VALUE) {
        activePlansWhere.balances = {
            some: {
                service: {
                    unitId: selectedUnit,
                },
            },
        };

        expiredPlansWhere.balances = {
            some: {
                service: {
                    unitId: selectedUnit,
                },
            },
        };

        soldPlansWhere.balances = {
            some: {
                service: {
                    unitId: selectedUnit,
                },
            },
        };

        creditUsageWhere.unitId = selectedUnit;
    }

    const [
        activePlans,
        activeClients,
        expiredPlans,
        creditUsages,
        activeBalances,
        usedCreditsAppointments,
        topSoldPlansRaw,
        topUsedClientPlansRaw,
    ] = await Promise.all([
        prisma.clientPlan.count({
            where: activePlansWhere,
        }),

        prisma.clientPlan.groupBy({
            by: ['clientId'],
            where: activePlansWhere,
        }),

        prisma.clientPlan.count({
            where: expiredPlansWhere,
        }),

        prisma.appointment.count({
            where: creditUsageWhere,
        }),

        prisma.clientPlanServiceBalance.findMany({
            where: {
                companyId,
                clientPlan: activePlansWhere,
            },
            select: {
                creditsTotal: true,
                creditsUsed: true,
                creditsRemaining: true,
                servicePriceSnapshot: true,
                clientPlan: {
                    select: {
                        planTypeSnapshot: true,
                    },
                },
            },
        }),

        prisma.appointment.findMany({
            where: {
                ...creditUsageWhere,
                clientPlanServiceBalanceId: { not: null },
            },
            select: {
                id: true,
                clientPlanServiceBalance: {
                    select: {
                        servicePriceSnapshot: true,
                    },
                },
                clientPlan: {
                    select: {
                        planTypeSnapshot: true,
                    },
                },
            },
        }),

        prisma.clientPlan.groupBy({
            by: ['planId'],
            where: soldPlansWhere,
            _count: {
                planId: true,
            },
            orderBy: {
                _count: {
                    planId: 'desc',
                },
            },
            take: 10,
        }),

        prisma.appointment.groupBy({
            by: ['clientPlanId'],
            where: {
                ...creditUsageWhere,
                clientPlanId: { not: null },
            },
            _count: {
                clientPlanId: true,
            },
            orderBy: {
                _count: {
                    clientPlanId: 'desc',
                },
            },
            take: 50,
        }),
    ]);

    const soldPlanIds = topSoldPlansRaw
        .map((item) => item.planId)
        .filter((id): id is string => !!id);

    const usedClientPlanIds = topUsedClientPlansRaw
        .map((item) => item.clientPlanId)
        .filter((id): id is string => !!id);

    const [soldPlans, usedClientPlans] = await Promise.all([
        soldPlanIds.length
            ? await prisma.plan.findMany({
                  where: {
                      id: {
                          in: soldPlanIds,
                      },
                  },
                  select: {
                      id: true,
                      name: true,
                      type: true,
                  },
              })
            : [],

        usedClientPlanIds.length
            ? await prisma.clientPlan.findMany({
                  where: {
                      id: {
                          in: usedClientPlanIds,
                      },
                  },
                  select: {
                      id: true,
                      planId: true,
                      planNameSnapshot: true,
                      planTypeSnapshot: true,
                  },
              })
            : [],
    ]);

    const soldPlansMap = new Map(
        soldPlans.map((plan) => [
            plan.id,
            {
                name: plan.name,
                type: toSafePlanType(plan.type),
            },
        ])
    );

    const topSoldPlansRanking = topSoldPlansRaw.map((item) => ({
        planId: item.planId,
        name: soldPlansMap.get(item.planId)?.name ?? 'Plano',
        type: soldPlansMap.get(item.planId)?.type ?? 'GENERAL',
        total: item._count.planId,
    }));

    const usedClientPlansMap = new Map(
        usedClientPlans.map((cp) => [
            cp.id,
            {
                planId: cp.planId,
                name: cp.planNameSnapshot || 'Plano',
                type: toSafePlanType(cp.planTypeSnapshot),
            },
        ])
    );

    const usedPlansAggMap = new Map<
        string,
        {
            name: string;
            type: PlanTypeBucket;
            total: number;
        }
    >();

    for (const item of topUsedClientPlansRaw) {
        const clientPlanId = item.clientPlanId;
        if (!clientPlanId) continue;

        const meta = usedClientPlansMap.get(clientPlanId);
        if (!meta?.planId) continue;

        const current = usedPlansAggMap.get(meta.planId) ?? {
            name: meta.name,
            type: meta.type,
            total: 0,
        };

        current.total += item._count.clientPlanId;
        usedPlansAggMap.set(meta.planId, current);
    }

    const topUsedPlansRanking = Array.from(usedPlansAggMap.entries())
        .map(([planId, stats]) => ({
            planId,
            name: stats.name,
            type: stats.type,
            total: stats.total,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    const creditsTotalAvailable = activeBalances.reduce(
        (sum, balance) => sum + Number(balance.creditsTotal ?? 0),
        0
    );

    const creditsTotalUsedSnapshot = activeBalances.reduce(
        (sum, balance) => sum + Number(balance.creditsUsed ?? 0),
        0
    );

    const creditsTotalRemaining = activeBalances.reduce(
        (sum, balance) => sum + Number(balance.creditsRemaining ?? 0),
        0
    );

    const creditsUsagePercent =
        creditsTotalAvailable > 0
            ? (creditsTotalUsedSnapshot / creditsTotalAvailable) * 100
            : 0;

    const creditsUsedValue = usedCreditsAppointments.reduce(
        (sum, appointment) => {
            const servicePrice = Number(
                appointment.clientPlanServiceBalance?.servicePriceSnapshot ?? 0
            );

            return sum + (Number.isFinite(servicePrice) ? servicePrice : 0);
        },
        0
    );

    const typeStatsSeed: Record<
        PlanTypeBucket,
        {
            activePlans: number;
            activeClients: Set<string>;
            sold: number;
            usedCredits: number;
            creditsTotal: number;
            creditsUsedSnapshot: number;
            creditsRemaining: number;
            usedValue: number;
        }
    > = {
        GENERAL: {
            activePlans: 0,
            activeClients: new Set<string>(),
            sold: 0,
            usedCredits: 0,
            creditsTotal: 0,
            creditsUsedSnapshot: 0,
            creditsRemaining: 0,
            usedValue: 0,
        },
        CUSTOM: {
            activePlans: 0,
            activeClients: new Set<string>(),
            sold: 0,
            usedCredits: 0,
            creditsTotal: 0,
            creditsUsedSnapshot: 0,
            creditsRemaining: 0,
            usedValue: 0,
        },
        SUBSCRIPTION: {
            activePlans: 0,
            activeClients: new Set<string>(),
            sold: 0,
            usedCredits: 0,
            creditsTotal: 0,
            creditsUsedSnapshot: 0,
            creditsRemaining: 0,
            usedValue: 0,
        },
    };

    const [
        activePlansByTypeRaw,
        activeClientsByTypeRaw,
        expiredPlansByTypeRaw,
        soldPlansByTypeRaw,
    ] = await Promise.all([
        prisma.clientPlan.groupBy({
            by: ['planTypeSnapshot'],
            where: activePlansWhere,
            _count: {
                _all: true,
            },
        }),

        prisma.clientPlan.findMany({
            where: activePlansWhere,
            select: {
                clientId: true,
                planTypeSnapshot: true,
            },
        }),

        prisma.clientPlan.groupBy({
            by: ['planTypeSnapshot'],
            where: expiredPlansWhere,
            _count: {
                _all: true,
            },
        }),

        prisma.clientPlan.groupBy({
            by: ['planTypeSnapshot'],
            where: soldPlansWhere,
            _count: {
                _all: true,
            },
        }),
    ]);

    for (const item of activePlansByTypeRaw) {
        const type = toSafePlanType(item.planTypeSnapshot);
        typeStatsSeed[type].activePlans += item._count._all;
    }

    for (const item of activeClientsByTypeRaw) {
        const type = toSafePlanType(item.planTypeSnapshot);
        if (item.clientId) {
            typeStatsSeed[type].activeClients.add(item.clientId);
        }
    }

    for (const item of soldPlansByTypeRaw) {
        const type = toSafePlanType(item.planTypeSnapshot);
        typeStatsSeed[type].sold += item._count._all;
    }

    for (const balance of activeBalances) {
        const type = toSafePlanType(balance.clientPlan?.planTypeSnapshot);
        typeStatsSeed[type].creditsTotal += Number(balance.creditsTotal ?? 0);
        typeStatsSeed[type].creditsUsedSnapshot += Number(
            balance.creditsUsed ?? 0
        );
        typeStatsSeed[type].creditsRemaining += Number(
            balance.creditsRemaining ?? 0
        );
    }

    for (const appointment of usedCreditsAppointments) {
        const type = toSafePlanType(appointment.clientPlan?.planTypeSnapshot);
        typeStatsSeed[type].usedCredits += 1;

        const servicePrice = Number(
            appointment.clientPlanServiceBalance?.servicePriceSnapshot ?? 0
        );

        typeStatsSeed[type].usedValue += Number.isFinite(servicePrice)
            ? servicePrice
            : 0;
    }

    const expiredPlansByTypeMap = new Map(
        expiredPlansByTypeRaw.map((item) => [
            toSafePlanType(item.planTypeSnapshot),
            item._count._all,
        ])
    );

    const typeStats = (['GENERAL', 'CUSTOM', 'SUBSCRIPTION'] as const).map(
        (type) => {
            const base = typeStatsSeed[type];
            const usagePercent =
                base.creditsTotal > 0
                    ? (base.creditsUsedSnapshot / base.creditsTotal) * 100
                    : 0;

            return {
                type,
                label: getPlanTypeLabel(type),
                activePlans: base.activePlans,
                activeClients: base.activeClients.size,
                sold: base.sold,
                expired: expiredPlansByTypeMap.get(type) ?? 0,
                usedCredits: base.usedCredits,
                creditsTotal: base.creditsTotal,
                creditsUsedSnapshot: base.creditsUsedSnapshot,
                creditsRemaining: base.creditsRemaining,
                usagePercent,
                usedValue: base.usedValue,
            };
        }
    );

    const expiredPlansList = await prisma.clientPlan.findMany({
        where: expiredPlansWhere,
        select: {
            id: true,
            planNameSnapshot: true,
            planTypeSnapshot: true,
            expiresAt: true,
            client: {
                select: {
                    name: true,
                    email: true,
                },
            },
        },
        orderBy: {
            expiresAt: 'desc',
        },
        take: 10,
    });

    function formatDateBR(value: Date) {
        return new Intl.DateTimeFormat('pt-BR').format(value);
    }

    return (
        <div className="space-y-6 max-w-7xl">
            <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <Link
                        href="/admin/report"
                        className="inline-flex items-center gap-2 text-paragraph-small text-content-secondary transition-colors hover:text-content-primary"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Voltar para relatórios
                    </Link>

                    <h1 className="text-title text-content-primary mt-2">
                        Relatório de planos
                    </h1>

                    <p className="text-paragraph-small text-content-secondary">
                        Analise adesão, uso e comportamento dos planos no
                        período selecionado.
                    </p>
                </div>

                <div>
                    <MonthPicker />
                </div>
            </header>

            <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    title="Planos ativos"
                    value={formatNumberBR(activePlans)}
                    description="Quantidade de planos ativos no período."
                    icon={CreditCard}
                />

                <SummaryCard
                    title="Clientes com plano"
                    value={formatNumberBR(activeClients.length)}
                    description="Clientes com plano ativo vinculado."
                    icon={Users}
                />

                <SummaryCard
                    title="Planos expirados"
                    value={formatNumberBR(expiredPlans)}
                    description="Planos que expiraram no período."
                    icon={CalendarClock}
                />

                <SummaryCard
                    title="Usos de crédito"
                    value={`${formatNumberBR(creditUsages)} / ${formatNumberBR(creditsTotalAvailable)}`}
                    description={`Uso acumulado: ${formatPercentBR(
                        creditsUsagePercent
                    )} • Valor dos créditos usados no período: ${formatCurrencyBR(
                        creditsUsedValue
                    )}`}
                    icon={Repeat}
                />
            </section>

            <section className="grid gap-4 grid-cols-1">
                <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5">
                    <h3 className="text-paragraph-medium text-content-primary">
                        Resumo geral de créditos
                    </h3>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                            <p className="text-[11px] text-content-secondary">
                                Créditos totais
                            </p>
                            <p className="text-label-large text-content-primary">
                                {formatNumberBR(creditsTotalAvailable)}
                            </p>
                        </div>

                        <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                            <p className="text-[11px] text-content-secondary">
                                Créditos usados
                            </p>
                            <p className="text-label-large text-content-primary">
                                {formatNumberBR(creditsTotalUsedSnapshot)}
                            </p>
                        </div>

                        <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                            <p className="text-[11px] text-content-secondary">
                                Créditos restantes
                            </p>
                            <p className="text-label-large text-content-primary">
                                {formatNumberBR(creditsTotalRemaining)}
                            </p>
                        </div>

                        <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                            <p className="text-[11px] text-content-secondary">
                                % de uso
                            </p>
                            <p className="text-label-large text-content-primary">
                                {formatPercentBR(creditsUsagePercent)}
                            </p>
                        </div>

                        <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                            <p className="text-[11px] text-content-secondary">
                                Valor usado no período
                            </p>
                            <p className="text-label-large text-content-primary">
                                {formatCurrencyBR(creditsUsedValue)}
                            </p>
                        </div>

                        <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                            <p className="text-[11px] text-content-secondary">
                                Usos no período
                            </p>
                            <p className="text-label-large text-content-primary">
                                {formatNumberBR(creditUsages)}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 grid-cols-1 xl:grid-cols-3">
                {typeStats.map((item) => (
                    <div
                        key={item.type}
                        className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5"
                    >
                        <div className="space-y-1">
                            <h3 className="text-paragraph-medium text-content-primary">
                                {item.label}
                            </h3>
                            <p className="text-paragraph-small text-content-secondary">
                                Visão segmentada por tipo de plano.
                            </p>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                                <p className="text-[11px] text-content-secondary">
                                    Planos ativos
                                </p>
                                <p className="text-label-large text-content-primary">
                                    {formatNumberBR(item.activePlans)}
                                </p>
                            </div>

                            <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                                <p className="text-[11px] text-content-secondary">
                                    Clientes ativos
                                </p>
                                <p className="text-label-large text-content-primary">
                                    {formatNumberBR(item.activeClients)}
                                </p>
                            </div>

                            <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                                <p className="text-[11px] text-content-secondary">
                                    Vendidos no período
                                </p>
                                <p className="text-label-large text-content-primary">
                                    {formatNumberBR(item.sold)}
                                </p>
                            </div>

                            <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                                <p className="text-[11px] text-content-secondary">
                                    Expirados no período
                                </p>
                                <p className="text-label-large text-content-primary">
                                    {formatNumberBR(item.expired)}
                                </p>
                            </div>

                            <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                                <p className="text-[11px] text-content-secondary">
                                    Créditos usados / total
                                </p>
                                <p className="text-label-large text-content-primary">
                                    {formatNumberBR(item.creditsUsedSnapshot)} /{' '}
                                    {formatNumberBR(item.creditsTotal)}
                                </p>
                            </div>

                            <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                                <p className="text-[11px] text-content-secondary">
                                    % de uso
                                </p>
                                <p className="text-label-large text-content-primary">
                                    {formatPercentBR(item.usagePercent)}
                                </p>
                            </div>

                            <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                                <p className="text-[11px] text-content-secondary">
                                    Créditos restantes
                                </p>
                                <p className="text-label-large text-content-primary">
                                    {formatNumberBR(item.creditsRemaining)}
                                </p>
                            </div>

                            <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3">
                                <p className="text-[11px] text-content-secondary">
                                    Valor usado no período
                                </p>
                                <p className="text-label-large text-content-primary">
                                    {formatCurrencyBR(item.usedValue)}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </section>

            <section className="grid gap-4 grid-cols-1 xl:grid-cols-3">
                <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5">
                    <div className="space-y-2">
                        <h3 className="text-paragraph-medium text-content-primary">
                            Planos mais vendidos
                        </h3>

                        <p className="text-paragraph-small text-content-secondary">
                            Ranking dos planos com maior adesão no período.
                        </p>
                    </div>

                    <div className="mt-4">
                        {topSoldPlansRanking.length === 0 ? (
                            <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                <p className="text-paragraph-small text-content-secondary">
                                    Nenhum plano vendido neste período.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {topSoldPlansRanking.map((plan, index) => (
                                    <div
                                        key={`${plan.planId}-${index}`}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-paragraph-small text-content-secondary">
                                                #{index + 1} •{' '}
                                                {getPlanTypeLabel(plan.type)}
                                            </p>
                                            <p className="truncate text-label-medium-size text-content-primary">
                                                {plan.name}
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-label-medium-size text-content-primary">
                                                {formatTopLabel(
                                                    plan.total,
                                                    'adesão',
                                                    'adesões'
                                                )}
                                            </p>
                                            <p className="text-[11px] text-content-secondary">
                                                Total no período
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5">
                    <div className="space-y-2">
                        <h3 className="text-paragraph-medium text-content-primary">
                            Planos mais utilizados
                        </h3>

                        <p className="text-paragraph-small text-content-secondary">
                            Planos com maior volume de uso de créditos no
                            período.
                        </p>
                    </div>

                    <div className="mt-4">
                        {topUsedPlansRanking.length === 0 ? (
                            <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                <p className="text-paragraph-small text-content-secondary">
                                    Nenhum uso de plano no período.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {topUsedPlansRanking.map((plan, index) => (
                                    <div
                                        key={`${plan.planId}-${index}`}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-paragraph-small text-content-secondary">
                                                #{index + 1} •{' '}
                                                {getPlanTypeLabel(plan.type)}
                                            </p>
                                            <p className="truncate text-label-medium-size text-content-primary">
                                                {plan.name}
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-label-medium-size text-content-primary">
                                                {formatTopLabel(
                                                    plan.total,
                                                    'uso',
                                                    'usos'
                                                )}
                                            </p>
                                            <p className="text-[11px] text-content-secondary">
                                                Créditos utilizados
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5">
                    <div className="space-y-2">
                        <h3 className="text-paragraph-medium text-content-primary">
                            Planos expirados no período
                        </h3>

                        <p className="text-paragraph-small text-content-secondary">
                            Acompanhe os planos que perderam validade no período
                            selecionado.
                        </p>
                    </div>

                    <div className="mt-4">
                        {expiredPlansList.length === 0 ? (
                            <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                <p className="text-paragraph-small text-content-secondary">
                                    Nenhum plano expirado neste período.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {expiredPlansList.map((plan) => (
                                    <div
                                        key={plan.id}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-label-medium-size text-content-primary">
                                                {plan.planNameSnapshot ||
                                                    'Plano'}
                                            </p>
                                            <p className="mt-1 truncate text-[11px] text-content-secondary">
                                                {getPlanTypeLabel(
                                                    toSafePlanType(
                                                        plan.planTypeSnapshot
                                                    )
                                                )}{' '}
                                                •{' '}
                                                {plan.client?.name?.trim() ||
                                                    plan.client?.email ||
                                                    'Cliente'}
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-label-medium-size text-content-primary">
                                                {formatDateBR(plan.expiresAt)}
                                            </p>
                                            <p className="text-[11px] text-content-secondary">
                                                Expirado em
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
