//src/components/admin/dashboard/dashboard-charts/dashboard-ratings-distribution-chart.tsx
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
} from 'recharts';

type RatingDistributionPoint = {
    rating: number; // 1..5
    count: number; // quantidade de avaliações com essa nota
};

type DashboardRatingsDistributionChartProps = {
    data: RatingDistributionPoint[];
    monthLabel: string;
    averageRatingMonth: number | null;
    averageRatingOverall: number | null;
    totalReviewsMonth: number;
    totalReviewsOverall: number;
};

type RatingsTooltipPayload = {
    value: number;
    name: string;
    color: string;
    dataKey: string | number;
};

type RatingsTooltipProps = {
    active?: boolean;
    payload?: RatingsTooltipPayload[];
    label?: string | number;
};

/**
 * Tooltip customizada para distribuição de notas
 */
function RatingsTooltip({ active, payload, label }: RatingsTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    const item = payload[0];

    return (
        <div className="rounded-md border border-border-primary bg-background-tertiary px-3 py-2 shadow-lg">
            <p className="mb-1 text-label-small text-content-secondary">
                Nota {label}★
            </p>
            <p className="text-paragraph-small text-content-primary">
                {item.value} avaliação{item.value === 1 ? '' : 'es'}
            </p>
        </div>
    );
}

/**
 * Gráfico de distribuição de notas (1 a 5 estrelas) no mês selecionado
 */
export function DashboardRatingsDistributionChart({
    data,
    monthLabel,
    averageRatingMonth,
    averageRatingOverall,
    totalReviewsMonth,
    totalReviewsOverall,
}: DashboardRatingsDistributionChartProps) {
    const avgMonthText =
        typeof averageRatingMonth === 'number'
            ? averageRatingMonth.toFixed(2).replace('.', ',')
            : '—';

    const avgOverallText =
        typeof averageRatingOverall === 'number'
            ? averageRatingOverall.toFixed(2).replace('.', ',')
            : '—';

    return (
        <Card className="border-border-primary bg-background-secondary">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="text-label-large text-content-primary">
                        Satisfação dos clientes
                    </CardTitle>
                    <CardDescription className="text-paragraph-small text-content-secondary">
                        Distribuição das notas (1 a 5 estrelas) nas avaliações
                        do mês selecionado ({monthLabel}).
                    </CardDescription>
                </div>

                <span
                    className={[
                        'inline-flex flex-col items-end gap-1 border border-border-primary bg-background-tertiary px-3 py-1.5 text-[11px] font-medium',
                        'rounded-xl md:rounded-full',
                        'max-w-45 leading-tight md:max-w-none',
                    ].join(' ')}
                >
                    <span className="text-content-secondary">
                        Nota média no mês:{' '}
                        <span className="font-semibold text-content-primary">
                            {avgMonthText}
                        </span>
                        {totalReviewsMonth > 0 && (
                            <span className="text-content-tertiary">
                                {' '}
                                ({totalReviewsMonth} aval.)
                            </span>
                        )}
                    </span>
                    <span className="text-content-secondary">
                        Histórico geral:{' '}
                        <span className="font-semibold text-content-primary">
                            {avgOverallText}
                        </span>
                        {totalReviewsOverall > 0 && (
                            <span className="text-content-tertiary">
                                {' '}
                                ({totalReviewsOverall} aval.)
                            </span>
                        )}
                    </span>
                </span>
            </CardHeader>

            <CardContent className="h-80">
                <div className="h-full w-full">
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
                                dataKey="rating"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                tick={{
                                    fill: 'var(--color-content-secondary)',
                                    fontSize: 11,
                                }}
                            />

                            <YAxis
                                allowDecimals={false}
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                tick={{
                                    fill: 'var(--color-content-secondary)',
                                    fontSize: 11,
                                }}
                            />

                            {/* ✅ Remove o retângulo cinza atrás (cursor highlight) */}
                            <Tooltip
                                content={<RatingsTooltip />}
                                cursor={false}
                            />

                            <Bar
                                dataKey="count"
                                name="Avaliações"
                                radius={[4, 4, 0, 0]}
                                fill="var(--color-accent-yellow)"
                                stroke="none"
                                activeBar={false}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
