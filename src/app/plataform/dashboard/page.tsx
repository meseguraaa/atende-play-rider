// src/app/plataform/dashboard/page.tsx
import type { Metadata } from 'next';

import { prisma } from '@/lib/prisma';
import { requirePlatformForModule } from '@/lib/plataform-permissions';

import {
    endOfDay,
    endOfMonth,
    format,
    startOfDay,
    startOfMonth,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { DatePicker } from '@/components/date-picker';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Plataforma | Dashboard',
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

function normalizeCompanyId(v: unknown): string | null {
    const s = normalizeString(v);
    if (!s || s === 'all') return null;
    return s;
}

function parseDateParam(dateParam?: string): Date {
    const raw = normalizeString(dateParam);
    if (!raw) return new Date();

    // esperado yyyy-MM-dd
    const [y, m, d] = raw.split('-').map(Number);
    if (!y || !m || !d) return new Date();

    return new Date(y, m - 1, d);
}

export default async function PlataformaDashboardPage({
    searchParams,
}: PageProps) {
    const sp = (await searchParams) as
        | {
              companyId?: string; // "all" | <companyId>
              date?: string; // yyyy-MM-dd
          }
        | undefined;

    await requirePlatformForModule('DASHBOARD');

    const DEMO_COMPANY_NAME = 'AtendePlay';

    const demoCompanyId = await prisma.company
        .findFirst({
            where: {
                name: {
                    equals: DEMO_COMPANY_NAME,
                    mode: 'insensitive',
                },
            },
            select: {
                id: true,
            },
        })
        .then((company) => company?.id);

    const rawCompanyId = normalizeCompanyId(sp?.companyId);

    const companyId =
        demoCompanyId && rawCompanyId === demoCompanyId ? null : rawCompanyId;

    const dayBase = parseDateParam(sp?.date);
    const dayStart = startOfDay(dayBase);
    const dayEnd = endOfDay(dayBase);

    // ✅ acumulado do mês (mês inteiro fechado)
    const monthStart = startOfMonth(dayBase);
    const monthEnd = endOfMonth(dayBase);

    const dayLabel = format(dayBase, "dd 'de' MMMM 'de' yyyy", {
        locale: ptBR,
    });

    const monthLabel = format(dayBase, "MMMM 'de' yyyy", { locale: ptBR });

    const companies = await prisma.company.findMany({
        where: {
            NOT: {
                name: {
                    equals: DEMO_COMPANY_NAME,
                    mode: 'insensitive',
                },
            },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: {
            id: true,
            name: true,
            isActive: true,
        },
    });

    const whereCompany = companyId
        ? { companyId }
        : demoCompanyId
          ? { companyId: { not: demoCompanyId } }
          : undefined;

    // ---------------------------------------------------------
    // ✅ Estado atual (não depende do dia)
    // ---------------------------------------------------------
    const [companiesActive, companiesInactive] = await Promise.all([
        prisma.company.count({
            where: {
                isActive: true,
                ...(demoCompanyId ? { id: { not: demoCompanyId } } : {}),
            },
        }),
        prisma.company.count({
            where: {
                isActive: false,
                ...(demoCompanyId ? { id: { not: demoCompanyId } } : {}),
            },
        }),
    ]);

    const [unitsActive, unitsInactive] = await Promise.all([
        prisma.unit.count({
            where: { ...(whereCompany ?? {}), isActive: true },
        }),
        prisma.unit.count({
            where: { ...(whereCompany ?? {}), isActive: false },
        }),
    ]);

    const [professionalsActive, professionalsInactive] = await Promise.all([
        prisma.professional.count({
            where: { ...(whereCompany ?? {}), isActive: true },
        }),
        prisma.professional.count({
            where: { ...(whereCompany ?? {}), isActive: false },
        }),
    ]);

    const servicesCount = await prisma.service.count({
        where: { ...(whereCompany ?? {}) },
    });

    const [productsActive, productsInactive, productsOutOfStock] =
        await Promise.all([
            prisma.product.count({
                where: { ...(whereCompany ?? {}), isActive: true },
            }),
            prisma.product.count({
                where: { ...(whereCompany ?? {}), isActive: false },
            }),
            prisma.product.count({
                where: {
                    ...(whereCompany ?? {}),
                    stockQuantity: { lte: 0 },
                },
            }),
        ]);

    const clientsCount = companyId
        ? await prisma.companyMember.count({
              where: {
                  companyId,
                  role: 'CLIENT',
                  isActive: true,
              },
          })
        : await prisma.companyMember.count({
              where: {
                  role: 'CLIENT',
                  isActive: true,
              },
          });

    // ---------------------------------------------------------
    // ✅ Movimento do DIA (evolução dia a dia)
    // ---------------------------------------------------------
    const [
        appointmentsPendingCount,
        appointmentsDoneCount,
        appointmentsCanceledCount,
        checkoutsCompletedCount,
    ] = await Promise.all([
        prisma.appointment.count({
            where: {
                ...(whereCompany ?? {}),
                status: 'PENDING',
                scheduleAt: { gte: dayStart, lte: dayEnd },
            },
        }),
        prisma.appointment.count({
            where: {
                ...(whereCompany ?? {}),
                status: 'DONE',
                doneAt: { gte: dayStart, lte: dayEnd },
            },
        }),
        prisma.appointment.count({
            where: {
                ...(whereCompany ?? {}),
                status: 'CANCELED',
                cancelledAt: { gte: dayStart, lte: dayEnd },
            },
        }),
        prisma.order.count({
            where: {
                ...(whereCompany ?? {}),
                status: 'COMPLETED', // ✅ vem do checkout
                updatedAt: { gte: dayStart, lte: dayEnd },
            },
        }),
    ]);

    const appointmentsTotalCount =
        appointmentsPendingCount +
        appointmentsDoneCount +
        appointmentsCanceledCount;

    // vendidos (dia) = soma quantity de OrderItem com productId,
    // onde Order.status = COMPLETED e Order.updatedAt no dia
    const soldAggDay = await prisma.orderItem.aggregate({
        where: {
            ...(whereCompany ?? {}),
            productId: { not: null },
            order: {
                status: 'COMPLETED',
                updatedAt: { gte: dayStart, lte: dayEnd },
            },
        },
        _sum: { quantity: true },
    });

    const productsSoldQtyDay = soldAggDay._sum.quantity ?? 0;

    // ---------------------------------------------------------
    // ✅ Movimento do MÊS (mês inteiro fechado)
    // ---------------------------------------------------------
    const [
        appointmentsPendingMonthCount,
        appointmentsDoneMonthCount,
        appointmentsCanceledMonthCount,
        checkoutsCompletedMonthCount,
    ] = await Promise.all([
        prisma.appointment.count({
            where: {
                ...(whereCompany ?? {}),
                status: 'PENDING',
                scheduleAt: { gte: monthStart, lte: monthEnd },
            },
        }),
        prisma.appointment.count({
            where: {
                ...(whereCompany ?? {}),
                status: 'DONE',
                doneAt: { gte: monthStart, lte: monthEnd },
            },
        }),
        prisma.appointment.count({
            where: {
                ...(whereCompany ?? {}),
                status: 'CANCELED',
                cancelledAt: { gte: monthStart, lte: monthEnd },
            },
        }),
        prisma.order.count({
            where: {
                ...(whereCompany ?? {}),
                status: 'COMPLETED', // ✅ vem do checkout
                updatedAt: { gte: monthStart, lte: monthEnd },
            },
        }),
    ]);

    const appointmentsTotalMonthCount =
        appointmentsPendingMonthCount +
        appointmentsDoneMonthCount +
        appointmentsCanceledMonthCount;

    const soldAggMonth = await prisma.orderItem.aggregate({
        where: {
            ...(whereCompany ?? {}),
            productId: { not: null },
            order: {
                status: 'COMPLETED',
                updatedAt: { gte: monthStart, lte: monthEnd },
            },
        },
        _sum: { quantity: true },
    });

    const productsSoldQtyMonth = soldAggMonth._sum.quantity ?? 0;

    const selectedCompanyLabel = companyId
        ? (companies.find((c) => c.id === companyId)?.name ?? 'Empresa')
        : 'Todas as empresas';

    return (
        <div className="space-y-6">
            {/* HEADER + DATA (igual Admin) */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-title text-content-primary">
                        Dashboard
                    </h1>
                    <p className="text-paragraph-medium-size text-content-secondary">
                        Visão geral da plataforma, com filtros por empresa e
                        evolução diária.
                    </p>
                </div>

                <DatePicker />
            </div>

            {/* CONTEXTO / FILTRO (mesmo “card” do admin) */}
            <section className="space-y-3 rounded-xl border border-border-primary bg-background-tertiary p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-title text-content-primary">
                            {selectedCompanyLabel}
                        </p>
                    </div>

                    {/* ✅ Server Component: sem onChange.
                        Form GET no mesmo padrão “limpo”. */}
                    <form
                        method="GET"
                        className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center"
                    >
                        {/* preserva date ao trocar empresa */}
                        <input
                            type="hidden"
                            name="date"
                            value={format(dayBase, 'yyyy-MM-dd')}
                        />

                        <label className="sr-only" htmlFor="companyId">
                            Empresa
                        </label>

                        <select
                            id="companyId"
                            name="companyId"
                            defaultValue={companyId ?? 'all'}
                            className="h-10 w-full max-w-50 rounded-xl border border-border-primary bg-background-secondary px-3 text-paragraph-small text-content-primary outline-none focus:ring-2 focus:ring-border-primary md:w-90"
                        >
                            <option value="all">Todas as empresas</option>

                            {companies.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                    {c.isActive ? '' : ' (inativa)'}
                                </option>
                            ))}
                        </select>

                        <button
                            type="submit"
                            className="h-10 rounded-xl border border-border-primary bg-background-tertiary px-4 text-paragraph-small font-semibold text-content-primary hover:bg-background-secondary"
                        >
                            Aplicar
                        </button>
                    </form>
                </div>
            </section>

            {/* DADOS (mesma estética do Admin: cards com borda, bg, tipografia) */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* SEÇÃO: OPERAÇÃO */}
                <section className="space-y-4 rounded-xl border border-border-primary bg-background-tertiary p-4">
                    <div>
                        <p className="text-title text-content-primary">
                            Estrutura e cadastros
                        </p>
                    </div>

                    <div className="grid gap-3">
                        {/* Empresas */}
                        <div className="rounded-xl border border-border-primary bg-background-secondary p-3">
                            <p className="text-paragraph text-content-primary">
                                Empresas
                            </p>

                            <div className="mt-2 space-y-2 text-paragraph-small">
                                <div className="flex items-center justify-between">
                                    <span className="text-content-secondary">
                                        Ativas
                                    </span>
                                    <span className="font-semibold text-content-primary">
                                        {companiesActive}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-content-secondary">
                                        Inativas
                                    </span>
                                    <span className="font-semibold text-content-primary">
                                        {companiesInactive}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Unidades */}
                        <div className="rounded-xl border border-border-primary bg-background-secondary p-3">
                            <p className="text-paragraph text-content-primary">
                                Unidades
                            </p>

                            <div className="mt-2 space-y-2 text-paragraph-small">
                                <div className="flex items-center justify-between">
                                    <span className="text-content-secondary">
                                        Ativas
                                    </span>
                                    <span className="font-semibold text-content-primary">
                                        {unitsActive}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-content-secondary">
                                        Inativas
                                    </span>
                                    <span className="font-semibold text-content-primary">
                                        {unitsInactive}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Profissionais */}
                        <div className="rounded-xl border border-border-primary bg-background-secondary p-3">
                            <p className="text-paragraph text-content-primary">
                                Profissionais
                            </p>

                            <div className="mt-2 space-y-2 text-paragraph-small">
                                <div className="flex items-center justify-between">
                                    <span className="text-content-secondary">
                                        Ativos
                                    </span>
                                    <span className="font-semibold text-content-primary">
                                        {professionalsActive}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-content-secondary">
                                        Inativos
                                    </span>
                                    <span className="font-semibold text-content-primary">
                                        {professionalsInactive}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Serviços */}
                        <div className="rounded-xl border border-border-primary bg-background-secondary p-3">
                            <p className="text-paragraph text-content-primary">
                                Serviços
                            </p>

                            <div className="mt-2 flex items-center justify-between text-paragraph-small">
                                <span className="text-content-secondary">
                                    Quantidade
                                </span>
                                <span className="font-semibold text-content-primary">
                                    {servicesCount}
                                </span>
                            </div>
                        </div>

                        {/* Produtos */}
                        <div className="rounded-xl border border-border-primary bg-background-secondary p-3">
                            <p className="text-paragraph text-content-primary">
                                Produtos
                            </p>

                            <div className="mt-2 space-y-2 text-paragraph-small">
                                <div className="flex items-center justify-between">
                                    <span className="text-content-secondary">
                                        Ativos
                                    </span>
                                    <span className="font-semibold text-content-primary">
                                        {productsActive}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-content-secondary">
                                        Inativos
                                    </span>
                                    <span className="font-semibold text-content-primary">
                                        {productsInactive}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-content-secondary">
                                        Sem estoque
                                    </span>
                                    <span className="font-semibold text-content-primary">
                                        {productsOutOfStock}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Clientes */}
                        <div className="rounded-xl border border-border-primary bg-background-secondary p-3">
                            <p className="text-paragraph text-content-primary">
                                Clientes
                            </p>

                            <div className="mt-2 flex items-center justify-between text-paragraph-small">
                                <span className="text-content-secondary">
                                    Cadastrados
                                </span>
                                <span className="font-semibold text-content-primary">
                                    {clientsCount}
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* SEÇÃO: MOVIMENTO DO DIA */}
                <section className="space-y-4 rounded-xl border border-border-primary bg-background-tertiary p-4">
                    <div>
                        <p className="text-title text-content-primary">
                            Movimento do dia
                        </p>
                    </div>

                    {/* Agendamentos */}
                    <div className="rounded-xl border border-border-primary bg-background-secondary p-4">
                        <p className="text-paragraph text-content-primary">
                            Agendamentos
                        </p>

                        <div className="mt-3 grid gap-6 md:grid-cols-2">
                            {/* DIA */}
                            <div className="space-y-2">
                                <p className="text-paragraph-small text-content-secondary">
                                    Dia
                                </p>

                                <p className="text-title font-semibold text-content-primary">
                                    Total:{' '}
                                    <span className="font-semibold">
                                        {appointmentsTotalCount}
                                    </span>
                                </p>

                                <div className="mt-2 space-y-2 text-paragraph-small">
                                    <div className="flex items-center justify-between">
                                        <span className="text-content-secondary">
                                            Pendentes
                                        </span>
                                        <span className="font-semibold text-content-primary">
                                            {appointmentsPendingCount}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-content-secondary">
                                            Concluídos
                                        </span>
                                        <span className="font-semibold text-content-primary">
                                            {appointmentsDoneCount}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-content-secondary">
                                            Cancelados
                                        </span>
                                        <span className="font-semibold text-content-primary">
                                            {appointmentsCanceledCount}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* MÊS */}
                            <div className="space-y-2 border-t border-border-primary/60 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                                <p className="text-paragraph-small text-content-secondary">
                                    Mês
                                </p>

                                <p className="text-title font-semibold text-content-primary">
                                    Total:{' '}
                                    <span className="font-semibold">
                                        {appointmentsTotalMonthCount}
                                    </span>
                                </p>

                                <div className="mt-2 space-y-2 text-paragraph-small">
                                    <div className="flex items-center justify-between">
                                        <span className="text-content-secondary">
                                            Pendentes
                                        </span>
                                        <span className="font-semibold text-content-primary">
                                            {appointmentsPendingMonthCount}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-content-secondary">
                                            Concluídos
                                        </span>
                                        <span className="font-semibold text-content-primary">
                                            {appointmentsDoneMonthCount}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-content-secondary">
                                            Cancelados
                                        </span>
                                        <span className="font-semibold text-content-primary">
                                            {appointmentsCanceledMonthCount}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Checkouts */}
                    <div className="rounded-xl border border-border-primary bg-background-secondary p-4">
                        <p className="text-paragraph text-content-primary">
                            Checkouts
                        </p>

                        <div className="mt-3 grid gap-6 md:grid-cols-2">
                            {/* DIA */}
                            <div className="space-y-2">
                                <p className="text-paragraph-small text-content-secondary">
                                    Dia
                                </p>

                                <p className="text-title font-semibold text-content-primary">
                                    Concluídos:{' '}
                                    <span className="font-semibold">
                                        {checkoutsCompletedCount}
                                    </span>
                                </p>
                            </div>

                            {/* MÊS */}
                            <div className="space-y-2 border-t border-border-primary/60 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                                <p className="text-paragraph-small text-content-secondary">
                                    Mês
                                </p>

                                <p className="text-title font-semibold text-content-primary">
                                    Concluídos:{' '}
                                    <span className="font-semibold">
                                        {checkoutsCompletedMonthCount}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Produtos */}
                    <div className="rounded-xl border border-border-primary bg-background-secondary p-4">
                        <p className="text-paragraph text-content-primary">
                            Produtos
                        </p>

                        <div className="mt-3 grid gap-6 md:grid-cols-2">
                            {/* DIA */}
                            <div className="space-y-2">
                                <p className="text-paragraph-small text-content-secondary">
                                    Dia
                                </p>

                                <p className="text-title font-semibold text-content-primary">
                                    Vendidos:{' '}
                                    <span className="font-semibold">
                                        {productsSoldQtyDay}
                                    </span>
                                </p>
                            </div>

                            {/* MÊS */}
                            <div className="space-y-2 border-t border-border-primary/60 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                                <p className="text-paragraph-small text-content-secondary">
                                    Mês
                                </p>

                                <p className="text-title font-semibold text-content-primary">
                                    Vendidos:{' '}
                                    <span className="font-semibold">
                                        {productsSoldQtyMonth}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
