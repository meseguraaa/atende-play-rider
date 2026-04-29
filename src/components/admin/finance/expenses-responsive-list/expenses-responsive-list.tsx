'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

import type { ExpenseRowUI } from '@/app/admin/finance/admin-finance-client';

/* ---------------------------
 * Hook: media query (JS render)
 * --------------------------- */
function useMediaQuery(query: string) {
    const [matches, setMatches] = React.useState<boolean>(false);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        const mql = window.matchMedia(query);

        const onChange = () => setMatches(Boolean(mql.matches));
        onChange();

        // compat Safari
        if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', onChange);
            return () => mql.removeEventListener('change', onChange);
        }

        // eslint-disable-next-line deprecation/deprecation
        mql.addListener(onChange);
        // eslint-disable-next-line deprecation/deprecation
        return () => mql.removeListener(onChange);
    }, [query]);

    return matches;
}

/* ========= API TYPES ========= */

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

type TogglePaidResponse =
    | {
          ok: true;
          data: { expenseId: string; isPaid: boolean };
      }
    | { ok: false; error: string };

/* ========= Helpers ========= */

function getIsPaidFromServer(expense: ExpenseRowUI) {
    return (
        expense.statusTone === 'success' ||
        String(expense.statusLabel || '').toLowerCase() === 'pago'
    );
}

function PaidBadge({
    effectiveIsPaid,
    title,
}: {
    effectiveIsPaid: boolean;
    title?: string;
}) {
    const toneClass = effectiveIsPaid
        ? 'bg-green-500/15 text-green-600 border-green-500/30'
        : 'bg-amber-500/15 text-amber-700 border-amber-500/30';

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-xs',
                toneClass
            )}
            title={title}
        >
            {effectiveIsPaid ? 'Pago' : 'Em aberto'}
        </span>
    );
}

function RecurringBadge({ isRecurring }: { isRecurring: boolean }) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-xs',
                isRecurring
                    ? 'bg-border-brand/10 border-border-brand/30 text-content-primary'
                    : 'bg-muted/40 border-border-primary text-content-secondary'
            )}
        >
            {isRecurring ? 'Sim' : 'Não'}
        </span>
    );
}

/* ========= Shared Actions (table row + card) ========= */

function ExpenseActions({
    expense,
    effectiveIsPaid,
    toggling,
    deleting,
    onTogglePaid,
    onOpenConfirm,
}: {
    expense: ExpenseRowUI;
    effectiveIsPaid: boolean;
    toggling: boolean;
    deleting: boolean;
    onTogglePaid: () => void;
    onOpenConfirm: () => void;
}) {
    return (
        <div className="flex items-center justify-end gap-2 flex-wrap md:flex-nowrap">
            <Button size="sm" variant="edit2" className="h-8 w-full md:w-auto">
                Editar
            </Button>

            <Button
                size="sm"
                variant="outline"
                className={cn(
                    'h-8 w-full md:w-auto bg-transparent border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand',
                    toggling && 'opacity-70 cursor-wait'
                )}
                onClick={onTogglePaid}
                disabled={toggling || deleting}
            >
                {toggling
                    ? 'Atualizando...'
                    : effectiveIsPaid
                      ? 'Pendente'
                      : 'Conta paga'}
            </Button>

            <Button
                size="sm"
                variant="destructive"
                className="h-8 w-full md:w-auto"
                onClick={onOpenConfirm}
                disabled={toggling}
            >
                Excluir
            </Button>
        </div>
    );
}

/* ========= Confirm Delete Dialog ========= */

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
    onOpenChange: (v: boolean) => void;
    deleting: boolean;
    deleteErr: string | null;
    onConfirmDelete: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-background-secondary border border-border-primary">
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
                                <b>todas as próximas</b> (do mês atual em
                                diante).
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

                    <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={deleting}
                            className="w-full sm:w-auto bg-transparent border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand"
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

/* ========= ROW (desktop table) ========= */

function ExpenseTableRow({ expense }: { expense: ExpenseRowUI }) {
    const router = useRouter();

    const serverIsPaid = getIsPaidFromServer(expense);
    const [localIsPaid, setLocalIsPaid] = React.useState<boolean | null>(null);
    const effectiveIsPaid = localIsPaid ?? serverIsPaid;

    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [deleteErr, setDeleteErr] = React.useState<string | null>(null);

    const [toggling, setToggling] = React.useState(false);
    const [toggleErr, setToggleErr] = React.useState<string | null>(null);

    const handleDelete = React.useCallback(async () => {
        setDeleteErr(null);
        setDeleting(true);

        try {
            const res = await fetch(
                `/api/admin/finance/expenses/${encodeURIComponent(expense.id)}`,
                { method: 'DELETE' }
            );

            const json = (await res.json()) as DeleteExpenseResponse;

            if (!res.ok || !json.ok) {
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

    const handleTogglePaid = React.useCallback(async () => {
        setToggleErr(null);
        setToggling(true);

        const next = !effectiveIsPaid;
        setLocalIsPaid(next);

        try {
            const res = await fetch(
                `/api/admin/finance/expenses/${encodeURIComponent(
                    expense.id
                )}/paid`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isPaid: next }),
                }
            );

            const json = (await res.json()) as TogglePaidResponse;

            if (!res.ok || !json.ok) {
                setLocalIsPaid(effectiveIsPaid);
                setToggleErr(
                    !json.ok ? json.error : 'Falha ao atualizar status.'
                );
                setToggling(false);
                return;
            }

            setLocalIsPaid(json.data.isPaid);
            router.refresh();
        } catch {
            setLocalIsPaid(effectiveIsPaid);
            setToggleErr('Erro de rede. Tente novamente.');
        } finally {
            setToggling(false);
        }
    }, [effectiveIsPaid, expense.id, router]);

    return (
        <>
            <tr className="border-b border-border-primary last:border-b-0">
                <td className="px-4 py-3 text-content-primary">
                    {expense.description}
                </td>

                <td className="px-4 py-3 text-content-secondary">
                    {expense.dueDate}
                </td>

                <td className="px-4 py-3 text-right text-content-primary font-medium">
                    {expense.amount}
                </td>

                <td className="px-4 py-3 text-center">
                    <RecurringBadge isRecurring={expense.isRecurring} />
                </td>

                <td className="px-4 py-3 text-center">
                    <PaidBadge
                        effectiveIsPaid={effectiveIsPaid}
                        title={toggleErr ?? undefined}
                    />
                </td>

                <td className="px-4 py-3 text-right">
                    <ExpenseActions
                        expense={expense}
                        effectiveIsPaid={effectiveIsPaid}
                        toggling={toggling}
                        deleting={deleting}
                        onTogglePaid={handleTogglePaid}
                        onOpenConfirm={() => setConfirmOpen(true)}
                    />
                </td>
            </tr>

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

/* ========= CARD (mobile) ========= */

function ExpenseCard({ expense }: { expense: ExpenseRowUI }) {
    const router = useRouter();

    const serverIsPaid = getIsPaidFromServer(expense);
    const [localIsPaid, setLocalIsPaid] = React.useState<boolean | null>(null);
    const effectiveIsPaid = localIsPaid ?? serverIsPaid;

    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [deleteErr, setDeleteErr] = React.useState<string | null>(null);

    const [toggling, setToggling] = React.useState(false);
    const [toggleErr, setToggleErr] = React.useState<string | null>(null);

    const handleDelete = React.useCallback(async () => {
        setDeleteErr(null);
        setDeleting(true);

        try {
            const res = await fetch(
                `/api/admin/finance/expenses/${encodeURIComponent(expense.id)}`,
                { method: 'DELETE' }
            );

            const json = (await res.json()) as DeleteExpenseResponse;

            if (!res.ok || !json.ok) {
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

    const handleTogglePaid = React.useCallback(async () => {
        setToggleErr(null);
        setToggling(true);

        const next = !effectiveIsPaid;
        setLocalIsPaid(next);

        try {
            const res = await fetch(
                `/api/admin/finance/expenses/${encodeURIComponent(
                    expense.id
                )}/paid`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isPaid: next }),
                }
            );

            const json = (await res.json()) as TogglePaidResponse;

            if (!res.ok || !json.ok) {
                setLocalIsPaid(effectiveIsPaid);
                setToggleErr(
                    !json.ok ? json.error : 'Falha ao atualizar status.'
                );
                setToggling(false);
                return;
            }

            setLocalIsPaid(json.data.isPaid);
            router.refresh();
        } catch {
            setLocalIsPaid(effectiveIsPaid);
            setToggleErr('Erro de rede. Tente novamente.');
        } finally {
            setToggling(false);
        }
    }, [effectiveIsPaid, expense.id, router]);

    return (
        <>
            <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-paragraph-medium-size font-semibold text-content-primary truncate">
                            {expense.description}
                        </p>

                        <p className="text-paragraph-small text-content-secondary mt-1">
                            Vencimento:{' '}
                            <span className="font-medium">
                                {expense.dueDate}
                            </span>
                            {' · '}
                            Valor:{' '}
                            <span className="font-medium">
                                {expense.amount}
                            </span>
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <RecurringBadge isRecurring={expense.isRecurring} />
                            <PaidBadge
                                effectiveIsPaid={effectiveIsPaid}
                                title={toggleErr ?? undefined}
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <ExpenseActions
                        expense={expense}
                        effectiveIsPaid={effectiveIsPaid}
                        toggling={toggling}
                        deleting={deleting}
                        onTogglePaid={handleTogglePaid}
                        onOpenConfirm={() => setConfirmOpen(true)}
                    />
                </div>
            </div>

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

/* ========= MAIN RESPONSIVE LIST ========= */

export default function ExpensesResponsiveList({
    expenses,
}: {
    expenses: ExpenseRowUI[];
}) {
    // desktop >= 768px (md)
    const isDesktop = useMediaQuery('(min-width: 768px)');

    if (!Array.isArray(expenses) || expenses.length === 0) {
        return (
            <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                <p className="text-paragraph-small text-content-secondary text-center">
                    Nenhuma despesa cadastrada para este mês.
                </p>
            </div>
        );
    }

    // ✅ Render único (sem duplicar)
    if (!isDesktop) {
        return (
            <section className="space-y-3">
                {expenses.map((e) => (
                    <ExpenseCard key={e.id} expense={e} />
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
                        <th className="px-4 py-2 text-center">Status</th>
                        <th className="px-4 py-2 text-right">Ações</th>
                    </tr>
                </thead>

                <tbody>
                    {expenses.map((e) => (
                        <ExpenseTableRow key={e.id} expense={e} />
                    ))}
                </tbody>
            </table>
        </section>
    );
}
