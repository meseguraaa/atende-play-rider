'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { PlanEditDialog } from '@/components/admin/plans/plan-edit-dialog/plan-edit-dialog';
import { PlanClientsDialog } from '@/components/admin/plans/plan-clients-dialog/plan-clients-dialog';
import { PlanActiveClientsDialog } from '@/components/admin/plans/plan-active-clients-dialog/plan-active-clients-dialog';

/* ---------------------------------------------
 * ✅ Media query hook com hidratação estável
 * --------------------------------------------- */
function useMediaQuery(query: string) {
    const [matches, setMatches] = React.useState(false);

    React.useEffect(() => {
        const mql = window.matchMedia(query);

        const onChange = () => setMatches(mql.matches);

        setMatches(mql.matches);

        if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', onChange);
            return () => mql.removeEventListener('change', onChange);
        }

        mql.addListener(onChange);
        return () => mql.removeListener(onChange);
    }, [query]);

    return matches;
}

export type PlanRowItem = {
    id: string;
    name: string;
    description: string | null;
    type: 'GENERAL' | 'CUSTOM' | 'SUBSCRIPTION';

    price: string;
    priceLabel: string;

    validityDays: number;
    allowedWeekdays: number[];
    allowedStartTime: string | null;
    allowedEndTime: string | null;
    sortOrder: number;

    isActive: boolean;
    customForClientId: string | null;
    customForClientName: string | null;
    servicesCount: number;
    professionalsCount: number;
    activeClientsCount: number;

    customDisplayStatus?: 'ACTIVE' | 'COMPLETED' | 'INACTIVE';
};

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error?: string };

function typeLabel(type: 'GENERAL' | 'CUSTOM' | 'SUBSCRIPTION') {
    if (type === 'CUSTOM') return 'Personalizado';
    if (type === 'SUBSCRIPTION') return 'Assinatura';
    return 'Geral';
}

function statusLabel(plan: PlanRowItem) {
    if (plan.customDisplayStatus === 'COMPLETED') return 'Concluído';
    return plan.isActive ? 'Ativo' : 'Inativo';
}

function shouldHideManagementActions(plan: PlanRowItem) {
    return plan.customDisplayStatus === 'COMPLETED';
}

async function patchPlan(planId: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/admin/plans/${planId}`, {
        method: 'PATCH',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => null)) as
        | ApiOk<unknown>
        | ApiErr
        | null;

    if (!res.ok || !json || json.ok !== true) {
        const msg =
            (json && json.ok === false && json.error) ||
            'Não foi possível salvar.';
        return { ok: false as const, error: msg };
    }

    return { ok: true as const, data: json.data };
}

function buildPlanDialogShape(plan: PlanRowItem) {
    return {
        id: plan.id,
        name: plan.name,
        description: plan.description ?? null,
        type: plan.type,
        price: plan.price,
        validityDays: plan.validityDays,
        isActive: plan.isActive,
        customForClientId: plan.customForClientId ?? null,
        allowedWeekdays: Array.isArray(plan.allowedWeekdays)
            ? plan.allowedWeekdays
            : [],
        allowedStartTime: plan.allowedStartTime ?? null,
        allowedEndTime: plan.allowedEndTime ?? null,
        sortOrder: typeof plan.sortOrder === 'number' ? plan.sortOrder : 100,
    };
}

function PlanClientsAction({ plan }: { plan: PlanRowItem }) {
    if (plan.type === 'CUSTOM') {
        return null;
    }

    return (
        <PlanClientsDialog planId={plan.id} planName={plan.name}>
            <Button
                variant="outline"
                size="sm"
                type="button"
                className="border-border-primary hover:bg-muted/40"
                title="Gerenciar cliente do plano"
            >
                Cliente
            </Button>
        </PlanClientsDialog>
    );
}

function PlanActiveClientsCountAction({ plan }: { plan: PlanRowItem }) {
    if (plan.type === 'CUSTOM') {
        return <span>-</span>;
    }

    return (
        <PlanActiveClientsDialog planId={plan.id} planName={plan.name}>
            <button
                type="button"
                className="font-medium text-content-brand underline-offset-4 transition hover:underline hover:text-content-brand/80"
                title="Ver clientes ativos do plano"
            >
                {plan.activeClientsCount}
            </button>
        </PlanActiveClientsDialog>
    );
}

function PlanCard({ plan }: { plan: PlanRowItem }) {
    const router = useRouter();

    const isActive = Boolean(plan.isActive);
    const [isToggling, setIsToggling] = React.useState(false);

    const planLikeForDialog = React.useMemo(
        () => buildPlanDialogShape(plan),
        [plan]
    );

    const hideManagementActions = shouldHideManagementActions(plan);

    async function handleToggleActive() {
        if (isToggling || hideManagementActions) return;

        setIsToggling(true);

        const res = await patchPlan(plan.id, { isActive: !isActive });

        setIsToggling(false);

        if (!res.ok) {
            toast.error(res.error);
            return;
        }

        toast.success(isActive ? 'Plano desativado!' : 'Plano ativado!');
        router.refresh();
    }

    return (
        <div className="space-y-3 rounded-xl border border-border-primary bg-background-tertiary p-4">
            <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="wrap-break-word text-paragraph-medium-size font-semibold text-content-primary">
                        {plan.name}
                    </p>

                    <span className="rounded-md border border-border-primary px-2 py-0.5 text-xs text-content-secondary">
                        {typeLabel(plan.type)}
                    </span>

                    {plan.customDisplayStatus === 'COMPLETED' ? (
                        <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600">
                            {statusLabel(plan)}
                        </span>
                    ) : plan.isActive ? (
                        <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
                            {statusLabel(plan)}
                        </span>
                    ) : (
                        <span className="rounded-md border border-border-primary px-2 py-0.5 text-xs text-content-secondary">
                            {statusLabel(plan)}
                        </span>
                    )}
                </div>

                {plan.description ? (
                    <p className="line-clamp-2 text-paragraph-small text-content-tertiary">
                        {plan.description}
                    </p>
                ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="space-y-0.5">
                    <p className="text-[11px] text-content-tertiary">Valor</p>
                    <p className="text-paragraph-small font-medium text-content-primary">
                        {plan.priceLabel}
                    </p>
                </div>

                <div className="space-y-0.5">
                    <p className="text-[11px] text-content-tertiary">
                        Validade
                    </p>
                    <p className="text-paragraph-small font-medium text-content-primary">
                        {plan.validityDays} dia
                        {plan.validityDays === 1 ? '' : 's'}
                    </p>
                </div>

                <div className="space-y-0.5">
                    <p className="text-[11px] text-content-tertiary">
                        Serviços
                    </p>
                    <p className="text-paragraph-small font-medium text-content-primary">
                        {plan.servicesCount}
                    </p>
                </div>

                <div className="space-y-0.5">
                    <p className="text-[11px] text-content-tertiary">
                        Profissionais
                    </p>
                    <p className="text-paragraph-small font-medium text-content-primary">
                        {plan.professionalsCount}
                    </p>
                </div>

                {plan.type !== 'CUSTOM' ? (
                    <div className="space-y-0.5">
                        <p className="text-[11px] text-content-tertiary">
                            Clientes ativos
                        </p>
                        <div className="text-paragraph-small text-content-primary">
                            <PlanActiveClientsCountAction plan={plan} />
                        </div>
                    </div>
                ) : null}
            </div>

            {plan.type === 'CUSTOM' && plan.customForClientName ? (
                <div className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2">
                    <p className="text-paragraph-small text-content-secondary">
                        Cliente vinculado:{' '}
                        <span className="font-medium text-content-primary">
                            {plan.customForClientName}
                        </span>
                    </p>
                </div>
            ) : null}

            {!hideManagementActions ? (
                <div className="flex flex-col gap-2 pt-1">
                    <PlanEditDialog plan={planLikeForDialog} />

                    {plan.type !== 'CUSTOM' ? (
                        <div className="w-full">
                            <PlanClientsAction plan={plan} />
                        </div>
                    ) : null}

                    <Button
                        variant={isActive ? 'destructive' : 'active'}
                        size="sm"
                        type="button"
                        onClick={handleToggleActive}
                        disabled={isToggling}
                        className="w-full border-border-primary hover:bg-muted/40"
                        title={
                            isToggling
                                ? 'Salvando...'
                                : isActive
                                  ? 'Desativar plano'
                                  : 'Ativar plano'
                        }
                    >
                        {isToggling
                            ? 'Salvando...'
                            : isActive
                              ? 'Desativar'
                              : 'Ativar'}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function PlanRow({ plan }: { plan: PlanRowItem }) {
    const router = useRouter();

    const isActive = Boolean(plan.isActive);
    const [isToggling, setIsToggling] = React.useState(false);

    const planLikeForDialog = React.useMemo(
        () => buildPlanDialogShape(plan),
        [plan]
    );

    const hideManagementActions = shouldHideManagementActions(plan);

    async function handleToggleActive() {
        if (isToggling || hideManagementActions) return;

        setIsToggling(true);

        const res = await patchPlan(plan.id, { isActive: !isActive });

        setIsToggling(false);

        if (!res.ok) {
            toast.error(res.error);
            return;
        }

        toast.success(isActive ? 'Plano desativado!' : 'Plano ativado!');
        router.refresh();
    }

    return (
        <tr className="border-t border-border-primary">
            <td className="px-4 py-3">
                <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-paragraph-medium-size text-content-primary">
                            {plan.name}
                        </p>

                        <span className="rounded-md border border-border-primary px-2 py-0.5 text-xs text-content-secondary">
                            {typeLabel(plan.type)}
                        </span>

                        {plan.customDisplayStatus === 'COMPLETED' ? (
                            <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600">
                                {statusLabel(plan)}
                            </span>
                        ) : null}
                    </div>

                    {plan.description ? (
                        <p className="line-clamp-2 text-paragraph-small text-content-tertiary">
                            {plan.description}
                        </p>
                    ) : (
                        <p className="text-paragraph-small text-content-tertiary"></p>
                    )}

                    {plan.type === 'CUSTOM' && plan.customForClientName ? (
                        <p className="text-paragraph-small text-content-secondary">
                            Cliente:{' '}
                            <span className="font-medium text-content-primary">
                                {plan.customForClientName}
                            </span>
                        </p>
                    ) : null}
                </div>
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary whitespace-nowrap">
                {plan.priceLabel}
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {plan.validityDays} dia{plan.validityDays === 1 ? '' : 's'}
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {plan.servicesCount}
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {plan.professionalsCount}
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                <PlanActiveClientsCountAction plan={plan} />
            </td>

            <td className="px-4 py-3">
                {!hideManagementActions ? (
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <PlanEditDialog plan={planLikeForDialog} />

                        {plan.type !== 'CUSTOM' ? (
                            <PlanClientsAction plan={plan} />
                        ) : null}

                        <Button
                            variant={isActive ? 'destructive' : 'active'}
                            size="sm"
                            type="button"
                            onClick={handleToggleActive}
                            disabled={isToggling}
                            className="border-border-primary hover:bg-muted/40"
                        >
                            {isToggling
                                ? 'Salvando...'
                                : isActive
                                  ? 'Desativar'
                                  : 'Ativar'}
                        </Button>
                    </div>
                ) : (
                    <div className="flex justify-end">
                        <span className="text-xs text-content-tertiary">
                            Sem ações disponíveis
                        </span>
                    </div>
                )}
            </td>
        </tr>
    );
}

export function PlansResponsiveList({ plans }: { plans: PlanRowItem[] }) {
    const list = Array.isArray(plans) ? plans : [];
    const isDesktop = useMediaQuery('(min-width: 768px)');

    if (!isDesktop) {
        return (
            <section className="space-y-2">
                {list.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-center text-paragraph-small text-content-secondary">
                            Nenhum plano cadastrado ainda.
                        </p>
                    </div>
                ) : (
                    list.map((plan) => <PlanCard key={plan.id} plan={plan} />)
                )}
            </section>
        );
    }

    return (
        <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
            <table className="min-w-275 w-full border-collapse text-sm">
                <colgroup>
                    <col className="w-[34%]" />
                    <col className="w-[11%]" />
                    <col className="w-[10%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                    <col className="w-[11%]" />
                    <col className="w-[16%]" />
                </colgroup>

                <thead>
                    <tr className="border-b border-border-primary bg-background-secondary">
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Plano
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Valor
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Validade
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Serviços
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Profissionais
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Clientes ativos
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                            Ações
                        </th>
                    </tr>
                </thead>

                <tbody className="[&>tr>td]:align-middle">
                    {list.length === 0 ? (
                        <tr className="border-t border-border-primary">
                            <td
                                colSpan={7}
                                className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                            >
                                Nenhum plano cadastrado ainda.
                            </td>
                        </tr>
                    ) : (
                        list.map((plan) => (
                            <PlanRow key={plan.id} plan={plan} />
                        ))
                    )}
                </tbody>
            </table>
        </section>
    );
}
