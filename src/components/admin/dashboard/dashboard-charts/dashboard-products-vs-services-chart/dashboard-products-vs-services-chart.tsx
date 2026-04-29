//src/components/admin/dashboard/dashboard-charts/dashboard-products-vs-services-chart/dashboard-products-vs-services-chart.tsx
'use client';

import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '@/components/ui/card';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';

type ProductsVsServicesPoint = {
    day: number;
    label: string; // "01", "02", ...
    services: number;
    products: number;
};

type DashboardProductsVsServicesChartProps = {
    data: ProductsVsServicesPoint[];
    monthLabel: string;
    totalServices: number;
    totalProducts: number;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
});

function formatCurrency(value: number) {
    return currencyFormatter.format(value || 0);
}

// 🎨 cores finais do sistema (PADRÃO DASHBOARD)
const SERVICES_COLOR = 'var(--color-accent-yellow)'; // amarelo (serviços)
const PRODUCTS_COLOR = '#2563EB'; // azul (produtos)

function ProductsVsServicesTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: Array<{ dataKey?: string; value?: number }>;
    label?: string | number;
}) {
    if (!active || !payload || payload.length === 0) return null;

    const services = payload.find((p) => p.dataKey === 'services')?.value ?? 0;
    const products = payload.find((p) => p.dataKey === 'products')?.value ?? 0;

    return (
        <div className="rounded-md border border-border-primary bg-background-tertiary px-3 py-2 shadow-lg">
            <p className="mb-2 text-label-small text-content-secondary">
                Dia {label}
            </p>

            <div className="space-y-1 text-[11px]">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-content-secondary">
                        <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: PRODUCTS_COLOR }}
                        />
                        Produtos
                    </div>
                    <span className="font-medium text-content-primary">
                        {formatCurrency(Number(products))}
                    </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-content-secondary">
                        <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: SERVICES_COLOR }}
                        />
                        Serviços
                    </div>
                    <span className="font-medium text-content-primary">
                        {formatCurrency(Number(services))}
                    </span>
                </div>
            </div>
        </div>
    );
}

export function DashboardProductsVsServicesChart({
    data,
    monthLabel,
    totalServices,
    totalProducts,
}: DashboardProductsVsServicesChartProps) {
    const total = totalServices + totalProducts;
    const servicesPct = total > 0 ? (totalServices / total) * 100 : 0;
    const productsPct = total > 0 ? (totalProducts / total) * 100 : 0;

    const isAllZero = data.every((d) => d.services === 0 && d.products === 0);

    return (
        <Card className="border-border-primary bg-background-secondary">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="text-label-large text-content-primary">
                        Produtos x Serviços
                    </CardTitle>
                    <CardDescription className="text-paragraph-small text-content-secondary">
                        Distribuição do faturamento por tipo de venda no mês
                        selecionado ({monthLabel}).
                    </CardDescription>
                </div>

                <span
                    className={[
                        'inline-flex flex-col items-end gap-1 border bg-background-tertiary px-3 py-1.5 text-[11px] font-medium',
                        'rounded-xl md:rounded-full',
                        'max-w-45 leading-tight md:max-w-none',
                    ].join(' ')}
                >
                    <span className="text-content-secondary">
                        Serviços:{' '}
                        <span className="font-semibold text-content-primary">
                            {formatCurrency(totalServices)}
                        </span>
                        {total > 0 && (
                            <span className="text-content-tertiary">
                                {' '}
                                ({servicesPct.toFixed(1)}%)
                            </span>
                        )}
                    </span>

                    <span className="text-content-secondary">
                        Produtos:{' '}
                        <span className="font-semibold text-content-primary">
                            {formatCurrency(totalProducts)}
                        </span>
                        {total > 0 && (
                            <span className="text-content-tertiary">
                                {' '}
                                ({productsPct.toFixed(1)}%)
                            </span>
                        )}
                    </span>
                </span>
            </CardHeader>

            <CardContent className="h-80">
                {isAllZero ? (
                    <p className="text-paragraph-small text-content-secondary">
                        Ainda não há faturamento de produtos ou serviços neste
                        mês.
                    </p>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={data}
                            margin={{ left: 0, right: 12, top: 8, bottom: 8 }}
                        >
                            <CartesianGrid
                                stroke="var(--color-border-divisor)"
                                strokeDasharray="3 3"
                                vertical={false}
                            />

                            <XAxis
                                dataKey="label"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                tick={{
                                    fill: 'var(--color-content-secondary)',
                                    fontSize: 11,
                                }}
                            />

                            <YAxis
                                tickFormatter={(v) =>
                                    currencyFormatter
                                        .format(v)
                                        .replace('R$', '')
                                        .trim()
                                }
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                tick={{
                                    fill: 'var(--color-content-secondary)',
                                    fontSize: 11,
                                }}
                            />

                            <Tooltip
                                content={<ProductsVsServicesTooltip />}
                                cursor={false}
                            />

                            <Legend
                                wrapperStyle={{ fontSize: 11 }}
                                iconType="circle"
                                verticalAlign="top"
                                height={28}
                            />

                            <Bar
                                dataKey="services"
                                name="Serviços"
                                stackId="a"
                                fill={SERVICES_COLOR}
                                radius={[4, 4, 0, 0]}
                                stroke="none"
                                activeBar={false}
                            />

                            <Bar
                                dataKey="products"
                                name="Produtos"
                                stackId="a"
                                fill={PRODUCTS_COLOR}
                                radius={[4, 4, 0, 0]}
                                stroke="none"
                                activeBar={false}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
