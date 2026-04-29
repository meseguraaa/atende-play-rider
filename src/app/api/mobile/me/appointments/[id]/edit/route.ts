// src/app/api/mobile/me/appointments/[id]/edit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';
import { addMinutes } from 'date-fns';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

type MobileTokenPayload = {
    sub: string;
    role?: 'CLIENT' | 'BARBER' | 'ADMIN';
    companyId: string; // ✅ multi-tenant obrigatório
};

const DEFAULT_RESCHEDULE_WINDOW_HOURS = 24;

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) throw new Error('missing_token');

    const payload = (await verifyAppJwt(token)) as any;

    const companyId =
        typeof payload?.companyId === 'string'
            ? String(payload.companyId).trim()
            : '';

    if (!companyId) throw new Error('missing_company_id');

    return { ...(payload as any), companyId } as MobileTokenPayload;
}

function normalizeWindowHours(raw: unknown): number | null {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n <= 0) return null;
    if (n > 24 * 30) return 24 * 30;
    return n;
}

function computeCanReschedule(scheduleAt: Date, windowHours: number) {
    const now = new Date();
    const diffMs = scheduleAt.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    const ok = diffHours >= windowHours;

    return {
        canReschedule: ok,
        reason: ok ? null : `Menos de ${windowHours}h de antecedência.`,
        diffHours,
        windowHours,
    };
}

function normalizeString(v: unknown) {
    return String(v ?? '').trim();
}

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

/**
 * dateISO: "2025-12-20T15:00:00.000Z" (do day picker, meio-dia UTC)
 * startTime: "09:30" (ou "9:30")
 *
 * ✅ Monta scheduleAt com offset -03:00 (São Paulo).
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

/**
 * ✅ overlap de intervalos [start, end)
 */
function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return (
        aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime()
    );
}

function normalizeDurationMinutes(v: unknown, fallback = 30) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.max(1, Math.round(n));
}

/**
 * ✅ Garante que o novo horário não conflita com outros agendamentos do mesmo profissional.
 * Exclui o próprio appointmentId.
 *
 * Importante:
 * - conflito é pelo PROFISSIONAL (não faz sentido estar em 2 lugares ao mesmo tempo)
 * - não filtra por unitId para manter consistência com o POST /api/mobile/appointments
 */
async function ensureAvailability(args: {
    companyId: string;
    professionalId: string;
    appointmentId: string;
    scheduleAt: Date;
    durationMinutes: number;
}) {
    const {
        companyId,
        professionalId,
        appointmentId,
        scheduleAt,
        durationMinutes,
    } = args;

    const dur = normalizeDurationMinutes(durationMinutes, 30);

    const newStart = scheduleAt;
    const newEnd = addMinutes(scheduleAt, dur);

    // janela ampla pra buscar candidatos (robusta)
    const windowStart = addMinutes(newStart, -12 * 60);
    const windowEnd = addMinutes(newEnd, 12 * 60);

    const candidates = await prisma.appointment.findMany({
        where: {
            companyId,
            professionalId,
            status: { not: 'CANCELED' },
            id: { not: appointmentId },
            scheduleAt: { gte: windowStart, lte: windowEnd },
        },
        select: {
            id: true,
            scheduleAt: true,
            service: { select: { durationMinutes: true } },
        },
        orderBy: { scheduleAt: 'asc' },
    });

    for (const appt of candidates ?? []) {
        const existingStart = new Date(appt.scheduleAt);

        const existingDur = normalizeDurationMinutes(
            appt?.service?.durationMinutes ?? 30,
            30
        );

        const existingEnd = addMinutes(existingStart, existingDur);

        if (intervalsOverlap(existingStart, existingEnd, newStart, newEnd)) {
            return 'Este profissional já possui um agendamento que conflita com este horário';
        }
    }

    return null;
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const headers = corsHeaders();

    try {
        const payload = await requireMobileAuth(req);
        const companyId = payload.companyId;

        // ✅ mobile “me/*” é do CLIENT (se vier role)
        if (payload.role && payload.role !== 'CLIENT') {
            return NextResponse.json(
                { ok: false, error: 'Sem permissão' },
                { status: 403, headers }
            );
        }

        const { id } = await params;
        const apptId = normalizeString(id);

        if (!apptId) {
            return NextResponse.json(
                { ok: false, error: 'Id ausente' },
                { status: 400, headers }
            );
        }

        // ✅ appointment do tenant + do cliente
        const appt = await prisma.appointment.findFirst({
            where: {
                id: apptId,
                companyId,
                clientId: payload.sub,
                status: { not: 'CANCELED' },
            },
            select: {
                id: true,
                status: true,
                scheduleAt: true,
                unitId: true,
                serviceId: true,
                professionalId: true,

                unit: { select: { id: true, name: true } },
                service: {
                    select: {
                        id: true,
                        name: true,
                        durationMinutes: true,
                        cancelLimitHours: true,
                    },
                },
                professional: { select: { id: true, name: true } },
            },
        });

        if (!appt) {
            return NextResponse.json(
                { ok: false, error: 'Agendamento não encontrado' },
                { status: 404, headers }
            );
        }

        const windowHours =
            normalizeWindowHours(appt.service?.cancelLimitHours) ??
            DEFAULT_RESCHEDULE_WINDOW_HOURS;

        const rules = computeCanReschedule(appt.scheduleAt, windowHours);

        // ✅ lista de unidades (o app espera isso no EditPayload)
        const units = await prisma.unit.findMany({
            where: { companyId, isActive: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json(
            {
                ok: true,
                appointment: {
                    id: appt.id,

                    unitId: appt.unitId ?? null,
                    unitName: appt.unit?.name ?? null,

                    serviceId: appt.serviceId ?? null,
                    serviceName: appt.service?.name ?? null,

                    // ✅ compat com o app (ainda usa barberId/barberName)
                    barberId: appt.professionalId ?? null,
                    barberName: appt.professional?.name ?? null,

                    scheduleAt: appt.scheduleAt.toISOString(),
                    status: appt.status,
                },
                units,
                rules: {
                    canReschedule: rules.canReschedule,
                    reason: rules.reason,
                },
            },
            { status: 200, headers }
        );
    } catch (err: any) {
        const msg = String(err?.message ?? '');

        const isAuth =
            msg === 'missing_token' ||
            msg === 'missing_company_id' ||
            msg.includes('Invalid token payload') ||
            msg.toLowerCase().includes('jwt') ||
            msg.toLowerCase().includes('token') ||
            msg.toLowerCase().includes('signature');

        if (isAuth) {
            return NextResponse.json(
                { ok: false, error: 'Não autorizado' },
                { status: 401, headers }
            );
        }

        console.error('[mobile/me/appointments/[id]/edit GET] error:', err);

        return NextResponse.json(
            { ok: false, error: 'Erro ao validar edição do agendamento' },
            { status: 500, headers }
        );
    }
}

/**
 * ✅ PATCH: aplica remarcação (e opcionalmente troca unidade/serviço/profissional)
 *
 * Body aceito:
 * - dateISO + startTime  (preferido)
 * ou
 * - scheduleAt (ISO)
 *
 * E opcional:
 * - unitId
 * - serviceId
 * - professionalId (ou barberId legado)
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const headers = corsHeaders();

    try {
        const payload = await requireMobileAuth(req);
        const companyId = payload.companyId;

        if (payload.role && payload.role !== 'CLIENT') {
            return NextResponse.json(
                { ok: false, error: 'Sem permissão' },
                { status: 403, headers }
            );
        }

        const { id } = await params;
        const apptId = normalizeString(id);

        if (!apptId) {
            return NextResponse.json(
                { ok: false, error: 'Id ausente' },
                { status: 400, headers }
            );
        }

        const body = await req.json().catch(() => ({}) as any);

        const unitIdBody = normalizeString(body?.unitId);
        const serviceIdBody = normalizeString(body?.serviceId);

        // compat profissional
        const professionalIdBody = normalizeString(body?.professionalId);
        const barberIdBody = normalizeString(body?.barberId);
        const resolvedProfessionalIdBody = professionalIdBody || barberIdBody;

        const scheduleAtRaw = normalizeString(body?.scheduleAt);
        const dateISO = normalizeString(body?.dateISO);
        const startTime = normalizeString(body?.startTime);

        // ✅ carrega agendamento atual
        const current = await prisma.appointment.findFirst({
            where: {
                id: apptId,
                companyId,
                clientId: payload.sub,
                status: { not: 'CANCELED' },
            },
            select: {
                id: true,
                status: true,
                scheduleAt: true,
                unitId: true,
                serviceId: true,
                professionalId: true,
                description: true,

                service: {
                    select: {
                        id: true,
                        name: true,
                        durationMinutes: true,
                        cancelLimitHours: true,
                        price: true,
                        professionalPercentage: true,
                        isActive: true,
                        unitId: true,
                    },
                },
            },
        });

        if (!current) {
            return NextResponse.json(
                { ok: false, error: 'Agendamento não encontrado' },
                { status: 404, headers }
            );
        }

        // ✅ regra de remarcação
        const windowHours =
            normalizeWindowHours(current.service?.cancelLimitHours) ??
            DEFAULT_RESCHEDULE_WINDOW_HOURS;

        const rules = computeCanReschedule(current.scheduleAt, windowHours);
        if (!rules.canReschedule) {
            return NextResponse.json(
                {
                    ok: false,
                    error:
                        rules.reason ||
                        'Este agendamento não pode ser alterado agora.',
                },
                { status: 409, headers }
            );
        }

        // ✅ resolve novos ids (ou mantém os atuais)
        const unitId = unitIdBody || String(current.unitId ?? '').trim();
        const serviceId =
            serviceIdBody || String(current.serviceId ?? '').trim();
        const professionalId =
            resolvedProfessionalIdBody ||
            String(current.professionalId ?? '').trim();

        if (!unitId || !serviceId || !professionalId) {
            return NextResponse.json(
                { ok: false, error: 'Parâmetros incompletos para alterar.' },
                { status: 400, headers }
            );
        }

        // ✅ resolve novo scheduleAt
        let newScheduleAt: Date | null = null;

        if (scheduleAtRaw) {
            const d = new Date(scheduleAtRaw);
            if (!Number.isNaN(d.getTime())) newScheduleAt = d;
        }

        if (!newScheduleAt) {
            if (!dateISO || !startTime) {
                return NextResponse.json(
                    { ok: false, error: 'Informe dateISO e startTime.' },
                    { status: 400, headers }
                );
            }
            newScheduleAt = buildScheduleAtSaoPaulo(dateISO, startTime);
        }

        if (newScheduleAt.getTime() < Date.now()) {
            return NextResponse.json(
                { ok: false, error: 'Não é possível remarcar para o passado.' },
                { status: 400, headers }
            );
        }

        // ✅ valida unidade
        const unit = await prisma.unit.findFirst({
            where: { id: unitId, companyId, isActive: true },
            select: { id: true },
        });

        if (!unit) {
            return NextResponse.json(
                { ok: false, error: 'Unidade inválida' },
                { status: 404, headers }
            );
        }

        // ✅ valida serviço
        const service = await prisma.service.findFirst({
            where: { id: serviceId, companyId, isActive: true },
            select: {
                id: true,
                name: true,
                unitId: true,
                durationMinutes: true,
                price: true,
                professionalPercentage: true,
            },
        });

        if (!service) {
            return NextResponse.json(
                { ok: false, error: 'Serviço não encontrado' },
                { status: 404, headers }
            );
        }

        if (service.unitId && service.unitId !== unitId) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Este serviço não pertence a esta unidade',
                },
                { status: 400, headers }
            );
        }

        // ✅ valida vínculo prof ↔ unidade
        const profUnit = await prisma.professionalUnit.findFirst({
            where: {
                companyId,
                unitId,
                professionalId,
                isActive: true,
            },
            select: { id: true },
        });

        if (!profUnit) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Profissional não vinculado a esta unidade',
                },
                { status: 400, headers }
            );
        }

        // ✅ valida prof ↔ serviço
        const sp = await prisma.serviceProfessional.findFirst({
            where: { companyId, professionalId, serviceId },
            select: { id: true },
        });

        if (!sp) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Este profissional não executa este serviço',
                },
                { status: 400, headers }
            );
        }

        const durationMinutes = normalizeDurationMinutes(
            service.durationMinutes ?? 0,
            30
        );

        // ✅ valida conflito por intervalo (exclui o próprio agendamento)
        const conflict = await ensureAvailability({
            companyId,
            professionalId,
            appointmentId: apptId,
            scheduleAt: newScheduleAt,
            durationMinutes,
        });

        if (conflict) {
            return NextResponse.json(
                { ok: false, error: conflict },
                { status: 409, headers }
            );
        }

        // ✅ se trocar serviço, atualiza também os valores congelados (mantém consistência)
        const price = (service.price ?? new Prisma.Decimal(0)) as any;
        const pct = (service.professionalPercentage ??
            new Prisma.Decimal(0)) as any;

        const professionalEarningValue = price
            .mul(pct)
            .div(new Prisma.Decimal(100));

        const updatedCount = await prisma.appointment.updateMany({
            where: {
                id: apptId,
                companyId,
                clientId: payload.sub,
                status: { not: 'CANCELED' },
            },
            data: {
                scheduleAt: newScheduleAt,

                unitId,
                serviceId,
                professionalId,

                description: service.name,

                servicePriceAtTheTime: service.price,
                professionalPercentageAtTheTime: service.professionalPercentage,
                professionalEarningValue,
            },
        });

        if (updatedCount.count === 0) {
            return NextResponse.json(
                { ok: false, error: 'Agendamento não encontrado' },
                { status: 404, headers }
            );
        }

        const updated = await prisma.appointment.findFirst({
            where: {
                id: apptId,
                companyId,
                clientId: payload.sub,
            },
            select: {
                id: true,
                status: true,
                scheduleAt: true,
                unitId: true,
                serviceId: true,
                professionalId: true,
            },
        });

        return NextResponse.json(
            { ok: true, appointment: updated },
            { status: 200, headers }
        );
    } catch (err: any) {
        const msg = String(err?.message ?? '');

        const isAuth =
            msg === 'missing_token' ||
            msg === 'missing_company_id' ||
            msg.includes('Invalid token payload') ||
            msg.toLowerCase().includes('jwt') ||
            msg.toLowerCase().includes('token') ||
            msg.toLowerCase().includes('signature');

        if (isAuth) {
            return NextResponse.json(
                { ok: false, error: 'Não autorizado' },
                { status: 401, headers }
            );
        }

        console.error('[mobile/me/appointments/[id]/edit PATCH] error:', err);

        return NextResponse.json(
            { ok: false, error: 'Erro ao remarcar o agendamento' },
            { status: 500, headers }
        );
    }
}
