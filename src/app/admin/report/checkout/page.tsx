// src/app/admin/report/checkout/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import {
    ArrowLeft,
    BadgeDollarSign,
    CreditCard,
    Package,
    Receipt,
    ShoppingBag,
    Wallet,
} from 'lucide-react';
import { cookies } from 'next/headers';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';

import { MonthPicker } from '@/components/month-picker';
import { CheckoutTopServicesRevenueChart } from '@/components/admin/reports/checkout-top-services-revenue-chart/checkout-top-services-revenue-chart';
import { CheckoutTopProductsRevenueChart } from '@/components/admin/reports/checkout-top-products-revenue-chart/checkout-top-products-revenue-chart';
import { CheckoutRevenueByProfessionalChart } from '@/components/admin/reports/checkout-revenue-by-professional-chart/checkout-revenue-by-professional-chart';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Relatório de Checkout',
};

type SummaryCardProps = {
    title: string;
    value: string;
    description: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type SnapshotItemType = 'SERVICE' | 'PRODUCT' | 'CANCELLATION_FEE';

type CheckoutSnapshotItem = {
    itemType?: SnapshotItemType | string | null;
    finalTotalPrice?: string | number | null;
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

function toMoney(value: unknown) {
    if (value == null) return 0;

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
        const n = Number(value.replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
    }

    if (typeof value === 'object') {
        const anyValue = value as any;

        if (typeof anyValue.toNumber === 'function') {
            const n = anyValue.toNumber();
            return Number.isFinite(n) ? n : 0;
        }

        if (typeof anyValue.toString === 'function') {
            const n = Number(String(anyValue.toString()).replace(',', '.'));
            return Number.isFinite(n) ? n : 0;
        }
    }

    return 0;
}

function roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getSubscriptionActionFromSnapshot(
    snapshot: unknown
): 'NONE' | 'USE_ACTIVE' | 'RENEW' | 'JOIN' {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        return 'NONE';
    }

    const raw = String(
        (snapshot as Record<string, unknown>).subscriptionAction ?? ''
    )
        .trim()
        .toUpperCase();

    if (raw === 'USE_ACTIVE') return 'USE_ACTIVE';
    if (raw === 'RENEW') return 'RENEW';
    if (raw === 'JOIN') return 'JOIN';

    return 'NONE';
}

function getSnapshotItems(snapshot: unknown): CheckoutSnapshotItem[] {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        return [];
    }

    const items = (snapshot as Record<string, unknown>).items;

    if (!Array.isArray(items)) return [];

    return items.filter(
        (item) => item && typeof item === 'object'
    ) as CheckoutSnapshotItem[];
}

function getSnapshotTotals(snapshot: unknown) {
    const items = getSnapshotItems(snapshot);

    let services = 0;
    let products = 0;
    let cancellationFees = 0;

    for (const item of items) {
        const itemType = String(item.itemType ?? '')
            .trim()
            .toUpperCase();
        const finalTotalPrice = roundMoney(toMoney(item.finalTotalPrice));

        if (itemType === 'SERVICE') {
            services += finalTotalPrice;
        } else if (itemType === 'PRODUCT') {
            products += finalTotalPrice;
        } else if (itemType === 'CANCELLATION_FEE') {
            cancellationFees += finalTotalPrice;
        }
    }

    return {
        services: roundMoney(services),
        products: roundMoney(products),
        cancellationFees: roundMoney(cancellationFees),
    };
}

export default async function AdminCheckoutReportPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await requireAdminForModule('DASHBOARD');

    const COMPANY_COOKIE_NAME = 'admin_company_context';
    const UNIT_COOKIE_NAME = 'admin_unit_context';
    const UNIT_ALL_VALUE = 'all';

    async function requireCompanyIdFromContext(session: any) {
        const sCompanyId = String(session?.companyId ?? '').trim();
        if (sCompanyId) return sCompanyId;

        const cookieStore = await cookies();
        const cookieCompanyId = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
        if (cookieCompanyId) return cookieCompanyId;

        throw new Error('companyId ausente.');
    }

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

    const orderWhere: any = {
        companyId,
        status: 'COMPLETED',
        createdAt: {
            gte: start,
            lt: end,
        },
        ...(selectedUnit !== UNIT_ALL_VALUE ? { unitId: selectedUnit } : {}),
    };

    const orderItemWhereBase: any = {
        companyId,
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
        totalCheckouts,
        serviceCheckouts,
        productCheckouts,
        cancellationFees,
        totalRevenueAgg,
        completedOrdersRevenueBreakdown,
        topServicesRevenueRaw,
        topProductsRevenueRaw,
        topProfessionalsRevenueRaw,
    ] = await Promise.all([
        prisma.order.count({
            where: orderWhere,
        }),

        prisma.order.count({
            where: {
                ...orderWhere,
                items: {
                    some: {
                        itemType: 'SERVICE',
                    },
                },
            },
        }),

        prisma.order.count({
            where: {
                ...orderWhere,
                items: {
                    some: {
                        itemType: 'PRODUCT',
                    },
                },
            },
        }),

        prisma.orderItem.count({
            where: {
                ...orderItemWhereBase,
                itemType: 'CANCELLATION_FEE',
            },
        }),

        prisma.order.aggregate({
            where: orderWhere,
            _sum: {
                totalAmount: true,
            },
        }),

        prisma.order.findMany({
            where: orderWhere,
            select: {
                totalAmount: true,
                appointment: {
                    select: {
                        planUsageType: true,
                        checkoutFinancialSnapshot: true,
                        clientPlan: {
                            select: {
                                planTypeSnapshot: true,
                            },
                        },
                    },
                },
            },
        }),

        prisma.orderItem.groupBy({
            by: ['serviceId'],
            where: {
                ...orderItemWhereBase,
                itemType: 'SERVICE',
                serviceId: { not: null },
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
        }),

        prisma.orderItem.groupBy({
            by: ['productId'],
            where: {
                ...orderItemWhereBase,
                itemType: 'PRODUCT',
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
            take: 5,
        }),

        prisma.orderItem.groupBy({
            by: ['professionalId'],
            where: {
                ...orderItemWhereBase,
                professionalId: { not: null },
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
        }),
    ]);

    const totalRevenue = Number(totalRevenueAgg._sum.totalAmount ?? 0);
    const averageTicket =
        totalCheckouts > 0 ? totalRevenue / totalCheckouts : 0;

    let totalAvulso = 0;
    let totalPlanoGeral = 0;
    let totalPlanoPersonalizado = 0;
    let totalAssinatura = 0;

    for (const order of completedOrdersRevenueBreakdown) {
        const orderTotal = roundMoney(Number(order.totalAmount ?? 0));
        const isPlan = order.appointment?.planUsageType === 'PLAN_CREDIT';
        const snapshot = order.appointment?.checkoutFinancialSnapshot;
        const snapshotTotals = getSnapshotTotals(snapshot);

        const productsAndFeesTotal = roundMoney(
            snapshotTotals.products + snapshotTotals.cancellationFees
        );

        const planOrServicePortion = roundMoney(
            Math.max(0, orderTotal - productsAndFeesTotal)
        );

        if (!isPlan) {
            totalAvulso += planOrServicePortion;
            continue;
        }

        const planType =
            order.appointment?.clientPlan?.planTypeSnapshot ?? 'GENERAL';

        if (planType === 'CUSTOM') {
            totalPlanoPersonalizado += planOrServicePortion;
            continue;
        }

        if (planType === 'SUBSCRIPTION') {
            const subscriptionAction =
                getSubscriptionActionFromSnapshot(snapshot);

            if (
                subscriptionAction === 'JOIN' ||
                subscriptionAction === 'RENEW'
            ) {
                totalAssinatura += planOrServicePortion;
            }

            continue;
        }

        totalPlanoGeral += planOrServicePortion;
    }

    totalAvulso = roundMoney(totalAvulso);
    totalPlanoGeral = roundMoney(totalPlanoGeral);
    totalPlanoPersonalizado = roundMoney(totalPlanoPersonalizado);
    totalAssinatura = roundMoney(totalAssinatura);

    const [revenueServices, revenueProducts, revenueProfessionals] =
        await Promise.all([
            prisma.service.findMany({
                where: {
                    id: {
                        in: topServicesRevenueRaw.map((s) => s.serviceId!),
                    },
                },
                select: {
                    id: true,
                    name: true,
                },
            }),

            prisma.product.findMany({
                where: {
                    id: {
                        in: topProductsRevenueRaw.map((p) => p.productId!),
                    },
                },
                select: {
                    id: true,
                    name: true,
                },
            }),

            prisma.professional.findMany({
                where: {
                    id: {
                        in: topProfessionalsRevenueRaw.map(
                            (p) => p.professionalId!
                        ),
                    },
                },
                select: {
                    id: true,
                    name: true,
                },
            }),
        ]);

    const revenueServicesMap = new Map(
        revenueServices.map((s) => [s.id, s.name])
    );

    const revenueProductsMap = new Map(
        revenueProducts.map((p) => [p.id, p.name])
    );

    const revenueProfessionalsMap = new Map(
        revenueProfessionals.map((p) => [p.id, p.name])
    );

    const revenueByProfessionalChartData = topProfessionalsRevenueRaw.map(
        (p) => {
            const value =
                Number(p._sum.finalTotalPrice ?? 0) ||
                Number(p._sum.totalPrice ?? 0);

            return {
                name: revenueProfessionalsMap.get(p.professionalId!) ?? '—',
                value,
            };
        }
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

    const topProductsRevenueChartData = topProductsRevenueRaw.map((p) => {
        const value =
            Number(p._sum.finalTotalPrice ?? 0) ||
            Number(p._sum.totalPrice ?? 0);

        return {
            name: revenueProductsMap.get(p.productId!) ?? '—',
            value,
        };
    });

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
                        Relatório de checkout
                    </h1>

                    <p className="text-paragraph-small text-content-secondary">
                        Acompanhe indicadores financeiros, volume de checkout e
                        desempenho de serviços e produtos.
                    </p>
                </div>

                <div>
                    <MonthPicker />
                </div>
            </header>

            <section className="grid gap-4 grid-cols-1 lg:grid-cols-3">
                <SummaryCard
                    title="Total de checkouts"
                    value={formatNumberBR(totalCheckouts)}
                    description="Quantidade total de checkouts no mês selecionado."
                    icon={Receipt}
                />

                <SummaryCard
                    title="Faturamento total"
                    value={formatCurrencyBR(totalRevenue)}
                    description="Valor total faturado no mês selecionado."
                    icon={BadgeDollarSign}
                />

                <SummaryCard
                    title="Ticket médio"
                    value={formatCurrencyBR(averageTicket)}
                    description="Valor médio por checkout concluído."
                    icon={Wallet}
                />

                <SummaryCard
                    title="Checkouts com serviço"
                    value={formatNumberBR(serviceCheckouts)}
                    description="Pedidos concluídos que tiveram pelo menos 1 serviço."
                    icon={Wallet}
                />

                <SummaryCard
                    title="Checkouts com produto"
                    value={formatNumberBR(productCheckouts)}
                    description="Pedidos concluídos que tiveram pelo menos 1 produto."
                    icon={ShoppingBag}
                />

                <SummaryCard
                    title="Taxas de cancelamento"
                    value={formatNumberBR(cancellationFees)}
                    description="Quantidade de taxas de cancelamento aplicadas."
                    icon={Package}
                />
            </section>

            <section className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    title="Serviço avulso"
                    value={formatCurrencyBR(totalAvulso)}
                    description="Faturamento apenas da parte avulsa dos serviços."
                    icon={BadgeDollarSign}
                />

                <SummaryCard
                    title="Plano geral"
                    value={formatCurrencyBR(totalPlanoGeral)}
                    description="Faturamento apenas da parte do plano geral."
                    icon={CreditCard}
                />

                <SummaryCard
                    title="Plano personalizado"
                    value={formatCurrencyBR(totalPlanoPersonalizado)}
                    description="Faturamento apenas da parte do plano personalizado."
                    icon={Wallet}
                />

                <SummaryCard
                    title="Assinatura"
                    value={formatCurrencyBR(totalAssinatura)}
                    description="Faturamento apenas de adesões e renovações da assinatura."
                    icon={CreditCard}
                />
            </section>

            <section className="grid gap-4 grid-cols-1 xl:grid-cols-3">
                <CheckoutTopServicesRevenueChart
                    data={topServicesRevenueChartData}
                />

                <CheckoutTopProductsRevenueChart
                    data={topProductsRevenueChartData}
                />

                <CheckoutRevenueByProfessionalChart
                    data={revenueByProfessionalChartData}
                />
            </section>
        </div>
    );
}
