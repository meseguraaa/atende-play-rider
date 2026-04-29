import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
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

export async function DELETE(
    _request: Request,
    context: { params: Promise<{ planId: string; clientId: string }> }
) {
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

    const { planId: rawPlanId, clientId: rawClientId } = await context.params;

    const planId = String(rawPlanId ?? '').trim();
    const clientId = String(rawClientId ?? '').trim();

    if (!planId) {
        return jsonErr('Plano inválido.', 400);
    }

    if (!clientId) {
        return jsonErr('Cliente inválido.', 400);
    }

    try {
        const [plan, membership, clientPlans] = await Promise.all([
            prisma.plan.findFirst({
                where: {
                    id: planId,
                    companyId,
                },
                select: {
                    id: true,
                    name: true,
                    type: true,
                    customForClientId: true,
                },
            }),

            // ✅ regra correta: cliente da empresa via membership
            prisma.companyMember.findFirst({
                where: {
                    companyId,
                    userId: clientId,
                    role: 'CLIENT',
                },
                select: {
                    id: true,
                    userId: true,
                    isActive: true,
                },
            }),

            prisma.clientPlan.findMany({
                where: {
                    companyId,
                    planId,
                    clientId,
                },
                orderBy: [{ createdAt: 'desc' }],
                select: {
                    id: true,
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

        if (!membership) {
            return jsonErr('Cliente inválido para esta empresa.', 404);
        }

        if (plan.type === 'CUSTOM') {
            return jsonErr(
                'Planos personalizados não podem ser desvinculados por esta rota.',
                400
            );
        }

        const now = new Date();

        const activeClientPlan = clientPlans.find((item) => {
            const runtime = getClientPlanRuntimeStatus({
                status: item.status,
                expiresAt: item.expiresAt,
                balances: item.balances,
                now,
            });

            return runtime.isEffectivelyActive;
        });

        if (!activeClientPlan) {
            return jsonErr(
                'Este cliente não possui plano ativo vinculado a este plano.',
                404
            );
        }

        const updated = await prisma.$transaction(async (tx) => {
            const updatedClientPlan = await tx.clientPlan.update({
                where: {
                    id: activeClientPlan.id,
                },
                data: {
                    status: 'CANCELED',
                },
                select: {
                    id: true,
                    status: true,
                },
            });

            return updatedClientPlan;
        });

        return jsonOk({
            plan: {
                id: plan.id,
                name: plan.name,
                type: plan.type,
            },
            unlinkedClientId: clientId,
            clientPlan: {
                id: updated.id,
                status: updated.status,
            },
        });
    } catch {
        return jsonErr('Não foi possível desvincular o cliente.', 500);
    }
}
