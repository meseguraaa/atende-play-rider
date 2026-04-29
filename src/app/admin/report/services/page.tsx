// src/app/admin/report/services/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft, Scissors, TrendingUp, Ban, Percent } from 'lucide-react';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';
import { MonthPicker } from '@/components/month-picker';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Relatório de Serviços',
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

function formatTopLabel(value: number, singular: string, plural: string) {
    return `${formatNumberBR(value)} ${value === 1 ? singular : plural}`;
}

function formatRateBR(value: number) {
    return `${value.toFixed(1).replace('.', ',')}%`;
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

export default async function AdminServicesReportPage({
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

    const appointmentWhere: any = {
        companyId,
        scheduleAt: {
            gte: start,
            lt: end,
        },
        serviceId: { not: null },
        ...(selectedUnit !== UNIT_ALL_VALUE ? { unitId: selectedUnit } : {}),
    };

    const [
        totalServices,
        completedServices,
        canceledServices,
        topServicesRaw,
        topCanceledServicesRaw,
    ] = await Promise.all([
        prisma.appointment.count({
            where: appointmentWhere,
        }),

        prisma.appointment.count({
            where: {
                ...appointmentWhere,
                status: 'DONE',
            },
        }),

        prisma.appointment.count({
            where: {
                ...appointmentWhere,
                status: 'CANCELED',
            },
        }),

        prisma.appointment.groupBy({
            by: ['serviceId'],
            where: appointmentWhere,
            _count: {
                serviceId: true,
            },
            orderBy: {
                _count: {
                    serviceId: 'desc',
                },
            },
            take: 10,
        }),

        prisma.appointment.groupBy({
            by: ['serviceId'],
            where: {
                ...appointmentWhere,
                status: 'CANCELED',
            },
            _count: {
                serviceId: true,
            },
            orderBy: {
                _count: {
                    serviceId: 'desc',
                },
            },
            take: 10,
        }),
    ]);

    const cancellationRate =
        totalServices > 0 ? (canceledServices / totalServices) * 100 : 0;

    const topServiceIds = Array.from(
        new Set([
            ...topServicesRaw.map((item) => item.serviceId),
            ...topCanceledServicesRaw.map((item) => item.serviceId),
        ])
    ).filter((id): id is string => !!id);

    const topServices = topServiceIds.length
        ? await prisma.service.findMany({
              where: {
                  id: {
                      in: topServiceIds,
                  },
              },
              select: {
                  id: true,
                  name: true,
              },
          })
        : [];

    const topServicesMap = new Map(topServices.map((s) => [s.id, s.name]));

    const topServicesRanking = topServicesRaw.map((item) => ({
        serviceId: item.serviceId!,
        name: topServicesMap.get(item.serviceId!) ?? 'Serviço',
        total: item._count.serviceId,
    }));

    const topCanceledServicesRanking = topCanceledServicesRaw.map((item) => ({
        serviceId: item.serviceId!,
        name: topServicesMap.get(item.serviceId!) ?? 'Serviço',
        total: item._count.serviceId,
    }));

    const serviceStatsMap = new Map<
        string,
        { total: number; canceled: number }
    >();

    for (const item of topServicesRaw) {
        const serviceId = item.serviceId!;
        serviceStatsMap.set(serviceId, {
            total: item._count.serviceId,
            canceled: 0,
        });
    }

    for (const item of topCanceledServicesRaw) {
        const serviceId = item.serviceId!;
        const existing = serviceStatsMap.get(serviceId);

        if (existing) {
            existing.canceled = item._count.serviceId;
        } else {
            serviceStatsMap.set(serviceId, {
                total: item._count.serviceId,
                canceled: item._count.serviceId,
            });
        }
    }

    const cancelRateByServiceRanking = Array.from(serviceStatsMap.entries())
        .map(([serviceId, stats]) => {
            const rate =
                stats.total > 0 ? (stats.canceled / stats.total) * 100 : 0;

            return {
                serviceId,
                name: topServicesMap.get(serviceId) ?? 'Serviço',
                total: stats.total,
                canceled: stats.canceled,
                rate,
            };
        })
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 10);

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
                        Relatório de serviços
                    </h1>

                    <p className="text-paragraph-small text-content-secondary">
                        Analise o desempenho dos serviços, volume de vendas,
                        cancelamentos e comportamento no período selecionado.
                    </p>
                </div>

                <div>
                    <MonthPicker />
                </div>
            </header>

            <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    title="Total de serviços"
                    value={formatNumberBR(totalServices)}
                    description="Quantidade total de serviços no período."
                    icon={Scissors}
                />

                <SummaryCard
                    title="Serviços concluídos"
                    value={formatNumberBR(completedServices)}
                    description="Serviços realizados com sucesso."
                    icon={TrendingUp}
                />

                <SummaryCard
                    title="Serviços cancelados"
                    value={formatNumberBR(canceledServices)}
                    description="Total de cancelamentos no período."
                    icon={Ban}
                />

                <SummaryCard
                    title="Taxa de cancelamento"
                    value={formatPercentBR(cancellationRate)}
                    description="Percentual de cancelamentos sobre o total."
                    icon={Percent}
                />
            </section>

            <section className="grid gap-4 grid-cols-1 xl:grid-cols-3">
                <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5">
                    <div className="space-y-2">
                        <h3 className="text-paragraph-medium text-content-primary">
                            Serviços mais agendados
                        </h3>

                        <p className="text-paragraph-small text-content-secondary">
                            Ranking dos serviços com maior volume de
                            agendamentos.
                        </p>
                    </div>

                    <div className="mt-4">
                        {topServicesRanking.length === 0 ? (
                            <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                <p className="text-paragraph-small text-content-secondary">
                                    Nenhum serviço agendado neste período.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {topServicesRanking.map((service, index) => (
                                    <div
                                        key={service.serviceId}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-paragraph-small text-content-secondary">
                                                #{index + 1}
                                            </p>
                                            <p className="truncate text-label-medium-size text-content-primary">
                                                {service.name}
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-label-medium-size text-content-primary">
                                                {formatTopLabel(
                                                    service.total,
                                                    'agendamento',
                                                    'agendamentos'
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
                            Serviços mais cancelados
                        </h3>

                        <p className="text-paragraph-small text-content-secondary">
                            Serviços com maior volume de cancelamentos.
                        </p>
                    </div>

                    <div className="mt-4">
                        {topCanceledServicesRanking.length === 0 ? (
                            <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                <p className="text-paragraph-small text-content-secondary">
                                    Nenhum serviço cancelado neste período.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {topCanceledServicesRanking.map(
                                    (service, index) => (
                                        <div
                                            key={service.serviceId}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-paragraph-small text-content-secondary">
                                                    #{index + 1}
                                                </p>
                                                <p className="truncate text-label-medium-size text-content-primary">
                                                    {service.name}
                                                </p>
                                            </div>

                                            <div className="text-right">
                                                <p className="text-label-medium-size text-content-primary">
                                                    {formatTopLabel(
                                                        service.total,
                                                        'cancelamento',
                                                        'cancelamentos'
                                                    )}
                                                </p>
                                                <p className="text-[11px] text-content-secondary">
                                                    Total no período
                                                </p>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5">
                    <div className="space-y-2">
                        <h3 className="text-paragraph-medium text-content-primary">
                            Taxa de cancelamento por serviço
                        </h3>

                        <p className="text-paragraph-small text-content-secondary">
                            Serviços com maior percentual de cancelamento.
                        </p>
                    </div>

                    <div className="mt-4">
                        {cancelRateByServiceRanking.length === 0 ? (
                            <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                <p className="text-paragraph-small text-content-secondary">
                                    Nenhum dado de cancelamento neste período.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {cancelRateByServiceRanking.map(
                                    (service, index) => (
                                        <div
                                            key={service.serviceId}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-paragraph-small text-content-secondary">
                                                    #{index + 1}
                                                </p>
                                                <p className="truncate text-label-medium-size text-content-primary">
                                                    {service.name}
                                                </p>
                                                <p className="mt-1 text-[11px] text-content-secondary">
                                                    {formatNumberBR(
                                                        service.canceled
                                                    )}{' '}
                                                    cancelados de{' '}
                                                    {formatNumberBR(
                                                        service.total
                                                    )}{' '}
                                                    agendamentos
                                                </p>
                                            </div>

                                            <div className="text-right">
                                                <p className="text-label-medium-size text-content-primary">
                                                    {formatRateBR(service.rate)}
                                                </p>
                                                <p className="text-[11px] text-content-secondary">
                                                    Taxa no período
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
