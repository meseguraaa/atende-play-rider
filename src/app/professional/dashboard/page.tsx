// src/app/professional/dashboard/page.tsx
import type { Metadata } from 'next';

import { prisma } from '@/lib/prisma';
import { requireProfessionalSession } from '@/lib/professional-permissions';

import { endOfMonth, startOfMonth } from 'date-fns';

import { DatePicker } from '@/components/date-picker';

// ✅ client que renderiza a lista viva (editar/concluir/cancelar)
import ProfessionalAppointmentsClient from './professional-appointments-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Profissional | Dashboard',
};

type SearchParamsShape = {
    date?: string; // yyyy-MM-dd (filtro do DIA)
    month?: string; // yyyy-MM (filtro do MÊS)
};

/**
 * ✅ Next (versões recentes) pode tipar `searchParams` como Promise nos tipos gerados.
 * Para evitar conflito com `.next/dev/types/...`, tratamos como Promise<any>.
 */
type PageProps = {
    searchParams?: Promise<any>;
};

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

/* ---------------------------------------------------------
 * ✅ Decimal-safe helpers (evita NaN com Prisma.Decimal)
 * ---------------------------------------------------------*/
function toNumberDecimal(v: unknown): number {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;

    if (typeof v === 'string') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : NaN;
    }

    if (typeof v === 'object') {
        const anyObj = v as any;
        if (typeof anyObj?.toNumber === 'function') {
            const n = anyObj.toNumber();
            return Number.isFinite(n) ? n : NaN;
        }
        if (typeof anyObj?.toString === 'function') {
            const n = Number(String(anyObj.toString()).replace(',', '.'));
            return Number.isFinite(n) ? n : NaN;
        }
    }

    const n = Number(v as any);
    return Number.isFinite(n) ? n : NaN;
}

/* ---------------------------------------------------------
 * ✅ Date helpers (dia em America/Sao_Paulo => range UTC)
 * - evita "sumir" agendamentos quando o server roda em UTC
 * ---------------------------------------------------------*/
const SAO_PAULO_UTC_OFFSET_HOURS = 3; // SP = UTC-03 => 00:00 SP = 03:00 UTC

function parseYMD(
    dateStr?: string
): { y: number; m: number; d: number } | null {
    const raw = normalizeString(dateStr);
    if (!raw) return null;

    const [y, m, d] = raw.split('-').map(Number);
    if (!y || !m || !d) return null;

    return { y, m, d };
}

function getTodayYMDInSaoPaulo(): { y: number; m: number; d: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());

    const y = Number(parts.find((p) => p.type === 'year')?.value ?? '0');
    const m = Number(parts.find((p) => p.type === 'month')?.value ?? '0');
    const d = Number(parts.find((p) => p.type === 'day')?.value ?? '0');

    return { y, m, d };
}

function buildSaoPauloDayUtcRange(ymd: { y: number; m: number; d: number }) {
    const { y, m, d } = ymd;

    const startUtcMs = Date.UTC(
        y,
        m - 1,
        d,
        SAO_PAULO_UTC_OFFSET_HOURS,
        0,
        0,
        0
    );

    const nextDayStartUtcMs = Date.UTC(
        y,
        m - 1,
        d + 1,
        SAO_PAULO_UTC_OFFSET_HOURS,
        0,
        0,
        0
    );

    return {
        startUtc: new Date(startUtcMs),
        endUtc: new Date(nextDayStartUtcMs - 1),
    };
}

function parseMonthParam(monthParam?: string): Date {
    const raw = normalizeString(monthParam);
    if (!raw) return startOfMonth(new Date());

    // esperado yyyy-MM
    const [y, m] = raw.split('-').map(Number);
    if (!y || !m) return startOfMonth(new Date());

    return startOfMonth(new Date(y, m - 1, 1));
}

function clampToPct(v: number) {
    if (!Number.isFinite(v)) return 0;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
}

function safeAdd(a: number, b: number) {
    const aa = Number.isFinite(a) ? a : 0;
    const bb = Number.isFinite(b) ? b : 0;
    return aa + bb;
}

export default async function ProfessionalDashboardPage({
    searchParams,
}: PageProps) {
    // ✅ Unwrap do Next (searchParams pode vir como Promise)
    const sp = (await searchParams) as SearchParamsShape | undefined;

    // ✅ sessão do profissional no SERVER
    const session = await requireProfessionalSession();

    const companyId = normalizeString(session.companyId);
    const professionalId = normalizeString(session.professionalId);

    // unitId pode vir do session. Se não vier, buscamos pela ProfessionalUnit ativa.
    let unitId = normalizeString(session.unitId);

    if (!companyId || !professionalId) {
        throw new Error(
            'ProfessionalDashboardPage: companyId/professionalId não encontrado na sessão.'
        );
    }

    if (!unitId) {
        const pu = await prisma.professionalUnit.findFirst({
            where: { companyId, professionalId, isActive: true },
            select: { unitId: true },
            orderBy: { updatedAt: 'desc' },
        });
        unitId = normalizeString(pu?.unitId);
    }

    if (!unitId) {
        throw new Error(
            'ProfessionalDashboardPage: unitId não encontrado para o profissional.'
        );
    }

    // ✅ DIA (range em UTC equivalente ao dia em SP)
    const ymd = parseYMD(sp?.date) ?? getTodayYMDInSaoPaulo();
    const { startUtc: dayStart, endUtc: dayEnd } =
        buildSaoPauloDayUtcRange(ymd);

    // ✅ MÊS (mantém como estava)
    const monthBase = parseMonthParam(sp?.month);
    const monthStart = startOfMonth(monthBase);
    const monthEnd = endOfMonth(monthBase);

    const currencyFormatter = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    });

    // ---------------------------------------------------------
    // ✅ ATENDIMENTOS (DIA): total e done
    // ---------------------------------------------------------
    const [appointmentsTodayCount, appointmentsDoneTodayCount] =
        await Promise.all([
            prisma.appointment.count({
                where: {
                    companyId,
                    unitId,
                    professionalId,
                    scheduleAt: { gte: dayStart, lte: dayEnd },
                    status: { in: ['PENDING', 'DONE'] },
                },
            }),
            prisma.appointment.count({
                where: {
                    companyId,
                    unitId,
                    professionalId,
                    scheduleAt: { gte: dayStart, lte: dayEnd },
                    status: 'DONE',
                },
            }),
        ]);

    const appointmentsPendingToday =
        appointmentsTodayCount - appointmentsDoneTodayCount;

    // ---------------------------------------------------------
    // ✅ FINANCEIRO (DIA/MÊS) baseado SEMPRE em Order COMPLETED
    // ---------------------------------------------------------
    const [ordersDay, ordersMonth] = await Promise.all([
        prisma.order.findMany({
            where: {
                companyId,
                unitId,
                status: 'COMPLETED',
                updatedAt: { gte: dayStart, lte: dayEnd },
                OR: [
                    { professionalId },
                    { items: { some: { professionalId } } },
                ],
            },
            select: {
                id: true,
                professionalId: true,
                appointment: {
                    select: {
                        professionalPercentageAtTheTime: true,
                    },
                },
                items: {
                    select: {
                        professionalId: true,
                        totalPrice: true,
                        serviceId: true,
                        productId: true,
                        service: { select: { professionalPercentage: true } },
                        product: { select: { professionalPercentage: true } },
                    },
                },
            },
        }),
        prisma.order.findMany({
            where: {
                companyId,
                unitId,
                status: 'COMPLETED',
                updatedAt: { gte: monthStart, lte: monthEnd },
                OR: [
                    { professionalId },
                    { items: { some: { professionalId } } },
                ],
            },
            select: {
                id: true,
                professionalId: true,
                appointment: {
                    select: {
                        professionalPercentageAtTheTime: true,
                    },
                },
                items: {
                    select: {
                        professionalId: true,
                        totalPrice: true,
                        serviceId: true,
                        productId: true,
                        service: { select: { professionalPercentage: true } },
                        product: { select: { professionalPercentage: true } },
                    },
                },
            },
        }),
    ]);

    // ---------------------------------------------------------
    // ✅ CÁLCULO (DIA)
    // ---------------------------------------------------------
    let grossToday = 0;
    let commissionToday = 0;

    for (const o of ordersDay) {
        const orderBelongsToProfessional = o.professionalId === professionalId;

        const pctFromAppointment = clampToPct(
            toNumberDecimal(o.appointment?.professionalPercentageAtTheTime)
        );

        for (const it of o.items) {
            const itemBelongsToProfessional =
                it.professionalId === professionalId ||
                (orderBelongsToProfessional && !it.professionalId);

            if (!itemBelongsToProfessional) continue;

            const itemTotal = toNumberDecimal(it.totalPrice);
            grossToday = safeAdd(grossToday, itemTotal);

            if (it.serviceId) {
                const pctFromService = clampToPct(
                    toNumberDecimal(it.service?.professionalPercentage)
                );
                const pct = pctFromAppointment || pctFromService;
                commissionToday = safeAdd(
                    commissionToday,
                    (itemTotal * pct) / 100
                );
            } else if (it.productId) {
                const pctFromProduct = clampToPct(
                    toNumberDecimal(it.product?.professionalPercentage)
                );
                commissionToday = safeAdd(
                    commissionToday,
                    (itemTotal * pctFromProduct) / 100
                );
            }
        }
    }

    const netToday = grossToday - commissionToday;

    // ---------------------------------------------------------
    // ✅ CÁLCULO (MÊS)
    // ---------------------------------------------------------
    let grossMonth = 0;
    let commissionMonth = 0;

    for (const o of ordersMonth) {
        const orderBelongsToProfessional = o.professionalId === professionalId;

        const pctFromAppointment = clampToPct(
            toNumberDecimal(o.appointment?.professionalPercentageAtTheTime)
        );

        for (const it of o.items) {
            const itemBelongsToProfessional =
                it.professionalId === professionalId ||
                (orderBelongsToProfessional && !it.professionalId);

            if (!itemBelongsToProfessional) continue;

            const itemTotal = toNumberDecimal(it.totalPrice);
            grossMonth = safeAdd(grossMonth, itemTotal);

            if (it.serviceId) {
                const pctFromService = clampToPct(
                    toNumberDecimal(it.service?.professionalPercentage)
                );
                const pct = pctFromAppointment || pctFromService;
                commissionMonth = safeAdd(
                    commissionMonth,
                    (itemTotal * pct) / 100
                );
            } else if (it.productId) {
                const pctFromProduct = clampToPct(
                    toNumberDecimal(it.product?.professionalPercentage)
                );
                commissionMonth = safeAdd(
                    commissionMonth,
                    (itemTotal * pctFromProduct) / 100
                );
            }
        }
    }

    const netMonth = grossMonth - commissionMonth;

    // ---------------------------------------------------------
    // ✅ REVIEWS (MÊS): média e total
    // ---------------------------------------------------------
    const reviewsMonthAgg = await prisma.appointmentReview.aggregate({
        where: {
            companyId,
            professionalId,
            createdAt: { gte: monthStart, lte: monthEnd },
        },
        _count: { id: true },
        _avg: { rating: true },
    });

    const totalReviewsMonth = reviewsMonthAgg._count.id ?? 0;
    const averageRatingMonth = Number(reviewsMonthAgg._avg.rating ?? 0);

    const averageRatingMonthDisplay =
        totalReviewsMonth > 0 ? averageRatingMonth.toFixed(2) : '—';

    // ---------------------------------------------------------
    // ✅ LISTA VIVA (DIA): agendamentos do profissional
    // ---------------------------------------------------------
    const [appointmentsPrisma, unitPrisma, servicesPrisma, clientsPrisma] =
        await Promise.all([
            prisma.appointment.findMany({
                where: {
                    companyId,
                    unitId,
                    professionalId,
                    scheduleAt: { gte: dayStart, lte: dayEnd },
                    status: { in: ['PENDING', 'DONE', 'CANCELED'] },
                },
                orderBy: { scheduleAt: 'asc' },
                select: {
                    id: true,
                    unitId: true,
                    clientId: true,
                    clientName: true,
                    phone: true,
                    description: true,
                    scheduleAt: true,
                    status: true,
                    confirmationStatus: true,
                    professionalId: true,
                    serviceId: true,
                },
            }),

            prisma.unit.findFirst({
                where: { id: unitId, companyId },
                select: { id: true, name: true },
            }),

            // ✅ para o EditAppointmentDialog (mesma UX do admin)
            prisma.service.findMany({
                where: {
                    companyId,
                    isActive: true,
                    OR: [{ unitId }, { unitId: null }],
                },
                orderBy: { name: 'asc' },
                select: {
                    id: true,
                    name: true,
                    durationMinutes: true,
                    price: true,
                    isActive: true,
                    unitId: true,
                },
            }),

            // ✅ para o picker de cliente
            prisma.user.findMany({
                where: {
                    isActive: true,
                    companyMemberships: {
                        some: {
                            companyId,
                            isActive: true,
                            role: 'CLIENT',
                        },
                    },
                },
                orderBy: { name: 'asc' },
                take: 200,
                select: {
                    id: true,
                    name: true,
                    phone: true,
                },
            }),
        ]);

    const appointments = appointmentsPrisma.map((a) => ({
        id: a.id,
        unitId: a.unitId,
        clientId: a.clientId,
        clientName: a.clientName,
        phone: a.phone,
        description: a.description,
        scheduleAt: a.scheduleAt,
        status: a.status as 'PENDING' | 'DONE' | 'CANCELED',
        confirmationStatus: a.confirmationStatus,
        professionalId: a.professionalId ?? null,
        serviceId: a.serviceId ?? null,
    }));

    // na tela do profissional, a lista de profissionais é só ele mesmo
    let professionalFromDb = await prisma.professional.findFirst({
        where: {
            id: professionalId,
            companyId,
        },
        select: {
            id: true,
            name: true,
            imageUrl: true,
            isActive: true,
            calendarSyncToken: true,
        },
    });

    if (professionalFromDb && !professionalFromDb.calendarSyncToken) {
        const generatedToken =
            typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `${professionalFromDb.id}-${Date.now()}`;

        await prisma.professional.update({
            where: { id: professionalFromDb.id },
            data: {
                calendarSyncToken: generatedToken,
                calendarSyncTokenCreatedAt: new Date(),
            },
        });

        professionalFromDb = {
            ...professionalFromDb,
            calendarSyncToken: generatedToken,
        };
    }

    const professionals = professionalFromDb
        ? [professionalFromDb]
        : [
              {
                  id: professionalId,
                  name: session.name ?? 'Profissional',
                  imageUrl: null,
                  isActive: true,
                  calendarSyncToken: null,
              },
          ];

    // ✅ EditAppointmentDialog aceita price number | string
    const services = servicesPrisma.map((s) => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
        price: s.price != null ? String(s.price) : undefined,
        isActive: s.isActive,
        unitId: s.unitId ?? null,
    }));

    const clients = clientsPrisma
        .map((c) => ({
            id: c.id,
            name: normalizeString(c.name),
            phone: normalizeString(c.phone) || null,
        }))
        .filter((c) => c.name.length > 0);

    const units = [
        {
            id: unitId,
            name: unitPrisma?.name ?? 'Unidade',
        },
    ];

    // ✅ garante que o client mostre a data mesmo quando não vem querystring
    const dayParamForClient =
        normalizeString(sp?.date) ||
        `${String(ymd.y).padStart(4, '0')}-${String(ymd.m).padStart(
            2,
            '0'
        )}-${String(ymd.d).padStart(2, '0')}`;

    const publicBaseUrl = normalizeString(
        process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL
    );

    const calendarSyncUrl =
        publicBaseUrl && professionals[0]?.calendarSyncToken
            ? `${publicBaseUrl.replace(/\/+$/, '')}/api/professional/calendar/feed/${professionalId}?token=${professionals[0].calendarSyncToken}`
            : null;

    return (
        <div className="space-y-6">
            {/* HEADER + DATA */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-title text-content-primary">
                        Dashboard
                    </h1>
                    <p className="text-paragraph-medium-size text-content-secondary">
                        Sua visão geral: atendimentos, ganhos e avaliações no
                        período selecionado.
                    </p>
                </div>

                <DatePicker />
            </div>

            {/* KPIs */}
            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4">
                    <p className="text-label-small text-content-secondary">
                        Atendimentos hoje
                    </p>
                    <p className="mt-1 text-title font-semibold text-content-primary">
                        {appointmentsTodayCount}
                    </p>
                    <p className="mt-2 text-paragraph-small text-content-tertiary">
                        Pendentes:{' '}
                        <span className="text-content-primary font-medium">
                            {appointmentsPendingToday}
                        </span>{' '}
                        · Concluídos:{' '}
                        <span className="text-content-primary font-medium">
                            {appointmentsDoneTodayCount}
                        </span>
                    </p>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4">
                    <p className="text-label-small text-content-secondary">
                        Ganhos do dia
                    </p>
                    <p className="mt-1 text-title font-semibold text-content-primary">
                        {currencyFormatter.format(netToday)}
                    </p>
                    <p className="mt-2 text-paragraph-small text-content-tertiary">
                        Bruto: {currencyFormatter.format(grossToday)} ·
                        Comissão: {currencyFormatter.format(commissionToday)}
                    </p>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4">
                    <p className="text-label-small text-content-secondary">
                        Ganhos do mês
                    </p>
                    <p className="mt-1 text-title font-semibold text-content-primary">
                        {currencyFormatter.format(netMonth)}
                    </p>
                    <p className="mt-2 text-paragraph-small text-content-tertiary">
                        Bruto: {currencyFormatter.format(grossMonth)} ·
                        Comissão: {currencyFormatter.format(commissionMonth)}
                    </p>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4">
                    <p className="text-label-small text-content-secondary">
                        Nota no mês
                    </p>
                    <p className="mt-1 text-title font-semibold text-content-primary">
                        {averageRatingMonthDisplay}
                        {totalReviewsMonth > 0 && (
                            <span className="ml-2 align-middle text-xl text-yellow-500">
                                {'★'.repeat(
                                    Math.max(
                                        0,
                                        Math.min(
                                            5,
                                            Math.round(averageRatingMonth)
                                        )
                                    )
                                )}
                            </span>
                        )}
                    </p>
                    <p className="mt-2 text-paragraph-small text-content-tertiary">
                        {totalReviewsMonth} avaliações no período
                    </p>
                </div>
            </section>

            {/* DIVISOR VISUAL */}
            <div className="h-px w-full bg-border-primary/60" />

            {/* SEÇÃO DE AGENDA */}
            <section className="space-y-4">
                <ProfessionalAppointmentsClient
                    date={dayParamForClient}
                    unitId={unitId}
                    professionalId={professionalId}
                    appointments={appointments}
                    units={units}
                    professionals={professionals}
                    services={services}
                    clients={clients}
                    calendarSyncUrl={calendarSyncUrl}
                />
            </section>
        </div>
    );
}
