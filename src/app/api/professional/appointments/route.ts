// src/app/api/professional/appointments/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireProfessionalSession } from '@/lib/professional-permissions';
import {
    AppointmentConfirmationStatus,
    AppointmentPlanUsageType,
    ClientPlanStatus,
    ProfessionalDailyAvailabilityType,
} from '@prisma/client';

export const dynamic = 'force-dynamic';

function jsonErr(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function jsonOk(data: unknown, status = 200) {
    return NextResponse.json({ ok: true, data }, { status });
}

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function normalizeBoolean(v: unknown): boolean {
    if (typeof v === 'boolean') return v;

    const s = String(v ?? '')
        .trim()
        .toLowerCase();

    return s === 'true' || s === '1' || s === 'yes' || s === 'sim';
}

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

type Interval = { startTime: string; endTime: string };

function normalizeHHMM(v: unknown) {
    const s = String(v ?? '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return '';
    return `${pad2(Number(m[1]))}:${m[2]}`;
}

function timeToMinutes(hhmmStr: string) {
    const m = String(hhmmStr ?? '').match(/^(\d{2}):(\d{2})$/);
    if (!m) return Number.POSITIVE_INFINITY;
    return Number(m[1]) * 60 + Number(m[2]);
}

function hhmmFromMinutes(total: number) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${pad2(h)}:${pad2(m)}`;
}

function clampDurationMin(v: unknown, fallback = 15) {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.max(1, Math.round(n));
}

function normalizeIntervals(list: Interval[]) {
    return list
        .map((it) => ({
            startTime: normalizeHHMM(it.startTime),
            endTime: normalizeHHMM(it.endTime),
        }))
        .filter((it) => it.startTime && it.endTime)
        .map((it) => {
            const s = timeToMinutes(it.startTime);
            const e = timeToMinutes(it.endTime);
            return { ...it, _s: s, _e: e };
        })
        .filter(
            (it) =>
                Number.isFinite(it._s) &&
                Number.isFinite(it._e) &&
                it._e > it._s
        )
        .sort((a, b) => a._s - b._s);
}

function getWeekdayInSaoPaulo(d: Date) {
    const wd = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
    }).format(d);

    const map: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };

    return map[String(wd)] ?? d.getUTCDay();
}

function buildSaoPauloDayUtcRangeFromDate(d: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(d);

    const get = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? '';

    const y = Number(get('year'));
    const m = Number(get('month'));
    const day = Number(get('day'));

    if (!y || !m || !day) {
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(d);
        end.setHours(23, 59, 59, 999);
        return { startUtc: start, endUtc: end, dateKey: null as string | null };
    }

    const startUtc = new Date(Date.UTC(y, m - 1, day, 3, 0, 0, 0));
    const endUtc = new Date(Date.UTC(y, m - 1, day + 1, 2, 59, 59, 999));
    const dateKey = `${y}-${pad2(m)}-${pad2(day)}`;

    return { startUtc, endUtc, dateKey };
}

function dateKeyToUnitDailyUTC(dateKey: string) {
    return new Date(`${dateKey}T00:00:00.000Z`);
}

function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
    const A = normalizeIntervals(a);
    const B = normalizeIntervals(b);
    const out: Interval[] = [];

    if (!A.length || !B.length) return out;

    let i = 0;
    let j = 0;

    while (i < A.length && j < B.length) {
        const x = A[i];
        const y = B[j];

        const start = Math.max(x._s, y._s);
        const end = Math.min(x._e, y._e);

        if (end > start) {
            out.push({
                startTime: hhmmFromMinutes(start),
                endTime: hhmmFromMinutes(end),
            });
        }

        if (x._e < y._e) i++;
        else j++;
    }

    return out;
}

function subtractIntervals(
    available: Interval[],
    blocked: Interval[]
): Interval[] {
    const A = normalizeIntervals(available);
    const B = normalizeIntervals(blocked);

    if (!A.length) return [];
    if (!B.length)
        return A.map((x) => ({ startTime: x.startTime, endTime: x.endTime }));

    const out: Interval[] = [];
    let j = 0;

    for (const a of A) {
        let curStart = a._s;
        const aEnd = a._e;

        while (j < B.length && B[j]._e <= curStart) j++;

        let k = j;
        while (k < B.length && B[k]._s < aEnd) {
            const b = B[k];

            if (b._s > curStart) {
                out.push({
                    startTime: hhmmFromMinutes(curStart),
                    endTime: hhmmFromMinutes(Math.min(b._s, aEnd)),
                });
            }

            curStart = Math.max(curStart, b._e);
            if (curStart >= aEnd) break;

            k++;
        }

        if (curStart < aEnd) {
            out.push({
                startTime: hhmmFromMinutes(curStart),
                endTime: hhmmFromMinutes(aEnd),
            });
        }
    }

    return normalizeIntervals(out).map((x) => ({
        startTime: x.startTime,
        endTime: x.endTime,
    }));
}

function fitsInsideAnyInterval(
    startMin: number,
    endMin: number,
    intervals: Interval[]
) {
    const xs = normalizeIntervals(intervals);
    for (const it of xs) {
        if (startMin >= it._s && endMin <= it._e) return true;
    }
    return false;
}

function getInitialConfirmationStatus(
    scheduleAt: Date,
    reminderLeadHours: number,
    now: Date = new Date()
): AppointmentConfirmationStatus {
    const safeLeadHours = Math.max(
        1,
        Math.min(168, Number(reminderLeadHours) || 24)
    );

    const diffMs = scheduleAt.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    return diffHours >= safeLeadHours
        ? AppointmentConfirmationStatus.PENDING
        : AppointmentConfirmationStatus.NOT_REQUIRED;
}

async function assertProfessionalUnitAccess(args: {
    companyId: string;
    professionalId: string;
    unitId: string;
}) {
    const ok = await prisma.professionalUnit.findFirst({
        where: {
            companyId: args.companyId,
            professionalId: args.professionalId,
            unitId: args.unitId,
            isActive: true,
        },
        select: { id: true },
    });

    return !!ok;
}

async function ensureBusinessAvailability(args: {
    companyId: string;
    unitId: string;
    professionalId: string;
    scheduleAt: Date;
    durationMinutes: number;
}): Promise<string | null> {
    const { companyId, unitId, professionalId, scheduleAt } = args;
    const dur = clampDurationMin(args.durationMinutes, 15);

    const { startUtc, endUtc, dateKey } =
        buildSaoPauloDayUtcRangeFromDate(scheduleAt);
    const weekday = getWeekdayInSaoPaulo(scheduleAt);

    const startMin = scheduleAt.getHours() * 60 + scheduleAt.getMinutes();
    const endMin = startMin + dur;

    const weeklyUnit = await prisma.unitWeeklyAvailability.findFirst({
        where: { companyId, unitId, weekday, isActive: true },
        include: { intervals: true },
    });

    const unitWeeklyIntervals: Interval[] = (weeklyUnit?.intervals ?? [])
        .map((i) => ({ startTime: i.startTime, endTime: i.endTime }))
        .map((i) => ({
            startTime: normalizeHHMM(i.startTime),
            endTime: normalizeHHMM(i.endTime),
        }))
        .filter((i) => i.startTime && i.endTime);

    if (!unitWeeklyIntervals.length) {
        return 'Unidade sem horário de funcionamento para este dia';
    }

    let unitDaily: any = null;

    if (dateKey) {
        unitDaily = await prisma.unitDailyAvailability.findFirst({
            where: {
                companyId,
                unitId,
                date: dateKeyToUnitDailyUTC(dateKey),
            },
            include: { intervals: true },
        });
    } else {
        unitDaily = await prisma.unitDailyAvailability.findFirst({
            where: { companyId, unitId, date: { gte: startUtc, lte: endUtc } },
            include: { intervals: true },
        });
    }

    if (unitDaily?.isClosed === true) {
        return 'Esta unidade está fechada neste dia';
    }

    const unitBlocked: Interval[] = (unitDaily?.intervals ?? [])
        .map((i: any) => ({ startTime: i.startTime, endTime: i.endTime }))
        .map((i: any) => ({
            startTime: normalizeHHMM(i.startTime),
            endTime: normalizeHHMM(i.endTime),
        }))
        .filter((i: any) => i.startTime && i.endTime);

    const unitAvailable = subtractIntervals(unitWeeklyIntervals, unitBlocked);

    if (!fitsInsideAnyInterval(startMin, endMin, unitAvailable)) {
        return 'Horário indisponível nesta unidade (bloqueio/fora do funcionamento)';
    }

    const dailyProf = await prisma.professionalDailyAvailability.findFirst({
        where: {
            companyId,
            unitId,
            professionalId,
            date: { gte: startUtc, lte: endUtc },
        },
        include: { intervals: true },
    });

    if (dailyProf?.type === ProfessionalDailyAvailabilityType.DAY_OFF) {
        return 'Este profissional não atende neste dia';
    }

    let profIntervals: Interval[] = [];

    if (dailyProf?.type === ProfessionalDailyAvailabilityType.CUSTOM) {
        profIntervals = (dailyProf?.intervals ?? [])
            .map((i: any) => ({ startTime: i.startTime, endTime: i.endTime }))
            .map((i: any) => ({
                startTime: normalizeHHMM(i.startTime),
                endTime: normalizeHHMM(i.endTime),
            }))
            .filter((i: any) => i.startTime && i.endTime);
    } else {
        const weeklyProf =
            await prisma.professionalWeeklyAvailability.findFirst({
                where: {
                    companyId,
                    unitId,
                    professionalId,
                    weekday,
                    isActive: true,
                },
                include: { intervals: true },
            });

        profIntervals = (weeklyProf?.intervals ?? [])
            .map((i: any) => ({ startTime: i.startTime, endTime: i.endTime }))
            .map((i: any) => ({
                startTime: normalizeHHMM(i.startTime),
                endTime: normalizeHHMM(i.endTime),
            }))
            .filter((i: any) => i.startTime && i.endTime);
    }

    if (!profIntervals.length) {
        return 'Este profissional não possui disponibilidade para este dia';
    }

    const effective = intersectIntervals(profIntervals, unitAvailable);

    if (!fitsInsideAnyInterval(startMin, endMin, effective)) {
        return 'Horário indisponível para este profissional nesta unidade';
    }

    return null;
}

export async function GET(request: Request) {
    try {
        const session = await requireProfessionalSession();
        const companyId = normalizeString(session.companyId);
        const professionalId = normalizeString(session.professionalId);

        if (!companyId || !professionalId) {
            return jsonErr('Sessão do profissional inválida.', 401);
        }

        const url = new URL(request.url);
        const date = url.searchParams.get('date');

        const appointments = await prisma.appointment.findMany({
            where: {
                companyId,
                professionalId,
            },
            orderBy: { scheduleAt: 'asc' },
        });

        return jsonOk({ date, appointments });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro interno.', 500);
    }
}

export async function POST(request: Request) {
    try {
        const session = await requireProfessionalSession();

        const companyId = normalizeString(session.companyId);
        const professionalIdSession = normalizeString(session.professionalId);

        if (!companyId || !professionalIdSession) {
            return jsonErr('Sessão inválida.', 401);
        }

        const body = await request.json().catch(() => null);
        if (!body) return jsonErr('Body inválido.');

        const clientId = normalizeString(body.clientId);
        const clientName = normalizeString(body.clientName);
        const phone = normalizeString(body.phone);
        const unitId = normalizeString(body.unitId);
        const professionalIdRaw = normalizeString(body.professionalId);
        const serviceId = normalizeString(body.serviceId);
        const description = normalizeString(body.description);
        const scheduleAtRaw = normalizeString(body.scheduleAt);
        const usePlanCredit = normalizeBoolean(body.usePlanCredit);

        if (!clientId) return jsonErr('clientId obrigatório');
        if (!clientName) return jsonErr('clientName obrigatório');
        if (!phone) return jsonErr('phone obrigatório');
        if (!unitId) return jsonErr('unitId obrigatório');
        if (!serviceId) return jsonErr('serviceId obrigatório');
        if (!scheduleAtRaw) return jsonErr('scheduleAt obrigatório');

        if (professionalIdRaw && professionalIdRaw !== professionalIdSession) {
            return jsonErr(
                'O profissional só pode criar agendamentos para si mesmo.',
                403
            );
        }

        const scheduleAt = new Date(scheduleAtRaw);
        if (Number.isNaN(scheduleAt.getTime())) {
            return jsonErr('scheduleAt inválido');
        }

        const hasUnitAccess = await assertProfessionalUnitAccess({
            companyId,
            professionalId: professionalIdSession,
            unitId,
        });

        if (!hasUnitAccess) {
            return jsonErr('Sem acesso a esta unidade.', 403);
        }

        const unit = await prisma.unit.findFirst({
            where: { id: unitId, companyId, isActive: true },
            select: {
                id: true,
                reminderLeadHours: true,
            },
        });

        if (!unit) return jsonErr('Unidade inválida', 404);

        const client = await prisma.user.findFirst({
            where: {
                id: clientId,
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

        if (!client) return jsonErr('Cliente inválido ou inativo.', 404);

        const service = await prisma.service.findFirst({
            where: {
                id: serviceId,
                companyId,
                isActive: true,
                OR: [{ unitId }, { unitId: null }],
            },
            select: {
                id: true,
                durationMinutes: true,
            },
        });

        if (!service) return jsonErr('Serviço inválido', 404);

        const durationMinutes = clampDurationMin(
            service.durationMinutes ?? 15,
            15
        );

        const businessBlock = await ensureBusinessAvailability({
            companyId,
            unitId,
            professionalId: professionalIdSession,
            scheduleAt,
            durationMinutes,
        });

        if (businessBlock) {
            return jsonErr(businessBlock, 409);
        }

        let clientPlanId: string | null = null;
        let clientPlanServiceBalanceId: string | null = null;
        let planUsageType: AppointmentPlanUsageType =
            AppointmentPlanUsageType.NONE;

        if (usePlanCredit) {
            const now = new Date();

            const activePlan = await prisma.clientPlan.findFirst({
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
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });

            if (!activePlan) {
                return jsonErr('Cliente não possui plano ativo', 409);
            }

            const serviceBalance =
                await prisma.clientPlanServiceBalance.findFirst({
                    where: {
                        companyId,
                        clientPlanId: activePlan.id,
                        serviceId,
                    },
                    select: {
                        id: true,
                        creditsTotal: true,
                    },
                });

            if (!serviceBalance) {
                return jsonErr(
                    'Este serviço não possui créditos disponíveis no plano ativo do cliente.',
                    409
                );
            }

            const usedAppointmentsCount = await prisma.appointment.count({
                where: {
                    companyId,
                    clientPlanId: activePlan.id,
                    clientPlanServiceBalanceId: serviceBalance.id,
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
                Number(serviceBalance.creditsTotal ?? 0) - usedAppointmentsCount
            );

            if (creditsRemainingReal <= 0) {
                return jsonErr(
                    'Este serviço não possui créditos disponíveis no plano ativo do cliente.',
                    409
                );
            }

            const allowedProfessionalsCount =
                await prisma.planProfessional.count({
                    where: {
                        companyId,
                        planId: activePlan.planId,
                    },
                });

            if (allowedProfessionalsCount > 0) {
                const allowedProfessional =
                    await prisma.planProfessional.findFirst({
                        where: {
                            companyId,
                            planId: activePlan.planId,
                            professionalId: professionalIdSession,
                        },
                        select: {
                            id: true,
                        },
                    });

                if (!allowedProfessional) {
                    return jsonErr(
                        'Este profissional não está permitido para o plano ativo do cliente.',
                        409
                    );
                }
            }

            clientPlanId = activePlan.id;
            clientPlanServiceBalanceId = serviceBalance.id;
            planUsageType = AppointmentPlanUsageType.PLAN_CREDIT;
        }

        const confirmationStatus = getInitialConfirmationStatus(
            scheduleAt,
            unit.reminderLeadHours ?? 24
        );

        const created = await prisma.appointment.create({
            data: {
                companyId,
                unitId,
                clientId,
                clientName,
                phone,
                description,
                scheduleAt,
                professionalId: professionalIdSession,
                serviceId,
                confirmationStatus,

                createdByRole: 'PROFESSIONAL',
                createdSource: 'PROFESSIONAL_PANEL',
                createdByProfessionalId: professionalIdSession,

                clientPlanId,
                clientPlanServiceBalanceId,
                planUsageType,
            },
            select: { id: true },
        });

        return NextResponse.json({ ok: true, id: created.id });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro interno.', 500);
    }
}
