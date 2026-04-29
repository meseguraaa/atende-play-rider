import { DashboardStatCard } from '@/components/admin/dashboard/dashboard-stat-card';

type DashboardDailySummaryProps = {
    totalGrossDay: string;
    totalGrossDayServices: string;
    totalGrossDayProducts: string;

    totalCommissionDay: string;
    totalCommissionDayServices: string;
    totalCommissionDayProducts: string;

    totalNetDay: string;
    totalNetDayServices: string;
    totalNetDayProducts: string;

    totalCancelFeeDay: string;
    totalCanceledWithFeeDay: number;
};

export function DashboardDailySummary({
    totalGrossDay,
    totalGrossDayServices,
    totalGrossDayProducts,

    totalCommissionDay,
    totalCommissionDayServices,
    totalCommissionDayProducts,

    totalNetDay,
    totalNetDayServices,
    totalNetDayProducts,

    totalCancelFeeDay,
    totalCanceledWithFeeDay,
}: DashboardDailySummaryProps) {
    return (
        <section className="grid gap-4 md:grid-cols-4">
            {/* Valor bruto (dia) */}
            <DashboardStatCard>
                <p className="text-label-small text-content-secondary">
                    Valor bruto (dia)
                </p>
                <p className="text-title text-content-primary">
                    {totalGrossDay}
                </p>
                <p className="text-label-small text-content-secondary">
                    Serviços: {totalGrossDayServices} • Produtos:{' '}
                    {totalGrossDayProducts}
                </p>
            </DashboardStatCard>

            {/* Comissão (dia) */}
            <DashboardStatCard>
                <p className="text-label-small text-content-secondary">
                    Comissão (dia)
                </p>
                <p className="text-title text-content-primary">
                    {totalCommissionDay}
                </p>
                <p className="text-label-small text-content-secondary">
                    Serviços: {totalCommissionDayServices} • Produtos:{' '}
                    {totalCommissionDayProducts}
                </p>
            </DashboardStatCard>

            {/* Valor líquido (dia) */}
            <DashboardStatCard>
                <p className="text-label-small text-content-secondary">
                    Valor líquido (dia)
                </p>
                <p className="text-title text-content-primary">{totalNetDay}</p>
                <p className="text-label-small text-content-secondary">
                    Serviços: {totalNetDayServices} • Produtos:{' '}
                    {totalNetDayProducts}
                </p>
            </DashboardStatCard>

            {/* Taxas de cancelamento (dia) */}
            <DashboardStatCard>
                <p className="text-label-small text-content-secondary">
                    Taxas de cancelamento (dia)
                </p>
                <p className="text-title text-content-primary">
                    {totalCancelFeeDay}
                </p>
                <p className="text-label-small text-content-secondary">
                    {totalCanceledWithFeeDay} cancelamento(s) com taxa
                </p>
            </DashboardStatCard>
        </section>
    );
}
