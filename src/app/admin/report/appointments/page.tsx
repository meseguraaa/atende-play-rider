// src/app/admin/report/appointments/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import {
    ArrowLeft,
    BarChart3,
    CalendarCheck2,
    CalendarClock,
    CalendarX2,
    CircleCheckBig,
    Users,
} from 'lucide-react';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';

import { MonthPicker } from '@/components/month-picker';
import { AppointmentsReportChart } from '@/components/admin/reports/appointments-report-chart/appointments-report-chart';
import { AppointmentsOriginChart } from '@/components/admin/reports/appointments-origin-chart/appointments-origin-chart';
import { AppointmentsTopServicesChart } from '@/components/admin/reports/appointments-top-services-chart/appointments-top-services-chart';
import { AppointmentsTopCanceledServicesChart } from '@/components/admin/reports/appointments-top-canceled-services-chart/appointments-top-canceled-services-chart';
import { AppointmentsCancelRateByServiceChart } from '@/components/admin/reports/appointments-cancel-rate-by-service-chart/appointments-cancel-rate-by-service-chart';
import { AppointmentsTopServicesRevenueChart } from '@/components/admin/reports/appointments-top-services-revenue-chart/appointments-top-services-revenue-chart';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Relatório de Agendamentos',
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

function getSingleParam(v: string | string[] | undefined): string | undefined {
    if (v == null) return undefined;
    return Array.isArray(v) ? v[0] : v;
}

function formatNumberBR(value: number) {
    return new Intl.NumberFormat('pt-BR').format(value);
}

function formatPercentBR(value: number) {
    return `${value.toFixed(1).replace('.', ',')}%`;
}

function formatMonthLabelBR(year: number, month: number) {
    const date = new Date(Date.UTC(year, month - 1, 1));

    return new Intl.DateTimeFormat('pt-BR', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    })
        .format(date)
        .replace('.', '');
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

    throw new Error(
        `companyId ausente (session.companyId, cookie "${COMPANY_COOKIE_NAME}" e sem fallback por membership).`
    );
}

export default async function AdminAppointmentsReportPage({
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

    // ===== MÊS ATUAL =====
    const currentStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const currentEnd = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));

    // ===== MÊS ANTERIOR =====
    const prevDate = new Date(Date.UTC(y, m - 2, 1));
    const prevY = prevDate.getUTCFullYear();
    const prevM = prevDate.getUTCMonth() + 1;

    const prevStart = new Date(Date.UTC(prevY, prevM - 1, 1, 0, 0, 0, 0));
    const prevEnd = new Date(Date.UTC(prevY, prevM, 1, 0, 0, 0, 0));

    // ===== LABELS =====
    const currentMonthLabel = formatMonthLabelBR(y, m);
    const previousMonthLabel = formatMonthLabelBR(prevY, prevM);

    // ===== BASE WHERE =====
    const baseAppointmentWhere: any = {
        companyId,
        ...(selectedUnit !== UNIT_ALL_VALUE ? { unitId: selectedUnit } : {}),
    };

    const appointmentWhere: any = {
        ...baseAppointmentWhere,
        scheduleAt: {
            gte: currentStart,
            lt: currentEnd,
        },
    };

    const previousAppointmentWhere: any = {
        ...baseAppointmentWhere,
        scheduleAt: {
            gte: prevStart,
            lt: prevEnd,
        },
    };

    const [
        totalAppointments,
        totalDone,
        totalCanceled,
        totalConfirmed,
        totalAdminPanel,
        totalProfessionalPanel,
        totalClientApp,
        totalClientWhatsapp,
        totalPreviousAppointments,
        totalPreviousCanceled,
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
        prisma.appointment.count({
            where: {
                ...appointmentWhere,
                confirmationStatus: 'CONFIRMED',
            },
        }),
        prisma.appointment.count({
            where: {
                ...appointmentWhere,
                createdSource: 'ADMIN_PANEL',
            },
        }),
        prisma.appointment.count({
            where: {
                ...appointmentWhere,
                createdSource: 'PROFESSIONAL_PANEL',
            },
        }),
        prisma.appointment.count({
            where: {
                ...appointmentWhere,
                createdSource: 'CLIENT_APP',
            },
        }),
        prisma.appointment.count({
            where: {
                ...appointmentWhere,
                createdSource: 'CLIENT_WHATSAPP',
            },
        }),
        prisma.appointment.count({
            where: previousAppointmentWhere,
        }),
        prisma.appointment.count({
            where: {
                ...previousAppointmentWhere,
                status: 'CANCELED',
            },
        }),
    ]);

    const originDescription = [
        `Admin: ${formatNumberBR(totalAdminPanel)}`,
        `Profissional: ${formatNumberBR(totalProfessionalPanel)}`,
        `App: ${formatNumberBR(totalClientApp)}`,
        `WhatsApp: ${formatNumberBR(totalClientWhatsapp)}`,
    ].join(' • ');

    const originChartData = [
        { name: 'Admin', value: totalAdminPanel },
        { name: 'Profissional', value: totalProfessionalPanel },
        { name: 'App', value: totalClientApp },
        { name: 'WhatsApp', value: totalClientWhatsapp },
    ];

    // ===== TOP SERVIÇOS =====
    const topServicesRaw = await prisma.appointment.groupBy({
        by: ['serviceId'],
        where: {
            ...appointmentWhere,
            serviceId: { not: null },
        },
        _count: {
            serviceId: true,
        },
        orderBy: {
            _count: {
                serviceId: 'desc',
            },
        },
        take: 5,
    });

    // ===== SERVIÇOS MAIS CANCELADOS =====
    const topCanceledServicesRaw = await prisma.appointment.groupBy({
        by: ['serviceId'],
        where: {
            ...appointmentWhere,
            status: 'CANCELED',
            serviceId: { not: null },
        },
        _count: {
            serviceId: true,
        },
        orderBy: {
            _count: {
                serviceId: 'desc',
            },
        },
        take: 5,
    });

    const canceledServices = await prisma.service.findMany({
        where: {
            id: {
                in: topCanceledServicesRaw.map((s) => s.serviceId!),
            },
        },
        select: {
            id: true,
            name: true,
        },
    });

    const canceledServicesMap = new Map(
        canceledServices.map((s) => [s.id, s.name])
    );

    const topCanceledServicesChartData = topCanceledServicesRaw.map((s) => ({
        name: canceledServicesMap.get(s.serviceId!) ?? '—',
        total: s._count.serviceId,
    }));

    const services = await prisma.service.findMany({
        where: {
            id: {
                in: topServicesRaw.map((s) => s.serviceId!),
            },
        },
        select: {
            id: true,
            name: true,
        },
    });

    const servicesMap = new Map(services.map((s) => [s.id, s.name]));

    const topServicesChartData = topServicesRaw.map((s) => ({
        name: servicesMap.get(s.serviceId!) ?? '—',
        total: s._count.serviceId,
    }));

    // ===== TAXA DE CANCELAMENTO POR SERVIÇO =====
    const serviceStatsMap = new Map<
        string,
        { total: number; canceled: number }
    >();

    for (const item of topServicesRaw) {
        const id = item.serviceId!;
        serviceStatsMap.set(id, {
            total: item._count.serviceId,
            canceled: 0,
        });
    }

    for (const item of topCanceledServicesRaw) {
        const id = item.serviceId!;
        const existing = serviceStatsMap.get(id);

        if (existing) {
            existing.canceled = item._count.serviceId;
        } else {
            serviceStatsMap.set(id, {
                total: item._count.serviceId,
                canceled: item._count.serviceId,
            });
        }
    }

    // ===== RECEITA POR SERVIÇO =====
    const topServicesRevenueRaw = await prisma.orderItem.groupBy({
        by: ['serviceId'],
        where: {
            companyId,
            serviceId: { not: null },
            itemType: 'SERVICE',
            order: {
                status: 'COMPLETED',
                ...(selectedUnit !== UNIT_ALL_VALUE
                    ? { unitId: selectedUnit }
                    : {}),
            },
        },
        _sum: {
            finalTotalPrice: true,
            totalPrice: true,
        },
        orderBy: {
            _sum: {
                finalTotalPrice: 'desc',
            },
        },
        take: 5,
    });

    const revenueServices = await prisma.service.findMany({
        where: {
            id: {
                in: topServicesRevenueRaw.map((s) => s.serviceId!),
            },
        },
        select: {
            id: true,
            name: true,
        },
    });

    const revenueServicesMap = new Map(
        revenueServices.map((s) => [s.id, s.name])
    );

    const topServicesRevenueChartData = topServicesRevenueRaw.map((s) => {
        const value =
            Number(s._sum.finalTotalPrice ?? 0) ||
            Number(s._sum.totalPrice ?? 0);

        return {
            name: revenueServicesMap.get(s.serviceId!) ?? '—',
            value,
        };
    });

    const cancelRateByServiceData = Array.from(serviceStatsMap.entries())
        .map(([serviceId, stats]) => {
            const rate =
                stats.total > 0 ? (stats.canceled / stats.total) * 100 : 0;

            return {
                name: servicesMap.get(serviceId) ?? '—',
                rate,
                canceled: stats.canceled,
                total: stats.total,
            };
        })
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 5);

    // ✅ Ranking de profissionais (Top 5)
    const topProfessionalsRaw = await prisma.appointment.groupBy({
        by: ['professionalId'],
        where: {
            ...appointmentWhere,
            professionalId: { not: null },
        },
        _count: {
            professionalId: true,
        },
        orderBy: {
            _count: {
                professionalId: 'desc',
            },
        },
        take: 5,
    });

    const professionals = await prisma.professional.findMany({
        where: {
            id: {
                in: topProfessionalsRaw.map((p) => p.professionalId!),
            },
        },
        select: {
            id: true,
            name: true,
        },
    });

    const professionalsMap = new Map(professionals.map((p) => [p.id, p.name]));

    const topProfessionalsDescription = topProfessionalsRaw
        .map((p) => {
            const name = professionalsMap.get(p.professionalId!) ?? '—';
            const total = p._count.professionalId;
            return `${name} (${formatNumberBR(total)})`;
        })
        .join(' • ');

    const topProfessionalsCount = topProfessionalsRaw.length;

    const topProfessionalsLegend =
        topProfessionalsCount > 0
            ? `Profissionais com mais agendamentos no mês (${topProfessionalsCount}).`
            : 'Nenhum profissional com agendamentos no mês.';

    // ===== GRÁFICO: MÊS ATUAL =====
    const currentRaw = await prisma.appointment.groupBy({
        by: ['scheduleAt'],
        where: appointmentWhere,
        _count: {
            scheduleAt: true,
        },
    });

    // ===== GRÁFICO: MÊS ANTERIOR =====
    const previousRaw = await prisma.appointment.groupBy({
        by: ['scheduleAt'],
        where: previousAppointmentWhere,
        _count: {
            scheduleAt: true,
        },
    });

    const daysInMonth = new Date(y, m, 0).getUTCDate();

    const currentMap = new Map<number, number>();
    const previousMap = new Map<number, number>();

    for (let day = 1; day <= daysInMonth; day++) {
        currentMap.set(day, 0);
        previousMap.set(day, 0);
    }

    for (const item of currentRaw) {
        const d = new Date(item.scheduleAt).getUTCDate();
        currentMap.set(d, (currentMap.get(d) ?? 0) + item._count.scheduleAt);
    }

    for (const item of previousRaw) {
        const d = new Date(item.scheduleAt).getUTCDate();
        previousMap.set(d, (previousMap.get(d) ?? 0) + item._count.scheduleAt);
    }

    const appointmentsPerDay = Array.from(currentMap.entries()).map(
        ([day, currentValue]) => ({
            day,
            currentMonth: currentValue,
            previousMonth: previousMap.get(day) ?? 0,
        })
    );

    const totalCurrent = Array.from(currentMap.values()).reduce(
        (acc, v) => acc + v,
        0
    );

    const totalPrevious = Array.from(previousMap.values()).reduce(
        (acc, v) => acc + v,
        0
    );

    const variationPercentage =
        totalPrevious > 0
            ? ((totalCurrent - totalPrevious) / totalPrevious) * 100
            : null;

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
                        Relatório de agendamentos
                    </h1>

                    <p className="text-paragraph-small text-content-secondary">
                        Mês selecionado:{' '}
                        <span className="font-medium">{month}</span>
                    </p>
                </div>

                <div>
                    <MonthPicker />
                </div>
            </header>

            <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                <SummaryCard
                    title="Total de agendamentos"
                    value={formatNumberBR(totalAppointments)}
                    description="Quantidade total no mês selecionado."
                    icon={CalendarClock}
                />

                <SummaryCard
                    title="Agendamentos concluídos"
                    value={formatNumberBR(totalDone)}
                    description="Total de atendimentos concluídos no mês selecionado."
                    icon={CalendarCheck2}
                />

                <SummaryCard
                    title="Agendamentos cancelados"
                    value={formatNumberBR(totalCanceled)}
                    description="Total de cancelamentos no mês selecionado."
                    icon={CalendarX2}
                />

                <SummaryCard
                    title="Agendamentos confirmados"
                    value={formatNumberBR(totalConfirmed)}
                    description="Total de confirmações no mês selecionado."
                    icon={CircleCheckBig}
                />

                <SummaryCard
                    title="Origem dos agendamentos"
                    value={originDescription}
                    description="Distribuição por origem dos agendamentos."
                    icon={BarChart3}
                />

                <SummaryCard
                    title="Ranking de profissionais"
                    value={topProfessionalsDescription || 'Sem dados'}
                    description={topProfessionalsLegend}
                    icon={Users}
                />
            </section>

            <section className="grid gap-4 grid-cols-1 md:grid-cols-2">
                <AppointmentsReportChart
                    data={appointmentsPerDay}
                    currentMonthLabel={currentMonthLabel}
                    previousMonthLabel={previousMonthLabel}
                    variationPercentage={variationPercentage}
                />

                <AppointmentsOriginChart data={originChartData} />

                <AppointmentsTopServicesChart data={topServicesChartData} />

                <AppointmentsTopCanceledServicesChart
                    data={topCanceledServicesChartData}
                />

                <AppointmentsCancelRateByServiceChart
                    data={cancelRateByServiceData}
                />

                <AppointmentsTopServicesRevenueChart
                    data={topServicesRevenueChartData}
                />
            </section>
        </div>
    );
}
