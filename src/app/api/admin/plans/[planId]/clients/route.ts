// src/app/api/admin/plans/[planId]/clients/route.ts
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

type RouteContext = {
    params: Promise<{ planId: string }>;
};

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function normalizeDate(value: Date | null | undefined) {
    return value ? value.toISOString() : null;
}

function getClientPlanRuntimeStatus(args: {
    status: string;
    expiresAt: Date;
    balances: Array<{
        creditsTotal: number;
        creditsUsed: number;
        creditsRemaining: number;
    }>;
    now?: Date;
}) {
    const now = args.now ?? new Date();

    if (args.status !== 'ACTIVE') {
        return {
            isEffectivelyActive: false,
            effectiveStatus: args.status,
        };
    }

    if (args.expiresAt.getTime() < now.getTime()) {
        return {
            isEffectivelyActive: false,
            effectiveStatus: 'EXPIRED',
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
            effectiveStatus: 'COMPLETED',
        };
    }

    return {
        isEffectivelyActive: true,
        effectiveStatus: 'ACTIVE',
    };
}

export async function GET(_request: Request, context: RouteContext) {
    const session = await requireAdminForModule('PLANS');
    const companyId = (
        session as unknown as { companyId?: string }
    ).companyId?.trim();

    if (!companyId) {
        return jsonErr(
            'Sessão sem companyId. Este painel é multi-tenant: vincule o admin a uma empresa.',
            401
        );
    }

    const { planId: rawPlanId } = await context.params;
    const planId = String(rawPlanId ?? '').trim();

    if (!planId) {
        return jsonErr('Plano inválido.');
    }

    try {
        const [plan, members, allClientPlans] = await Promise.all([
            prisma.plan.findFirst({
                where: {
                    id: planId,
                    companyId,
                },
                select: {
                    id: true,
                    name: true,
                    type: true,
                    isActive: true,
                    customForClientId: true,
                    services: {
                        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                        select: {
                            creditsIncluded: true,
                        },
                    },
                },
            }),

            prisma.companyMember.findMany({
                where: {
                    companyId,
                    role: 'CLIENT',
                    isActive: true,
                },
                orderBy: [{ user: { name: 'asc' } }],
                select: {
                    userId: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                        },
                    },
                },
            }),

            prisma.clientPlan.findMany({
                where: {
                    companyId,
                },
                orderBy: [{ createdAt: 'desc' }],
                select: {
                    id: true,
                    clientId: true,
                    planId: true,
                    status: true,
                    startsAt: true,
                    expiresAt: true,
                    isPaid: true,
                    planNameSnapshot: true,
                    client: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                        },
                    },
                    balances: {
                        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                        select: {
                            serviceId: true,
                            serviceNameSnapshot: true,
                            sortOrder: true,
                            creditsTotal: true,
                            creditsUsed: true,
                            creditsRemaining: true,
                        },
                    },
                },
            }),
        ]);

        if (!plan) {
            return jsonErr('Plano não encontrado.', 404);
        }

        const now = new Date();

        const clientPlansWithRuntime = allClientPlans.map((item) => {
            const runtime = getClientPlanRuntimeStatus({
                status: item.status,
                expiresAt: item.expiresAt,
                balances: item.balances,
                now,
            });

            const creditsTotal = item.balances.reduce(
                (sum, balance) => sum + Number(balance.creditsTotal ?? 0),
                0
            );
            const creditsUsed = item.balances.reduce(
                (sum, balance) => sum + Number(balance.creditsUsed ?? 0),
                0
            );
            const creditsRemaining = item.balances.reduce(
                (sum, balance) => sum + Number(balance.creditsRemaining ?? 0),
                0
            );

            return {
                ...item,
                runtime,
                creditsTotal,
                creditsUsed,
                creditsRemaining,
            };
        });

        const linkedClientPlans = clientPlansWithRuntime.filter(
            (item) => item.planId === planId && item.runtime.isEffectivelyActive
        );

        const linkedClientIds = new Set(
            linkedClientPlans.map((item) => item.clientId)
        );

        const linkedClients = linkedClientPlans.map((item) => ({
            id: item.client.id,
            name: item.client.name?.trim() || item.client.email,
            email: item.client.email,
            isActive: true,
            status: item.runtime.effectiveStatus,
            startsAt: normalizeDate(item.startsAt),
            expiresAt: normalizeDate(item.expiresAt),
            creditsTotal: item.creditsTotal,
            creditsUsed: item.creditsUsed,
            creditsRemaining: item.creditsRemaining,
            creditsLabel: `${item.creditsUsed}/${item.creditsTotal}`,
            serviceBalances: item.balances.map((balance) => ({
                serviceId: balance.serviceId,
                serviceName: balance.serviceNameSnapshot,
                creditsTotal: Number(balance.creditsTotal ?? 0),
                creditsUsed: Number(balance.creditsUsed ?? 0),
                creditsRemaining: Number(balance.creditsRemaining ?? 0),
                creditsLabel: `${Number(balance.creditsUsed ?? 0)}/${Number(balance.creditsTotal ?? 0)}`,
                sortOrder: Number(balance.sortOrder ?? 0),
            })),
        }));

        const blockedClientIds = new Set(
            clientPlansWithRuntime
                .filter(
                    (item) =>
                        item.planId !== planId &&
                        item.runtime.isEffectivelyActive
                )
                .map((item) => item.clientId)
        );

        const clients = members
            .map((member) => {
                const user = member.user;
                const currentPlan = clientPlansWithRuntime.find(
                    (planItem) => planItem.clientId === user.id
                );

                return {
                    id: user.id,
                    name: user.name?.trim() || user.email,
                    email: user.email,
                    phone: user.phone ?? null,
                    isActive: true,
                    isSelected: linkedClientIds.has(user.id),
                    currentPlan: currentPlan
                        ? {
                              id: currentPlan.id,
                              planId: currentPlan.planId,
                              planName:
                                  currentPlan.planNameSnapshot ?? plan.name,
                              status: currentPlan.runtime.effectiveStatus,
                              startsAt: normalizeDate(currentPlan.startsAt),
                              expiresAt: normalizeDate(currentPlan.expiresAt),
                              isPaid: Boolean(currentPlan.isPaid),
                              creditsTotal: currentPlan.creditsTotal,
                              creditsUsed: currentPlan.creditsUsed,
                              creditsRemaining: currentPlan.creditsRemaining,
                              creditsLabel: `${currentPlan.creditsUsed}/${currentPlan.creditsTotal}`,
                              isEffectivelyActive:
                                  currentPlan.runtime.isEffectivelyActive,
                          }
                        : null,
                };
            })
            .filter((client) => {
                if (linkedClientIds.has(client.id)) return true;
                return !blockedClientIds.has(client.id);
            });

        return jsonOk({
            plan: {
                id: plan.id,
                name: plan.name,
                type: plan.type,
                isActive: Boolean(plan.isActive),
                customForClientId: plan.customForClientId ?? null,
            },
            currentClient: linkedClients.length > 0 ? linkedClients[0] : null,
            linkedClients,
            clients,
        });
    } catch {
        return jsonErr('Não foi possível carregar os clientes do plano.', 500);
    }
}

export async function POST(request: Request, context: RouteContext) {
    const session = await requireAdminForModule('PLANS');
    const companyId = (
        session as unknown as { companyId?: string }
    ).companyId?.trim();

    if (!companyId) {
        return jsonErr(
            'Sessão sem companyId. Este painel é multi-tenant: vincule o admin a uma empresa.',
            401
        );
    }

    const { planId: rawPlanId } = await context.params;
    const planId = String(rawPlanId ?? '').trim();

    if (!planId) {
        return jsonErr('Plano inválido.');
    }

    const body = (await request.json().catch(() => null)) as {
        clientId?: unknown;
    } | null;

    if (!body) {
        return jsonErr('Body inválido.');
    }

    const clientId =
        typeof body.clientId === 'string' ? body.clientId.trim() : '';

    if (!clientId) {
        return jsonErr('Cliente inválido.');
    }

    try {
        const [plan, membership, existingClientPlans] = await Promise.all([
            prisma.plan.findFirst({
                where: {
                    id: planId,
                    companyId,
                },
                select: {
                    id: true,
                    name: true,
                    type: true,
                    isActive: true,
                    price: true,
                    validityDays: true,
                    services: {
                        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                        select: {
                            serviceId: true,
                            serviceNameSnapshot: true,
                            servicePriceSnapshot: true,
                            durationMinutesSnapshot: true,
                            professionalPercentage: true,
                            sortOrder: true,
                            creditsIncluded: true,
                        },
                    },
                },
            }),

            prisma.companyMember.findFirst({
                where: {
                    companyId,
                    userId: clientId,
                    role: 'CLIENT',
                    isActive: true,
                },
                select: {
                    userId: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            }),

            prisma.clientPlan.findMany({
                where: {
                    companyId,
                    clientId,
                },
                orderBy: [{ createdAt: 'desc' }],
                select: {
                    id: true,
                    planId: true,
                    status: true,
                    expiresAt: true,
                    balances: {
                        select: {
                            creditsTotal: true,
                            creditsUsed: true,
                            creditsRemaining: true,
                        },
                    },
                },
            }),
        ]);

        if (!plan) {
            return jsonErr('Plano não encontrado.', 404);
        }

        if (plan.type === 'CUSTOM') {
            return jsonErr(
                'Planos personalizados já são vinculados automaticamente ao cliente na criação.',
                400
            );
        }

        if (!plan.isActive) {
            return jsonErr(
                'Não é possível vincular e ativar cliente em um plano inativo.'
            );
        }

        if (!membership?.userId || !membership.user) {
            return jsonErr('Cliente inválido para esta empresa.');
        }

        const now = new Date();

        const activeClientPlan = existingClientPlans.find((item) => {
            const runtime = getClientPlanRuntimeStatus({
                status: item.status,
                expiresAt: item.expiresAt,
                balances: item.balances,
                now,
            });

            return runtime.isEffectivelyActive;
        });

        if (activeClientPlan?.id) {
            if (activeClientPlan.planId === planId) {
                return jsonErr('Este cliente já está ativo neste plano.');
            }

            return jsonErr('Este cliente já possui um plano ativo.');
        }

        if (!plan.services.length) {
            return jsonErr(
                'Este plano não possui serviços configurados para ativação.'
            );
        }

        const startsAt = new Date();
        const expiresAt = addDays(startsAt, plan.validityDays);

        const created = await prisma.$transaction(async (tx) => {
            const clientPlan = await tx.clientPlan.create({
                data: {
                    companyId,
                    clientId,
                    planId: plan.id,
                    planNameSnapshot: plan.name,
                    planTypeSnapshot: plan.type,
                    planPriceSnapshot: new Prisma.Decimal(plan.price),
                    validityDaysSnapshot: plan.validityDays,
                    startsAt,
                    expiresAt,
                    isPaid: true,
                    status: 'ACTIVE',
                },
                select: {
                    id: true,
                },
            });

            await tx.clientPlanServiceBalance.createMany({
                data: plan.services.map((service) => ({
                    companyId,
                    clientPlanId: clientPlan.id,
                    serviceId: service.serviceId,
                    serviceNameSnapshot: service.serviceNameSnapshot,
                    servicePriceSnapshot: new Prisma.Decimal(
                        service.servicePriceSnapshot
                    ),
                    durationMinutesSnapshot: service.durationMinutesSnapshot,
                    professionalPercentageSnapshot: new Prisma.Decimal(
                        service.professionalPercentage
                    ),
                    sortOrder: service.sortOrder,
                    creditsTotal: service.creditsIncluded,
                    creditsUsed: 0,
                    creditsRemaining: service.creditsIncluded,
                })),
            });

            return clientPlan;
        });

        return jsonOk(
            {
                plan: {
                    id: plan.id,
                    name: plan.name,
                },
                client: {
                    id: membership.user.id,
                    name: membership.user.name?.trim() || membership.user.email,
                    email: membership.user.email,
                },
                clientPlan: {
                    id: created.id,
                    startsAt: startsAt.toISOString(),
                    expiresAt: expiresAt.toISOString(),
                    status: 'ACTIVE',
                    isPaid: true,
                },
            },
            { status: 201 }
        );
    } catch {
        return jsonErr('Não foi possível vincular e ativar o plano.', 500);
    }
}
