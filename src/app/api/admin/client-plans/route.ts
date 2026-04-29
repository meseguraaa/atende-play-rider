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

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

export async function POST(request: Request) {
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

    const body = (await request.json().catch(() => null)) as {
        clientId?: unknown;
        planId?: unknown;
        startsAt?: unknown;
    } | null;

    if (!body) return jsonErr('Body inválido.');

    const clientId =
        typeof body.clientId === 'string' ? body.clientId.trim() : '';
    const planId = typeof body.planId === 'string' ? body.planId.trim() : '';

    if (!clientId) {
        return jsonErr('Cliente é obrigatório.');
    }

    if (!planId) {
        return jsonErr('Plano é obrigatório.');
    }

    let startsAt = new Date();

    if (typeof body.startsAt === 'string' && body.startsAt.trim()) {
        const parsed = new Date(body.startsAt);
        if (Number.isNaN(parsed.getTime())) {
            return jsonErr('Data de início inválida.');
        }
        startsAt = parsed;
    }

    try {
        const [clientMembership, plan, activeClientPlan] = await Promise.all([
            prisma.companyMember.findFirst({
                where: {
                    companyId,
                    userId: clientId,
                    role: 'CLIENT',
                    isActive: true,
                    user: {
                        isActive: true,
                    },
                },
                select: {
                    userId: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            isActive: true,
                        },
                    },
                },
            }),
            prisma.plan.findFirst({
                where: {
                    id: planId,
                    companyId,
                    isActive: true,
                },
                select: {
                    id: true,
                    companyId: true,
                    name: true,
                    type: true,
                    description: true,
                    price: true,
                    validityDays: true,
                    allowedWeekdays: true,
                    allowedStartTime: true,
                    allowedEndTime: true,
                    isActive: true,
                    customForClientId: true,
                    services: {
                        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                        select: {
                            serviceId: true,
                            creditsIncluded: true,
                            sortOrder: true,
                            professionalPercentage: true,
                            serviceNameSnapshot: true,
                            servicePriceSnapshot: true,
                            durationMinutesSnapshot: true,
                        },
                    },
                    creditOrders: {
                        orderBy: [{ position: 'asc' }],
                        select: {
                            serviceId: true,
                            position: true,
                        },
                    },
                },
            }),
            prisma.clientPlan.findFirst({
                where: {
                    companyId,
                    clientId,
                    status: 'ACTIVE',
                },
                select: { id: true },
            }),
        ]);

        if (!clientMembership?.userId) {
            return jsonErr('Cliente inválido para esta empresa.', 404);
        }

        if (!plan) {
            return jsonErr('Plano não encontrado ou inativo.', 404);
        }

        if (activeClientPlan?.id) {
            return jsonErr('Este cliente já possui um plano ativo.');
        }

        if (plan.type === 'CUSTOM') {
            if (!plan.customForClientId) {
                return jsonErr('Plano personalizado inválido.');
            }

            if (plan.customForClientId !== clientId) {
                return jsonErr(
                    'Este plano personalizado não pertence a este cliente.'
                );
            }
        }

        if (!Array.isArray(plan.services) || plan.services.length === 0) {
            return jsonErr(
                'O plano não possui serviços configurados e não pode ser ativado.'
            );
        }

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
                    status: 'ACTIVE',
                    isPaid: false,
                },
                select: {
                    id: true,
                    clientId: true,
                    planId: true,
                    startsAt: true,
                    expiresAt: true,
                    status: true,
                },
            });

            await tx.clientPlanServiceBalance.createMany({
                data: plan.services.map((item) => ({
                    companyId,
                    clientPlanId: clientPlan.id,
                    serviceId: item.serviceId,
                    serviceNameSnapshot: item.serviceNameSnapshot,
                    servicePriceSnapshot: new Prisma.Decimal(
                        item.servicePriceSnapshot
                    ),
                    durationMinutesSnapshot: item.durationMinutesSnapshot,
                    professionalPercentageSnapshot: new Prisma.Decimal(
                        item.professionalPercentage
                    ),
                    sortOrder: item.sortOrder,
                    creditsTotal: item.creditsIncluded,
                    creditsUsed: 0,
                    creditsRemaining: item.creditsIncluded,
                })),
            });

            const balances = await tx.clientPlanServiceBalance.findMany({
                where: {
                    companyId,
                    clientPlanId: clientPlan.id,
                },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                select: {
                    id: true,
                    serviceId: true,
                    serviceNameSnapshot: true,
                    creditsTotal: true,
                    creditsUsed: true,
                    creditsRemaining: true,
                    sortOrder: true,
                },
            });

            return {
                clientPlan,
                balances,
            };
        });

        return jsonOk(
            {
                id: created.clientPlan.id,
                clientId: created.clientPlan.clientId,
                planId: created.clientPlan.planId,
                startsAt: created.clientPlan.startsAt,
                expiresAt: created.clientPlan.expiresAt,
                status: created.clientPlan.status,
                balances: created.balances,
            },
            { status: 201 }
        );
    } catch {
        return jsonErr('Não foi possível ativar o plano para o cliente.', 500);
    }
}
