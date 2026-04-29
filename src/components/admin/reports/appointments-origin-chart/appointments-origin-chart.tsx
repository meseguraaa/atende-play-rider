'use client';

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
} from 'recharts';

type AppointmentsOriginChartItem = {
    name: string;
    value: number;
};

type AppointmentsOriginChartProps = {
    data: AppointmentsOriginChartItem[];
};

type OriginTooltipPayload = {
    value: number | string | undefined;
    name: string;
    color: string;
    payload: AppointmentsOriginChartItem;
};

type OriginTooltipProps = {
    active?: boolean;
    payload?: OriginTooltipPayload[];
};

const COLORS = [
    'var(--color-accent-yellow)',
    'var(--color-accent-blue)',
    'var(--color-brand-primary)',
    'var(--color-accent-green)',
];

function formatNumberBR(value: number) {
    return new Intl.NumberFormat('pt-BR').format(value);
}

function CustomTooltip({ active, payload }: OriginTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    const item = payload[0];
    const value =
        typeof item.value === 'number' ? item.value : Number(item.value ?? 0);

    return (
        <div className="rounded-md border border-border-primary bg-background-tertiary px-3 py-2 shadow-lg">
            <p className="text-paragraph-small text-content-primary">
                {item.name}:{' '}
                <span className="font-semibold">{formatNumberBR(value)}</span>
            </p>
        </div>
    );
}

export function AppointmentsOriginChart({
    data,
}: AppointmentsOriginChartProps) {
    const safeData = Array.isArray(data) ? data : [];
    const chartData = safeData.filter((item) => Number(item.value) > 0);
    const total = chartData.reduce((acc, item) => acc + Number(item.value), 0);

    return (
        <Card className="border-border-primary bg-background-secondary">
            <CardHeader>
                <CardTitle className="text-label-large text-content-primary">
                    Origem dos agendamentos
                </CardTitle>

                <CardDescription className="text-paragraph-small text-content-secondary">
                    Distribuição dos agendamentos por canal no mês selecionado.
                </CardDescription>
            </CardHeader>

            <CardContent className="h-80">
                {chartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                        <p className="text-paragraph-small text-content-secondary">
                            Nenhum dado disponível para o gráfico neste período.
                        </p>
                    </div>
                ) : (
                    <div className="h-full w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={55}
                                    outerRadius={95}
                                    paddingAngle={3}
                                    stroke="transparent"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${entry.name}`}
                                            fill={COLORS[index % COLORS.length]}
                                        />
                                    ))}
                                </Pie>

                                <Tooltip
                                    cursor={false}
                                    content={<CustomTooltip />}
                                />

                                <Legend
                                    verticalAlign="bottom"
                                    wrapperStyle={{
                                        paddingTop: 8,
                                    }}
                                    formatter={(value: string) => (
                                        <span className="text-paragraph-small text-content-secondary">
                                            {value}
                                        </span>
                                    )}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
