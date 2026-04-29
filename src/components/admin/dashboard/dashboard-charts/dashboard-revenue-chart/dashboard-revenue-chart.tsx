//src/components/admin/dashboard/dashboard-charts/dashboard-revenue-chart.tsx
'use client';

import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '@/components/ui/card';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';

type RevenuePoint = {
    day: number; // 1..31
    currentMonth: number; // valor em R$
    previousMonth: number; // valor em R$
};

type DashboardRevenueChartProps = {
    data: RevenuePoint[];
    currentMonthLabel: string; // ex: "Dezembro/2025"
    previousMonthLabel: string; // ex: "Novembro/2025"
    variationPercentage?: number | null; // comparação mês vs mês passado
};

type RevenueTooltipPayload = {
    value: number | string | undefined;
    name: string;
    color: string;
    dataKey: string | number;
};

type RevenueTooltipProps = {
    active?: boolean;
    payload?: RevenueTooltipPayload[];
    label?: string | number;
};

/**
 * Tooltip customizada no padrão do seu tema
 */
function CustomTooltip({ active, payload, label }: RevenueTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    const current = payload.find(
        (p: RevenueTooltipPayload) => p.dataKey === 'currentMonth'
    );
    const previous = payload.find(
        (p: RevenueTooltipPayload) => p.dataKey === 'previousMonth'
    );

    const formatCurrency = (value: number | string | undefined) => {
        if (typeof value !== 'number') return 'R$ 0,00';
        return value.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
        });
    };

    return (
        <div className="rounded-md border border-border-primary bg-background-tertiary px-3 py-2 shadow-lg">
            <p className="mb-1 text-label-small text-content-secondary">
                Dia {label}
            </p>

            {current && (
                <p className="text-paragraph-small text-content-primary">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent-yellow" />
                    Mês atual:{' '}
                    <span className="font-semibold">
                        {formatCurrency(current.value)}
                    </span>
                </p>
            )}

            {previous && (
                <p className="mt-1 text-paragraph-small text-content-secondary">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent-blue" />
                    Mês anterior:{' '}
                    <span className="font-semibold">
                        {formatCurrency(previous.value)}
                    </span>
                </p>
            )}
        </div>
    );
}

/**
 * Card + gráfico de faturamento comparando mês atual vs mês anterior.
 * Visual 100% alinhado com seu CSS.
 */
export function DashboardRevenueChart({
    data,
    currentMonthLabel,
    previousMonthLabel,
    variationPercentage,
}: DashboardRevenueChartProps) {
    const formattedVariation =
        typeof variationPercentage === 'number'
            ? `${variationPercentage > 0 ? '+' : ''}${variationPercentage.toFixed(
                  1
              )}%`
            : null;

    const variationIsPositive =
        typeof variationPercentage === 'number' && variationPercentage >= 0;

    return (
        <Card className="border-border-primary bg-background-secondary">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="text-label-large text-content-primary">
                        Faturamento do mês
                    </CardTitle>
                    <CardDescription className="text-paragraph-small text-content-secondary">
                        Comparação diária entre o mês selecionado e o mês
                        anterior.
                    </CardDescription>
                </div>

                {formattedVariation && (
                    <span
                        className={[
                            // ✅ no mobile: menos “pílula” e permite quebrar linha melhor
                            'inline-flex items-center gap-1 border px-3 py-1.5 text-xs font-medium',
                            'rounded-xl md:rounded-full',
                            'max-w-42.5 text-right leading-tight md:max-w-none md:text-left',
                            variationIsPositive
                                ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500'
                                : 'text-red-500 bg-red-500/10 border-red-500',
                        ].join(' ')}
                    >
                        <span>{variationIsPositive ? '↑' : '↓'}</span>
                        <span>{formattedVariation} vs mês anterior</span>
                    </span>
                )}
            </CardHeader>

            <CardContent className="h-80">
                <div className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={data}
                            margin={{ left: 0, right: 12, top: 8, bottom: 8 }}
                        >
                            <CartesianGrid
                                stroke="var(--color-border-divisor)"
                                strokeDasharray="3 3"
                                vertical={false}
                            />
                            <XAxis
                                dataKey="day"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                tick={{
                                    fill: 'var(--color-content-secondary)',
                                    fontSize: 11,
                                }}
                            />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                tick={{
                                    fill: 'var(--color-content-secondary)',
                                    fontSize: 11,
                                }}
                                tickFormatter={(value: number) =>
                                    value.toLocaleString('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                        maximumFractionDigits: 0,
                                    })
                                }
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                                wrapperStyle={{
                                    paddingTop: 8,
                                }}
                                formatter={(value: string) => (
                                    <span className="text-paragraph-small text-content-secondary">
                                        {value}
                                    </span>
                                )}
                            />
                            <Line
                                type="monotone"
                                dataKey="currentMonth"
                                name={currentMonthLabel}
                                stroke="var(--color-accent-yellow)"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="previousMonth"
                                name={previousMonthLabel}
                                stroke="var(--color-accent-blue)"
                                strokeWidth={2}
                                dot={false}
                                strokeDasharray="4 4"
                                activeDot={{ r: 4 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * Exemplo de dados fake só pra você visualizar o gráfico
 * (remove quando ligar no Prisma).
 */
export const mockRevenueData: RevenuePoint[] = [
    { day: 1, currentMonth: 850, previousMonth: 600 },
    { day: 2, currentMonth: 1200, previousMonth: 800 },
    { day: 3, currentMonth: 400, previousMonth: 950 },
    { day: 4, currentMonth: 1500, previousMonth: 1000 },
    { day: 5, currentMonth: 900, previousMonth: 700 },
    { day: 6, currentMonth: 1700, previousMonth: 1200 },
    { day: 7, currentMonth: 1100, previousMonth: 900 },
];
