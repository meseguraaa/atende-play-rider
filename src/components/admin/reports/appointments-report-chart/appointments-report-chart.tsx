'use client';

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

type AppointmentsReportChartItem = {
    day: number;
    currentMonth: number;
    previousMonth: number;
};

type AppointmentsReportChartProps = {
    data: AppointmentsReportChartItem[];
    currentMonthLabel: string;
    previousMonthLabel: string;
    variationPercentage?: number | null;
};

type AppointmentsTooltipPayload = {
    value: number | string | undefined;
    name: string;
    color: string;
    dataKey: string | number;
};

type AppointmentsTooltipProps = {
    active?: boolean;
    payload?: AppointmentsTooltipPayload[];
    label?: string | number;
};

function formatNumberBR(value: number) {
    return new Intl.NumberFormat('pt-BR').format(value);
}

function CustomTooltip({ active, payload, label }: AppointmentsTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    const current = payload.find(
        (p: AppointmentsTooltipPayload) => p.dataKey === 'currentMonth'
    );
    const previous = payload.find(
        (p: AppointmentsTooltipPayload) => p.dataKey === 'previousMonth'
    );

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
                        {formatNumberBR(
                            typeof current.value === 'number'
                                ? current.value
                                : Number(current.value ?? 0)
                        )}
                    </span>
                </p>
            )}

            {previous && (
                <p className="mt-1 text-paragraph-small text-content-secondary">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent-blue" />
                    Mês anterior:{' '}
                    <span className="font-semibold">
                        {formatNumberBR(
                            typeof previous.value === 'number'
                                ? previous.value
                                : Number(previous.value ?? 0)
                        )}
                    </span>
                </p>
            )}
        </div>
    );
}

export function AppointmentsReportChart({
    data,
    currentMonthLabel,
    previousMonthLabel,
    variationPercentage,
}: AppointmentsReportChartProps) {
    const safeData = Array.isArray(data) ? data : [];

    const formattedVariation =
        typeof variationPercentage === 'number'
            ? `${variationPercentage > 0 ? '+' : ''}${variationPercentage.toFixed(1)}%`
            : null;

    const variationIsPositive =
        typeof variationPercentage === 'number' && variationPercentage >= 0;

    return (
        <Card className="border-border-primary bg-background-secondary">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="text-label-large text-content-primary">
                        Agendamentos por dia
                    </CardTitle>

                    <CardDescription className="text-paragraph-small text-content-secondary">
                        Comparação diária entre o mês selecionado e o mês
                        anterior.
                    </CardDescription>
                </div>

                {formattedVariation && (
                    <span
                        className={[
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
                {safeData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                        <p className="text-paragraph-small text-content-secondary">
                            Nenhum dado disponível para o gráfico neste período.
                        </p>
                    </div>
                ) : (
                    <div className="h-full w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                data={safeData}
                                margin={{
                                    left: 0,
                                    right: 12,
                                    top: 8,
                                    bottom: 8,
                                }}
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
                                    allowDecimals={false}
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    tick={{
                                        fill: 'var(--color-content-secondary)',
                                        fontSize: 11,
                                    }}
                                    tickFormatter={(value: number) =>
                                        formatNumberBR(value)
                                    }
                                />

                                <Tooltip
                                    cursor={false}
                                    content={<CustomTooltip />}
                                />

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
                )}
            </CardContent>
        </Card>
    );
}
