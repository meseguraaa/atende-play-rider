import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';

export const dynamic = 'force-dynamic';

type Role = 'CLIENT' | 'BARBER' | 'ADMIN';

type MobileTokenPayload = {
    sub: string;
    role: Role;
    companyId: string;
};

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

function getHeaderCI(req: Request, key: string): string | null {
    const target = key.toLowerCase();

    for (const [k, v] of req.headers.entries()) {
        if (k.toLowerCase() === target) {
            const s = String(v ?? '').trim();
            return s.length ? s : null;
        }
    }

    return null;
}

function getCompanyIdFromHeader(req: Request): string | null {
    const raw = getHeaderCI(req, 'x-company-id');
    return raw ? raw.trim() : null;
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

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(),
    });
}

export async function GET(request: Request) {
    try {
        const auth = request.headers.get('authorization') || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'unauthorized' },
                { status: 401, headers: corsHeaders() }
            );
        }

        const payload = (await verifyAppJwt(
            token
        )) as MobileTokenPayload | null;

        if (!payload?.sub) {
            return NextResponse.json(
                { ok: false, error: 'unauthorized' },
                { status: 401, headers: corsHeaders() }
            );
        }

        const companyId =
            getCompanyIdFromHeader(request) ||
            String(payload.companyId || '').trim();

        if (!companyId) {
            return NextResponse.json(
                { ok: false, error: 'company_not_found' },
                { status: 400, headers: corsHeaders() }
            );
        }

        const clientId = String(payload.sub).trim();

        const clientPlans = await prisma.clientPlan.findMany({
            where: {
                companyId,
                clientId,
            },
            orderBy: [{ createdAt: 'desc' }],
            select: {
                id: true,
                planId: true,
                planNameSnapshot: true,
                planTypeSnapshot: true,
                status: true,
                startsAt: true,
                expiresAt: true,
                isPaid: true,
                balances: {
                    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                    select: {
                        id: true,
                        serviceId: true,
                        serviceNameSnapshot: true,
                        sortOrder: true,
                        creditsTotal: true,
                        creditsUsed: true,
                        creditsRemaining: true,
                    },
                },
                plan: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                    },
                },
            },
        });

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
            return NextResponse.json(
                {
                    ok: true,
                    data: {
                        plan: null,
                    },
                },
                { headers: corsHeaders() }
            );
        }

        const runtime = getClientPlanRuntimeStatus({
            status: activeClientPlan.status,
            expiresAt: activeClientPlan.expiresAt,
            balances: activeClientPlan.balances,
            now,
        });

        const creditsTotal = activeClientPlan.balances.reduce(
            (sum, item) => sum + Number(item.creditsTotal ?? 0),
            0
        );
        const creditsUsed = activeClientPlan.balances.reduce(
            (sum, item) => sum + Number(item.creditsUsed ?? 0),
            0
        );
        const creditsRemaining = activeClientPlan.balances.reduce(
            (sum, item) => sum + Number(item.creditsRemaining ?? 0),
            0
        );

        const nextSuggestedBalance =
            activeClientPlan.balances.find(
                (item) => Number(item.creditsRemaining ?? 0) > 0
            ) ?? null;

        const normalizedPlanType = String(
            activeClientPlan.planTypeSnapshot ??
                activeClientPlan.plan?.type ??
                'GENERAL'
        )
            .trim()
            .toUpperCase();

        const isSubscription = normalizedPlanType === 'SUBSCRIPTION';

        return NextResponse.json(
            {
                ok: true,
                data: {
                    plan: {
                        id: activeClientPlan.id,
                        clientPlanId: activeClientPlan.id,
                        planId: activeClientPlan.planId,
                        name:
                            activeClientPlan.planNameSnapshot ||
                            activeClientPlan.plan?.name ||
                            'Plano',
                        type: normalizedPlanType,
                        planTypeSnapshot: normalizedPlanType,
                        isSubscription,
                        assetLabel: isSubscription ? 'assinatura' : 'plano',
                        assetLabelPlural: isSubscription
                            ? 'créditos da assinatura'
                            : 'créditos do plano',
                        status: runtime.effectiveStatus,
                        isPaid: Boolean(activeClientPlan.isPaid),
                        startsAt: activeClientPlan.startsAt.toISOString(),
                        expiresAt: activeClientPlan.expiresAt.toISOString(),
                        creditsTotal,
                        creditsUsed,
                        creditsRemaining,
                        creditsLabel: `${creditsUsed}/${creditsTotal}`,
                        nextSuggestedService: nextSuggestedBalance
                            ? {
                                  balanceId: nextSuggestedBalance.id,
                                  serviceId: nextSuggestedBalance.serviceId,
                                  serviceName:
                                      nextSuggestedBalance.serviceNameSnapshot,
                                  sortOrder: nextSuggestedBalance.sortOrder,
                                  creditsRemaining:
                                      nextSuggestedBalance.creditsRemaining,
                              }
                            : null,
                        balances: activeClientPlan.balances.map((item) => ({
                            balanceId: item.id,
                            serviceId: item.serviceId,
                            serviceName: item.serviceNameSnapshot,
                            sortOrder: item.sortOrder,
                            creditsTotal: item.creditsTotal,
                            creditsUsed: item.creditsUsed,
                            creditsRemaining: item.creditsRemaining,
                        })),
                    },
                },
            },
            { headers: corsHeaders() }
        );
    } catch {
        return NextResponse.json(
            { ok: false, error: 'server_error' },
            { status: 500, headers: corsHeaders() }
        );
    }
}
