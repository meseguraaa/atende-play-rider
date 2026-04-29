// src/app/api/admin/clients/[id]/active-plan-for-appointment/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';
import { ClientPlanStatus } from '@prisma/client';

function jsonErr(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await requireAdminForModule('APPOINTMENTS');

        const companyId = session.companyId;
        if (!companyId) {
            return jsonErr('Empresa não encontrada na sessão.', 401);
        }

        const params = await context.params;
        const clientId = normalizeString(params?.id);

        if (!clientId) {
            return jsonErr('clientId é obrigatório.', 400);
        }

        const client = await prisma.user.findFirst({
            where: {
                id: clientId,
                isActive: true,
                companyMemberships: {
                    some: {
                        companyId,
                        isActive: true,
                        role: 'CLIENT',
                    },
                },
            },
            select: { id: true },
        });

        if (!client) {
            return jsonErr('Cliente inválido ou inativo.', 404);
        }

        const now = new Date();

        const activeClientPlan = await prisma.clientPlan.findFirst({
            where: {
                companyId,
                clientId,
                status: ClientPlanStatus.ACTIVE,
                isPaid: true,
                startsAt: { lte: now },
                expiresAt: { gte: now },
            },
            select: {
                id: true,
                planId: true,
                planNameSnapshot: true,
                expiresAt: true,
                balances: {
                    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                    select: {
                        id: true,
                        serviceId: true,
                        serviceNameSnapshot: true,
                        creditsTotal: true,
                        creditsRemaining: true,
                    },
                },
                plan: {
                    select: {
                        professionals: {
                            orderBy: [{ createdAt: 'asc' }],
                            select: {
                                professionalId: true,
                                professional: {
                                    select: {
                                        name: true,
                                        isActive: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        if (!activeClientPlan) {
            return NextResponse.json({
                ok: true,
                data: null,
            });
        }

        const servicesWithRealCredits = activeClientPlan.balances
            .map((balance) => ({
                clientPlanServiceBalanceId: balance.id,
                serviceId: balance.serviceId,
                serviceName: balance.serviceNameSnapshot,
                creditsRemaining: Math.max(
                    0,
                    Number(balance.creditsRemaining ?? 0)
                ),
            }))
            .filter((balance) => balance.creditsRemaining > 0);

        if (servicesWithRealCredits.length === 0) {
            return NextResponse.json({
                ok: true,
                data: null,
            });
        }

        return NextResponse.json({
            ok: true,
            data: {
                clientPlanId: activeClientPlan.id,
                planId: activeClientPlan.planId,
                planName: activeClientPlan.planNameSnapshot,
                expiresAt: activeClientPlan.expiresAt.toISOString(),
                services: servicesWithRealCredits,
                professionals: (activeClientPlan.plan?.professionals ?? [])
                    .filter((item) => item.professional?.isActive !== false)
                    .map((item) => ({
                        professionalId: item.professionalId,
                        professionalName:
                            item.professional?.name ?? 'Profissional',
                    })),
            },
        });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro interno.', 500);
    }
}
