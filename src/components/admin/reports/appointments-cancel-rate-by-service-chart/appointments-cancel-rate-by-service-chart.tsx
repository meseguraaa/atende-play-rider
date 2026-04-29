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

type AppointmentsCancelRateByServiceChartItem = {
    name: string;
    rate: number;
    canceled: number;
    total: number;
};

type AppointmentsCancelRateByServiceChartProps = {
    data: AppointmentsCancelRateByServiceChartItem[];
};

type ServicesTooltipPayload = {
    payload: AppointmentsCancelRateByServiceChartItem;
};

type ServicesTooltipProps = {
    active?: boolean;
    payload?: ServicesTooltipPayload[];
};

function formatPercentBR(value: number) {
    return `${value.toFixed(1).replace('.', ',')}%`;
}

function formatNumberBR(value: number) {
    return new Intl.NumberFormat('pt-BR').format(value);
}

function truncateLabel(value: string, max = 22) {
    const text = String(value ?? '').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
}

function CustomTooltip({ active, payload }: ServicesTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    const item = payload[0]?.payload;

    if (!item) return null;

    return (
        <div className="rounded-md border border-border-primary bg-background-tertiary px-3 py-2 shadow-lg">
            <p className="text-paragraph-small text-content-primary">
                {item.name}
            </p>

            <p className="mt-1 text-paragraph-small text-content-secondary">
                Taxa de cancelamento:{' '}
                <span className="font-semibold text-content-primary">
                    {formatPercentBR(item.rate)}
                </span>
            </p>

            <p className="mt-1 text-paragraph-small text-content-secondary">
                Cancelados:{' '}
                <span className="font-semibold text-content-primary">
                    {formatNumberBR(item.canceled)}
                </span>
            </p>

            <p className="mt-1 text-paragraph-small text-content-secondary">
                Total:{' '}
                <span className="font-semibold text-content-primary">
                    {formatNumberBR(item.total)}
                </span>
            </p>
        </div>
    );
}

export function AppointmentsCancelRateByServiceChart({
    data,
}: AppointmentsCancelRateByServiceChartProps) {
    const safeData = Array.isArray(data) ? data : [];
    const chartData = safeData.slice(0, 5);

    return (
        <Card className="border-border-primary bg-background-secondary">
            <CardHeader>
                <CardTitle className="text-label-large text-content-primary">
                    Taxa de cancelamento por serviço
                </CardTitle>

                <CardDescription className="text-paragraph-small text-content-secondary">
                    Top serviços com maior taxa de cancelamento no mês
                    selecionado.
                </CardDescription>
            </CardHeader>

            <CardContent className="h-80">
                {chartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                        <p className="text-paragraph-small text-content-secondary">
                            Nenhum dado suficiente para taxa de cancelamento
                            neste período.
                        </p>
                    </div>
                ) : (
                    <div className="h-full w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={chartData}
                                layout="vertical"
                                margin={{
                                    top: 8,
                                    right: 12,
                                    left: 12,
                                    bottom: 8,
                                }}
                            >
                                <CartesianGrid
                                    stroke="var(--color-border-divisor)"
                                    strokeDasharray="3 3"
                                    horizontal={true}
                                    vertical={false}
                                />

                                <XAxis
                                    type="number"
                                    allowDecimals={false}
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    domain={[0, 100]}
                                    tick={{
                                        fill: 'var(--color-content-secondary)',
                                        fontSize: 11,
                                    }}
                                    tickFormatter={(value: number) =>
                                        formatPercentBR(value)
                                    }
                                />

                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={140}
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
                                    dataKey="rate"
                                    radius={[0, 8, 8, 0]}
                                    maxBarSize={28}
                                >
                                    {chartData.map((item, index) => (
                                        <Cell
                                            key={`cell-${item.name}-${index}`}
                                            fill={
                                                index === 0
                                                    ? 'var(--color-destructive)'
                                                    : 'var(--color-accent-yellow)'
                                            }
                                            fillOpacity={index === 0 ? 1 : 0.82}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
