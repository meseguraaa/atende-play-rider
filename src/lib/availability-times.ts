// src/lib/availability-times.ts
import { prisma } from '@/lib/prisma';
import { ProfessionalDailyAvailabilityType } from '@prisma/client';

export type AvailabilityInterval = { startTime: string; endTime: string };

export type AvailabilityTimesData = {
    date: string; // yyyy-MM-dd
    unitId: string;
    professionalId: string;
    appointmentId: string | null;

    source: string;
    unitSource: string;

    intervals: AvailabilityInterval[];
    durationMinutes: number;
    times: string[];
};

export type AvailabilityTimesResult =
    | { ok: true; data: AvailabilityTimesData }
    | { ok: false; error: string; status?: number };

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function parseDateParam(
    dateStr?: string
): { y: number; m: number; d: number } | null {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return null;
    return { y, m, d };
}

function ymdToUtcDateKeyMidday(ymd: { y: number; m: number; d: number }) {
    // ✅ Exceções (professionalDailyAvailability.date) estão armazenadas como UTC 12:00Z do dia
    return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 12, 0, 0, 0));
}

function ymdToUtcDateKeyMidnight(ymd: { y: number; m: number; d: number }) {
    // ✅ Exceções da UNIDADE (unitDailyAvailability.date) estão armazenadas como UTC 00:00Z do dia
    return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 0, 0, 0, 0));
}

const SAO_PAULO_UTC_OFFSET_HOURS = 3; // SP = UTC-03 => 00:00 SP = 03:00 UTC

function normalizeSlotIntervalMinutes(v: unknown): 15 | 30 | 45 | 60 {
    const n = Number(v);
    if (n === 15 || n === 30 || n === 45 || n === 60) return n;
    return 30;
}

function buildSaoPauloDayUtcRange(ymd: { y: number; m: number; d: number }) {
    const { y, m, d } = ymd;

    const startUtcMs = Date.UTC(
        y,
        m - 1,
        d,
        SAO_PAULO_UTC_OFFSET_HOURS,
        0,
        0,
        0
    );
    const nextDayStartUtcMs = Date.UTC(
        y,
        m - 1,
        d + 1,
        SAO_PAULO_UTC_OFFSET_HOURS,
        0,
        0,
        0
    );

    return {
        startUtc: new Date(startUtcMs),
        endUtc: new Date(nextDayStartUtcMs - 1),
    };
}

function getWeekdayInSaoPaulo(ymd: {
    y: number;
    m: number;
    d: number;
}): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
    const utcMidday = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 12, 0, 0, 0));

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
    }).formatToParts(utcMidday);

    const wd = (
        parts.find((p) => p.type === 'weekday')?.value ?? ''
    ).toLowerCase();

    if (wd.startsWith('sun')) return 0;
    if (wd.startsWith('mon')) return 1;
    if (wd.startsWith('tue')) return 2;
    if (wd.startsWith('wed')) return 3;
    if (wd.startsWith('thu')) return 4;
    if (wd.startsWith('fri')) return 5;
    return 6;
}

function isValidTimeHHMM(v: string) {
    return /^\d{2}:\d{2}$/.test(v);
}

function timeToMinutes(t: string) {
    const [hh, mm] = t.split(':').map(Number);
    return hh * 60 + mm;
}

function minutesToHHmm(mins: number) {
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    return `${hh}:${mm}`;
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

function buildSlotsForDuration(
    startTime: string,
    endTime: string,
    durationMinutes: number,
    slotIntervalMinutes: number
) {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);

    const dur = Math.max(1, Number(durationMinutes || 0));
    const step = normalizeSlotIntervalMinutes(slotIntervalMinutes);

    const out: string[] = [];
    for (let m = start; m + dur <= end; m += step) {
        out.push(minutesToHHmm(m));
    }
    return out;
}

function intervalsOverlap(
    aStart: number,
    aEnd: number,
    bStart: number,
    bEnd: number
) {
    // [start, end) overlap
    return aStart < bEnd && bStart < aEnd;
}

type Interval = { startTime: string; endTime: string };

function normalizeIntervals(list: Interval[]) {
    return list
        .map((it) => ({
            startTime: String(it.startTime ?? '').trim(),
            endTime: String(it.endTime ?? '').trim(),
        }))
        .filter(
            (it) =>
                isValidTimeHHMM(it.startTime) &&
                isValidTimeHHMM(it.endTime) &&
                it.startTime < it.endTime
        )
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

/**
 * ✅ Interseção de intervalos (A ∩ B)
 */
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
                startTime: minutesToHHmm(start),
                endTime: minutesToHHmm(end),
            });
        }

        if (x._e < y._e) i++;
        else j++;
    }

    return out;
}

/**
 * ✅ Subtrai intervalos bloqueados de intervalos disponíveis: available - blocked
 * Bloqueios são "pausas", não "funcionamento".
 */
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
                    startTime: minutesToHHmm(curStart),
                    endTime: minutesToHHmm(Math.min(b._s, aEnd)),
                });
            }

            curStart = Math.max(curStart, b._e);
            if (curStart >= aEnd) break;

            k++;
        }

        if (curStart < aEnd) {
            out.push({
                startTime: minutesToHHmm(curStart),
                endTime: minutesToHHmm(aEnd),
            });
        }
    }

    return normalizeIntervals(out).map((x) => ({
        startTime: x.startTime,
        endTime: x.endTime,
    }));
}

export async function computeAvailabilityTimes(args: {
    companyId: string;

    unitId: string;
    professionalId: string;
    date: string; // yyyy-MM-dd

    serviceId?: string | null; // recomendado (pra duração)
    appointmentId?: string | null; // edição: ignora o próprio agendamento
}): Promise<AvailabilityTimesResult> {
    const companyId = normalizeString(args.companyId);
    const unitId = normalizeString(args.unitId);
    const professionalId = normalizeString(args.professionalId);
    const dateStr = normalizeString(args.date);
    const serviceId = normalizeString(args.serviceId ?? '') || '';
    const appointmentId = normalizeString(args.appointmentId ?? '') || '';

    if (!companyId)
        return { ok: false, error: 'companyId é obrigatório.', status: 400 };
    if (!unitId)
        return { ok: false, error: 'unitId é obrigatório.', status: 400 };
    if (!professionalId)
        return {
            ok: false,
            error: 'professionalId é obrigatório.',
            status: 400,
        };
    if (!dateStr)
        return {
            ok: false,
            error: 'date é obrigatório (yyyy-MM-dd).',
            status: 400,
        };

    const ymd = parseDateParam(dateStr);
    if (!ymd)
        return {
            ok: false,
            error: 'date inválido. Use yyyy-MM-dd.',
            status: 400,
        };

    // ✅ se veio appointmentId (edição), valida tenant do agendamento
    if (appointmentId) {
        const appt = await prisma.appointment.findFirst({
            where: { id: appointmentId, companyId },
            select: { id: true },
        });
        if (!appt)
            return {
                ok: false,
                error: 'Agendamento inválido para edição.',
                status: 404,
            };
    }

    // ✅ valida unidade
    const unit = await prisma.unit.findFirst({
        where: { id: unitId, companyId, isActive: true },
        select: { id: true, slotIntervalMinutes: true },
    });
    if (!unit)
        return {
            ok: false,
            error: 'Unidade inválida ou inativa.',
            status: 404,
        };

    const slotIntervalMinutes = normalizeSlotIntervalMinutes(
        unit.slotIntervalMinutes
    );

    // ✅ valida profissional na unidade
    const prof = await prisma.professional.findFirst({
        where: {
            id: professionalId,
            companyId,
            isActive: true,
            units: { some: { unitId, isActive: true } },
        },
        select: { id: true },
    });
    if (!prof)
        return {
            ok: false,
            error: 'Profissional inválido para esta unidade.',
            status: 404,
        };

    // ✅ duração desejada (do serviço selecionado)
    let desiredDurationMinutes = 15;

    if (serviceId) {
        const svc = await prisma.service.findFirst({
            where: {
                id: serviceId,
                companyId,
                isActive: true,
                OR: [{ unitId }, { unitId: null }],
            },
            select: { id: true, durationMinutes: true },
        });

        if (!svc)
            return {
                ok: false,
                error: 'Serviço inválido para esta unidade.',
                status: 404,
            };

        desiredDurationMinutes = Math.max(1, Number(svc.durationMinutes || 15));
    }

    const weekday = getWeekdayInSaoPaulo(ymd);

    // ==========================================================
    //  A) UNIDADE: weekly funcionamento + daily bloqueios
    // ==========================================================
    const weeklyUnit = await prisma.unitWeeklyAvailability.findFirst({
        where: { companyId, unitId, weekday, isActive: true },
        include: { intervals: true },
    });

    const weeklyUnitIntervals: Interval[] = (weeklyUnit?.intervals ?? [])
        .map((i) => ({ startTime: i.startTime, endTime: i.endTime }))
        .filter(
            (i) =>
                isValidTimeHHMM(i.startTime) &&
                isValidTimeHHMM(i.endTime) &&
                i.startTime < i.endTime
        );

    if (!weeklyUnitIntervals.length) {
        return {
            ok: true,
            data: {
                date: dateStr,
                unitId,
                professionalId,
                appointmentId: appointmentId || null,
                source: 'UNIT_WEEKLY_INACTIVE',
                unitSource: 'UNIT_WEEKLY',
                intervals: [],
                durationMinutes: desiredDurationMinutes,
                times: [],
            },
        };
    }

    const unitDailyKey = ymdToUtcDateKeyMidnight(ymd);

    const dailyUnit = await prisma.unitDailyAvailability.findFirst({
        where: { companyId, unitId, date: unitDailyKey },
        include: { intervals: true },
    });

    if (dailyUnit?.isClosed === true) {
        return {
            ok: true,
            data: {
                date: dateStr,
                unitId,
                professionalId,
                appointmentId: appointmentId || null,
                source: 'UNIT_DAILY_CLOSED',
                unitSource: 'UNIT_CLOSED',
                intervals: [],
                durationMinutes: desiredDurationMinutes,
                times: [],
            },
        };
    }

    const unitBlocks: Interval[] = (dailyUnit?.intervals ?? [])
        .map((i) => ({ startTime: i.startTime, endTime: i.endTime }))
        .filter(
            (i) =>
                isValidTimeHHMM(i.startTime) &&
                isValidTimeHHMM(i.endTime) &&
                i.startTime < i.endTime
        );

    const unitAvailableIntervals = subtractIntervals(
        weeklyUnitIntervals,
        unitBlocks
    );

    if (!unitAvailableIntervals.length) {
        return {
            ok: true,
            data: {
                date: dateStr,
                unitId,
                professionalId,
                appointmentId: appointmentId || null,
                source: dailyUnit ? 'UNIT_DAILY_BLOCKED_ALL' : 'UNIT_WEEKLY',
                unitSource: dailyUnit ? 'UNIT_BLOCKS' : 'UNIT_WEEKLY',
                intervals: [],
                durationMinutes: desiredDurationMinutes,
                times: [],
            },
        };
    }

    // ==========================================================
    //  B) PROFISSIONAL: daily exception (DAY_OFF/CUSTOM) ou weekly
    // ==========================================================
    const dateUtcKeyProf = ymdToUtcDateKeyMidday(ymd);

    const dailyProf = await prisma.professionalDailyAvailability.findFirst({
        where: { companyId, professionalId, unitId, date: dateUtcKeyProf },
        include: { intervals: true },
    });

    if (dailyProf?.type === ProfessionalDailyAvailabilityType.DAY_OFF) {
        return {
            ok: true,
            data: {
                date: dateStr,
                unitId,
                professionalId,
                appointmentId: appointmentId || null,
                source: 'PROF_DAY_OFF',
                unitSource: dailyUnit ? 'UNIT_BLOCKS' : 'UNIT_WEEKLY',
                intervals: [],
                durationMinutes: desiredDurationMinutes,
                times: [],
            },
        };
    }

    let profIntervals: Interval[] = [];

    if (
        dailyProf &&
        dailyProf.type === ProfessionalDailyAvailabilityType.CUSTOM
    ) {
        profIntervals = (dailyProf.intervals ?? [])
            .map((i) => ({ startTime: i.startTime, endTime: i.endTime }))
            .filter(
                (i) =>
                    isValidTimeHHMM(i.startTime) &&
                    isValidTimeHHMM(i.endTime) &&
                    i.startTime < i.endTime
            );
    } else {
        const weeklyProf =
            await prisma.professionalWeeklyAvailability.findFirst({
                where: { companyId, professionalId, unitId, weekday },
                include: { intervals: true },
            });

        if (!weeklyProf || !weeklyProf.isActive) {
            return {
                ok: true,
                data: {
                    date: dateStr,
                    unitId,
                    professionalId,
                    appointmentId: appointmentId || null,
                    source: 'PROF_WEEKLY_INACTIVE',
                    unitSource: dailyUnit ? 'UNIT_BLOCKS' : 'UNIT_WEEKLY',
                    intervals: [],
                    durationMinutes: desiredDurationMinutes,
                    times: [],
                },
            };
        }

        profIntervals = (weeklyProf.intervals ?? [])
            .map((i) => ({ startTime: i.startTime, endTime: i.endTime }))
            .filter(
                (i) =>
                    isValidTimeHHMM(i.startTime) &&
                    isValidTimeHHMM(i.endTime) &&
                    i.startTime < i.endTime
            );
    }

    if (!profIntervals.length) {
        return {
            ok: true,
            data: {
                date: dateStr,
                unitId,
                professionalId,
                appointmentId: appointmentId || null,
                source: 'PROF_NO_INTERVALS',
                unitSource: dailyUnit ? 'UNIT_BLOCKS' : 'UNIT_WEEKLY',
                intervals: [],
                durationMinutes: desiredDurationMinutes,
                times: [],
            },
        };
    }

    // ==========================================================
    //  C) FINAL: (prof ∩ unitAvailable)
    // ==========================================================
    const effectiveIntervals = intersectIntervals(
        profIntervals,
        unitAvailableIntervals
    );

    if (!effectiveIntervals.length) {
        return {
            ok: true,
            data: {
                date: dateStr,
                unitId,
                professionalId,
                appointmentId: appointmentId || null,
                source: 'NO_EFFECTIVE_INTERVALS',
                unitSource: dailyUnit ? 'UNIT_BLOCKS' : 'UNIT_WEEKLY',
                intervals: [],
                durationMinutes: desiredDurationMinutes,
                times: [],
            },
        };
    }

    // ===== 3) GERA SLOTS (de 15 em 15) respeitando duração =====
    let slots = effectiveIntervals.flatMap((i) =>
        buildSlotsForDuration(
            i.startTime,
            i.endTime,
            desiredDurationMinutes,
            slotIntervalMinutes
        )
    );

    slots = Array.from(new Set(slots)).sort(
        (a, b) => timeToMinutes(a) - timeToMinutes(b)
    );

    // ===== 4) REMOVE HORÁRIOS OCUPADOS (por intervalo) =====
    const { startUtc, endUtc } = buildSaoPauloDayUtcRange(ymd);

    const busy = await prisma.appointment.findMany({
        where: {
            companyId,
            unitId,
            professionalId,
            scheduleAt: { gte: startUtc, lte: endUtc },
            status: { in: ['PENDING', 'DONE'] },

            // ✅ edição: ignora o próprio agendamento (permite manter o horário)
            ...(appointmentId ? { id: { not: appointmentId } } : {}),
        },
        select: {
            scheduleAt: true,
            service: { select: { durationMinutes: true } },
        },
    });

    const busyIntervals = busy.map((a) => {
        const startHHmm = formatHHmmInSaoPaulo(new Date(a.scheduleAt));
        const startMins = timeToMinutes(startHHmm);
        const dur = Math.max(1, Number(a.service?.durationMinutes || 15));
        return { startMins, endMins: startMins + dur };
    });

    slots = slots.filter((t) => {
        const slotStart = timeToMinutes(t);
        const slotEnd = slotStart + desiredDurationMinutes;

        for (const b of busyIntervals) {
            if (intervalsOverlap(slotStart, slotEnd, b.startMins, b.endMins)) {
                return false;
            }
        }
        return true;
    });

    // ===== 5) Se for hoje em SP, remove horários passados =====
    try {
        const nowParts = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(new Date());

        const d = Number(nowParts.find((p) => p.type === 'day')?.value ?? '0');
        const m = Number(
            nowParts.find((p) => p.type === 'month')?.value ?? '0'
        );
        const y = Number(nowParts.find((p) => p.type === 'year')?.value ?? '0');
        const hh = Number(
            nowParts.find((p) => p.type === 'hour')?.value ?? '0'
        );
        const mm = Number(
            nowParts.find((p) => p.type === 'minute')?.value ?? '0'
        );

        const isToday = y === ymd.y && m === ymd.m && d === ymd.d;

        if (isToday) {
            const nowMins = hh * 60 + mm;
            slots = slots.filter((t) => timeToMinutes(t) >= nowMins);
        }
    } catch {
        // noop
    }

    return {
        ok: true,
        data: {
            date: dateStr,
            unitId,
            professionalId,
            appointmentId: appointmentId || null,

            source: dailyProf ? 'PROF_EXCEPTION' : 'PROF_WEEKLY',
            unitSource: dailyUnit ? 'UNIT_BLOCKS' : 'UNIT_WEEKLY',

            intervals: effectiveIntervals,
            durationMinutes: desiredDurationMinutes,
            times: slots,
        },
    };
}
