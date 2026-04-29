'use client';

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

type TopServicesRevenueItem = {
    name: string;
    value: number;
};

type Props = {
    data: TopServicesRevenueItem[];
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
});

function formatCurrency(value: number) {
    return currencyFormatter.format(value || 0);
}

function truncateLabel(value: string, max = 18) {
    const text = String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ');
    if (text.length <= max) return text;
    return `${text.slice(0, max).trimEnd()}...`;
}

function CustomTooltip({ active, payload }: any) {
    if (!active || !payload || payload.length === 0) return null;

    const item = payload[0]?.payload;

    return (
        <div className="rounded-md border border-border-primary bg-background-tertiary px-3 py-2 shadow-lg">
            <p className="text-paragraph-small text-content-primary">
                {item?.name}
            </p>

            <p className="mt-1 text-paragraph-small text-content-secondary">
                Receita:{' '}
                <span className="font-semibold text-content-primary">
                    {formatCurrency(item?.value ?? 0)}
                </span>
            </p>
        </div>
    );
}

export function AppointmentsTopServicesRevenueChart({ data }: Props) {
    const safeData = Array.isArray(data) ? data : [];
    const chartData = safeData.slice(0, 5);

    return (
        <Card className="border-border-primary bg-background-secondary">
            <CardHeader>
                <CardTitle className="text-label-large text-content-primary">
                    Serviços que mais faturam
                </CardTitle>

                <CardDescription className="text-paragraph-small text-content-secondary">
                    Top serviços por receita gerada no mês selecionado.
                </CardDescription>
            </CardHeader>

            <CardContent className="h-80">
                {chartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                        <p className="text-paragraph-small text-content-secondary">
                            Nenhum faturamento de serviços neste período.
                        </p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{ top: 8, right: 12, left: 12, bottom: 8 }}
                        >
                            <CartesianGrid
                                stroke="var(--color-border-divisor)"
                                strokeDasharray="3 3"
                                horizontal
                                vertical={false}
                            />

                            <XAxis
                                type="number"
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

                            <YAxis
                                type="category"
                                dataKey="name"
                                width={180}
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                tick={{
                                    fill: 'var(--color-content-secondary)',
                                    fontSize: 11,
                                }}
                                tickFormatter={(value: string) =>
                                    truncateLabel(value)
                                }
                            />

                            <Tooltip
                                cursor={false}
                                content={<CustomTooltip />}
                            />

                            <Bar
                                dataKey="value"
                                radius={[0, 8, 8, 0]}
                                maxBarSize={28}
                            >
                                {chartData.map((_, index) => (
                                    <Cell
                                        key={index}
                                        fill={
                                            index === 0
                                                ? 'var(--color-accent-yellow)'
                                                : 'var(--color-accent-blue)'
                                        }
                                        fillOpacity={index === 0 ? 1 : 0.78}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
