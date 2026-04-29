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
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

type ClientsNewVsRecurringChartItem = {
    name: string;
    value: number;
};

type ClientsNewVsRecurringChartProps = {
    data: ClientsNewVsRecurringChartItem[];
};

type ChartTooltipPayload = {
    value: number | string | undefined;
    payload: ClientsNewVsRecurringChartItem;
};

type ChartTooltipProps = {
    active?: boolean;
    payload?: ChartTooltipPayload[];
};

function formatNumberBR(value: number) {
    return new Intl.NumberFormat('pt-BR').format(value);
}

function CustomTooltip({ active, payload }: ChartTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    const item = payload[0]?.payload;
    const value =
        typeof payload[0]?.value === 'number'
            ? payload[0].value
            : Number(payload[0]?.value ?? 0);

    return (
        <div className="rounded-md border border-border-primary bg-background-tertiary px-3 py-2 shadow-lg">
            <p className="text-paragraph-small text-content-primary">
                {item?.name ?? 'Clientes'}
            </p>

            <p className="mt-1 text-paragraph-small text-content-secondary">
                Quantidade:{' '}
                <span className="font-semibold text-content-primary">
                    {formatNumberBR(value)}
                </span>
            </p>
        </div>
    );
}

export function ClientsNewVsRecurringChart({
    data,
}: ClientsNewVsRecurringChartProps) {
    const safeData = Array.isArray(data) ? data : [];

    return (
        <Card className="border-border-primary bg-background-secondary">
            <CardHeader>
                <CardTitle className="text-label-large text-content-primary">
                    Novos vs recorrentes
                </CardTitle>

                <CardDescription className="text-paragraph-small text-content-secondary">
                    Comparativo entre clientes novos e clientes recorrentes no
                    período selecionado.
                </CardDescription>
            </CardHeader>

            <CardContent className="h-80">
                {safeData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                        <p className="text-paragraph-small text-content-secondary">
                            Nenhum dado disponível para este período.
                        </p>
                    </div>
                ) : (
                    <div className="h-full w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={safeData}
                                margin={{
                                    top: 8,
                                    right: 12,
                                    left: 0,
                                    bottom: 8,
                                }}
                            >
                                <CartesianGrid
                                    stroke="var(--color-border-divisor)"
                                    strokeDasharray="3 3"
                                    vertical={false}
                                />

                                <XAxis
                                    dataKey="name"
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

                                <Bar
                                    dataKey="value"
                                    radius={[8, 8, 0, 0]}
                                    fill="var(--color-accent-blue)"
                                    maxBarSize={56}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
