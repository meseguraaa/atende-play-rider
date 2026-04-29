//src/components/admin/dashboard/dashboard-monthly-summary.tsx
import { DashboardStatCard } from '@/components/admin/dashboard/dashboard-stat-card';

type DashboardMonthlySummaryProps = {
    totalGrossMonth: string;
    totalGrossMonthServices: string;
    totalGrossMonthProducts: string;

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

    // ✅ NOVO: PRODUTOS
    productsInStock: number;
    productsSoldMonth: number;
    productsReservedMonth: number;
};

export function DashboardMonthlySummary({
    totalGrossMonth,
    totalGrossMonthServices,
    totalGrossMonthProducts,

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

    // ✅ NOVO
    productsInStock,
    productsSoldMonth,
    productsReservedMonth,
}: DashboardMonthlySummaryProps) {
    return (
        <section className="grid gap-4 md:grid-cols-4">
            {/* 1. Bruto mês */}
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

            {/* 2. Líquido mês (sem despesas) */}
            <DashboardStatCard>
                <p className="text-label-small text-content-secondary">
                    Valor líquido (mês)
                </p>
                <p className="text-title text-content-primary">
                    {totalNetMonth}
                </p>
                <p className="text-paragraph-small text-content-secondary">
                    Serviços: {totalNetMonthServices} • Produtos:{' '}
                    {totalNetMonthProducts}
                </p>
            </DashboardStatCard>

            {/* 3. Despesas (mês) */}
            <DashboardStatCard>
                <p className="text-label-small text-content-secondary">
                    Despesas (mês)
                </p>
                <p className="text-title text-content-primary">
                    {totalExpensesMonth}
                </p>
                <p className="text-paragraph-small text-content-secondary">
                    Soma das despesas cadastradas no módulo Financeiro.
                </p>
            </DashboardStatCard>

            {/* 4. Lucro real (mês) */}
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
                    Valor líquido (serviços + produtos) menos as despesas.
                </p>
            </DashboardStatCard>

            {/* 5 + 6: ATENDIMENTOS + PRODUTOS (lado a lado) */}
            <div className="grid gap-4 md:col-span-4 md:grid-cols-2">
                {/* 5. Atendimentos */}
                <div className="space-y-3 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
                    <p className="text-label-small text-content-secondary">
                        Atendimentos
                    </p>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {/* Concluídos */}
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

                        {/* Cancelados */}
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

                        {/* Com taxa */}
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
                </div>

                {/* 6. Produtos (NOVO) */}
                <div className="space-y-3 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
                    <p className="text-label-small text-content-secondary">
                        Produtos
                    </p>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {/* Estoque */}
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

                        {/* Vendidos */}
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

                        {/* Em reserva */}
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
                </div>
            </div>
        </section>
    );
}
