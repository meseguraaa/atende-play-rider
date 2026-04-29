import { DashboardStatCard } from '@/components/admin/dashboard/dashboard-stat-card';

type DashboardMonthlySummaryProps = {
    totalGrossMonth: string;
    totalGrossMonthServices: string;
    totalGrossMonthProducts: string;

    totalCommissionMonth: string;
    totalCommissionMonthServices: string;
    totalCommissionMonthProducts: string;

    totalNetMonth: string;
    totalNetMonthServices: string;
    totalNetMonthProducts: string;

    totalExpensesMonth: string;

    realNetMonth: string;
    realNetMonthIsPositive: boolean;

    totalAppointmentsDoneDay: number;
    totalAppointmentsDoneMonth: number;
    totalAppointmentsCanceledDay: number;
    totalAppointmentsCanceledMonth: number;
    totalCanceledWithFeeDay: number;
    totalCanceledWithFeeMonth: number;
    totalCancelFeeMonth: string;

    productsInStock: number;
    productsSoldMonth: number;
    productsReservedMonth: number;

    paymentsMonthCreditCount: number;
    paymentsMonthDebitCount: number;
    paymentsMonthPixCount: number;
    paymentsMonthCashCount: number;

    paymentsMonthCreditGross: string;
    paymentsMonthDebitGross: string;
    paymentsMonthPixGross: string;
    paymentsMonthCashGross: string;

    paymentsMonthCreditFees: string;
    paymentsMonthDebitFees: string;
    paymentsMonthPixFees: string;
    paymentsMonthCashFees: string;

    paymentsMonthCreditNet: string;
    paymentsMonthDebitNet: string;
    paymentsMonthPixNet: string;
    paymentsMonthCashNet: string;

    paymentsMonthTotalCount: number;
    paymentsMonthTotalGross: string;
    paymentsMonthTotalFees: string;
    paymentsMonthTotalNet: string;

    discountCountMonth?: number;
    discountTotalMonth?: string;
    discountTotalMonthServices?: string;
    discountTotalMonthProducts?: string;
};

export function DashboardMonthlySummary({
    totalGrossMonth,
    totalGrossMonthServices,
    totalGrossMonthProducts,

    totalCommissionMonth,
    totalCommissionMonthServices,
    totalCommissionMonthProducts,

    totalNetMonth,
    totalNetMonthServices,
    totalNetMonthProducts,

    totalExpensesMonth,

    realNetMonth,
    realNetMonthIsPositive,

    totalAppointmentsDoneDay,
    totalAppointmentsDoneMonth,
    totalAppointmentsCanceledDay,
    totalAppointmentsCanceledMonth,
    totalCanceledWithFeeDay,
    totalCanceledWithFeeMonth,
    totalCancelFeeMonth,

    productsInStock,
    productsSoldMonth,
    productsReservedMonth,

    paymentsMonthCreditCount,
    paymentsMonthDebitCount,
    paymentsMonthPixCount,
    paymentsMonthCashCount,

    paymentsMonthCreditGross,
    paymentsMonthDebitGross,
    paymentsMonthPixGross,
    paymentsMonthCashGross,

    paymentsMonthCreditFees,
    paymentsMonthDebitFees,
    paymentsMonthPixFees,
    paymentsMonthCashFees,

    paymentsMonthCreditNet,
    paymentsMonthDebitNet,
    paymentsMonthPixNet,
    paymentsMonthCashNet,

    paymentsMonthTotalCount,
    paymentsMonthTotalGross,
    paymentsMonthTotalFees,
    paymentsMonthTotalNet,

    discountCountMonth = 0,
    discountTotalMonth = 'R$ 0,00',
    discountTotalMonthServices = 'R$ 0,00',
    discountTotalMonthProducts = 'R$ 0,00',
}: DashboardMonthlySummaryProps) {
    return (
        <section className="space-y-4">
            <div className="block md:hidden">
                <div className="grid grid-cols-1 gap-4">
                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Valor bruto (mês)
                        </p>
                        <p className="text-title text-content-primary">
                            {totalGrossMonth}
                        </p>
                        <p className="text-label-small text-content-secondary">
                            Serviços: {totalGrossMonthServices} • Produtos:{' '}
                            {totalGrossMonthProducts}
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Taxas cartão (mês)
                        </p>
                        <p className="text-title text-red-600">
                            {paymentsMonthTotalFees}
                        </p>
                        <p className="text-label-small text-content-secondary">
                            Crédito: {paymentsMonthCreditFees} • Débito:{' '}
                            {paymentsMonthDebitFees}
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Comissão (mês)
                        </p>
                        <p className="text-title text-content-primary">
                            {totalCommissionMonth}
                        </p>
                        <p className="text-paragraph-small text-content-secondary">
                            Serviços: {totalCommissionMonthServices} • Produtos:{' '}
                            {totalCommissionMonthProducts}
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Taxa de cancelamento (mês)
                        </p>
                        <p className="text-title text-content-primary">
                            {totalCancelFeeMonth}
                        </p>
                        <p className="text-paragraph-small text-content-secondary">
                            {totalCanceledWithFeeMonth} cancelamento(s)
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Descontos (mês)
                        </p>
                        <p className="text-title text-amber-600">
                            {discountTotalMonth}
                        </p>
                        <p className="text-paragraph-small text-content-secondary">
                            Serviços: {discountTotalMonthServices} • Produtos:{' '}
                            {discountTotalMonthProducts}
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Lucro real (mês)
                        </p>
                        <p
                            className={`text-title ${
                                realNetMonthIsPositive
                                    ? 'text-green-500'
                                    : 'text-red-600'
                            }`}
                        >
                            {realNetMonth}
                        </p>
                        <p className="text-paragraph-small text-content-secondary">
                            Líquido menos taxas de cartão e despesas
                        </p>
                    </DashboardStatCard>
                </div>
            </div>

            <div className="hidden md:block">
                <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
                >
                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Valor bruto (mês)
                        </p>
                        <p className="text-title text-content-primary">
                            {totalGrossMonth}
                        </p>
                        <p className="text-label-small text-content-secondary">
                            Serviços: {totalGrossMonthServices} • Produtos:{' '}
                            {totalGrossMonthProducts}
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Taxas cartão (mês)
                        </p>
                        <p className="text-title text-red-600">
                            {paymentsMonthTotalFees}
                        </p>
                        <p className="text-label-small text-content-secondary">
                            Crédito: {paymentsMonthCreditFees} • Débito:{' '}
                            {paymentsMonthDebitFees}
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Comissão (mês)
                        </p>
                        <p className="text-title text-content-primary">
                            {totalCommissionMonth}
                        </p>
                        <p className="text-paragraph-small text-content-secondary">
                            Serviços: {totalCommissionMonthServices} • Produtos:{' '}
                            {totalCommissionMonthProducts}
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Taxa de cancelamento (mês)
                        </p>
                        <p className="text-title text-content-primary">
                            {totalCancelFeeMonth}
                        </p>
                        <p className="text-paragraph-small text-content-secondary">
                            {totalCanceledWithFeeMonth} cancelamento(s)
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Descontos (mês)
                        </p>
                        <p className="text-title text-amber-600">
                            {discountTotalMonth}
                        </p>
                        <p className="text-paragraph-small text-content-secondary">
                            Serviços: {discountTotalMonthServices} • Produtos:{' '}
                            {discountTotalMonthProducts}
                        </p>
                    </DashboardStatCard>

                    <DashboardStatCard>
                        <p className="text-label-small text-content-secondary">
                            Lucro real (mês)
                        </p>
                        <p
                            className={`text-title ${
                                realNetMonthIsPositive
                                    ? 'text-green-500'
                                    : 'text-red-600'
                            }`}
                        >
                            {realNetMonth}
                        </p>
                        <p className="text-paragraph-small text-content-secondary">
                            Líquido menos taxas de cartão e despesas
                        </p>
                    </DashboardStatCard>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                <DashboardStatCard>
                    <p className="text-label-small text-content-secondary">
                        Crédito
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Quantidade:{' '}
                        <span className="font-semibold">
                            {paymentsMonthCreditCount}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Bruto:{' '}
                        <span className="font-semibold">
                            {paymentsMonthCreditGross}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Taxas:{' '}
                        <span className="font-semibold text-red-600">
                            {paymentsMonthCreditFees}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Líquido:{' '}
                        <span className="font-semibold text-green-500">
                            {paymentsMonthCreditNet}
                        </span>
                    </p>
                </DashboardStatCard>

                <DashboardStatCard>
                    <p className="text-label-small text-content-secondary">
                        Débito
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Quantidade:{' '}
                        <span className="font-semibold">
                            {paymentsMonthDebitCount}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Bruto:{' '}
                        <span className="font-semibold">
                            {paymentsMonthDebitGross}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Taxas:{' '}
                        <span className="font-semibold text-red-600">
                            {paymentsMonthDebitFees}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Líquido:{' '}
                        <span className="font-semibold text-green-500">
                            {paymentsMonthDebitNet}
                        </span>
                    </p>
                </DashboardStatCard>

                <DashboardStatCard>
                    <p className="text-label-small text-content-secondary">
                        Pix
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Quantidade:{' '}
                        <span className="font-semibold">
                            {paymentsMonthPixCount}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Bruto:{' '}
                        <span className="font-semibold">
                            {paymentsMonthPixGross}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Taxas:{' '}
                        <span className="font-semibold text-red-600">
                            {paymentsMonthPixFees}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Líquido:{' '}
                        <span className="font-semibold text-green-500">
                            {paymentsMonthPixNet}
                        </span>
                    </p>
                </DashboardStatCard>

                <DashboardStatCard>
                    <p className="text-label-small text-content-secondary">
                        Dinheiro
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Quantidade:{' '}
                        <span className="font-semibold">
                            {paymentsMonthCashCount}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Bruto:{' '}
                        <span className="font-semibold">
                            {paymentsMonthCashGross}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Taxas:{' '}
                        <span className="font-semibold text-red-600">
                            {paymentsMonthCashFees}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Líquido:{' '}
                        <span className="font-semibold text-green-500">
                            {paymentsMonthCashNet}
                        </span>
                    </p>
                </DashboardStatCard>

                <DashboardStatCard>
                    <p className="text-label-small text-content-secondary">
                        Consolidação
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Pagamentos:{' '}
                        <span className="font-semibold">
                            {paymentsMonthTotalCount}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Bruto:{' '}
                        <span className="font-semibold">
                            {paymentsMonthTotalGross}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Taxas:{' '}
                        <span className="font-semibold text-red-600">
                            {paymentsMonthTotalFees}
                        </span>
                    </p>
                    <p className="text-paragraph-small text-content-primary">
                        Líquido:{' '}
                        <span className="font-semibold text-green-500">
                            {paymentsMonthTotalNet}
                        </span>
                    </p>
                </DashboardStatCard>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <DashboardStatCard>
                    <p className="text-label-small text-content-secondary">
                        Despesas (mês)
                    </p>
                    <p className="text-title text-content-primary">
                        {totalExpensesMonth}
                    </p>
                    <p className="text-paragraph-small text-content-secondary">
                        Soma das despesas cadastradas no módulo Financeiro
                    </p>
                </DashboardStatCard>

                <DashboardStatCard>
                    <p className="text-label-small text-content-secondary">
                        Atendimentos
                    </p>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="space-y-1">
                            <p className="text-paragraph-small text-content-secondary">
                                Concluídos
                            </p>
                            <p className="text-paragraph-medium text-content-primary">
                                Dia:{' '}
                                <span className="font-semibold">
                                    {totalAppointmentsDoneDay}
                                </span>
                            </p>
                            <p className="text-paragraph-medium text-content-primary">
                                Mês:{' '}
                                <span className="font-semibold">
                                    {totalAppointmentsDoneMonth}
                                </span>
                            </p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-paragraph-small text-content-secondary">
                                Cancelados
                            </p>
                            <p className="text-paragraph-medium text-content-primary">
                                Dia:{' '}
                                <span className="font-semibold">
                                    {totalAppointmentsCanceledDay}
                                </span>
                            </p>
                            <p className="text-paragraph-medium text-content-primary">
                                Mês:{' '}
                                <span className="font-semibold">
                                    {totalAppointmentsCanceledMonth}
                                </span>
                            </p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-paragraph-small text-content-secondary">
                                Com taxa
                            </p>
                            <p className="text-paragraph-medium text-content-primary">
                                Dia:{' '}
                                <span className="font-semibold">
                                    {totalCanceledWithFeeDay}
                                </span>
                            </p>
                            <p className="text-paragraph-medium text-content-primary">
                                Mês:{' '}
                                <span className="font-semibold">
                                    {totalCanceledWithFeeMonth}
                                </span>
                            </p>
                        </div>
                    </div>
                </DashboardStatCard>

                <DashboardStatCard>
                    <p className="text-label-small text-content-secondary">
                        Produtos
                    </p>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="space-y-1">
                            <p className="text-paragraph-small text-content-secondary">
                                Em estoque
                            </p>
                            <p className="text-paragraph-medium text-content-primary">
                                <span className="font-semibold">
                                    {productsInStock}
                                </span>
                            </p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-paragraph-small text-content-secondary">
                                Vendidos (mês)
                            </p>
                            <p className="text-paragraph-medium text-content-primary">
                                <span className="font-semibold">
                                    {productsSoldMonth}
                                </span>
                            </p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-paragraph-small text-content-secondary">
                                Em reserva (mês)
                            </p>
                            <p className="text-paragraph-medium text-content-primary">
                                <span className="font-semibold">
                                    {productsReservedMonth}
                                </span>
                            </p>
                        </div>
                    </div>
                </DashboardStatCard>
            </div>
        </section>
    );
}
