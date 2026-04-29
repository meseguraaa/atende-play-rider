import type { Metadata } from 'next';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';
import { PlanNewDialog } from '@/components/admin/plans/plan-new-dialog/plan-new-dialog';
import {
    PlansResponsiveList,
    type PlanRowItem,
} from '@/components/admin/plans/plans-responsive-list/plans-responsive-list';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Planos',
};

type SessionWithCompanyId = { companyId?: string };

function formatCurrencyBRL(value: number) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    }).format(value);
}

function getClientPlanRuntimeStatus(args: {
    status: string;
    expiresAt: Date;
    balances: Array<{
        creditsRemaining: number;
    }>;
    now?: Date;
}) {
    const now = args.now ?? new Date();

    if (args.status !== 'ACTIVE') {
        return {
            isEffectivelyActive: false,
            effectiveStatus: 'INACTIVE' as const,
        };
    }

    if (args.expiresAt.getTime() < now.getTime()) {
        return {
            isEffectivelyActive: false,
            effectiveStatus: 'INACTIVE' as const,
        };
    }

    const balances = args.balances ?? [];
    const hasAnyBalance = balances.length > 0;
    const hasCreditsRemaining = balances.some(
        (item) => Number(item.creditsRemaining ?? 0) > 0
    );

    if (hasAnyBalance && !hasCreditsRemaining) {
        return {
            isEffectivelyActive: false,
            effectiveStatus: 'COMPLETED' as const,
        };
    }

    return {
        isEffectivelyActive: true,
        effectiveStatus: 'ACTIVE' as const,
    };
}

function getCustomPlanBucket(args: {
    planIsActive: boolean;
    clientPlans: Array<{
        status: string;
        expiresAt: Date;
        balances: Array<{
            creditsRemaining: number;
        }>;
    }>;
    now?: Date;
}) {
    const now = args.now ?? new Date();

    if (!args.planIsActive) return 'INACTIVE' as const;

    const clientPlans = Array.isArray(args.clientPlans) ? args.clientPlans : [];
    if (clientPlans.length === 0) return 'INACTIVE' as const;

    const runtimeStatuses = clientPlans.map((clientPlan) =>
        getClientPlanRuntimeStatus({
            status: clientPlan.status,
            expiresAt: clientPlan.expiresAt,
            balances: clientPlan.balances,
            now,
        })
    );

    if (runtimeStatuses.some((item) => item.effectiveStatus === 'ACTIVE')) {
        return 'ACTIVE' as const;
    }

    if (runtimeStatuses.some((item) => item.effectiveStatus === 'COMPLETED')) {
        return 'COMPLETED' as const;
    }

    return 'INACTIVE' as const;
}

export default async function AdminPlansPage() {
    const session = (await requireAdminForModule(
        'PLANS'
    )) as unknown as SessionWithCompanyId;

    const companyId = session.companyId?.trim();

    if (!companyId) {
        return (
            <div className="space-y-8 max-w-7xl">
                <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-title text-content-primary">
                            Planos
                        </h1>
                        <p className="text-paragraph-medium text-content-secondary">
                            Gerencie planos gerais, personalizados e
                            assinaturas, com créditos, regras de uso e
                            disponibilidade.
                        </p>

                        <div className="mt-3 md:hidden">
                            <PlanNewDialog />
                        </div>
                    </div>

                    <div className="hidden md:block">
                        <PlanNewDialog />
                    </div>
                </header>

                <section className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                    <p className="text-paragraph-small text-content-secondary text-center">
                        Sessão sem <b>companyId</b>. Este painel é multi-tenant:
                        vincule o admin a uma empresa.
                    </p>
                </section>
            </div>
        );
    }

    const plans = await prisma.plan.findMany({
        where: { companyId },
        orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: {
            id: true,
            name: true,
            description: true,
            type: true,
            price: true,
            validityDays: true,
            allowedWeekdays: true,
            allowedStartTime: true,
            allowedEndTime: true,
            sortOrder: true,
            isActive: true,
            customForClientId: true,
            customForClient: {
                select: {
                    name: true,
                },
            },
            clientPlans: {
                where: {
                    status: 'ACTIVE',
                },
                orderBy: [{ createdAt: 'desc' }],
                select: {
                    id: true,
                    clientId: true,
                    status: true,
                    expiresAt: true,
                    balances: {
                        select: {
                            creditsRemaining: true,
                        },
                    },
                },
            },
            _count: {
                select: {
                    services: true,
                    professionals: true,
                },
            },
        },
    });

    const now = new Date();

    const rows: Array<
        PlanRowItem & {
            customDisplayStatus: 'ACTIVE' | 'COMPLETED' | 'INACTIVE';
            activeClientsCount: number;
        }
    > = plans.map((plan) => {
        const priceNumber = Number(plan.price);

        const runtimeClientPlans = (plan.clientPlans ?? []).map(
            (clientPlan) => {
                const runtime = getClientPlanRuntimeStatus({
                    status: clientPlan.status,
                    expiresAt: clientPlan.expiresAt,
                    balances: clientPlan.balances,
                    now,
                });

                return {
                    ...clientPlan,
                    runtime,
                };
            }
        );

        const activeClientsCount = runtimeClientPlans.filter(
            (item) => item.runtime.isEffectivelyActive
        ).length;

        let customDisplayStatus: 'ACTIVE' | 'COMPLETED' | 'INACTIVE' =
            plan.isActive ? 'ACTIVE' : 'INACTIVE';

        if (plan.type === 'CUSTOM') {
            customDisplayStatus = getCustomPlanBucket({
                planIsActive: Boolean(plan.isActive),
                clientPlans: plan.clientPlans,
                now,
            });
        }

        return {
            id: plan.id,
            name: plan.name,
            description: plan.description ?? null,
            type: plan.type,
            price: String(plan.price),
            priceLabel: Number.isFinite(priceNumber)
                ? formatCurrencyBRL(priceNumber)
                : formatCurrencyBRL(0),
            validityDays:
                typeof plan.validityDays === 'number' ? plan.validityDays : 0,
            allowedWeekdays: Array.isArray(plan.allowedWeekdays)
                ? plan.allowedWeekdays
                : [],
            allowedStartTime: plan.allowedStartTime ?? null,
            allowedEndTime: plan.allowedEndTime ?? null,
            sortOrder:
                typeof plan.sortOrder === 'number' ? plan.sortOrder : 100,
            isActive:
                plan.type === 'CUSTOM'
                    ? customDisplayStatus === 'ACTIVE'
                    : Boolean(plan.isActive),
            customForClientId: plan.customForClientId ?? null,
            customForClientName: plan.customForClient?.name ?? null,
            servicesCount: plan._count.services ?? 0,
            professionalsCount: plan._count.professionals ?? 0,
            activeClientsCount,
            customDisplayStatus,
        };
    });

    const activeGeneralRows = rows.filter(
        (r) => r.type === 'GENERAL' && r.isActive
    );

    const activeCustomRows = rows.filter(
        (r) => r.type === 'CUSTOM' && r.customDisplayStatus === 'ACTIVE'
    );

    const activeSubscriptionRows = rows.filter(
        (r) => r.type === 'SUBSCRIPTION' && r.isActive
    );

    const completedCustomRows = rows.filter(
        (r) => r.type === 'CUSTOM' && r.customDisplayStatus === 'COMPLETED'
    );

    const inactiveGeneralRows = rows.filter(
        (r) => r.type === 'GENERAL' && !r.isActive
    );

    const inactiveCustomRows = rows.filter(
        (r) => r.type === 'CUSTOM' && r.customDisplayStatus === 'INACTIVE'
    );

    const inactiveSubscriptionRows = rows.filter(
        (r) => r.type === 'SUBSCRIPTION' && !r.isActive
    );

    return (
        <div className="space-y-8 max-w-7xl">
            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <h1 className="text-title text-content-primary">Planos</h1>
                    <p className="text-paragraph-medium text-content-secondary">
                        Gerencie planos gerais, personalizados e assinaturas,
                        com créditos, regras de uso e disponibilidade.
                    </p>

                    <div className="mt-3 md:hidden">
                        <PlanNewDialog />
                    </div>
                </div>

                <div className="hidden md:block">
                    <PlanNewDialog />
                </div>
            </header>

            <section className="space-y-4">
                <h2 className="text-paragraph-medium text-content-primary">
                    Planos ativos - Geral
                </h2>

                {activeGeneralRows.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhum plano geral ativo no momento.
                        </p>
                    </div>
                ) : (
                    <PlansResponsiveList plans={activeGeneralRows} />
                )}
            </section>

            <section className="space-y-4">
                <h2 className="text-paragraph-medium text-content-primary">
                    Planos ativos - Personalizados
                </h2>

                {activeCustomRows.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhum plano personalizado ativo no momento.
                        </p>
                    </div>
                ) : (
                    <PlansResponsiveList plans={activeCustomRows} />
                )}
            </section>

            <section className="space-y-4">
                <h2 className="text-paragraph-medium text-content-primary">
                    Assinaturas ativas
                </h2>

                {activeSubscriptionRows.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhuma assinatura ativa no momento.
                        </p>
                    </div>
                ) : (
                    <PlansResponsiveList plans={activeSubscriptionRows} />
                )}
            </section>

            <section className="space-y-4">
                <h2 className="text-paragraph-medium text-content-primary">
                    Planos concluídos
                </h2>

                {completedCustomRows.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhum plano concluído no momento.
                        </p>
                    </div>
                ) : (
                    <PlansResponsiveList plans={completedCustomRows} />
                )}
            </section>

            <section className="space-y-4">
                <h2 className="text-paragraph-medium text-content-primary">
                    Planos inativos - Geral
                </h2>

                {inactiveGeneralRows.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhum plano geral inativo no momento.
                        </p>
                    </div>
                ) : (
                    <PlansResponsiveList plans={inactiveGeneralRows} />
                )}
            </section>

            <section className="space-y-4">
                <h2 className="text-paragraph-medium text-content-primary">
                    Planos inativos - Personalizados
                </h2>

                {inactiveCustomRows.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhum plano personalizado inativo no momento.
                        </p>
                    </div>
                ) : (
                    <PlansResponsiveList plans={inactiveCustomRows} />
                )}
            </section>

            <section className="space-y-4">
                <h2 className="text-paragraph-medium text-content-primary">
                    Assinaturas inativas
                </h2>

                {inactiveSubscriptionRows.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhuma assinatura inativa no momento.
                        </p>
                    </div>
                ) : (
                    <PlansResponsiveList plans={inactiveSubscriptionRows} />
                )}
            </section>
        </div>
    );
}
