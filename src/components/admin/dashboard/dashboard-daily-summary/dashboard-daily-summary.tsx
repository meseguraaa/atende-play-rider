import { DashboardStatCard } from '@/components/admin/dashboard/dashboard-stat-card';

type DashboardDailySummaryProps = {
    totalGrossDay: string;
    totalGrossDayServices: string;
    totalGrossDayProducts: string;

    totalCardFeesDay?: string;

    totalCommissionDay: string;
    totalCommissionDayServices: string;
    totalCommissionDayProducts: string;

    totalNetDay: string;
    totalNetDayServices: string;
    totalNetDayProducts: string;

    totalCancelFeeDay: string;
    totalCanceledWithFeeDay: number;

    discountTotalDay?: string;
    discountTotalDayServices?: string;
    discountTotalDayProducts?: string;
    discountCountDay?: number;
};

export function DashboardDailySummary({
    totalGrossDay,
    totalGrossDayServices,
    totalGrossDayProducts,

    totalCardFeesDay,

    totalCommissionDay,
    totalCommissionDayServices,
    totalCommissionDayProducts,

    totalNetDay,
    totalNetDayServices,
    totalNetDayProducts,

    totalCancelFeeDay,
    totalCanceledWithFeeDay,

    discountTotalDay = 'R$ 0,00',
    discountTotalDayServices = 'R$ 0,00',
    discountTotalDayProducts = 'R$ 0,00',
    discountCountDay = 0,
}: DashboardDailySummaryProps) {
    return (
        <>
            <div className="block md:hidden">
                <section className="grid grid-cols-1 gap-4">
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

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Taxas cartão (dia)
                        </p>

                        <p className="text-title text-red-600">
                            {totalCardFeesDay ?? 'R$ 0,00'}
                        </p>

                        <p className="text-label-small text-content-secondary">
                            Taxas de crédito e débito no dia
                        </p>
                    </DashboardStatCard>

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

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Taxa de cancelamento (dia)
                        </p>

                        <p className="text-title text-content-primary">
                            {totalCancelFeeDay}
                        </p>

                        <p className="text-label-small text-content-secondary">
                            {totalCanceledWithFeeDay} cancelamento(s)
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Descontos (dia)
                        </p>

                        <p className="text-title text-amber-600">
                            {discountTotalDay}
                        </p>

                        <p className="text-label-small text-content-secondary">
                            Serviços: {discountTotalDayServices} • Produtos:{' '}
                            {discountTotalDayProducts}
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Valor líquido (dia)
                        </p>

                        <p className="text-title text-green-500">
                            {totalNetDay}
                        </p>

                        <p className="text-label-small text-content-secondary">
                            Serviços: {totalNetDayServices} • Produtos:{' '}
                            {totalNetDayProducts}
                        </p>
                    </DashboardStatCard>
                </section>
            </div>

            <div className="hidden md:block">
                <section
                    className="grid gap-4"
                    style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
                >
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

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Taxas cartão (dia)
                        </p>

                        <p className="text-title text-red-600">
                            {totalCardFeesDay ?? 'R$ 0,00'}
                        </p>

                        <p className="text-label-small text-content-secondary">
                            Taxas de crédito e débito no dia
                        </p>
                    </DashboardStatCard>

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

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Taxa de cancelamento (dia)
                        </p>

                        <p className="text-title text-content-primary">
                            {totalCancelFeeDay}
                        </p>

                        <p className="text-label-small text-content-secondary">
                            {totalCanceledWithFeeDay} cancelamento(s)
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Descontos (dia)
                        </p>

                        <p className="text-title text-amber-600">
                            {discountTotalDay}
                        </p>

                        <p className="text-label-small text-content-secondary">
                            Serviços: {discountTotalDayServices} • Produtos:{' '}
                            {discountTotalDayProducts}
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Valor líquido (dia)
                        </p>

                        <p className="text-title text-green-500">
                            {totalNetDay}
                        </p>

                        <p className="text-label-small text-content-secondary">
                            Serviços: {totalNetDayServices} • Produtos:{' '}
                            {totalNetDayProducts}
                        </p>
                    </DashboardStatCard>
                </section>
            </div>
        </>
    );
}
