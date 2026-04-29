// src/app/api/professional/appointments/[appointmentId]/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireProfessionalSession } from '@/lib/professional-permissions';
import {
    AppointmentPlanUsageType,
    ProfessionalDailyAvailabilityType,
    Prisma,
} from '@prisma/client';

function jsonErr(
    message: string,
    status = 400,
    extra?: Record<string, unknown>
) {
    return NextResponse.json(
        { ok: false, error: message, ...(extra ?? {}) },
        { status }
    );
}

function jsonOk(data: unknown, status = 200) {
    return NextResponse.json({ ok: true, data }, { status });
}

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

type AppointmentStatus = 'PENDING' | 'DONE' | 'CANCELED';

type PatchBody =
    | {
          action?: 'cancel' | 'done';
          status?: AppointmentStatus;
          confirmCancelFeeCharge?: boolean | null;
          confirmPlanCreditDebit?: boolean | null;
      }
    | {
          clientId: string;
          clientName: string;
          phone: string;
          unitId: string;
          professionalId: string;
          serviceId: string;
          description?: string;
          scheduleAt: string;
      };

type Ctx = {
    params: Promise<{
        appointmentId: string;
    }>;
};

function resolveNextStatus(body: any): AppointmentStatus | null {
    const action = normalizeString(body?.action).toLowerCase();
    const status = normalizeString(body?.status).toUpperCase();

    if (action === 'cancel') return 'CANCELED';
    if (action === 'done') return 'DONE';

    if (status === 'PENDING' || status === 'DONE' || status === 'CANCELED') {
        return status as AppointmentStatus;
    }

    return null;
}

function isEditPayload(
    body: any
): body is Extract<PatchBody, { clientId: string }> {
    return (
        body &&
        typeof body === 'object' &&
        'clientId' in body &&
        'unitId' in body &&
        'professionalId' in body &&
        'serviceId' in body &&
        'scheduleAt' in body
    );
}

function parseISODate(value: unknown): Date | null {
    const s = normalizeString(value);
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

/* ---------------------------------------------------------
 * ✅ Decimal-safe helpers
 * ---------------------------------------------------------*/
function toNumberDecimal(v: unknown): number {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;

    if (typeof v === 'string') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : NaN;
    }

    if (typeof v === 'object') {
        const anyObj = v as any;
        if (typeof anyObj.toNumber === 'function') {
            const n = anyObj.toNumber();
            return Number.isFinite(n) ? n : NaN;
        }
        if (typeof anyObj.toString === 'function') {
            const n = Number(String(anyObj.toString()).replace(',', '.'));
            return Number.isFinite(n) ? n : NaN;
        }
    }

    return NaN;
}

function money(n: unknown): number {
    const v = toNumberDecimal(n);
    if (!Number.isFinite(v)) return 0;
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

function pct(n: unknown): number {
    const v = toNumberDecimal(n);
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, v));
}

function getBooleanOrNull(v: unknown): boolean | null {
    if (v === true) return true;
    if (v === false) return false;
    return null;
}

/* ---------------------------------------------------------
 * ✅ Segurança: acesso do profissional à unidade
 * ---------------------------------------------------------*/
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

/* ---------------------------------------------------------
 * ✅ Cancelamento com taxa
 * ---------------------------------------------------------*/
type CancellationFeePreview =
    | {
          shouldPrompt: false;
      }
    | {
          shouldPrompt: true;
          originalServicePrice: number;
          cancelFeePercentage: number;
          cancelFeeValue: number;
          professionalPercentage: number;
          professionalCommissionValue: number;
          serviceName: string;
          cancelLimitHours: number;
      };

function buildCancellationFeePreview(args: {
    scheduleAt: Date;
    serviceName: string;
    servicePriceAtTheTime: unknown;
    servicePriceCurrent: unknown;
    cancelLimitHours: unknown;
    cancelFeePercentage: unknown;
    professionalPercentageAtTheTime: unknown;
    professionalPercentageCurrent: unknown;
}): CancellationFeePreview {
    const cancelLimitHours = Math.trunc(Number(args.cancelLimitHours ?? 0));
    const cancelFeePercentage = pct(args.cancelFeePercentage);

    const originalServicePrice = money(
        args.servicePriceAtTheTime ?? args.servicePriceCurrent
    );

    const professionalPercentage = pct(
        args.professionalPercentageAtTheTime ??
            args.professionalPercentageCurrent
    );

    if (
        !Number.isFinite(cancelLimitHours) ||
        cancelLimitHours <= 0 ||
        cancelFeePercentage <= 0 ||
        originalServicePrice <= 0
    ) {
        return { shouldPrompt: false };
    }

    const now = new Date();
    const limitDate = new Date(
        args.scheduleAt.getTime() - cancelLimitHours * 60 * 60 * 1000
    );

    const isLateCancellation = now > limitDate;

    if (!isLateCancellation) {
        return { shouldPrompt: false };
    }

    const cancelFeeValue = money(
        originalServicePrice * (cancelFeePercentage / 100)
    );

    if (cancelFeeValue <= 0) {
        return { shouldPrompt: false };
    }

    const professionalCommissionValue = money(
        cancelFeeValue * (professionalPercentage / 100)
    );

    return {
        shouldPrompt: true,
        originalServicePrice,
        cancelFeePercentage,
        cancelFeeValue,
        professionalPercentage,
        professionalCommissionValue,
        serviceName: args.serviceName || 'Atendimento',
        cancelLimitHours,
    };
}

type PlanCreditDebitPreview =
    | {
          shouldPrompt: false;
      }
    | {
          shouldPrompt: true;
          serviceName: string;
          creditsAvailable: number;
          creditsToConsume: number;
      };

async function buildPlanCreditDebitPreviewWithBalance(args: {
    tx: Prisma.TransactionClient | typeof prisma;
    companyId: string;
    planUsageType: AppointmentPlanUsageType | null | undefined;
    clientPlanServiceBalanceId: string | null | undefined;
    serviceName: string;
}): Promise<PlanCreditDebitPreview> {
    const usesPlanCredit =
        args.planUsageType === AppointmentPlanUsageType.PLAN_CREDIT;

    if (!usesPlanCredit || !args.clientPlanServiceBalanceId) {
        return { shouldPrompt: false };
    }

    const balance = await args.tx.clientPlanServiceBalance.findFirst({
        where: {
            id: args.clientPlanServiceBalanceId,
            companyId: args.companyId,
        },
        select: {
            creditsTotal: true,
            creditsUsed: true,
        },
    });

    if (!balance) {
        return { shouldPrompt: false };
    }

    const total = Number(balance.creditsTotal ?? 0);
    const used = Number(balance.creditsUsed ?? 0);
    const available = Math.max(0, total - used);

    return {
        shouldPrompt: true,
        serviceName: args.serviceName || 'Atendimento',
        creditsAvailable: available,
        creditsToConsume: 1,
    };
}

/* ---------------------------------------------------------
 * ✅ Disponibilidade
 * ---------------------------------------------------------*/
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

function intervalsOverlap(
    aStart: number,
    aEnd: number,
    bStart: number,
    bEnd: number
) {
    return aStart < bEnd && bStart < aEnd;
}

function formatHHmmInSaoPaulo(date: Date) {
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date);

    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return `${hh}:${mm}`;
}

async function ensureBusinessAvailability(args: {
    companyId: string;
    unitId: string;
    professionalId: string;
    scheduleAt: Date;
    durationMinutes: number;
    appointmentIdToIgnore?: string | null;
}): Promise<string | null> {
    const { companyId, unitId, professionalId, scheduleAt } = args;
    const dur = clampDurationMin(args.durationMinutes, 15);
    const appointmentIdToIgnore = args.appointmentIdToIgnore ?? null;

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

    const busy = await prisma.appointment.findMany({
        where: {
            companyId,
            unitId,
            professionalId,
            scheduleAt: { gte: startUtc, lte: endUtc },
            status: { in: ['PENDING', 'DONE'] },
            confirmationStatus: { not: 'CANCELED' },
            ...(appointmentIdToIgnore
                ? { id: { not: appointmentIdToIgnore } }
                : {}),
        },
        select: {
            scheduleAt: true,
            service: { select: { durationMinutes: true } },
        },
    });

    const busyIntervals = busy.map((a) => {
        const startHHmm = formatHHmmInSaoPaulo(new Date(a.scheduleAt));
        const sMins = timeToMinutes(startHHmm);
        const dMins = clampDurationMin(a.service?.durationMinutes ?? 15, 15);
        return { startMins: sMins, endMins: sMins + dMins };
    });

    for (const b of busyIntervals) {
        if (intervalsOverlap(startMin, endMin, b.startMins, b.endMins)) {
            return 'Horário indisponível para este profissional (já existe agendamento neste período)';
        }
    }

    return null;
}

export async function PATCH(request: Request, ctx: Ctx) {
    try {
        const session = await requireProfessionalSession();
        const companyId = normalizeString(session.companyId);
        const professionalId = normalizeString(session.professionalId);
        const userId = normalizeString(session.userId);

        if (!companyId || !professionalId || !userId) {
            return jsonErr('Sessão do profissional inválida.', 401);
        }

        const { appointmentId: appointmentIdRaw } = await ctx.params;
        const appointmentId = normalizeString(appointmentIdRaw);
        if (!appointmentId) return jsonErr('appointmentId é obrigatório.', 400);

        const body = (await request
            .json()
            .catch(() => null)) as PatchBody | null;
        if (!body) return jsonErr('Body inválido.');

        const appt = await prisma.appointment.findFirst({
            where: {
                id: appointmentId,
                companyId,
                professionalId,
            },
            select: {
                id: true,
                unitId: true,
                status: true,
                confirmationStatus: true,

                clientId: true,
                clientName: true,
                professionalId: true,
                serviceId: true,
                description: true,
                scheduleAt: true,

                clientPlanId: true,
                clientPlanServiceBalanceId: true,
                planUsageType: true,
                planCreditDebitedAt: true,

                servicePriceAtTheTime: true,
                professionalPercentageAtTheTime: true,
                professionalEarningValue: true,

                cancelFeeApplied: true,
                cancelFeeValue: true,
            },
        });

        if (!appt) return jsonErr('Agendamento não encontrado.', 404);

        const hasUnitAccess = await assertProfessionalUnitAccess({
            companyId,
            professionalId,
            unitId: appt.unitId,
        });
        if (!hasUnitAccess) {
            return jsonErr('Sem acesso a esta unidade.', 403);
        }

        const nextStatus = resolveNextStatus(body as any);
        if (nextStatus) {
            if (appt.status === nextStatus) {
                if (nextStatus === 'DONE') {
                    const existingOrder = await prisma.order.findFirst({
                        where: {
                            companyId,
                            appointmentId: appt.id,
                        },
                        select: {
                            id: true,
                            status: true,
                            totalAmount: true,
                        },
                    });

                    return jsonOk({
                        id: appt.id,
                        status: appt.status,
                        order: existingOrder
                            ? {
                                  id: existingOrder.id,
                                  status: existingOrder.status,
                                  totalAmount: existingOrder.totalAmount,
                              }
                            : null,
                        orderCreated: false,
                    });
                }

                if (nextStatus === 'CANCELED') {
                    const existingCharge =
                        await prisma.cancellationCharge.findUnique({
                            where: { appointmentId: appt.id },
                            select: {
                                id: true,
                                status: true,
                                cancelFeeValue: true,
                                cancelFeePercentageSnapshot: true,
                                originalServicePrice: true,
                                professionalPercentageSnapshot: true,
                                professionalCommissionValue: true,
                            },
                        });

                    return jsonOk({
                        id: appt.id,
                        status: appt.status,
                        cancellationCharge: existingCharge,
                    });
                }

                return jsonOk({ id: appt.id, status: appt.status });
            }

            if (nextStatus === 'CANCELED') {
                const cancelFeeDecision = getBooleanOrNull(
                    (body as any)?.confirmCancelFeeCharge
                );

                const cancelPlanCreditDecision = getBooleanOrNull(
                    (body as any)?.confirmPlanCreditDebit
                );

                const service = appt.serviceId
                    ? await prisma.service.findFirst({
                          where: {
                              id: appt.serviceId,
                              companyId,
                          },
                          select: {
                              id: true,
                              name: true,
                              price: true,
                              cancelLimitHours: true,
                              cancelFeePercentage: true,
                              professionalPercentage: true,
                          },
                      })
                    : null;

                const resolvedServiceName =
                    service?.name ?? appt.description ?? 'Atendimento';

                const feePreview = buildCancellationFeePreview({
                    scheduleAt: appt.scheduleAt,
                    serviceName: resolvedServiceName,
                    servicePriceAtTheTime: appt.servicePriceAtTheTime,
                    servicePriceCurrent: service?.price,
                    cancelLimitHours: service?.cancelLimitHours,
                    cancelFeePercentage: service?.cancelFeePercentage,
                    professionalPercentageAtTheTime:
                        appt.professionalPercentageAtTheTime,
                    professionalPercentageCurrent:
                        service?.professionalPercentage,
                });

                const planCreditPreview =
                    await buildPlanCreditDebitPreviewWithBalance({
                        tx: prisma,
                        companyId,
                        planUsageType: appt.planUsageType,
                        clientPlanServiceBalanceId:
                            appt.clientPlanServiceBalanceId,
                        serviceName: resolvedServiceName,
                    });

                if (
                    planCreditPreview.shouldPrompt &&
                    cancelPlanCreditDecision === null
                ) {
                    return jsonErr(
                        'Este agendamento usa crédito de plano. Deseja debitar o crédito mesmo com o cancelamento?',
                        409,
                        {
                            requiresPlanCreditConfirmation: true,
                            planCreditPreview: {
                                serviceName: planCreditPreview.serviceName,
                                creditsAvailable:
                                    planCreditPreview.creditsAvailable,
                                creditsToConsume:
                                    planCreditPreview.creditsToConsume,
                            },
                        }
                    );
                }

                if (
                    !planCreditPreview.shouldPrompt &&
                    feePreview.shouldPrompt &&
                    cancelFeeDecision === null
                ) {
                    return jsonErr(
                        'Este agendamento poderá ser cobrado com taxa de cancelamento.',
                        409,
                        {
                            requiresCancellationFeeConfirmation: true,
                            cancellationFeePreview: {
                                originalServicePrice:
                                    feePreview.originalServicePrice,
                                cancelFeePercentage:
                                    feePreview.cancelFeePercentage,
                                cancelFeeValue: feePreview.cancelFeeValue,
                                professionalPercentage:
                                    feePreview.professionalPercentage,
                                professionalCommissionValue:
                                    feePreview.professionalCommissionValue,
                                serviceName: feePreview.serviceName,
                                cancelLimitHours: feePreview.cancelLimitHours,
                            },
                        }
                    );
                }

                const now = new Date();

                const result = await prisma.$transaction(async (tx) => {
                    let planCreditDebitedAt: Date | null = null;

                    if (
                        planCreditPreview.shouldPrompt &&
                        cancelPlanCreditDecision === true
                    ) {
                        const freshAppt = await tx.appointment.findFirst({
                            where: {
                                id: appt.id,
                                companyId,
                            },
                            select: {
                                id: true,
                                planCreditDebitedAt: true,
                                clientPlanServiceBalanceId: true,
                            },
                        });

                        if (!freshAppt) {
                            throw new Error('Agendamento não encontrado.');
                        }

                        if (freshAppt.planCreditDebitedAt) {
                            throw new Error(
                                'O crédito deste plano já foi debitado para este agendamento.'
                            );
                        }

                        const balance =
                            await tx.clientPlanServiceBalance.findFirst({
                                where: {
                                    id:
                                        freshAppt.clientPlanServiceBalanceId ??
                                        undefined,
                                    companyId,
                                },
                                select: {
                                    id: true,
                                    creditsTotal: true,
                                    creditsUsed: true,
                                    creditsRemaining: true,
                                },
                            });

                        if (!balance) {
                            throw new Error(
                                'Saldo do plano não encontrado para este agendamento.'
                            );
                        }

                        const remaining = Number(balance.creditsRemaining ?? 0);

                        if (remaining <= 0) {
                            throw new Error(
                                'Não há créditos disponíveis para debitar neste plano.'
                            );
                        }

                        await tx.clientPlanServiceBalance.update({
                            where: { id: balance.id },
                            data: {
                                creditsUsed: {
                                    increment: 1,
                                },
                                creditsRemaining: {
                                    decrement: 1,
                                },
                            },
                        });

                        planCreditDebitedAt = now;
                    }

                    const updated = await tx.appointment.update({
                        where: { id: appt.id },
                        data: {
                            status: 'CANCELED',
                            cancelledAt: now,
                            cancelledByRole: 'PROFESSIONAL',
                            cancelledByUserId: userId,
                            planCreditDebitedAt,

                            cancelFeeApplied:
                                !planCreditPreview.shouldPrompt &&
                                feePreview.shouldPrompt &&
                                cancelFeeDecision === true,

                            cancelFeeValue:
                                !planCreditPreview.shouldPrompt &&
                                feePreview.shouldPrompt &&
                                cancelFeeDecision === true
                                    ? (feePreview.cancelFeeValue as any)
                                    : null,
                        },
                        select: {
                            id: true,
                            status: true,
                            cancelFeeApplied: true,
                            cancelFeeValue: true,
                        },
                    });

                    let cancellationCharge: {
                        id: string;
                        status: string;
                        cancelFeeValue: unknown;
                        cancelFeePercentageSnapshot: unknown;
                        originalServicePrice: unknown;
                        professionalPercentageSnapshot: unknown;
                        professionalCommissionValue: unknown;
                    } | null = null;

                    if (
                        !planCreditPreview.shouldPrompt &&
                        feePreview.shouldPrompt &&
                        cancelFeeDecision === true
                    ) {
                        const existingCharge =
                            await tx.cancellationCharge.findUnique({
                                where: { appointmentId: appt.id },
                                select: {
                                    id: true,
                                    status: true,
                                    cancelFeeValue: true,
                                    cancelFeePercentageSnapshot: true,
                                    originalServicePrice: true,
                                    professionalPercentageSnapshot: true,
                                    professionalCommissionValue: true,
                                },
                            });

                        if (existingCharge) {
                            cancellationCharge = existingCharge;
                        } else {
                            cancellationCharge =
                                await tx.cancellationCharge.create({
                                    data: {
                                        companyId,
                                        unitId: appt.unitId,
                                        clientId: appt.clientId,
                                        appointmentId: appt.id,
                                        serviceId: appt.serviceId ?? null,
                                        professionalId:
                                            appt.professionalId ?? null,
                                        originalServicePrice:
                                            feePreview.originalServicePrice as any,
                                        cancelFeePercentageSnapshot:
                                            feePreview.cancelFeePercentage as any,
                                        cancelFeeValue:
                                            feePreview.cancelFeeValue as any,
                                        professionalPercentageSnapshot:
                                            feePreview.professionalPercentage as any,
                                        professionalCommissionValue:
                                            feePreview.professionalCommissionValue as any,
                                        status: 'PENDING',
                                    },
                                    select: {
                                        id: true,
                                        status: true,
                                        cancelFeeValue: true,
                                        cancelFeePercentageSnapshot: true,
                                        originalServicePrice: true,
                                        professionalPercentageSnapshot: true,
                                        professionalCommissionValue: true,
                                    },
                                });
                        }
                    }

                    return {
                        appointment: updated,
                        cancellationCharge,
                    };
                });

                return jsonOk({
                    id: result.appointment.id,
                    status: result.appointment.status,
                    cancelFeeApplied: result.appointment.cancelFeeApplied,
                    cancelFeeValue: result.appointment.cancelFeeValue,
                    cancellationCharge: result.cancellationCharge,
                });
            }

            if (nextStatus === 'DONE') {
                if (appt.status !== 'PENDING') {
                    return jsonErr(
                        'Só é possível concluir agendamentos pendentes.',
                        400
                    );
                }

                if (appt.confirmationStatus === 'CANCELED') {
                    return jsonErr(
                        'Este agendamento foi cancelado pelo cliente e precisa de finalização administrativa, não podendo ser concluído.',
                        400
                    );
                }

                const now = new Date();

                const result = await prisma.$transaction(async (tx) => {
                    if (
                        appt.planUsageType ===
                            AppointmentPlanUsageType.PLAN_CREDIT &&
                        (!appt.clientPlanId || !appt.clientPlanServiceBalanceId)
                    ) {
                        throw new Error(
                            'Este agendamento está marcado para uso de plano, mas não possui vínculo válido com o saldo do plano.'
                        );
                    }

                    const service = appt.serviceId
                        ? await tx.service.findFirst({
                              where: { id: appt.serviceId, companyId },
                              select: {
                                  id: true,
                                  name: true,
                                  price: true,
                                  professionalPercentage: true,
                                  isActive: true,
                              },
                          })
                        : null;

                    const frozenServicePrice =
                        appt.servicePriceAtTheTime != null
                            ? appt.servicePriceAtTheTime
                            : (service?.price ?? null);

                    const frozenPct =
                        appt.professionalPercentageAtTheTime != null
                            ? appt.professionalPercentageAtTheTime
                            : (service?.professionalPercentage ?? null);

                    const frozenPriceNum =
                        frozenServicePrice != null
                            ? money(frozenServicePrice)
                            : 0;

                    const frozenPctNum = frozenPct != null ? pct(frozenPct) : 0;

                    const earningValue =
                        frozenServicePrice != null && frozenPct != null
                            ? money((frozenPriceNum * frozenPctNum) / 100)
                            : null;

                    const updatedAppt = await tx.appointment.update({
                        where: { id: appt.id },
                        data: {
                            status: 'DONE',
                            doneAt: now,
                            concludedByRole: 'PROFESSIONAL',
                            concludedByUserId: userId,

                            servicePriceAtTheTime:
                                appt.servicePriceAtTheTime != null
                                    ? undefined
                                    : (frozenServicePrice ?? undefined),

                            professionalPercentageAtTheTime:
                                appt.professionalPercentageAtTheTime != null
                                    ? undefined
                                    : (frozenPct ?? undefined),

                            professionalEarningValue:
                                appt.professionalEarningValue != null
                                    ? undefined
                                    : (earningValue ?? undefined),
                        },
                        select: {
                            id: true,
                            status: true,
                            unitId: true,
                            clientId: true,
                            professionalId: true,
                            serviceId: true,
                        },
                    });

                    const existingOrder = await tx.order.findFirst({
                        where: {
                            companyId,
                            appointmentId: updatedAppt.id,
                        },
                        select: { id: true },
                    });

                    let orderCreated = false;

                    const orderId = existingOrder?.id
                        ? existingOrder.id
                        : (
                              await tx.order.create({
                                  data: {
                                      companyId,
                                      unitId: updatedAppt.unitId,
                                      appointmentId: updatedAppt.id,
                                      clientId: updatedAppt.clientId ?? null,
                                      professionalId:
                                          updatedAppt.professionalId ?? null,
                                      status: 'PENDING',
                                      totalAmount: 0,
                                  },
                                  select: { id: true },
                              })
                          ).id;

                    if (!existingOrder?.id) orderCreated = true;

                    if (updatedAppt.serviceId) {
                        const alreadyHasServiceItem =
                            await tx.orderItem.findFirst({
                                where: {
                                    companyId,
                                    orderId,
                                    serviceId: updatedAppt.serviceId,
                                    itemType: 'SERVICE',
                                },
                                select: { id: true },
                            });

                        if (!alreadyHasServiceItem) {
                            const unitPrice =
                                frozenServicePrice ?? service?.price;

                            if (unitPrice != null) {
                                await tx.orderItem.create({
                                    data: {
                                        companyId,
                                        orderId,
                                        itemType: 'SERVICE',
                                        serviceId: updatedAppt.serviceId,
                                        descriptionSnapshot:
                                            appt.description ?? 'Atendimento',
                                        sourceAppointmentId: appt.id,
                                        quantity: 1,
                                        unitPrice: unitPrice as any,
                                        totalPrice: unitPrice as any,
                                        professionalId:
                                            updatedAppt.professionalId ?? null,
                                    },
                                    select: { id: true },
                                });
                            }
                        }
                    }

                    const pendingCancellationCharges =
                        await tx.cancellationCharge.findMany({
                            where: {
                                companyId,
                                clientId: updatedAppt.clientId,
                                unitId: updatedAppt.unitId,
                                status: 'PENDING',
                            },
                            select: {
                                id: true,
                                appointmentId: true,
                                serviceId: true,
                                professionalId: true,
                                cancelFeeValue: true,
                                cancelFeePercentageSnapshot: true,
                                professionalPercentageSnapshot: true,
                                professionalCommissionValue: true,
                                appointment: {
                                    select: {
                                        description: true,
                                    },
                                },
                                service: {
                                    select: {
                                        name: true,
                                    },
                                },
                            },
                        });

                    for (const charge of pendingCancellationCharges) {
                        const alreadyLinkedCharge =
                            await tx.cancellationCharge.findFirst({
                                where: {
                                    id: charge.id,
                                    companyId,
                                    orderItemId: {
                                        not: null,
                                    },
                                },
                                select: {
                                    id: true,
                                    orderItemId: true,
                                },
                            });

                        if (alreadyLinkedCharge) continue;

                        const descriptionSnapshot =
                            normalizeString(charge.service?.name) ||
                            normalizeString(charge.appointment?.description) ||
                            `Taxa de cancelamento do agendamento ${charge.appointmentId}`;

                        const createdOrderItem = await tx.orderItem.create({
                            data: {
                                companyId,
                                orderId,
                                itemType: 'CANCELLATION_FEE',
                                quantity: 1,
                                unitPrice: charge.cancelFeeValue as any,
                                totalPrice: charge.cancelFeeValue as any,
                                descriptionSnapshot,
                                sourceAppointmentId: charge.appointmentId,
                                feePercentageSnapshot:
                                    charge.cancelFeePercentageSnapshot as any,
                                professionalId: charge.professionalId ?? null,
                                commissionBasePrice:
                                    charge.cancelFeeValue as any,
                                professionalPercentageAtTime:
                                    charge.professionalPercentageSnapshot as any,
                                professionalCommissionAmount:
                                    charge.professionalCommissionValue as any,
                            },
                            select: { id: true },
                        });

                        await tx.cancellationCharge.update({
                            where: {
                                id: charge.id,
                            },
                            data: {
                                orderItemId: createdOrderItem.id,
                                status: 'ATTACHED_TO_ORDER',
                            },
                        });
                    }

                    const items = await tx.orderItem.findMany({
                        where: { companyId, orderId },
                        select: { totalPrice: true },
                    });

                    const total = money(
                        (items ?? []).reduce(
                            (sum, it) => sum + money(it.totalPrice),
                            0
                        )
                    );

                    const updatedOrder = await tx.order.update({
                        where: { id: orderId },
                        data: { totalAmount: total as any },
                        select: { id: true, status: true, totalAmount: true },
                    });

                    return {
                        appointment: updatedAppt,
                        order: updatedOrder,
                        orderCreated,
                    };
                });

                return jsonOk({
                    id: result.appointment.id,
                    status: result.appointment.status,
                    order: result.order,
                    orderCreated: result.orderCreated,
                });
            }

            const updated = await prisma.appointment.update({
                where: { id: appt.id },
                data: { status: nextStatus },
                select: { id: true, status: true },
            });

            return jsonOk({ id: updated.id, status: updated.status });
        }

        if (!isEditPayload(body)) {
            return jsonErr(
                'Body inválido. Use { action: "cancel" | "done" } para status, ou envie dados de edição (clientId, unitId, professionalId, serviceId, scheduleAt...).',
                400
            );
        }

        if (appt.status !== 'PENDING') {
            return jsonErr('Só é possível editar agendamentos pendentes.', 400);
        }

        if (appt.confirmationStatus === 'CANCELED') {
            return jsonErr(
                'Este agendamento foi cancelado pelo cliente e aguarda finalização administrativa, não podendo ser editado.',
                400
            );
        }

        const clientId = normalizeString((body as any).clientId);
        const clientName = normalizeString((body as any).clientName);
        const phone = normalizeString((body as any).phone);

        const unitId = normalizeString((body as any).unitId);
        const serviceId = normalizeString((body as any).serviceId);

        const scheduleAt = parseISODate((body as any).scheduleAt);
        if (!scheduleAt) return jsonErr('scheduleAt inválido.', 400);

        if (!clientId) return jsonErr('clientId é obrigatório.', 400);
        if (!clientName) return jsonErr('clientName é obrigatório.', 400);
        if (!phone) return jsonErr('phone é obrigatório.', 400);
        if (!unitId) return jsonErr('unitId é obrigatório.', 400);
        if (!serviceId) return jsonErr('serviceId é obrigatório.', 400);

        const hasAccessToTargetUnit = await assertProfessionalUnitAccess({
            companyId,
            professionalId,
            unitId,
        });
        if (!hasAccessToTargetUnit) {
            return jsonErr('Sem acesso a esta unidade.', 403);
        }

        const clientUser = await prisma.user.findFirst({
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
        if (!clientUser) return jsonErr('Cliente não encontrado.', 404);

        const service = await prisma.service.findFirst({
            where: {
                id: serviceId,
                companyId,
                isActive: true,
                OR: [{ unitId }, { unitId: null }],
            },
            select: {
                id: true,
                name: true,
                durationMinutes: true,
            },
        });

        if (!service)
            return jsonErr('Serviço inválido para esta unidade.', 400);

        const durationMinutes = clampDurationMin(
            service.durationMinutes ?? 15,
            15
        );

        const block = await ensureBusinessAvailability({
            companyId,
            unitId,
            professionalId,
            scheduleAt,
            durationMinutes,
            appointmentIdToIgnore: appt.id,
        });

        if (block) {
            return jsonErr(block, 409);
        }

        const description =
            normalizeString((body as any).description) ||
            service.name ||
            'Atendimento';

        const updated = await prisma.appointment.update({
            where: { id: appt.id },
            data: {
                clientId,
                clientName,
                phone,

                unitId,
                professionalId,
                serviceId,
                description,
                scheduleAt,
            },
            select: {
                id: true,
                status: true,
                unitId: true,
                professionalId: true,
                serviceId: true,
                scheduleAt: true,
            },
        });

        return jsonOk(updated);
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro interno.', 500);
    }
}
