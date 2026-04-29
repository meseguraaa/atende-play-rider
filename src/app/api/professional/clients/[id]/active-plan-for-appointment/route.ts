// src/app/api/professional/clients/[id]/active-plan-for-appointment/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireProfessionalSession } from '@/lib/professional-permissions';
import { AppointmentPlanUsageType, ClientPlanStatus } from '@prisma/client';

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
        const session = await requireProfessionalSession();

        const companyId = normalizeString(session.companyId);
        const professionalId = normalizeString(session.professionalId);

        if (!companyId || !professionalId) {
            return jsonErr('Sessão do profissional inválida.', 401);
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

        const balancesWithRealCredits = await Promise.all(
            activeClientPlan.balances.map(async (balance) => {
                const usedAppointmentsCount = await prisma.appointment.count({
                    where: {
                        companyId,
                        clientPlanId: activeClientPlan.id,
                        clientPlanServiceBalanceId: balance.id,
                        planUsageType: AppointmentPlanUsageType.PLAN_CREDIT,
                        status: {
                            not: 'CANCELED',
                        },
                        confirmationStatus: {
                            not: 'CANCELED',
                        },
                    },
                });

                const creditsRemainingReal = Math.max(
                    0,
                    Number(balance.creditsTotal ?? 0) - usedAppointmentsCount
                );

                return {
                    clientPlanServiceBalanceId: balance.id,
                    serviceId: balance.serviceId,
                    serviceName: balance.serviceNameSnapshot,
                    creditsRemaining: creditsRemainingReal,
                };
            })
        );

        const servicesWithRealCredits = balancesWithRealCredits.filter(
            (balance) => balance.creditsRemaining > 0
        );

        if (servicesWithRealCredits.length === 0) {
            return NextResponse.json({
                ok: true,
                data: null,
            });
        }

        const allowedProfessionals = (
            activeClientPlan.plan?.professionals ?? []
        )
            .filter((item) => item.professional?.isActive !== false)
            .map((item) => ({
                professionalId: item.professionalId,
                professionalName: item.professional?.name ?? 'Profissional',
            }));

        return NextResponse.json({
            ok: true,
            data: {
                clientPlanId: activeClientPlan.id,
                planId: activeClientPlan.planId,
                planName: activeClientPlan.planNameSnapshot,
                expiresAt: activeClientPlan.expiresAt.toISOString(),
                services: servicesWithRealCredits,
                professionals: allowedProfessionals,
            },
        });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro interno.', 500);
    }
}
