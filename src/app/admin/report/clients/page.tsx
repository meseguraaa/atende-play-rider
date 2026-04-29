// src/app/admin/report/clients/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft, Users, UserPlus, Repeat, Percent } from 'lucide-react';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';
import { MonthPicker } from '@/components/month-picker';
import { ClientsNewVsRecurringChart } from '@/components/admin/reports/clients-new-vs-recurring-chart/clients-new-vs-recurring-chart';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Relatório de Clientes',
};

const COMPANY_COOKIE_NAME = 'admin_company_context';
const UNIT_COOKIE_NAME = 'admin_unit_context';
const UNIT_ALL_VALUE = 'all';
const TOP_CLIENT_OPTIONS = [10, 20, 30, 40, 50] as const;

type SummaryCardProps = {
    title: string;
    value: string;
    description: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

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

function formatPercentBR(value: number) {
    return `${value.toFixed(1).replace('.', ',')}%`;
}

function formatCurrencyBR(value: number) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    }).format(value);
}

function parseTopLimit(
    value: string | string[] | undefined,
    fallback = 10
): number {
    const parsed = Number(getSingleParam(value));

    return TOP_CLIENT_OPTIONS.includes(
        parsed as (typeof TOP_CLIENT_OPTIONS)[number]
    )
        ? parsed
        : fallback;
}

async function requireCompanyIdFromContext(session: any) {
    const sCompanyId = String(session?.companyId ?? '').trim();
    if (sCompanyId) return sCompanyId;

    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
    if (cookieCompanyId) return cookieCompanyId;

    const userId = String(session?.userId ?? '').trim();
    if (userId) {
        const membership = await prisma.companyMember.findFirst({
            where: { userId, isActive: true },
            orderBy: { createdAt: 'asc' },
            select: { companyId: true },
        });

        if (membership?.companyId) return membership.companyId;
    }

    throw new Error('companyId ausente.');
}

export default async function AdminClientsReportPage({
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

    const topSpentLimit = parseTopLimit(resolvedSearchParams.topSpent, 10);
    const topSelfBookingLimit = parseTopLimit(
        resolvedSearchParams.topSelfBooking,
        10
    );
    const topCanceledLimit = parseTopLimit(
        resolvedSearchParams.topCanceled,
        10
    );

    const cookieStore = await cookies();
    const selectedUnit =
        cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

    const [y, m] = month.split('-').map(Number);

    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));

    const appointmentBaseWhere: any = {
        companyId,
        ...(selectedUnit !== UNIT_ALL_VALUE ? { unitId: selectedUnit } : {}),
    };

    const appointmentMonthWhere: any = {
        ...appointmentBaseWhere,
        scheduleAt: {
            gte: start,
            lt: end,
        },
    };

    const selfBookingWhere: any = {
        companyId,
        ...(selectedUnit !== UNIT_ALL_VALUE ? { unitId: selectedUnit } : {}),
        createdAt: {
            gte: start,
            lt: end,
        },
        createdSource: {
            in: ['CLIENT_APP', 'CLIENT_WHATSAPP'],
        },
    };

    const [
        totalClients,
        newClientsInMonth,
        recurringGrouped,
        returnedGrouped,
        topClientsRaw,
        topSelfBookingRaw,
        topCanceledClientsRaw,
    ] = await Promise.all([
        prisma.companyMember.count({
            where: {
                companyId,
                role: 'CLIENT',
                ...(selectedUnit !== UNIT_ALL_VALUE
                    ? {
                          user: {
                              appointmentsAsClient: {
                                  some: {
                                      companyId,
                                      unitId: selectedUnit,
                                  },
                              },
                          },
                      }
                    : {}),
            },
        }),

        prisma.companyMember.count({
            where: {
                companyId,
                role: 'CLIENT',
                createdAt: {
                    gte: start,
                    lt: end,
                },
            },
        }),

        prisma.appointment.groupBy({
            by: ['clientId'],
            where: {
                ...appointmentBaseWhere,
                status: 'DONE',
            },
            _count: {
                clientId: true,
            },
        }),

        prisma.appointment.groupBy({
            by: ['clientId'],
            where: {
                ...appointmentMonthWhere,
                status: 'DONE',
            },
            _count: {
                clientId: true,
            },
        }),

        prisma.order.groupBy({
            by: ['clientId'],
            where: {
                companyId,
                status: 'COMPLETED',
                clientId: { not: null },
                createdAt: {
                    gte: start,
                    lt: end,
                },
                ...(selectedUnit !== UNIT_ALL_VALUE
                    ? { unitId: selectedUnit }
                    : {}),
            },
            _sum: {
                totalAmount: true,
            },
            orderBy: {
                _sum: {
                    totalAmount: 'desc',
                },
            },
            take: topSpentLimit,
        }),

        prisma.appointment.groupBy({
            by: ['clientId', 'createdSource'],
            where: {
                ...selfBookingWhere,
                createdSource: {
                    in: ['CLIENT_APP', 'CLIENT_WHATSAPP'],
                },
            },
            _count: {
                _all: true,
            },
        }),

        prisma.appointment.groupBy({
            by: ['clientId'],
            where: {
                ...appointmentMonthWhere,
                status: 'CANCELED',
            },
            _count: {
                clientId: true,
            },
            orderBy: {
                _count: {
                    clientId: 'desc',
                },
            },
            take: topCanceledLimit,
        }),
    ]);

    const recurringClients = recurringGrouped.filter(
        (item) => item._count.clientId > 1
    ).length;

    const returnedClients = returnedGrouped.filter(
        (item) => item._count.clientId > 0
    ).length;

    const retentionRate =
        newClientsInMonth > 0 ? (returnedClients / newClientsInMonth) * 100 : 0;

    const clientsChartData = [
        {
            name: 'Novos',
            value: newClientsInMonth,
        },
        {
            name: 'Recorrentes',
            value: recurringClients,
        },
    ];

    const topClientIds = topClientsRaw
        .map((item) => item.clientId)
        .filter((id): id is string => !!id);

    const selfBookingClientIds = topSelfBookingRaw
        .map((item) => item.clientId)
        .filter((id): id is string => !!id);

    const canceledClientIds = topCanceledClientsRaw
        .map((item) => item.clientId)
        .filter((id): id is string => !!id);

    const uniqueUserIds = Array.from(
        new Set([
            ...topClientIds,
            ...selfBookingClientIds,
            ...canceledClientIds,
        ])
    );

    const users = uniqueUserIds.length
        ? await prisma.user.findMany({
              where: {
                  id: {
                      in: uniqueUserIds,
                  },
              },
              select: {
                  id: true,
                  name: true,
                  email: true,
              },
          })
        : [];

    const usersMap = new Map(
        users.map((user) => [
            user.id,
            user.name?.trim() || user.email || 'Cliente',
        ])
    );

    const topClientsRanking = topClientsRaw.map((item) => ({
        clientId: item.clientId!,
        name: usersMap.get(item.clientId!) ?? 'Cliente',
        total: Number(item._sum.totalAmount ?? 0),
    }));

    const selfBookingMap = new Map<
        string,
        {
            app: number;
            whatsapp: number;
            total: number;
        }
    >();

    for (const item of topSelfBookingRaw) {
        const clientId = String(item.clientId || '').trim();
        if (!clientId) continue;

        const current = selfBookingMap.get(clientId) ?? {
            app: 0,
            whatsapp: 0,
            total: 0,
        };

        const count = item._count._all;

        if (item.createdSource === 'CLIENT_APP') {
            current.app += count;
        }

        if (item.createdSource === 'CLIENT_WHATSAPP') {
            current.whatsapp += count;
        }

        current.total += count;

        selfBookingMap.set(clientId, current);
    }

    const topSelfBookingRanking = Array.from(selfBookingMap.entries())
        .map(([clientId, stats]) => ({
            clientId,
            name: usersMap.get(clientId) ?? 'Cliente',
            app: stats.app,
            whatsapp: stats.whatsapp,
            total: stats.total,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, topSelfBookingLimit);

    const topCanceledClientsRanking = topCanceledClientsRaw
        .map((item) => ({
            clientId: item.clientId!,
            name: usersMap.get(item.clientId!) ?? 'Cliente',
            total: item._count.clientId,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, topCanceledLimit);

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
                        Relatório de clientes
                    </h1>

                    <p className="text-paragraph-small text-content-secondary">
                        Acompanhe crescimento da base, retenção e comportamento
                        dos seus clientes.
                    </p>
                </div>

                <div>
                    <MonthPicker />
                </div>
            </header>

            <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    title="Total de clientes"
                    value={formatNumberBR(totalClients)}
                    description="Quantidade total de clientes cadastrados."
                    icon={Users}
                />

                <SummaryCard
                    title="Novos clientes"
                    value={formatNumberBR(newClientsInMonth)}
                    description="Clientes cadastrados no mês selecionado."
                    icon={UserPlus}
                />

                <SummaryCard
                    title="Clientes recorrentes"
                    value={formatNumberBR(recurringClients)}
                    description="Clientes com mais de um atendimento concluído."
                    icon={Repeat}
                />

                <SummaryCard
                    title="Taxa de retenção"
                    value={formatPercentBR(retentionRate)}
                    description="Percentual de retorno com base no mês selecionado."
                    icon={Percent}
                />
            </section>

            <section className="grid gap-4 grid-cols-1 xl:grid-cols-2">
                <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5">
                    <div className="space-y-2">
                        <h3 className="text-paragraph-medium text-content-primary">
                            Novos vs recorrentes
                        </h3>

                        <p className="text-paragraph-small text-content-secondary">
                            Evolução de novos clientes versus clientes que
                            retornam ao longo do período.
                        </p>
                    </div>

                    <div className="mt-4">
                        <ClientsNewVsRecurringChart data={clientsChartData} />
                    </div>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                            <h3 className="text-paragraph-medium text-content-primary">
                                Clientes que mais gastam
                            </h3>

                            <p className="text-paragraph-small text-content-secondary">
                                Ranking dos clientes com maior valor acumulado
                                no sistema.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {TOP_CLIENT_OPTIONS.map((option) => {
                                const params = new URLSearchParams();
                                params.set('month', month);
                                params.set('topSpent', String(option));
                                params.set(
                                    'topSelfBooking',
                                    String(topSelfBookingLimit)
                                );
                                params.set(
                                    'topCanceled',
                                    String(topCanceledLimit)
                                );

                                const href = `/admin/report/clients?${params.toString()}`;
                                const isActive = topSpentLimit === option;

                                return (
                                    <Link
                                        key={option}
                                        href={href}
                                        className={[
                                            'inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                                            isActive
                                                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                                                : 'border-border-primary bg-background-secondary text-content-secondary hover:bg-background-secondary/70',
                                        ].join(' ')}
                                    >
                                        Top {option}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-4">
                        {topClientsRanking.length === 0 ? (
                            <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                <p className="text-paragraph-small text-content-secondary">
                                    Nenhum cliente com faturamento neste
                                    período.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {topClientsRanking.map((client, index) => (
                                    <div
                                        key={client.clientId}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-paragraph-small text-content-secondary">
                                                #{index + 1}
                                            </p>
                                            <p className="truncate text-label-medium-size text-content-primary">
                                                {client.name}
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-label-medium-size text-content-primary">
                                                {formatCurrencyBR(client.total)}
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
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                            <h3 className="text-paragraph-medium text-content-primary">
                                Clientes que mais fizeram autoagendamento
                            </h3>

                            <p className="text-paragraph-small text-content-secondary">
                                Ranking de clientes que mais agendaram sozinhos
                                via app e WhatsApp no período.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {TOP_CLIENT_OPTIONS.map((option) => {
                                const params = new URLSearchParams();
                                params.set('month', month);
                                params.set('topSpent', String(topSpentLimit));
                                params.set('topSelfBooking', String(option));
                                params.set(
                                    'topCanceled',
                                    String(topCanceledLimit)
                                );

                                const href = `/admin/report/clients?${params.toString()}`;
                                const isActive = topSelfBookingLimit === option;

                                return (
                                    <Link
                                        key={option}
                                        href={href}
                                        className={[
                                            'inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                                            isActive
                                                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                                                : 'border-border-primary bg-background-secondary text-content-secondary hover:bg-background-secondary/70',
                                        ].join(' ')}
                                    >
                                        Top {option}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-4">
                        {topSelfBookingRanking.length === 0 ? (
                            <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                <p className="text-paragraph-small text-content-secondary">
                                    Nenhum autoagendamento neste período.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {topSelfBookingRanking.map((client, index) => (
                                    <div
                                        key={client.clientId}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-paragraph-small text-content-secondary">
                                                #{index + 1}
                                            </p>
                                            <p className="truncate text-label-medium-size text-content-primary">
                                                {client.name}
                                            </p>
                                            <p className="mt-1 text-[11px] text-content-secondary">
                                                App:{' '}
                                                {formatNumberBR(client.app)} •
                                                WhatsApp:{' '}
                                                {formatNumberBR(
                                                    client.whatsapp
                                                )}
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-label-medium-size text-content-primary">
                                                {formatNumberBR(client.total)}
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
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                            <h3 className="text-paragraph-medium text-content-primary">
                                Clientes que mais cancelaram
                            </h3>

                            <p className="text-paragraph-small text-content-secondary">
                                Ranking de clientes com maior volume de
                                cancelamentos no período.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {TOP_CLIENT_OPTIONS.map((option) => {
                                const params = new URLSearchParams();
                                params.set('month', month);
                                params.set('topSpent', String(topSpentLimit));
                                params.set(
                                    'topSelfBooking',
                                    String(topSelfBookingLimit)
                                );
                                params.set('topCanceled', String(option));

                                const href = `/admin/report/clients?${params.toString()}`;
                                const isActive = topCanceledLimit === option;

                                return (
                                    <Link
                                        key={option}
                                        href={href}
                                        className={[
                                            'inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                                            isActive
                                                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                                                : 'border-border-primary bg-background-secondary text-content-secondary hover:bg-background-secondary/70',
                                        ].join(' ')}
                                    >
                                        Top {option}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-4">
                        {topCanceledClientsRanking.length === 0 ? (
                            <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                <p className="text-paragraph-small text-content-secondary">
                                    Nenhum cancelamento neste período.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {topCanceledClientsRanking.map(
                                    (client, index) => (
                                        <div
                                            key={client.clientId}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-paragraph-small text-content-secondary">
                                                    #{index + 1}
                                                </p>
                                                <p className="truncate text-label-medium-size text-content-primary">
                                                    {client.name}
                                                </p>
                                            </div>

                                            <div className="text-right">
                                                <p className="text-label-medium-size text-content-primary">
                                                    {formatNumberBR(
                                                        client.total
                                                    )}
                                                </p>
                                                <p className="text-[11px] text-content-secondary">
                                                    Cancelamentos
                                                </p>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
