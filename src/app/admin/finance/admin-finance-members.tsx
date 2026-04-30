'use client';

import * as React from 'react';
import { MonthPicker } from '@/components/month-picker';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ExpenseDueDatePicker } from '@/components/expense-due-date-picker';
import { useRouter, useSearchParams } from 'next/navigation';

import ExpensesResponsiveList from '@/components/admin/finance/expenses-responsive-list/expenses-responsive-list';

export type AdminFinanceSummaryUI = {
    netRevenueMonth: string;
    servicesNetMonth: string;
    productsNetMonth: string;
    totalExpenses: string;
    totalCardFees: string;
    netIncome: string;
    netIncomeIsPositive: boolean;
    netIncomeYear: string;
    netIncomeYearIsPositive: boolean;
};

/**
 * ✅ Baseado no schema atual:
 * - Professional.id (professionalId)
 * - ganhos de serviços e comissão de produtos
 */
export type ProfessionalMonthlyEarningsUI = {
    professionalId: string;
    name: string;
    servicesEarnings: string;
    productsEarnings: string;
    total: string;
};

/**
 * ✅ Compat/legado (caso alguma parte do server ainda use "barber")
 */
export type BarberMonthlyEarningsUI = {
    barberId: string;
    name: string;
    servicesEarnings: string;
    productsEarnings: string;
    total: string;
};

export type ExpenseRowUI = {
    id: string;
    description: string;
    dueDate: string; // dd/MM/yyyy (display)
    amount: string; // BRL formatted (display)
    isRecurring: boolean;
    statusLabel: string;
    statusTone?: 'success' | 'warning' | 'danger' | 'neutral';
};

type AdminFinanceClientProps = {
    scopeLabel: string;
    monthLabel: string;
    monthQuery: string;
    summary: AdminFinanceSummaryUI;

    professionalEarnings?: ProfessionalMonthlyEarningsUI[];
    barberEarnings?: BarberMonthlyEarningsUI[];

    expenses: ExpenseRowUI[];
    newExpenseDisabled?: boolean;

    units?: never;
    canSeeAllUnits?: boolean;
    unitPickerDisabled?: boolean;
};

export default function AdminFinanceClient({
    scopeLabel,
    monthLabel,
    monthQuery,
    summary,
    professionalEarnings,
    barberEarnings,
    expenses,
    newExpenseDisabled,
}: AdminFinanceClientProps) {
    const normalizedProfessionalEarnings: ProfessionalMonthlyEarningsUI[] =
        Array.isArray(professionalEarnings)
            ? professionalEarnings
            : Array.isArray(barberEarnings)
              ? barberEarnings.map((b) => ({
                    professionalId: b.barberId,
                    name: b.name,
                    servicesEarnings: b.servicesEarnings,
                    productsEarnings: b.productsEarnings,
                    total: b.total,
                }))
              : [];

    return (
        <div className="space-y-6 max-w-7xl">
            <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-title text-content-primary">
                        Financeiro
                    </h1>

                    <p className="text-paragraph-small text-content-secondary">
                        Mês selecionado:{' '}
                        <span className="font-medium">{monthLabel}</span>
                    </p>

                    <p className="text-paragraph-small text-content-tertiary">
                        Unidade:{' '}
                        <span className="font-medium">{scopeLabel}</span>
                    </p>
                </div>

                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <MonthPicker />
                </div>
            </header>

            {/* RESUMO FINANCEIRO DO MÊS */}
            <section className="grid gap-4 md:grid-cols-4">
                <div className="space-y-1 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
                    <p className="text-label-small text-content-secondary">
                        Faturamento líquido (mês)
                    </p>
                    <p className="text-title text-content-primary">
                        {summary.netRevenueMonth}
                    </p>
                    <p className="text-paragraph-small text-content-secondary">
                        Serviços (líq.):{' '}
                        <span className="font-semibold">
                            {summary.servicesNetMonth}
                        </span>{' '}
                        • Produtos (líq.):{' '}
                        <span className="font-semibold">
                            {summary.productsNetMonth}
                        </span>
                    </p>
                </div>

                <div className="space-y-1 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
                    <p className="text-label-small text-content-secondary">
                        Despesas (mês)
                    </p>
                    <p className="text-title text-content-primary">
                        {summary.totalExpenses}
                    </p>
                    <p className="text-paragraph-small text-content-secondary">
                        Soma apenas das despesas pagas no mês.
                    </p>
                </div>

                <div className="space-y-1 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
                    <p className="text-label-small text-content-secondary">
                        Lucro líquido (mês)
                    </p>

                    <p
                        className={`text-title ${
                            summary.netIncomeIsPositive
                                ? 'text-green-500'
                                : 'text-red-600'
                        }`}
                    >
                        {summary.netIncome}
                    </p>

                    <p className="text-paragraph-small text-content-secondary">
                        Faturamento líquido do mês menos despesas pagas.
                    </p>
                </div>

                <div className="space-y-1 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
                    <p className="text-label-small text-content-secondary">
                        Lucro líquido (ano)
                    </p>

                    <p
                        className={`text-title ${
                            summary.netIncomeYearIsPositive
                                ? 'text-green-500'
                                : 'text-red-600'
                        }`}
                    >
                        {summary.netIncomeYear}
                    </p>

                    <p className="text-paragraph-small text-content-secondary">
                        Acumulado de janeiro até o mês selecionado.
                    </p>
                </div>
            </section>

            <ProfessionalMonthlyEarningsSection
                professionalsEarnings={normalizedProfessionalEarnings}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-subtitle text-content-primary">
                        Cadastro de despesas (mês)
                    </h2>
                    <p className="text-paragraph-small text-content-secondary">
                        Contas cadastradas para este mês, incluindo despesas
                        recorrentes e avulsas.
                    </p>
                </div>

                <NewExpenseDialog
                    month={monthQuery}
                    disabled={newExpenseDisabled}
                />
            </div>

            <ExpensesResponsiveList expenses={expenses} />
        </div>
    );
}

/* ========= SEÇÃO: FATURAMENTO POR PROFISSIONAL ========= */

function ProfessionalMonthlyEarningsSection({
    professionalsEarnings,
}: {
    professionalsEarnings: ProfessionalMonthlyEarningsUI[];
}) {
    const list = Array.isArray(professionalsEarnings)
        ? professionalsEarnings
        : [];

    return (
        <section className="space-y-3">
            <div>
                <h2 className="text-subtitle text-content-primary">
                    Faturamento por profissional (mês)
                </h2>
                <p className="text-paragraph-small text-content-secondary">
                    Valores de comissões de serviços e produtos no mês.
                </p>
            </div>

            {list.length === 0 ? (
                <p className="text-paragraph-small text-content-secondary">
                    Nenhum profissional ativo cadastrado.
                </p>
            ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                    {list.map((p) => (
                        <div
                            key={p.professionalId}
                            className="min-w-0 space-y-2 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3"
                        >
                            <p className="text-label-large text-content-primary">
                                {p.name}
                            </p>

                            <p className="text-paragraph-small text-content-secondary">
                                Serviços:{' '}
                                <span className="font-semibold">
                                    {p.servicesEarnings}
                                </span>
                            </p>

                            <p className="text-paragraph-small text-content-secondary">
                                Produtos:{' '}
                                <span className="font-semibold">
                                    {p.productsEarnings}
                                </span>
                            </p>

                            <p className="text-paragraph-small text-content-secondary">
                                Total:{' '}
                                <span className="font-semibold">{p.total}</span>
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

/* ========= NOVA DESPESA (POST na route) ========= */

type CreateExpenseResponse =
    | {
          ok: true;
          data: { expenseId: string; monthQuery: string; created: boolean };
      }
    | { ok: false; error: string };

function NewExpenseDialog({
    month,
    disabled,
}: {
    month: string;
    disabled?: boolean;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const unitParam = searchParams.get('unit');
    const unitId = unitParam ? unitParam : null;

    const [open, setOpen] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

    const hasValidUnit = !!unitId;

    const onSubmit = React.useCallback(
        async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setErrorMsg(null);

            if (!unitId) {
                setErrorMsg('Selecione uma unidade para cadastrar a despesa.');
                return;
            }

            const form = e.currentTarget;
            const fd = new FormData(form);

            const description = String(fd.get('description') ?? '').trim();
            const amountRaw = String(fd.get('amount') ?? '').trim();
            const amount = Number(amountRaw);

            const isRecurring = fd.get('isRecurring') != null;
            const recurringDayRaw = String(fd.get('recurringDay') ?? '').trim();
            const recurringDay = recurringDayRaw
                ? Number(recurringDayRaw)
                : undefined;

            const dueDate = String(fd.get('dueDate') ?? '').trim() || undefined;

            if (!description) {
                setErrorMsg('Informe a descrição.');
                return;
            }
            if (!Number.isFinite(amount) || amount <= 0) {
                setErrorMsg('Informe um valor válido.');
                return;
            }
            if (isRecurring) {
                if (
                    !Number.isFinite(Number(recurringDay)) ||
                    Number(recurringDay) < 1 ||
                    Number(recurringDay) > 31
                ) {
                    setErrorMsg('Informe um dia de vencimento (1 a 31).');
                    return;
                }
            } else {
                if (!dueDate) {
                    setErrorMsg('Informe a data de vencimento.');
                    return;
                }
            }

            setSubmitting(true);
            try {
                const res = await fetch('/api/admin/finance/expenses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        month,
                        unitId,
                        category: 'OTHER',
                        description,
                        amount,
                        isRecurring,
                        recurringDay: isRecurring
                            ? Number(recurringDay)
                            : undefined,
                        dueDate: !isRecurring ? dueDate : undefined,
                    }),
                });

                const json = (await res.json()) as CreateExpenseResponse;

                if (!res.ok || !json.ok) {
                    setErrorMsg(!json.ok ? json.error : 'Falha ao salvar.');
                    setSubmitting(false);
                    return;
                }

                setOpen(false);
                form.reset();
                router.refresh();
            } catch {
                setErrorMsg('Erro de rede. Tente novamente.');
            } finally {
                setSubmitting(false);
            }
        },
        [month, router, unitId]
    );

    if (disabled) {
        return (
            <Button variant="brand" disabled title="Ação indisponível">
                Nova despesa
            </Button>
        );
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="brand">Nova despesa</Button>
            </DialogTrigger>

            <DialogContent className="bg-background-secondary border border-border-primary">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Nova despesa
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-4">
                    <input type="hidden" name="month" value={month} />
                    <input type="hidden" name="category" value="OTHER" />
                    <input type="hidden" name="unitId" value={unitId ?? ''} />

                    {!hasValidUnit && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                            <p className="text-paragraph-small text-amber-700">
                                Selecione uma unidade no menu lateral para
                                cadastrar a despesa.
                            </p>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label
                            className="text-label-small text-content-secondary"
                            htmlFor="description"
                        >
                            Descrição
                        </label>
                        <Input
                            id="description"
                            name="description"
                            required
                            placeholder="Ex: Aluguel, Luz, Internet..."
                            className="bg-background-tertiary border-border-primary text-content-primary"
                        />
                    </div>

                    <div className="space-y-1">
                        <label
                            className="text-label-small text-content-secondary"
                            htmlFor="amount"
                        >
                            Valor (R$)
                        </label>
                        <Input
                            id="amount"
                            name="amount"
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            className="bg-background-tertiary border-border-primary text-content-primary"
                        />
                    </div>

                    <div className="space-y-3">
                        <input
                            id="isRecurring"
                            name="isRecurring"
                            type="checkbox"
                            className="peer sr-only"
                        />

                        <label
                            htmlFor="isRecurring"
                            className="
                inline-flex items-center gap-2 cursor-pointer
                peer-checked:[&_.box]:bg-border-brand
                peer-checked:[&_.box]:border-border-brand
                peer-checked:[&_.check]:bg-background-primary
              "
                        >
                            <span
                                className="
                  box flex h-4 w-4 items-center justify-center
                  rounded border border-border-primary bg-background-tertiary
                  transition-colors
                "
                            >
                                <span className="check h-2 w-2 rounded-sm bg-transparent transition-colors" />
                            </span>
                            <span className="text-label-small text-content-primary">
                                Despesa recorrente
                            </span>
                        </label>

                        <div className="space-y-1 hidden peer-checked:block">
                            <label
                                className="text-label-small text-content-secondary"
                                htmlFor="recurringDay"
                            >
                                Dia de vencimento (se recorrente)
                            </label>
                            <Input
                                id="recurringDay"
                                name="recurringDay"
                                type="number"
                                min={1}
                                max={31}
                                placeholder="Ex: 10"
                                className="bg-background-tertiary border-border-primary text-content-primary"
                            />
                            <p className="text-paragraph-small text-content-secondary">
                                Para despesas recorrentes, informe apenas o dia
                                de vencimento (se for 31 e o mês não tiver, cai
                                no último dia do mês).
                            </p>
                        </div>

                        <div className="space-y-1 peer-checked:hidden">
                            <label
                                className="text-label-small text-content-secondary"
                                htmlFor="dueDate"
                            >
                                Data de vencimento (se NÃO recorrente)
                            </label>

                            <ExpenseDueDatePicker id="dueDate" name="dueDate" />

                            <p className="text-paragraph-small text-content-secondary">
                                Use este campo para despesas que acontecem em
                                uma data única.
                            </p>
                        </div>
                    </div>

                    {errorMsg && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                            <p className="text-paragraph-small text-red-600">
                                {errorMsg}
                            </p>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="submit"
                            variant="brand"
                            disabled={submitting || !hasValidUnit}
                            title={
                                !hasValidUnit
                                    ? 'Selecione uma unidade para salvar'
                                    : undefined
                            }
                        >
                            {submitting ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
