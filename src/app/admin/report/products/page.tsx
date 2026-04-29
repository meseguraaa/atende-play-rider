// src/app/admin/report/products/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import {
    ArrowLeft,
    Package,
    DollarSign,
    Boxes,
    ShoppingBag,
} from 'lucide-react';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';
import { MonthPicker } from '@/components/month-picker';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Relatório de Produtos',
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

function formatCurrencyBR(value: number) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    }).format(value);
}

function formatTopLabel(value: number, singular: string, plural: string) {
    return `${formatNumberBR(value)} ${value === 1 ? singular : plural}`;
}

async function requireCompanyIdFromContext(session: any) {
    const sCompanyId = String(session?.companyId ?? '').trim();
    if (sCompanyId) return sCompanyId;

    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
    if (cookieCompanyId) return cookieCompanyId;

    throw new Error('companyId ausente.');
}

export default async function AdminProductsReportPage({
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

    const productItemsWhere: any = {
        companyId,
        itemType: 'PRODUCT',
        order: {
            status: 'COMPLETED',
            createdAt: {
                gte: start,
                lt: end,
            },
            ...(selectedUnit !== UNIT_ALL_VALUE
                ? { unitId: selectedUnit }
                : {}),
        },
    };

    const [
        soldItemsAgg,
        revenueAgg,
        distinctProducts,
        completedOrdersWithProducts,
        topProductsSoldRaw,
        topProductsRevenueRaw,
        professionalProductRevenueRaw,
    ] = await Promise.all([
        prisma.orderItem.aggregate({
            where: productItemsWhere,
            _sum: {
                quantity: true,
            },
        }),

        prisma.orderItem.aggregate({
            where: productItemsWhere,
            _sum: {
                finalTotalPrice: true,
                totalPrice: true,
            },
        }),

        prisma.orderItem.groupBy({
            by: ['productId'],
            where: {
                ...productItemsWhere,
                productId: { not: null },
            },
        }),

        prisma.order.findMany({
            where: {
                companyId,
                status: 'COMPLETED',
                createdAt: {
                    gte: start,
                    lt: end,
                },
                ...(selectedUnit !== UNIT_ALL_VALUE
                    ? { unitId: selectedUnit }
                    : {}),
                items: {
                    some: {
                        itemType: 'PRODUCT',
                    },
                },
            },
            select: {
                id: true,
            },
        }),

        prisma.orderItem.groupBy({
            by: ['productId'],
            where: {
                ...productItemsWhere,
                productId: { not: null },
            },
            _sum: {
                quantity: true,
            },
            orderBy: {
                _sum: {
                    quantity: 'desc',
                },
            },
            take: 10,
        }),

        prisma.orderItem.groupBy({
            by: ['productId'],
            where: {
                ...productItemsWhere,
                productId: { not: null },
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
            take: 10,
        }),

        prisma.orderItem.groupBy({
            by: ['professionalId'],
            where: {
                ...productItemsWhere,
                professionalId: { not: null },
            },
            _sum: {
                finalTotalPrice: true,
                totalPrice: true,
                quantity: true,
            },
            orderBy: {
                _sum: {
                    finalTotalPrice: 'desc',
                },
            },
            take: 10,
        }),
    ]);

    const totalProductsSold = Number(soldItemsAgg._sum.quantity ?? 0);

    const totalProductsRevenue =
        Number(revenueAgg._sum.finalTotalPrice ?? 0) ||
        Number(revenueAgg._sum.totalPrice ?? 0);

    const distinctProductsSold = distinctProducts.length;
    const productSalesCount = completedOrdersWithProducts.length;

    const averageProductTicket =
        productSalesCount > 0 ? totalProductsRevenue / productSalesCount : 0;

    const topProductIds = Array.from(
        new Set([
            ...topProductsSoldRaw.map((item) => item.productId),
            ...topProductsRevenueRaw.map((item) => item.productId),
        ])
    ).filter((id): id is string => !!id);

    const topProducts = topProductIds.length
        ? await prisma.product.findMany({
              where: {
                  id: {
                      in: topProductIds,
                  },
              },
              select: {
                  id: true,
                  name: true,
              },
          })
        : [];

    const topProductsMap = new Map(
        topProducts.map((product) => [product.id, product.name])
    );

    const topProductsSoldRanking = topProductsSoldRaw.map((item) => ({
        productId: item.productId!,
        name: topProductsMap.get(item.productId!) ?? 'Produto',
        total: Number(item._sum.quantity ?? 0),
    }));

    const topProductsRevenueRanking = topProductsRevenueRaw.map((item) => ({
        productId: item.productId!,
        name: topProductsMap.get(item.productId!) ?? 'Produto',
        total:
            Number(item._sum.finalTotalPrice ?? 0) ||
            Number(item._sum.totalPrice ?? 0),
    }));

    const professionalIds = professionalProductRevenueRaw
        .map((item) => item.professionalId)
        .filter((id): id is string => !!id);

    const professionals = professionalIds.length
        ? await prisma.professional.findMany({
              where: {
                  id: {
                      in: professionalIds,
                  },
              },
              select: {
                  id: true,
                  name: true,
              },
          })
        : [];

    const professionalsMap = new Map(
        professionals.map((professional) => [
            professional.id,
            professional.name,
        ])
    );

    const professionalSalesRanking = professionalProductRevenueRaw.map(
        (item) => ({
            professionalId: item.professionalId!,
            name: professionalsMap.get(item.professionalId!) ?? 'Profissional',
            revenue:
                Number(item._sum.finalTotalPrice ?? 0) ||
                Number(item._sum.totalPrice ?? 0),
            quantity: Number(item._sum.quantity ?? 0),
        })
    );

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
                        Relatório de produtos
                    </h1>

                    <p className="text-paragraph-small text-content-secondary">
                        Analise vendas, faturamento e desempenho dos produtos no
                        período selecionado.
                    </p>
                </div>

                <div>
                    <MonthPicker />
                </div>
            </header>

            <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    title="Produtos vendidos"
                    value={formatNumberBR(totalProductsSold)}
                    description="Quantidade total de produtos vendidos no período."
                    icon={ShoppingBag}
                />

                <SummaryCard
                    title="Faturamento com produtos"
                    value={formatCurrencyBR(totalProductsRevenue)}
                    description="Valor total faturado com venda de produtos."
                    icon={DollarSign}
                />

                <SummaryCard
                    title="Produtos diferentes"
                    value={formatNumberBR(distinctProductsSold)}
                    description="Quantidade de produtos distintos vendidos."
                    icon={Boxes}
                />

                <SummaryCard
                    title="Ticket médio de produtos"
                    value={formatCurrencyBR(averageProductTicket)}
                    description="Valor médio por venda de produto no período."
                    icon={Package}
                />
            </section>

            <section className="grid gap-4 grid-cols-1 xl:grid-cols-3">
                <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5">
                    <div className="space-y-2">
                        <h3 className="text-paragraph-medium text-content-primary">
                            Produtos mais vendidos
                        </h3>

                        <p className="text-paragraph-small text-content-secondary">
                            Ranking dos produtos com maior volume de vendas.
                        </p>
                    </div>

                    <div className="mt-4">
                        {topProductsSoldRanking.length === 0 ? (
                            <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                <p className="text-paragraph-small text-content-secondary">
                                    Nenhum produto vendido neste período.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {topProductsSoldRanking.map(
                                    (product, index) => (
                                        <div
                                            key={product.productId}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-paragraph-small text-content-secondary">
                                                    #{index + 1}
                                                </p>
                                                <p className="truncate text-label-medium-size text-content-primary">
                                                    {product.name}
                                                </p>
                                            </div>

                                            <div className="text-right">
                                                <p className="text-label-medium-size text-content-primary">
                                                    {formatTopLabel(
                                                        product.total,
                                                        'unidade',
                                                        'unidades'
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
                            Produtos que mais faturam
                        </h3>

                        <p className="text-paragraph-small text-content-secondary">
                            Produtos com maior receita gerada no período.
                        </p>
                    </div>

                    <div className="mt-4">
                        {topProductsRevenueRanking.length === 0 ? (
                            <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                <p className="text-paragraph-small text-content-secondary">
                                    Nenhum faturamento com produtos neste
                                    período.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {topProductsRevenueRanking.map(
                                    (product, index) => (
                                        <div
                                            key={product.productId}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-paragraph-small text-content-secondary">
                                                    #{index + 1}
                                                </p>
                                                <p className="truncate text-label-medium-size text-content-primary">
                                                    {product.name}
                                                </p>
                                            </div>

                                            <div className="text-right">
                                                <p className="text-label-medium-size text-content-primary">
                                                    {formatCurrencyBR(
                                                        product.total
                                                    )}
                                                </p>
                                                <p className="text-[11px] text-content-secondary">
                                                    Receita no período
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
                            Vendas por profissional
                        </h3>

                        <p className="text-paragraph-small text-content-secondary">
                            Desempenho dos profissionais nas vendas de produtos.
                        </p>
                    </div>

                    <div className="mt-4">
                        {professionalSalesRanking.length === 0 ? (
                            <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                <p className="text-paragraph-small text-content-secondary">
                                    Nenhuma venda de produto por profissional
                                    neste período.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {professionalSalesRanking.map(
                                    (professional, index) => (
                                        <div
                                            key={professional.professionalId}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-paragraph-small text-content-secondary">
                                                    #{index + 1}
                                                </p>
                                                <p className="truncate text-label-medium-size text-content-primary">
                                                    {professional.name}
                                                </p>
                                                <p className="text-[11px] text-content-secondary mt-1">
                                                    {formatTopLabel(
                                                        professional.quantity,
                                                        'unidade',
                                                        'unidades'
                                                    )}
                                                </p>
                                            </div>

                                            <div className="text-right">
                                                <p className="text-label-medium-size text-content-primary">
                                                    {formatCurrencyBR(
                                                        professional.revenue
                                                    )}
                                                </p>
                                                <p className="text-[11px] text-content-secondary">
                                                    Receita no período
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
