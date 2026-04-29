import { NextResponse } from 'next/server';
import { CustomerLevel } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';
import { sendPushToUsers } from '@/lib/push/send-push';
import { consumeWhatsappCampaignCredit } from '@/lib/whatsapp/whatsapp-message-credits';

const UNIT_ALL_VALUE = 'all';

type LevelFilter = 'all' | CustomerLevel;
type ClientStatusFilter = 'active' | 'inactive' | 'all';
type PlanFilter = 'all' | 'with_active_plan' | 'without_active_plan';
type LastVisitFilter = 'all' | 'lt_30' | 'gt_30' | 'gt_60' | 'never';
type FrequencyFilter =
    | 'all'
    | 'very_frequent'
    | 'recurring'
    | 'sporadic'
    | 'no_history';

const LEVEL_RANK: Record<CustomerLevel, number> = {
    BRONZE: 1,
    PRATA: 2,
    OURO: 3,
    DIAMANTE: 4,
};

function jsonError(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeLevel(v: unknown): LevelFilter {
    if (v === 'BRONZE') return 'BRONZE';
    if (v === 'PRATA') return 'PRATA';
    if (v === 'OURO') return 'OURO';
    if (v === 'DIAMANTE') return 'DIAMANTE';
    return 'all';
}

function normalizeClientStatus(v: unknown): ClientStatusFilter {
    if (v === 'inactive') return 'inactive';
    if (v === 'all') return 'all';
    return 'active';
}

function normalizePlanFilter(v: unknown): PlanFilter {
    if (v === 'with_active_plan') return 'with_active_plan';
    if (v === 'without_active_plan') return 'without_active_plan';
    return 'all';
}

function normalizeLastVisit(v: unknown): LastVisitFilter {
    if (v === 'lt_30') return 'lt_30';
    if (v === 'gt_30') return 'gt_30';
    if (v === 'gt_60') return 'gt_60';
    if (v === 'never') return 'never';
    return 'all';
}

function normalizeFrequency(v: unknown): FrequencyFilter {
    if (v === 'very_frequent') return 'very_frequent';
    if (v === 'recurring') return 'recurring';
    if (v === 'sporadic') return 'sporadic';
    if (v === 'no_history') return 'no_history';
    return 'all';
}

function normalizeMinSpent(v: unknown): number {
    const n = Number(String(v ?? '').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

function digitsOnly(value: string | null | undefined) {
    return String(value ?? '').replace(/\D/g, '');
}

function pickHighestLevel(levels: CustomerLevel[]): CustomerLevel {
    let best: CustomerLevel = 'BRONZE';
    for (const l of levels) {
        if (LEVEL_RANK[l] > LEVEL_RANK[best]) best = l;
    }
    return best;
}

function buildFrequencyKey(doneDates: Date[]): Exclude<FrequencyFilter, 'all'> {
    if (doneDates.length === 0) return 'no_history';
    if (doneDates.length === 1) return 'sporadic';

    const sorted = [...doneDates].sort((a, b) => a.getTime() - b.getTime());

    const diffs: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
        const diffMs = sorted[i].getTime() - sorted[i - 1].getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        diffs.push(diffDays);
    }

    if (diffs.length === 0) return 'sporadic';

    const avgDays = diffs.reduce((acc, d) => acc + d, 0) / diffs.length;

    if (avgDays <= 10) return 'very_frequent';
    if (avgDays <= 25) return 'recurring';
    return 'sporadic';
}

function matchesLastVisitFilter(
    lastDoneDate: Date | null,
    filter: LastVisitFilter,
    now: Date
) {
    if (filter === 'all') return true;
    if (filter === 'never') return !lastDoneDate;
    if (!lastDoneDate) return false;

    const diffMs = now.getTime() - lastDoneDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (filter === 'lt_30') return diffDays < 30;
    if (filter === 'gt_30') return diffDays > 30;
    if (filter === 'gt_60') return diffDays > 60;

    return true;
}

function matchesFrequencyFilter(
    frequency: Exclude<FrequencyFilter, 'all'>,
    filter: FrequencyFilter
) {
    if (filter === 'all') return true;
    return frequency === filter;
}

type CampaignAudienceFilters = {
    q?: unknown;
    level?: unknown;
    status?: unknown;
    plan?: unknown;
    lastVisit?: unknown;
    frequency?: unknown;
    minSpent?: unknown;
    unitId?: unknown;
};

async function resolveAudience(
    companyId: string,
    rawFilters: CampaignAudienceFilters
) {
    const q = String(rawFilters.q ?? '').trim();
    const level = normalizeLevel(rawFilters.level);
    const status = normalizeClientStatus(rawFilters.status);
    const plan = normalizePlanFilter(rawFilters.plan);
    const lastVisit = normalizeLastVisit(rawFilters.lastVisit);
    const frequency = normalizeFrequency(rawFilters.frequency);
    const minSpent = normalizeMinSpent(rawFilters.minSpent);
    const unitId =
        String(rawFilters.unitId ?? UNIT_ALL_VALUE).trim() || UNIT_ALL_VALUE;

    const membershipWhere: {
        companyId: string;
        role: 'CLIENT';
        isActive?: boolean;
    } = {
        companyId,
        role: 'CLIENT',
        ...(status === 'active'
            ? { isActive: true }
            : status === 'inactive'
              ? { isActive: false }
              : {}),
    };

    const whereUser: {
        companyMemberships: { some: typeof membershipWhere };
        OR?: Array<
            | { name: { contains: string; mode: 'insensitive' } }
            | { email: { contains: string; mode: 'insensitive' } }
            | { phone: { contains: string } }
        >;
    } = {
        companyMemberships: {
            some: membershipWhere,
        },
    };

    if (q.length > 0) {
        whereUser.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
        ];
    }

    const candidateUsers = await prisma.user.findMany({
        where: whereUser,
        orderBy: { name: 'asc' },
        select: {
            id: true,
            name: true,
            phone: true,
            pushDevices: {
                where: {
                    isActive: true,
                },
                select: {
                    id: true,
                    deviceToken: true,
                },
            },
        },
    });

    const candidateIds = candidateUsers.map((u) => u.id);
    if (candidateIds.length === 0) {
        return [];
    }

    const levelStates = await prisma.customerLevelState.findMany({
        where: {
            companyId,
            userId: { in: candidateIds },
            ...(unitId !== UNIT_ALL_VALUE ? { unitId } : {}),
        },
        select: {
            userId: true,
            levelCurrent: true,
        },
    });

    const levelByUserId = new Map<string, CustomerLevel>();

    if (unitId !== UNIT_ALL_VALUE) {
        for (const st of levelStates) {
            levelByUserId.set(st.userId, st.levelCurrent);
        }
    } else {
        const levelsPerUser = new Map<string, CustomerLevel[]>();
        for (const st of levelStates) {
            const arr = levelsPerUser.get(st.userId) ?? [];
            arr.push(st.levelCurrent);
            levelsPerUser.set(st.userId, arr);
        }

        for (const [userId, levels] of levelsPerUser.entries()) {
            levelByUserId.set(userId, pickHighestLevel(levels));
        }
    }

    const appointments = await prisma.appointment.findMany({
        where: {
            companyId,
            clientId: { in: candidateIds },
            ...(unitId !== UNIT_ALL_VALUE ? { unitId } : {}),
        },
        select: {
            clientId: true,
            status: true,
            scheduleAt: true,
            servicePriceAtTheTime: true,
            clientPlanId: true,
        },
    });

    const clientPlans = await prisma.clientPlan.findMany({
        where: {
            companyId,
            clientId: { in: candidateIds },
        },
        select: {
            clientId: true,
            status: true,
            expiresAt: true,
            planPriceSnapshot: true,
        },
    });

    const completedOrders = await prisma.order.findMany({
        where: {
            companyId,
            clientId: { in: candidateIds },
            status: 'COMPLETED',
            ...(unitId !== UNIT_ALL_VALUE ? { unitId } : {}),
        },
        select: {
            clientId: true,
            totalAmount: true,
        },
    });

    const appointmentsByClientId = new Map<
        string,
        {
            status: string;
            scheduleAt: Date;
            servicePriceAtTheTime: unknown;
            clientPlanId: string | null;
        }[]
    >();

    for (const apt of appointments) {
        const arr = appointmentsByClientId.get(apt.clientId) ?? [];
        arr.push({
            status: apt.status,
            scheduleAt: apt.scheduleAt,
            servicePriceAtTheTime: apt.servicePriceAtTheTime,
            clientPlanId: apt.clientPlanId ?? null,
        });
        appointmentsByClientId.set(apt.clientId, arr);
    }

    const plansByClientId = new Map<
        string,
        {
            status: string;
            expiresAt: Date;
            planPriceSnapshot: unknown;
        }[]
    >();

    for (const cp of clientPlans) {
        const arr = plansByClientId.get(cp.clientId) ?? [];
        arr.push({
            status: cp.status,
            expiresAt: cp.expiresAt,
            planPriceSnapshot: cp.planPriceSnapshot,
        });
        plansByClientId.set(cp.clientId, arr);
    }

    const ordersByClientId = new Map<string, number>();
    for (const order of completedOrders) {
        const key = String(order.clientId ?? '');
        const current = ordersByClientId.get(key) ?? 0;
        ordersByClientId.set(key, current + Number(order.totalAmount ?? 0));
    }

    const now = new Date();

    return candidateUsers.filter((user) => {
        const userLevel = levelByUserId.get(user.id) ?? 'BRONZE';
        if (level !== 'all' && userLevel !== level) return false;

        const userPlans = plansByClientId.get(user.id) ?? [];
        const hasActivePlan = userPlans.some(
            (cp) => cp.status === 'ACTIVE' && cp.expiresAt >= now
        );

        if (plan === 'with_active_plan' && !hasActivePlan) return false;
        if (plan === 'without_active_plan' && hasActivePlan) return false;

        const userAppointments = appointmentsByClientId.get(user.id) ?? [];
        const doneAppointments = userAppointments.filter(
            (apt) => apt.status === 'DONE'
        );

        const doneDates = doneAppointments.map((apt) => apt.scheduleAt);
        const lastDoneDate =
            doneDates.length > 0
                ? new Date(Math.max(...doneDates.map((d) => d.getTime())))
                : null;

        if (!matchesLastVisitFilter(lastDoneDate, lastVisit, now)) {
            return false;
        }

        const frequencyKey = buildFrequencyKey(doneDates);
        if (!matchesFrequencyFilter(frequencyKey, frequency)) {
            return false;
        }

        const totalFromAppointments = doneAppointments.reduce((sum, apt) => {
            if (apt.clientPlanId) return sum;
            return sum + Number(apt.servicePriceAtTheTime ?? 0);
        }, 0);

        const totalFromPlans = userPlans.reduce((sum, cp) => {
            return sum + Number(cp.planPriceSnapshot ?? 0);
        }, 0);

        const totalFromOrders = ordersByClientId.get(user.id) ?? 0;
        const totalSpent =
            totalFromAppointments + totalFromPlans + totalFromOrders;

        if (minSpent > 0 && totalSpent < minSpent) return false;
        if (!user.pushDevices?.length) return false;

        return true;
    });
}

export async function POST(request: Request) {
    const session = await requireAdminForModuleApi('COMMUNICATION');
    if (session instanceof NextResponse) return session;

    const companyId = String(session.companyId ?? '').trim();
    if (!companyId) {
        return jsonError('Empresa não encontrada na sessão.', 401);
    }

    const body = (await request.json().catch(() => null)) as {
        title?: unknown;
        message?: unknown;
        filters?: CampaignAudienceFilters;
    } | null;

    const title = String(body?.title ?? '').trim();
    if (!title) {
        return jsonError('O título é obrigatório.');
    }

    const message = String(body?.message ?? '').trim();
    if (!message) {
        return jsonError('A mensagem é obrigatória.');
    }

    const audience = await resolveAudience(companyId, body?.filters ?? {});
    if (audience.length === 0) {
        return jsonError('Nenhum cliente elegível encontrado para envio.');
    }

    const creditResult = await consumeWhatsappCampaignCredit(companyId);
    if (!creditResult.ok) {
        return jsonError(
            'Sem créditos disponíveis para enviar esta campanha.',
            402
        );
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const client of audience) {
        const communicationLog = await prisma.communicationLog.create({
            data: {
                companyId,
                channel: 'PUSH',
                type: 'MANUAL',
                content: message,
                status: 'FAILED', // atualiza depois conforme resultado real
                consumedCredit: false, // crédito já foi consumido na campanha
                sentAt: new Date(),
            },
            select: {
                id: true,
            },
        });

        const sendResult = await sendPushToUsers({
            companyId,
            communicationLogId: communicationLog.id,
            userIds: [client.id],
            title,
            body: message,
        });

        const isSuccess = sendResult.ok && sendResult.totalDevices > 0;

        if (isSuccess) {
            sentCount += 1;
        } else {
            failedCount += 1;
        }

        await prisma.communicationLog.update({
            where: {
                id: communicationLog.id,
            },
            data: {
                status: isSuccess ? 'SENT' : 'FAILED',
                sentAt: new Date(),
            },
        });
    }

    await prisma.communicationLog.create({
        data: {
            companyId,
            channel: 'PUSH',
            type: 'MANUAL',
            content: message,
            status: failedCount === 0 ? 'SENT' : 'PARTIAL',
            consumedCredit: true,
            sentAt: new Date(),
        },
    });

    return NextResponse.json({
        ok: true,
        data: {
            sentCount,
            failedCount,
            audienceCount: audience.length,
            creditMode: creditResult.mode,
            remainingCredits: creditResult.remainingCredits,
        },
    });
}
