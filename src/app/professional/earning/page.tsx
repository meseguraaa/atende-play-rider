// src/app/professional/earning/page.tsx
import type { Metadata } from 'next';

import { prisma } from '@/lib/prisma';
import { requireProfessionalSession } from '@/lib/professional-permissions';

import { DatePicker } from '@/components/date-picker';

import { endOfDay, endOfMonth, startOfDay, startOfMonth } from 'date-fns';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Profissional | Ganhos',
};

const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';

type EarningRow = {
    id: string;
    clientName: string;
    description: string;
    time: string;
    priceFormatted: string;
    percentageFormatted: string;
    earningFormatted: string;
};

function SummaryCard({
    label,
    value,
    hint,
}: {
    label: string;
    value: string;
    hint?: string;
}) {
    return (
        <div className="rounded-xl border border-border-primary bg-background-tertiary p-4">
            <p className="text-label-small text-content-secondary">{label}</p>
            <p className="mt-1 text-title font-semibold text-content-primary">
                {value}
            </p>
            {hint ? (
                <p className="mt-2 text-paragraph-small text-content-tertiary">
                    {hint}
                </p>
            ) : null}
        </div>
    );
}

function EarningsDayList({ rows }: { rows: EarningRow[] }) {
    return (
        <div className="space-y-2">
            {rows.map((row) => (
                <div
                    key={row.id}
                    className="rounded-xl border border-border-primary bg-background-tertiary px-3 py-3"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-paragraph-small text-content-primary font-medium truncate">
                                {row.clientName}
                            </p>
                            <p className="text-[11px] text-content-secondary truncate">
                                {row.description}
                            </p>
                        </div>

                        <div className="shrink-0 text-right">
                            <p className="text-paragraph-small text-content-primary font-semibold">
                                {row.earningFormatted}
                            </p>
                            <p className="text-[11px] text-content-tertiary">
                                {row.time}
                            </p>
                        </div>
                    </div>

                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                        <div className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2">
                            <p className="text-[11px] text-content-tertiary">
                                Valor
                            </p>
                            <p className="text-paragraph-small text-content-primary font-medium">
                                {row.priceFormatted}
                            </p>
                        </div>

                        <div className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2">
                            <p className="text-[11px] text-content-tertiary">
                                Percentual
                            </p>
                            <p className="text-paragraph-small text-content-primary font-medium">
                                {row.percentageFormatted}
                            </p>
                        </div>

                        <div className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2">
                            <p className="text-[11px] text-content-tertiary">
                                Ganho
                            </p>
                            <p className="text-paragraph-small text-content-primary font-medium">
                                {row.earningFormatted}
                            </p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function getSaoPauloToday(): Date {
    const now = new Date();

    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: SAO_PAULO_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    const parts = formatter.formatToParts(now);
    const day = Number(parts.find((p) => p.type === 'day')?.value ?? '1');
    const month = Number(parts.find((p) => p.type === 'month')?.value ?? '1');
    const year = Number(parts.find((p) => p.type === 'year')?.value ?? '1970');

    return new Date(year, month - 1, day);
}

function parseDateParam(dateStr?: string): Date | null {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

type ProfessionalEarningPageProps = {
    searchParams: Promise<{
        date?: string;
    }>;
};

export default async function ProfessionalEarningPage({
    searchParams,
}: ProfessionalEarningPageProps) {
    const session = await requireProfessionalSession();

    if (!session.companyId || !session.professionalId || !session.userId) {
        return (
            <div className="space-y-4">
                <h2 className="text-title text-content-primary">Ganhos</h2>
                <p className="text-paragraph-medium-size text-content-secondary">
                    Não foi possível identificar seu acesso como profissional.
                    Faça login novamente ou peça para um administrador vincular
                    seu usuário a um profissional ativo.
                </p>
            </div>
        );
    }

    const resolvedSearchParams = await searchParams;
    const dateParam = resolvedSearchParams.date;

    const baseDate = dateParam
        ? (parseDateParam(dateParam) ?? getSaoPauloToday())
        : getSaoPauloToday();

    const dayStart = startOfDay(baseDate);
    const dayEnd = endOfDay(baseDate);

    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(baseDate);

    const currencyFormatter = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    });

    const [
        dayAppointments,
        dayCanceledAppointments,
        monthAppointments,
        monthCanceledAppointments,
        dayProductSales,
        monthProductSales,
        dayCancellationFees,
        monthCancellationFees,
    ] = await Promise.all([
        prisma.appointment.findMany({
            where: {
                companyId: session.companyId,
                professionalId: session.professionalId,
                status: 'DONE',
                scheduleAt: { gte: dayStart, lte: dayEnd },
            },
            include: { service: true },
            orderBy: { scheduleAt: 'asc' },
        }),
        prisma.appointment.findMany({
            where: {
                companyId: session.companyId,
                professionalId: session.professionalId,
                status: 'CANCELED',
                scheduleAt: { gte: dayStart, lte: dayEnd },
            },
            select: {
                id: true,
                cancelFeeApplied: true,
                cancelFeeValue: true,
            },
        }),
        prisma.appointment.findMany({
            where: {
                companyId: session.companyId,
                professionalId: session.professionalId,
                status: 'DONE',
                scheduleAt: { gte: monthStart, lte: monthEnd },
            },
            include: { service: true },
            orderBy: { scheduleAt: 'asc' },
        }),
        prisma.appointment.findMany({
            where: {
                companyId: session.companyId,
                professionalId: session.professionalId,
                status: 'CANCELED',
                scheduleAt: { gte: monthStart, lte: monthEnd },
            },
            select: {
                id: true,
                cancelFeeApplied: true,
                cancelFeeValue: true,
            },
        }),
        prisma.productSale.findMany({
            where: {
                companyId: session.companyId,
                professionalId: session.professionalId,
                soldAt: { gte: dayStart, lte: dayEnd },
            },
            include: { product: true },
            orderBy: { soldAt: 'asc' },
        }),
        prisma.productSale.findMany({
            where: {
                companyId: session.companyId,
                professionalId: session.professionalId,
                soldAt: { gte: monthStart, lte: monthEnd },
            },
            include: { product: true },
            orderBy: { soldAt: 'asc' },
        }),
        prisma.professionalCancellationFee.findMany({
            where: {
                companyId: session.companyId,
                professionalId: session.professionalId,
                createdAt: { gte: dayStart, lte: dayEnd },
            },
            select: { id: true, amount: true, createdAt: true },
        }),
        prisma.professionalCancellationFee.findMany({
            where: {
                companyId: session.companyId,
                professionalId: session.professionalId,
                createdAt: { gte: monthStart, lte: monthEnd },
            },
            select: { id: true, amount: true, createdAt: true },
        }),
    ]);

    // ===== GANHOS (SERVIÇOS) =====
    const totalServiceEarningsDay = dayAppointments.reduce((sum, appt) => {
        const earningSnapshot = appt.professionalEarningValue;
        const priceSnapshot = appt.servicePriceAtTheTime;
        const priceService = appt.service?.price ?? 0;

        const percentSnapshot = appt.professionalPercentageAtTheTime;
        const percentService = appt.service?.professionalPercentage ?? 0;

        if (earningSnapshot) return sum + Number(earningSnapshot);

        const priceNumber = priceSnapshot
            ? Number(priceSnapshot)
            : Number(priceService);

        const percentNumber = percentSnapshot
            ? Number(percentSnapshot)
            : Number(percentService);

        return sum + (priceNumber * percentNumber) / 100;
    }, 0);

    const totalServiceEarningsMonth = monthAppointments.reduce((sum, appt) => {
        const earningSnapshot = appt.professionalEarningValue;
        const priceSnapshot = appt.servicePriceAtTheTime;
        const priceService = appt.service?.price ?? 0;

        const percentSnapshot = appt.professionalPercentageAtTheTime;
        const percentService = appt.service?.professionalPercentage ?? 0;

        if (earningSnapshot) return sum + Number(earningSnapshot);

        const priceNumber = priceSnapshot
            ? Number(priceSnapshot)
            : Number(priceService);

        const percentNumber = percentSnapshot
            ? Number(percentSnapshot)
            : Number(percentService);

        return sum + (priceNumber * percentNumber) / 100;
    }, 0);

    // ===== PRODUTOS (GANHO DO PROFISSIONAL) =====
    const totalProductsSoldDay = dayProductSales.reduce(
        (sum, sale) => sum + sale.quantity,
        0
    );
    const totalProductsSoldMonth = monthProductSales.reduce(
        (sum, sale) => sum + sale.quantity,
        0
    );

    const totalProductEarningsDay = dayProductSales.reduce((sum, sale) => {
        const percent = sale.product?.professionalPercentage ?? 0;
        const total = Number(sale.totalPrice);
        const commission = (total * Number(percent)) / 100;
        return sum + commission;
    }, 0);

    const totalProductEarningsMonth = monthProductSales.reduce((sum, sale) => {
        const percent = sale.product?.professionalPercentage ?? 0;
        const total = Number(sale.totalPrice);
        const commission = (total * Number(percent)) / 100;
        return sum + commission;
    }, 0);

    // ===== CANCELAMENTO (100% do profissional) =====
    const totalCancelFeeDayFromTable = dayCancellationFees.reduce(
        (sum, row) => {
            return sum + Number(row.amount ?? 0);
        },
        0
    );

    const totalCancelFeeMonthFromTable = monthCancellationFees.reduce(
        (sum, row) => sum + Number(row.amount ?? 0),
        0
    );

    const canceledWithFeeDayFallback = dayCanceledAppointments.filter(
        (appt) => appt.cancelFeeApplied
    );
    const totalCancelFeeDayFallback = canceledWithFeeDayFallback.reduce(
        (sum, appt) => sum + Number(appt.cancelFeeValue ?? 0),
        0
    );

    const canceledWithFeeMonthFallback = monthCanceledAppointments.filter(
        (appt) => appt.cancelFeeApplied
    );
    const totalCancelFeeMonthFallback = canceledWithFeeMonthFallback.reduce(
        (sum, appt) => sum + Number(appt.cancelFeeValue ?? 0),
        0
    );

    const cancelFeeDay =
        totalCancelFeeDayFromTable > 0
            ? totalCancelFeeDayFromTable
            : totalCancelFeeDayFallback;

    const cancelFeeMonth =
        totalCancelFeeMonthFromTable > 0
            ? totalCancelFeeMonthFromTable
            : totalCancelFeeMonthFallback;

    // ===== TOTAIS =====
    const totalEarningsDay =
        totalServiceEarningsDay + totalProductEarningsDay + cancelFeeDay;

    const totalEarningsMonth =
        totalServiceEarningsMonth + totalProductEarningsMonth + cancelFeeMonth;

    // ===== CONTAGENS =====
    const totalAppointmentsDay = dayAppointments.length;
    const totalAppointmentsMonth = monthAppointments.length;
    const totalAppointmentsCanceledDay = dayCanceledAppointments.length;
    const totalAppointmentsCanceledMonth = monthCanceledAppointments.length;

    // ===== LINHAS (SERVIÇOS DO DIA) =====
    const dayAppointmentsRows: EarningRow[] = dayAppointments.map((appt) => {
        const timeStr = appt.scheduleAt.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: SAO_PAULO_TIMEZONE,
        });

        const priceSnapshot = appt.servicePriceAtTheTime;
        const priceService = appt.service?.price ?? 0;
        const priceNumber = priceSnapshot
            ? Number(priceSnapshot)
            : Number(priceService);

        const percentSnapshot = appt.professionalPercentageAtTheTime;
        const percentService = appt.service?.professionalPercentage ?? 0;
        const percentNumber = percentSnapshot
            ? Number(percentSnapshot)
            : Number(percentService);

        const earningSnapshot = appt.professionalEarningValue;
        const earningNumber = earningSnapshot
            ? Number(earningSnapshot)
            : (priceNumber * percentNumber) / 100;

        return {
            id: appt.id,
            clientName: appt.clientName ?? '',
            description: appt.description ?? appt.service?.name ?? 'Serviço',
            time: timeStr,
            priceFormatted: currencyFormatter.format(priceNumber),
            percentageFormatted: `${percentNumber.toFixed(2)}%`,
            earningFormatted: currencyFormatter.format(earningNumber),
        };
    });

    // ===== LINHAS (PRODUTOS DO DIA) =====
    const dayProductRows: EarningRow[] = dayProductSales.map((sale) => {
        const timeStr = sale.soldAt.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: SAO_PAULO_TIMEZONE,
        });

        const productName = sale.product?.name ?? 'Produto';
        const totalNumber = Number(sale.totalPrice);

        const percent = sale.product?.professionalPercentage ?? 0;
        const percentNumber = Number(percent);

        const earningNumber = (totalNumber * percentNumber) / 100;

        return {
            id: `product-${sale.id}`,
            clientName: '(Produto)',
            description: `${productName} · ${sale.quantity} un.`,
            time: timeStr,
            priceFormatted: currencyFormatter.format(totalNumber),
            percentageFormatted: `${percentNumber.toFixed(2)}%`,
            earningFormatted: currencyFormatter.format(earningNumber),
        };
    });

    return (
        <div className="space-y-6">
            {/* HEADER LOCAL (com DatePicker na mesma linha) */}
            <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                    <h1 className="text-title text-content-primary">
                        Meus ganhos
                    </h1>
                    <p className="text-paragraph-medium-size text-content-secondary">
                        Ganhos do dia e acumulado no mês (serviços, produtos e
                        taxas quando aplicadas).
                    </p>
                </div>

                <DatePicker />
            </header>

            {/* RESUMO */}
            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                    label="Total do dia"
                    value={currencyFormatter.format(totalEarningsDay)}
                    hint={`Serviços: ${currencyFormatter.format(
                        totalServiceEarningsDay
                    )} · Produtos: ${currencyFormatter.format(
                        totalProductEarningsDay
                    )} · Taxas: ${currencyFormatter.format(cancelFeeDay)}`}
                />

                <SummaryCard
                    label="Total do mês"
                    value={currencyFormatter.format(totalEarningsMonth)}
                    hint={`Serviços: ${currencyFormatter.format(
                        totalServiceEarningsMonth
                    )} · Produtos: ${currencyFormatter.format(
                        totalProductEarningsMonth
                    )} · Taxas: ${currencyFormatter.format(cancelFeeMonth)}`}
                />

                <SummaryCard
                    label="Atendimentos"
                    value={`${totalAppointmentsDay} hoje`}
                    hint={`${totalAppointmentsMonth} no mês · Cancelados: ${totalAppointmentsCanceledDay} hoje / ${totalAppointmentsCanceledMonth} mês`}
                />

                <SummaryCard
                    label="Produtos"
                    value={`${totalProductsSoldDay} un. hoje`}
                    hint={`${totalProductsSoldMonth} un. no mês · Ganho: ${currencyFormatter.format(
                        totalProductEarningsMonth
                    )}`}
                />
            </section>

            {/* LISTA DE ATENDIMENTOS DO DIA */}
            <section className="space-y-3">
                <h2 className="text-subtitle text-content-primary">
                    Detalhamento de atendimentos do dia
                </h2>

                {dayAppointmentsRows.length === 0 ? (
                    <p className="text-paragraph-small text-content-secondary">
                        Você não teve atendimentos concluídos neste dia.
                    </p>
                ) : (
                    <EarningsDayList rows={dayAppointmentsRows} />
                )}
            </section>

            {/* LISTA DE VENDAS DE PRODUTOS DO DIA */}
            <section className="space-y-3">
                <h2 className="text-subtitle text-content-primary">
                    Detalhamento de vendas de produtos do dia
                </h2>

                {dayProductRows.length === 0 ? (
                    <p className="text-paragraph-small text-content-secondary">
                        Você não teve vendas de produtos neste dia.
                    </p>
                ) : (
                    <EarningsDayList rows={dayProductRows} />
                )}
            </section>
        </div>
    );
}
