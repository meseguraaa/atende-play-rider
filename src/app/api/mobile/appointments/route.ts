// src/app/api/mobile/appointments/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addMinutes } from 'date-fns';
import {
    AppointmentConfirmationStatus,
    Prisma,
    ProfessionalDailyAvailabilityType,
} from '@prisma/client';
import { verifyAppJwt } from '@/lib/app-jwt';

type MobileTokenPayload = {
    sub: string;
    role: 'CLIENT' | 'BARBER' | 'ADMIN' | 'PROFESSIONAL'; // ✅ compat
    companyId: string; // ✅ multi-tenant obrigatório
    profile_complete?: boolean;

    // compat (não garantido no token)
    email?: string;
    name?: string | null;
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

// ✅ header case-insensitive (compat)
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

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
    const auth = getHeaderCI(req, 'authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) throw new Error('missing_token');

    const payload = await verifyAppJwt(token);
    return payload as MobileTokenPayload;
}

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

/**
 * dateISO: "2025-12-20T15:00:00.000Z" (do day picker, meio-dia)
 * startTime: "09:30" (ou "9:30")
 */
function buildScheduleAtSaoPaulo(dateISO: string, startTime: string): Date {
    const date = new Date(String(dateISO ?? '').trim());
    if (Number.isNaN(date.getTime())) throw new Error('dateISO inválido');

    const yyyy = date.getUTCFullYear();
    const mm = pad2(date.getUTCMonth() + 1);
    const dd = pad2(date.getUTCDate());

    const raw = String(startTime ?? '').trim();
    const m = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!m) throw new Error('startTime inválido');

    const hh = Number(m[1]);
    const mi = Number(m[2]);

    if (
        !Number.isFinite(hh) ||
        !Number.isFinite(mi) ||
        hh < 0 ||
        hh > 23 ||
        mi < 0 ||
        mi > 59
    ) {
        throw new Error('startTime inválido');
    }

    const iso = `${yyyy}-${mm}-${dd}T${pad2(hh)}:${pad2(mi)}:00-03:00`;
    const d = new Date(iso);

    if (Number.isNaN(d.getTime()))
        throw new Error('Falha ao montar scheduleAt');
    return d;
}

function normalizePhone(phone: string): string {
    return String(phone ?? '').replace(/\D/g, '');
}

function isValidPhoneDigits(phoneDigits: string): boolean {
    return phoneDigits.length === 10 || phoneDigits.length === 11;
}

/**
 * ✅ Overlap de intervalos [start, end)
 */
function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return (
        aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime()
    );
}

function clampDurationMin(v: unknown, fallback = 30) {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.max(1, Math.round(n));
}

function isThirtyMinuteSlot(d: Date) {
    return d.getMinutes() % 30 === 0;
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

/* ============================================================
 *  ✅ Regras de disponibilidade (airbag do backend)
 *  - Unidade: weekly = funcionamento, daily = bloqueios (isClosed / intervals)
 *  - Profissional: daily (DAY_OFF/CUSTOM) sobrescreve weekly
 *  - Final: (prof ∩ unitDisponível)
 *  - O serviço deve CABER inteiro dentro de um intervalo final
 * ============================================================ */

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

/**
 * ✅ weekday (0=Dom..6=Sáb) em São Paulo.
 */
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

/**
 * ✅ Range UTC do "dia em São Paulo"
 */
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

    // SP -03:00 => 00:00 SP = 03:00Z | 23:59 SP = 02:59Z do dia seguinte
    const startUtc = new Date(Date.UTC(y, m - 1, day, 3, 0, 0, 0));
    const endUtc = new Date(Date.UTC(y, m - 1, day + 1, 2, 59, 59, 999));
    const dateKey = `${y}-${pad2(m)}-${pad2(day)}`;

    return { startUtc, endUtc, dateKey };
}

function dateKeyToUnitDailyUTC(dateKey: string) {
    // unitDailyAvailability.date = YYYY-MM-DDT00:00:00.000Z
    return new Date(`${dateKey}T00:00:00.000Z`);
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
                startTime: hhmmFromMinutes(start),
                endTime: hhmmFromMinutes(end),
            });
        }

        if (x._e < y._e) i++;
        else j++;
    }

    return out;
}

/**
 * ✅ Subtrai intervalos bloqueados de intervalos disponíveis: available - blocked
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

async function ensureBusinessAvailability(args: {
    companyId: string;
    unitId: string;
    professionalId: string;
    scheduleAt: Date;
    durationMinutes: number;
}): Promise<string | null> {
    const { companyId, unitId, professionalId, scheduleAt } = args;
    const dur = clampDurationMin(args.durationMinutes, 30);

    const { startUtc, endUtc, dateKey } =
        buildSaoPauloDayUtcRangeFromDate(scheduleAt);
    const weekday = getWeekdayInSaoPaulo(scheduleAt);

    // minutos locais (SP) a partir do Date (que já está em -03:00)
    const startMin = scheduleAt.getHours() * 60 + scheduleAt.getMinutes();
    const endMin = startMin + dur;

    // 1) Unidade weekly (funcionamento)
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

    // 2) Unidade daily (exceções = BLOQUEIOS)
    let unitDaily = null as any;

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
        // fallback
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
        return 'Horário indisponível nesta unidade';
    }

    // 3) Profissional daily (DAY_OFF/CUSTOM) ou weekly
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

    // 4) Final: (prof ∩ unitDisponível) e o serviço deve caber
    const effective = intersectIntervals(profIntervals, unitAvailable);

    if (!fitsInsideAnyInterval(startMin, endMin, effective)) {
        return 'Horário indisponível para este profissional nesta unidade';
    }

    return null;
}

async function ensureAvailability(
    companyId: string,
    scheduleAt: Date,
    professionalId: string,
    durationMinutes: number
): Promise<string | null> {
    // ✅ garante duração válida (evita “0 minutos” matar o bloqueio)
    const durNew = clampDurationMin(durationMinutes, 30);

    const newStart = scheduleAt;
    const newEnd = addMinutes(scheduleAt, durNew);

    // Janela suficiente pra pegar conflitos próximos (inclusive atravessando meia-noite)
    const windowStart = addMinutes(newStart, -12 * 60);
    const windowEnd = addMinutes(newEnd, 12 * 60);

    const candidates = await prisma.appointment.findMany({
        where: {
            companyId,
            professionalId,
            status: { not: 'CANCELED' },
            scheduleAt: { gte: windowStart, lte: windowEnd },
        },
        select: {
            id: true,
            scheduleAt: true,
            service: { select: { durationMinutes: true } },
        },
        orderBy: { scheduleAt: 'asc' },
    });

    for (const appt of candidates) {
        const existingStart = appt.scheduleAt;

        // ✅ saneia duração do existente (se vier null / 0, assume 30)
        const durExisting = clampDurationMin(appt.service?.durationMinutes, 30);

        const existingEnd = addMinutes(existingStart, durExisting);

        if (intervalsOverlap(existingStart, existingEnd, newStart, newEnd)) {
            return 'Este profissional já possui um agendamento que conflita com este horário';
        }
    }

    return null;
}

/**
 * ✅ Garante que o usuário (client) tenha vínculo na empresa (CompanyMember).
 */
async function ensureCompanyMembership(args: {
    companyId: string;
    userId: string;
    unitId?: string | null;
}) {
    const { companyId, userId, unitId } = args;

    await prisma.companyMember.upsert({
        where: {
            companyId_userId: { companyId, userId },
        },
        create: {
            companyId,
            userId,
            role: 'CLIENT',
            isActive: true,
            lastUnitId: unitId ?? undefined,
        },
        update: {
            isActive: true,
            ...(unitId ? { lastUnitId: unitId } : {}),
        },
    });
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
    try {
        const payload = await requireMobileAuth(req);

        const companyId = String(payload.companyId || '').trim();
        if (!companyId) {
            return NextResponse.json(
                { error: 'Não autorizado' },
                { status: 401, headers: corsHeaders() }
            );
        }

        if (payload.role !== 'CLIENT') {
            return NextResponse.json(
                { error: 'Sem permissão' },
                { status: 403, headers: corsHeaders() }
            );
        }

        const body = await req.json();

        const clientName = String(body?.clientName ?? '').trim();
        const phoneRaw = String(body?.phone ?? '');
        const phone = normalizePhone(phoneRaw);

        const unitId = String(body?.unitId ?? '').trim();
        const serviceId = String(body?.serviceId ?? '').trim();

        const usePlan = body?.usePlan === true;
        const clientPlanId = String(body?.clientPlanId ?? '').trim();
        const planServiceId = String(body?.planServiceId ?? '').trim();

        // ✅ compat: aceita professionalId OU barberId
        const professionalId = String(body?.professionalId ?? '').trim();
        const barberIdLegacy = String(body?.barberId ?? '').trim();
        const resolvedProfessionalId = professionalId || barberIdLegacy;

        // ✅ agora aceitamos scheduleAt OU dateISO+startTime
        const scheduleAtRaw = String(body?.scheduleAt ?? '').trim();
        const dateISO = String(body?.dateISO ?? '').trim();
        const startTime = String(body?.startTime ?? '').trim();

        if (!clientName) {
            return NextResponse.json(
                { error: 'Nome é obrigatório' },
                { status: 400, headers: corsHeaders() }
            );
        }

        if (!phone || !isValidPhoneDigits(phone)) {
            return NextResponse.json(
                { error: 'Telefone inválido (use DDD + número)' },
                { status: 400, headers: corsHeaders() }
            );
        }

        if (!unitId || !serviceId || !resolvedProfessionalId) {
            return NextResponse.json(
                { error: 'Parâmetros incompletos' },
                { status: 400, headers: corsHeaders() }
            );
        }

        if (usePlan && (!clientPlanId || !planServiceId)) {
            return NextResponse.json(
                { error: 'Dados do plano incompletos para este agendamento' },
                { status: 400, headers: corsHeaders() }
            );
        }

        // ✅ decide scheduleAt
        let scheduleAt: Date | null = null;

        if (scheduleAtRaw) {
            const d = new Date(scheduleAtRaw);
            if (!Number.isNaN(d.getTime())) scheduleAt = d;
        }

        if (!scheduleAt) {
            if (!dateISO || !startTime) {
                return NextResponse.json(
                    { error: 'Parâmetros incompletos' },
                    { status: 400, headers: corsHeaders() }
                );
            }
            scheduleAt = buildScheduleAtSaoPaulo(dateISO, startTime);
        }

        if (scheduleAt.getTime() < Date.now()) {
            return NextResponse.json(
                { error: 'Não é possível agendar para um horário no passado' },
                { status: 400, headers: corsHeaders() }
            );
        }

        // ✅ regra do produto: slots sempre de 30 em 30
        if (!isThirtyMinuteSlot(scheduleAt)) {
            return NextResponse.json(
                { error: 'Horário inválido (use intervalos de 30 minutos).' },
                { status: 400, headers: corsHeaders() }
            );
        }

        const unit = await prisma.unit.findFirst({
            where: { id: unitId, companyId },
            select: {
                id: true,
                isActive: true,
                bookingWindowDays: true,
                reminderLeadHours: true,
            },
        });
        if (!unit) {
            return NextResponse.json(
                { error: 'Unidade não encontrada' },
                { status: 404, headers: corsHeaders() }
            );
        }
        if (unit.isActive === false) {
            return NextResponse.json(
                { error: 'Unidade inativa' },
                { status: 400, headers: corsHeaders() }
            );
        }

        // 🔒 BLOQUEIO: janela de agendamento por unidade (cliente)
        const bookingWindowDays =
            typeof unit.bookingWindowDays === 'number'
                ? unit.bookingWindowDays
                : 30;

        const now = new Date();

        const nowParts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(now);

        const targetParts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(scheduleAt);

        const getPart = (
            parts: Intl.DateTimeFormatPart[],
            type: 'year' | 'month' | 'day'
        ) => Number(parts.find((p) => p.type === type)?.value ?? '');

        const todaySP = new Date(
            getPart(nowParts, 'year'),
            getPart(nowParts, 'month') - 1,
            getPart(nowParts, 'day')
        );

        const targetDate = new Date(
            getPart(targetParts, 'year'),
            getPart(targetParts, 'month') - 1,
            getPart(targetParts, 'day')
        );

        const maxDate = new Date(todaySP);
        maxDate.setDate(maxDate.getDate() + bookingWindowDays - 1);

        if (targetDate > maxDate) {
            return NextResponse.json(
                {
                    error: `Este agendamento ultrapassa o limite de ${bookingWindowDays} dias desta unidade`,
                },
                { status: 400, headers: corsHeaders() }
            );
        }

        const service = await prisma.service.findFirst({
            where: { id: serviceId, companyId },
            select: {
                id: true,
                name: true,
                unitId: true,
                price: true,
                professionalPercentage: true, // ✅ novo
                isActive: true,
                durationMinutes: true,
            },
        });
        if (!service) {
            return NextResponse.json(
                { error: 'Serviço não encontrado' },
                { status: 404, headers: corsHeaders() }
            );
        }
        if (!service.isActive) {
            return NextResponse.json(
                { error: 'Serviço inativo' },
                { status: 400, headers: corsHeaders() }
            );
        }

        if (service.unitId && service.unitId !== unitId) {
            return NextResponse.json(
                { error: 'Este serviço não pertence a esta unidade' },
                { status: 400, headers: corsHeaders() }
            );
        }

        // ✅ valida que o profissional existe e está ativo no tenant
        const professional = await prisma.professional.findFirst({
            where: { id: resolvedProfessionalId, companyId, isActive: true },
            select: { id: true },
        });
        if (!professional) {
            return NextResponse.json(
                { error: 'Profissional não encontrado ou inativo' },
                { status: 404, headers: corsHeaders() }
            );
        }

        const professionalUnit = await prisma.professionalUnit.findFirst({
            where: {
                professionalId: resolvedProfessionalId,
                unitId,
                isActive: true,
                companyId,
            },
            select: { id: true },
        });
        if (!professionalUnit) {
            return NextResponse.json(
                {
                    error: 'Este profissional não está vinculado a esta unidade',
                },
                { status: 400, headers: corsHeaders() }
            );
        }

        const sp = await prisma.serviceProfessional.findFirst({
            where: {
                professionalId: resolvedProfessionalId,
                serviceId,
                companyId,
            },
            select: { id: true },
        });
        if (!sp) {
            return NextResponse.json(
                { error: 'Este profissional não executa este serviço' },
                { status: 400, headers: corsHeaders() }
            );
        }

        // ✅ AIRBAG 1: valida regras de disponibilidade (unidade + profissional + bloqueios)
        const businessBlock = await ensureBusinessAvailability({
            companyId,
            unitId,
            professionalId: resolvedProfessionalId,
            scheduleAt,
            durationMinutes: service.durationMinutes ?? 0,
        });
        if (businessBlock) {
            return NextResponse.json(
                { error: businessBlock },
                { status: 409, headers: corsHeaders() }
            );
        }

        // ✅ AIRBAG 2: valida conflito com outros agendamentos
        const conflict = await ensureAvailability(
            companyId,
            scheduleAt,
            resolvedProfessionalId,
            service.durationMinutes ?? 0
        );
        if (conflict) {
            return NextResponse.json(
                { error: conflict },
                { status: 409, headers: corsHeaders() }
            );
        }

        const clientId = String(payload.sub || '').trim();
        if (!clientId) {
            return NextResponse.json(
                { error: 'Não autorizado' },
                { status: 401, headers: corsHeaders() }
            );
        }

        await ensureCompanyMembership({ companyId, userId: clientId, unitId });

        let clientPlanContext: {
            clientPlanId: string;
            clientPlanServiceBalanceId: string;
        } | null = null;

        if (usePlan) {
            const clientPlan = await prisma.clientPlan.findFirst({
                where: {
                    id: clientPlanId,
                    companyId,
                    clientId,
                    status: 'ACTIVE',
                },
                select: {
                    id: true,
                    expiresAt: true,
                    balances: {
                        where: {
                            id: planServiceId,
                        },
                        select: {
                            id: true,
                            serviceId: true,
                            creditsRemaining: true,
                        },
                    },
                },
            });

            if (!clientPlan) {
                return NextResponse.json(
                    {
                        error: 'Plano do cliente não encontrado ou inativo',
                    },
                    { status: 400, headers: corsHeaders() }
                );
            }

            if (clientPlan.expiresAt.getTime() < Date.now()) {
                return NextResponse.json(
                    { error: 'Este plano está expirado' },
                    { status: 400, headers: corsHeaders() }
                );
            }

            const matchingBalance = clientPlan.balances[0] ?? null;

            if (!matchingBalance) {
                return NextResponse.json(
                    {
                        error: 'Crédito do plano não encontrado para este agendamento',
                    },
                    { status: 400, headers: corsHeaders() }
                );
            }

            if (Number(matchingBalance.creditsRemaining ?? 0) <= 0) {
                return NextResponse.json(
                    {
                        error: 'Este crédito do plano não possui saldo disponível',
                    },
                    { status: 400, headers: corsHeaders() }
                );
            }

            if (matchingBalance.serviceId !== serviceId) {
                return NextResponse.json(
                    {
                        error: 'O serviço selecionado não corresponde ao crédito do plano informado',
                    },
                    { status: 400, headers: corsHeaders() }
                );
            }

            clientPlanContext = {
                clientPlanId: clientPlan.id,
                clientPlanServiceBalanceId: matchingBalance.id,
            };
        }

        // ✅ decimal-safe
        const price = (service.price ?? new Prisma.Decimal(0)) as any;
        const pct = (service.professionalPercentage ??
            new Prisma.Decimal(0)) as any;

        const professionalEarningValue = price
            .mul(pct)
            .div(new Prisma.Decimal(100));

        const confirmationStatus = getInitialConfirmationStatus(
            scheduleAt,
            unit.reminderLeadHours ?? 24
        );

        const appointment = await prisma.appointment.create({
            data: {
                companyId,

                clientName,
                phone,
                description: service.name,
                scheduleAt,

                serviceId,
                professionalId: resolvedProfessionalId,
                unitId,
                clientId,

                servicePriceAtTheTime: service.price,
                professionalPercentageAtTheTime: service.professionalPercentage,
                professionalEarningValue,
                status: 'PENDING',
                confirmationStatus,

                createdByRole: 'CLIENT',
                createdSource: 'CLIENT_APP',
                createdByUserId: clientId,

                clientPlanId: clientPlanContext?.clientPlanId ?? null,
                clientPlanServiceBalanceId:
                    clientPlanContext?.clientPlanServiceBalanceId ?? null,
                planUsageType: clientPlanContext ? 'PLAN_CREDIT' : 'NONE',
            },
            select: {
                id: true,
                status: true,
                scheduleAt: true,
                confirmationStatus: true,
                clientPlanId: true,
                clientPlanServiceBalanceId: true,
                planUsageType: true,
            },
        });

        return NextResponse.json(
            {
                ok: true,
                appointment,
                plan: clientPlanContext
                    ? {
                          usePlan: true,
                          clientPlanId: clientPlanContext.clientPlanId,
                          clientPlanServiceBalanceId:
                              clientPlanContext.clientPlanServiceBalanceId,
                      }
                    : null,
            },
            { status: 200, headers: corsHeaders() }
        );
    } catch (err: any) {
        const msg = String(err?.message ?? 'Erro').toLowerCase();

        const isAuth =
            msg.includes('missing_token') ||
            msg.includes('token') ||
            msg.includes('jwt') ||
            msg.includes('signature') ||
            msg.includes('invalid token payload') ||
            msg.includes('companyid');

        if (isAuth) {
            return NextResponse.json(
                { error: 'Não autorizado' },
                { status: 401, headers: corsHeaders() }
            );
        }

        console.error('[api/mobile/appointments] error:', err);
        return NextResponse.json(
            { error: 'Erro ao criar agendamento' },
            { status: 500, headers: corsHeaders() }
        );
    }
}
