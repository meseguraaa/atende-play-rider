'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExpenseDueDatePicker } from '@/components/expense-due-date-picker';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

import type { ExpenseRowUI } from '@/app/admin/finance/admin-finance-members';

function useMediaQuery(query: string) {
    const [matches, setMatches] = React.useState(false);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        const mql = window.matchMedia(query);
        const onChange = () => setMatches(Boolean(mql.matches));

        onChange();

        if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', onChange);
            return () => mql.removeEventListener('change', onChange);
        }

        mql.addListener(onChange);
        return () => mql.removeListener(onChange);
    }, [query]);

    return matches;
}

type DeleteExpenseResponse =
    | {
          ok: true;
          data: {
              deleted: boolean;
              deletedCount: number;
              mode: 'single' | 'series';
          };
      }
    | { ok: false; error: string };

type UpdateExpenseResponse =
    | {
          ok: true;
          data: {
              expenseId: string;
              updated: boolean;
          };
      }
    | { ok: false; error: string };

function parseCurrencyInput(value: FormDataEntryValue | null): number {
    const raw = String(value ?? '').trim();

    if (!raw) return Number.NaN;

    const normalized = raw
        .replace(/\s/g, '')
        .replace(/[R$]/g, '')
        .replace(/\./g, '')
        .replace(',', '.');

    return Number(normalized);
}

function brDateToIsoDate(value: string) {
    const [day, month, year] = value.split('/');

    if (!day || !month || !year) return '';

    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function amountToInputValue(value: string) {
    return String(value)
        .replace(/\s/g, '')
        .replace('R$', '')
        .replace(/\./g, '')
        .replace(',', '.');
}

function getDayFromBrDate(value: string) {
    const [day] = value.split('/');
    const parsed = Number(day);

    return Number.isFinite(parsed) ? parsed : undefined;
}

function RecurringBadge({ isRecurring }: { isRecurring: boolean }) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-xs',
                isRecurring
                    ? 'border-border-brand/30 bg-border-brand/10 text-content-primary'
                    : 'border-border-primary bg-muted/40 text-content-secondary'
            )}
        >
            {isRecurring ? 'Sim' : 'Não'}
        </span>
    );
}

function ExpenseActions({
    deleting,
    onOpenEdit,
    onOpenConfirm,
}: {
    deleting: boolean;
    onOpenEdit: () => void;
    onOpenConfirm: () => void;
}) {
    return (
        <div className="flex flex-wrap items-center justify-end gap-2 md:flex-nowrap">
            <Button
                size="sm"
                variant="edit2"
                className="h-8 w-full md:w-auto"
                onClick={onOpenEdit}
                disabled={deleting}
            >
                Editar
            </Button>

            <Button
                size="sm"
                variant="destructive"
                className="h-8 w-full md:w-auto"
                onClick={onOpenConfirm}
                disabled={deleting}
            >
                Excluir
            </Button>
        </div>
    );
}

function EditExpenseDialog({
    expense,
    open,
    onOpenChange,
}: {
    expense: ExpenseRowUI;
    open: boolean;
    onOpenChange: (value: boolean) => void;
}) {
    const router = useRouter();

    const [submitting, setSubmitting] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

    const defaultDueDate = brDateToIsoDate(expense.dueDate);
    const defaultRecurringDay = getDayFromBrDate(expense.dueDate);

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
                const response = await fetch(
                    `/api/admin/finance/expenses/${encodeURIComponent(
                        expense.id
                    )}`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            description,
                            amount,
                            isRecurring,
                            recurringDay: isRecurring
                                ? Number(recurringDay)
                                : undefined,
                            dueDate: !isRecurring ? dueDate : undefined,
                        }),
                    }
                );

                const json = (await response.json()) as UpdateExpenseResponse;

                if (!response.ok || !json.ok) {
                    setErrorMsg(!json.ok ? json.error : 'Falha ao salvar.');
                    return;
                }

                onOpenChange(false);
                router.refresh();
            } catch {
                setErrorMsg('Erro de rede. Tente novamente.');
            } finally {
                setSubmitting(false);
            }
        },
        [expense.id, onOpenChange, router]
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="border border-border-primary bg-background-secondary">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Editar despesa
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label
                            className="text-label-small text-content-secondary"
                            htmlFor={`description-${expense.id}`}
                        >
                            Descrição
                        </label>

                        <Input
                            id={`description-${expense.id}`}
                            name="description"
                            required
                            defaultValue={expense.description}
                            className="border-border-primary bg-background-tertiary text-content-primary"
                        />
                    </div>

                    <div className="space-y-1">
                        <label
                            className="text-label-small text-content-secondary"
                            htmlFor={`amount-${expense.id}`}
                        >
                            Valor (R$)
                        </label>

                        <Input
                            id={`amount-${expense.id}`}
                            name="amount"
                            type="text"
                            inputMode="decimal"
                            required
                            defaultValue={amountToInputValue(expense.amount)}
                            className="border-border-primary bg-background-tertiary text-content-primary"
                        />
                    </div>

                    <div className="space-y-3">
                        <input
                            id={`isRecurring-${expense.id}`}
                            name="isRecurring"
                            type="checkbox"
                            defaultChecked={expense.isRecurring}
                            className="peer sr-only"
                        />

                        <label
                            htmlFor={`isRecurring-${expense.id}`}
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
                                htmlFor={`recurringDay-${expense.id}`}
                            >
                                Dia de vencimento
                            </label>

                            <Input
                                id={`recurringDay-${expense.id}`}
                                name="recurringDay"
                                type="number"
                                min={1}
                                max={31}
                                defaultValue={defaultRecurringDay}
                                className="border-border-primary bg-background-tertiary text-content-primary"
                            />
                        </div>

                        <div className="space-y-1 peer-checked:hidden">
                            <label
                                className="text-label-small text-content-secondary"
                                htmlFor={`dueDate-${expense.id}`}
                            >
                                Data de vencimento
                            </label>

                            <ExpenseDueDatePicker
                                id={`dueDate-${expense.id}`}
                                name="dueDate"
                                defaultValue={defaultDueDate}
                            />
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
                            type="button"
                            variant="outline"
                            disabled={submitting}
                            onClick={() => onOpenChange(false)}
                            className="border-border-primary bg-transparent text-content-primary"
                        >
                            Cancelar
                        </Button>

                        <Button
                            type="submit"
                            variant="brand"
                            disabled={submitting}
                        >
                            {submitting ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DeleteExpenseDialog({
    expense,
    open,
    onOpenChange,
    deleting,
    deleteErr,
    onConfirmDelete,
}: {
    expense: ExpenseRowUI;
    open: boolean;
    onOpenChange: (value: boolean) => void;
    deleting: boolean;
    deleteErr: string | null;
    onConfirmDelete: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="border border-border-primary bg-background-secondary">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Excluir despesa
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-3 py-2">
                        <p className="text-paragraph-small text-content-secondary">
                            Você está prestes a excluir:
                        </p>

                        <p className="text-label-large text-content-primary">
                            {expense.description}
                        </p>

                        <p className="text-paragraph-small text-content-secondary">
                            Vencimento: {expense.dueDate} • Valor:{' '}
                            <span className="font-semibold text-content-primary">
                                {expense.amount}
                            </span>
                        </p>
                    </div>

                    {expense.isRecurring ? (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                            <p className="text-paragraph-small text-amber-700">
                                Essa despesa é <b>recorrente</b>. Ao excluir, o
                                sistema removerá esta despesa e{' '}
                                <b>todas as próximas</b> do mês atual em diante.
                            </p>
                        </div>
                    ) : (
                        <p className="text-paragraph-small text-content-secondary">
                            Essa ação não pode ser desfeita.
                        </p>
                    )}

                    {deleteErr && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                            <p className="text-paragraph-small text-red-600">
                                {deleteErr}
                            </p>
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={deleting}
                            className="w-full border-border-primary bg-transparent text-content-primary sm:w-auto"
                        >
                            Cancelar
                        </Button>

                        <Button
                            type="button"
                            variant="destructive"
                            onClick={onConfirmDelete}
                            disabled={deleting}
                            className="w-full sm:w-auto"
                        >
                            {deleting ? 'Excluindo...' : 'Excluir'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ExpenseTableRow({ expense }: { expense: ExpenseRowUI }) {
    const router = useRouter();

    const [editOpen, setEditOpen] = React.useState(false);
    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [deleteErr, setDeleteErr] = React.useState<string | null>(null);

    const handleDelete = React.useCallback(async () => {
        setDeleteErr(null);
        setDeleting(true);

        try {
            const response = await fetch(
                `/api/admin/finance/expenses/${encodeURIComponent(expense.id)}`,
                { method: 'DELETE' }
            );

            const json = (await response.json()) as DeleteExpenseResponse;

            if (!response.ok || !json.ok) {
                setDeleteErr(!json.ok ? json.error : 'Falha ao excluir.');
                setDeleting(false);
                return;
            }

            setConfirmOpen(false);
            router.refresh();
        } catch {
            setDeleteErr('Erro de rede. Tente novamente.');
        } finally {
            setDeleting(false);
        }
    }, [expense.id, router]);

    return (
        <>
            <tr className="border-b border-border-primary last:border-b-0">
                <td className="px-4 py-3 text-content-primary">
                    {expense.description}
                </td>

                <td className="px-4 py-3 text-content-secondary">
                    {expense.dueDate}
                </td>

                <td className="px-4 py-3 text-right font-medium text-content-primary">
                    {expense.amount}
                </td>

                <td className="px-4 py-3 text-center">
                    <RecurringBadge isRecurring={expense.isRecurring} />
                </td>

                <td className="px-4 py-3 text-right">
                    <ExpenseActions
                        deleting={deleting}
                        onOpenEdit={() => setEditOpen(true)}
                        onOpenConfirm={() => setConfirmOpen(true)}
                    />
                </td>
            </tr>

            <EditExpenseDialog
                expense={expense}
                open={editOpen}
                onOpenChange={setEditOpen}
            />

            <DeleteExpenseDialog
                expense={expense}
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                deleting={deleting}
                deleteErr={deleteErr}
                onConfirmDelete={handleDelete}
            />
        </>
    );
}

function ExpenseCard({ expense }: { expense: ExpenseRowUI }) {
    const router = useRouter();

    const [editOpen, setEditOpen] = React.useState(false);
    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [deleteErr, setDeleteErr] = React.useState<string | null>(null);

    const handleDelete = React.useCallback(async () => {
        setDeleteErr(null);
        setDeleting(true);

        try {
            const response = await fetch(
                `/api/admin/finance/expenses/${encodeURIComponent(expense.id)}`,
                { method: 'DELETE' }
            );

            const json = (await response.json()) as DeleteExpenseResponse;

            if (!response.ok || !json.ok) {
                setDeleteErr(!json.ok ? json.error : 'Falha ao excluir.');
                setDeleting(false);
                return;
            }

            setConfirmOpen(false);
            router.refresh();
        } catch {
            setDeleteErr('Erro de rede. Tente novamente.');
        } finally {
            setDeleting(false);
        }
    }, [expense.id, router]);

    return (
        <>
            <div className="space-y-3 rounded-xl border border-border-primary bg-background-tertiary p-4">
                <div className="min-w-0">
                    <p className="truncate text-paragraph-medium-size font-semibold text-content-primary">
                        {expense.description}
                    </p>

                    <p className="mt-1 text-paragraph-small text-content-secondary">
                        Vencimento:{' '}
                        <span className="font-medium">{expense.dueDate}</span>
                        {' · '}
                        Valor:{' '}
                        <span className="font-medium">{expense.amount}</span>
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <RecurringBadge isRecurring={expense.isRecurring} />
                    </div>
                </div>

                <ExpenseActions
                    deleting={deleting}
                    onOpenEdit={() => setEditOpen(true)}
                    onOpenConfirm={() => setConfirmOpen(true)}
                />
            </div>

            <EditExpenseDialog
                expense={expense}
                open={editOpen}
                onOpenChange={setEditOpen}
            />

            <DeleteExpenseDialog
                expense={expense}
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                deleting={deleting}
                deleteErr={deleteErr}
                onConfirmDelete={handleDelete}
            />
        </>
    );
}

export default function ExpensesResponsiveList({
    expenses,
}: {
    expenses: ExpenseRowUI[];
}) {
    const isDesktop = useMediaQuery('(min-width: 768px)');

    if (!Array.isArray(expenses) || expenses.length === 0) {
        return (
            <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                <p className="text-center text-paragraph-small text-content-secondary">
                    Nenhuma despesa cadastrada para este mês.
                </p>
            </div>
        );
    }

    if (!isDesktop) {
        return (
            <section className="space-y-3">
                {expenses.map((expense) => (
                    <ExpenseCard key={expense.id} expense={expense} />
                ))}
            </section>
        );
    }

    return (
        <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
            <table className="min-w-full text-sm">
                <thead>
                    <tr className="border-b border-border-primary bg-muted/40 text-left text-label-small text-content-secondary">
                        <th className="px-4 py-2">Descrição</th>
                        <th className="px-4 py-2">Vencimento</th>
                        <th className="px-4 py-2 text-right">Valor</th>
                        <th className="px-4 py-2 text-center">Recorrente</th>
                        <th className="px-4 py-2 text-right">Ações</th>
                    </tr>
                </thead>

                <tbody>
                    {expenses.map((expense) => (
                        <ExpenseTableRow key={expense.id} expense={expense} />
                    ))}
                </tbody>
            </table>
        </section>
    );
}
