'use client';

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

type CommunicationStatusChartProps = {
    sent: number;
    failed: number;
};

type ChartItem = {
    name: string;
    value: number;
};

type TooltipPayload = {
    value: number | string | undefined;
    payload: ChartItem;
};

type TooltipProps = {
    active?: boolean;
    payload?: TooltipPayload[];
};

function formatNumberBR(value: number) {
    return new Intl.NumberFormat('pt-BR').format(value);
}

function formatPercentBR(value: number) {
    return `${value.toFixed(1).replace('.', ',')}%`;
}

function CustomTooltip({ active, payload }: TooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    const item = payload[0]?.payload;
    const value =
        typeof payload[0]?.value === 'number'
            ? payload[0].value
            : Number(payload[0]?.value ?? 0);

    return (
        <div className="rounded-md border border-border-primary bg-background-tertiary px-3 py-2 shadow-lg">
            <p className="text-paragraph-small text-content-primary">
                {item?.name ?? 'Status'}
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

export function CommunicationStatusChart({
    sent,
    failed,
}: CommunicationStatusChartProps) {
    const total = sent + failed;

    const data: ChartItem[] = [
        { name: 'Enviadas com sucesso', value: sent },
        { name: 'Falhas de envio', value: failed },
    ].filter((item) => item.value > 0);

    return (
        <Card className="border-border-primary bg-background-secondary">
            <CardHeader>
                <CardTitle className="text-label-large text-content-primary">
                    Status dos envios
                </CardTitle>

                <CardDescription className="text-paragraph-small text-content-secondary">
                    Distribuição entre sucesso e falha nos envios automáticos.
                </CardDescription>
            </CardHeader>

            <CardContent className="h-80">
                {total === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                        <p className="text-paragraph-small text-content-secondary">
                            Nenhum envio no período.
                        </p>
                    </div>
                ) : (
                    <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-[1fr_200px] md:items-center">
                        <div className="h-56 md:h-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data}
                                        dataKey="value"
                                        nameKey="name"
                                        innerRadius={55}
                                        outerRadius={85}
                                        paddingAngle={3}
                                    >
                                        {data.map((entry) => (
                                            <Cell
                                                key={entry.name}
                                                fill={
                                                    entry.name ===
                                                    'Enviadas com sucesso'
                                                        ? '#22c55e'
                                                        : '#ef4444'
                                                }
                                            />
                                        ))}
                                    </Pie>

                                    <Tooltip content={<CustomTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="space-y-3">
                            <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
                                <p className="text-label-medium-size text-content-primary">
                                    Enviadas com sucesso
                                </p>
                                <p className="mt-1 text-title text-content-primary">
                                    {formatNumberBR(sent)}
                                </p>
                                <p className="text-[11px] text-content-secondary">
                                    {formatPercentBR((sent / total) * 100)} do
                                    total
                                </p>
                            </div>

                            <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
                                <p className="text-label-medium-size text-content-primary">
                                    Falhas de envio
                                </p>
                                <p className="mt-1 text-title text-content-primary">
                                    {formatNumberBR(failed)}
                                </p>
                                <p className="text-[11px] text-content-secondary">
                                    {formatPercentBR((failed / total) * 100)} do
                                    total
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
