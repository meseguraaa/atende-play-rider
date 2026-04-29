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

type AppointmentsTopServicesChartItem = {
    name: string;
    total: number;
};

type AppointmentsTopServicesChartProps = {
    data: AppointmentsTopServicesChartItem[];
};

type ServicesTooltipPayload = {
    value: number | string | undefined;
    payload: AppointmentsTopServicesChartItem;
};

type ServicesTooltipProps = {
    active?: boolean;
    payload?: ServicesTooltipPayload[];
};

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
    const total =
        typeof payload[0]?.value === 'number'
            ? payload[0].value
            : Number(payload[0]?.value ?? 0);

    return (
        <div className="rounded-md border border-border-primary bg-background-tertiary px-3 py-2 shadow-lg">
            <p className="text-paragraph-small text-content-primary">
                {item?.name ?? 'Serviço'}
            </p>
            <p className="mt-1 text-paragraph-small text-content-secondary">
                Agendamentos:{' '}
                <span className="font-semibold text-content-primary">
                    {formatNumberBR(total)}
                </span>
            </p>
        </div>
    );
}

export function AppointmentsTopServicesChart({
    data,
}: AppointmentsTopServicesChartProps) {
    const safeData = Array.isArray(data) ? data : [];
    const chartData = safeData.slice(0, 5);

    return (
        <Card className="border-border-primary bg-background-secondary">
            <CardHeader>
                <CardTitle className="text-label-large text-content-primary">
                    Serviços mais agendados
                </CardTitle>

                <CardDescription className="text-paragraph-small text-content-secondary">
                    Top serviços com maior volume de agendamentos no mês
                    selecionado.
                </CardDescription>
            </CardHeader>

            <CardContent className="h-80">
                {chartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                        <p className="text-paragraph-small text-content-secondary">
                            Nenhum serviço agendado neste período.
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
                                    tick={{
                                        fill: 'var(--color-content-secondary)',
                                        fontSize: 11,
                                    }}
                                    tickFormatter={(value: number) =>
                                        formatNumberBR(value)
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
                                    dataKey="total"
                                    radius={[0, 8, 8, 0]}
                                    maxBarSize={28}
                                >
                                    {chartData.map((item, index) => (
                                        <Cell
                                            key={`cell-${item.name}-${index}`}
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
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
