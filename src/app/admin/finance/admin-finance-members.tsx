'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

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

export type ExpenseRowUI = {
    id: string;
    description: string;
    dueDate: string;
    amount: string;
    isRecurring: boolean;
    statusLabel: string;
    statusTone?: 'success' | 'warning' | 'danger' | 'neutral';
};

type AdminFinanceClientProps = {
    scopeLabel: string;
    monthLabel: string;
    monthQuery: string;
    summary: AdminFinanceSummaryUI;
    expenses: ExpenseRowUI[];
    newExpenseDisabled?: boolean;
};

export default function AdminFinanceClient({
    scopeLabel,
    monthLabel,
    monthQuery,
    summary,
    expenses,
    newExpenseDisabled,
}: AdminFinanceClientProps) {
    return (
        <div className="max-w-7xl space-y-6">
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
                        Escopo:{' '}
                        <span className="font-medium">{scopeLabel}</span>
                    </p>
                </div>

                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <MonthPicker />
                </div>
            </header>

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

type CreateExpenseResponse =
    | {
          ok: true;
          data: {
              expenseId: string;
              monthQuery: string;
              created: boolean;
          };
      }
    | {
          ok: false;
          error: string;
      };

function parseCurrencyInput(value: FormDataEntryValue | null): number {
    const raw = String(value ?? '').trim();

    if (!raw) return Number.NaN;

    const normalized = raw
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.');

    return Number(normalized);
}

function NewExpenseDialog({
    month,
    disabled,
}: {
    month: string;
    disabled?: boolean;
}) {
    const router = useRouter();

    const [open, setOpen] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

    const canCreateExpense = !disabled;

    const onSubmit = React.useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setErrorMsg(null);

            const form = event.currentTarget;
            const formData = new FormData(form);

            const description = String(
                formData.get('description') ?? ''
            ).trim();

            const amount = parseCurrencyInput(formData.get('amount'));
            const isRecurring = formData.get('isRecurring') != null;

            const recurringDayRaw = String(
                formData.get('recurringDay') ?? ''
            ).trim();

            const recurringDay = recurringDayRaw
                ? Number(recurringDayRaw)
                : undefined;

            const dueDate =
                String(formData.get('dueDate') ?? '').trim() || undefined;

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
                    setErrorMsg('Informe um dia de vencimento entre 1 e 31.');
                    return;
                }
            } else if (!dueDate) {
                setErrorMsg('Informe a data de vencimento.');
                return;
            }

            setSubmitting(true);

            try {
                const response = await fetch('/api/admin/finance/expenses', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        month,
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

                const json = (await response.json()) as CreateExpenseResponse;

                if (!response.ok || !json.ok) {
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
        [month, router]
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

            <DialogContent className="border border-border-primary bg-background-secondary">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Nova despesa
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-4">
                    <input type="hidden" name="month" value={month} />
                    <input type="hidden" name="category" value="OTHER" />

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
                            className="border-border-primary bg-background-tertiary text-content-primary"
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
                            type="text"
                            inputMode="decimal"
                            required
                            placeholder="Ex: 450,45"
                            className="border-border-primary bg-background-tertiary text-content-primary"
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
                            className="inline-flex cursor-pointer items-center gap-2 peer-checked:[&_.box]:border-border-brand peer-checked:[&_.box]:bg-border-brand peer-checked:[&_.check]:bg-background-primary"
                        >
                            <span className="box flex h-4 w-4 items-center justify-center rounded border border-border-primary bg-background-tertiary transition-colors">
                                <span className="check h-2 w-2 rounded-sm bg-transparent transition-colors" />
                            </span>

                            <span className="text-label-small text-content-primary">
                                Despesa recorrente
                            </span>
                        </label>

                        <div className="hidden space-y-1 peer-checked:block">
                            <label
                                className="text-label-small text-content-secondary"
                                htmlFor="recurringDay"
                            >
                                Dia de vencimento
                            </label>

                            <Input
                                id="recurringDay"
                                name="recurringDay"
                                type="number"
                                min={1}
                                max={31}
                                placeholder="Ex: 10"
                                className="border-border-primary bg-background-tertiary text-content-primary"
                            />

                            <p className="text-paragraph-small text-content-secondary">
                                Para despesas recorrentes, informe apenas o dia
                                de vencimento. Se for 31 e o mês não tiver esse
                                dia, a despesa cai no último dia do mês.
                            </p>
                        </div>

                        <div className="space-y-1 peer-checked:hidden">
                            <label
                                className="text-label-small text-content-secondary"
                                htmlFor="dueDate"
                            >
                                Data de vencimento
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
                            disabled={submitting || !canCreateExpense}
                        >
                            {submitting ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
