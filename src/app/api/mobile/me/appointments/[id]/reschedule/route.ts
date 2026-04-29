// src/app/api/mobile/me/appointments/[id]/reschedule/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';
import { addMinutes } from 'date-fns';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type MobileTokenPayload = {
    sub: string;
    role?: 'CLIENT' | 'BARBER' | 'ADMIN';
    companyId: string;
};

// ⚠️ Mantemos a constante, mas não usamos mais como default automático.
// Serve só se você quiser reativar uma regra global depois.
const DEFAULT_RESCHEDULE_WINDOW_HOURS = 24;

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
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

function normalizeString(v: unknown) {
    return String(v ?? '').trim();
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

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const headers = corsHeaders();

    try {
        const payload = await requireMobileAuth(req);
        const companyId = payload.companyId;

        // ✅ Mantém padrão do app: cliente apenas
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

        const body = await req.json().catch(() => ({}));

        const unitId = normalizeString(body?.unitId);
        const serviceId = normalizeString(body?.serviceId);

        // ✅ compat: app manda barberId, mas banco é professionalId
        const professionalId = normalizeString(
            body?.professionalId ?? body?.barberId
        );

        const scheduleAtRaw = normalizeString(body?.scheduleAt);

        if (!unitId || !serviceId || !professionalId || !scheduleAtRaw) {
            return NextResponse.json(
                { ok: false, error: 'Parâmetros incompletos' },
                { status: 400, headers }
            );
        }

        const scheduleAt = new Date(scheduleAtRaw);
        if (Number.isNaN(scheduleAt.getTime())) {
            return NextResponse.json(
                { ok: false, error: 'scheduleAt inválido' },
                { status: 400, headers }
            );
        }

        // ✅ regra do produto: sempre slots de 30 em 30
        if (!isThirtyMinuteSlot(scheduleAt)) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Horário inválido (use intervalos de 30 minutos).',
                },
                { status: 400, headers }
            );
        }

        if (scheduleAt.getTime() < Date.now()) {
            return NextResponse.json(
                { ok: false, error: 'Não é possível remarcar para o passado.' },
                { status: 400, headers }
            );
        }

        // 1) ✅ garante que o appointment é do tenant + do cliente
        const appt = await prisma.appointment.findFirst({
            where: {
                id: apptId,
                companyId,
                clientId: payload.sub,
                status: { not: 'CANCELED' },
            },
            include: { service: true },
        });

        if (!appt) {
            return NextResponse.json(
                { ok: false, error: 'Agendamento não encontrado' },
                { status: 404, headers }
            );
        }

        // 2) ✅ regra de janela (SÓ se o serviço tiver cancelLimitHours configurado)
        const configuredWindowHours = normalizeWindowHours(
            appt.service?.cancelLimitHours
        );

        if (configuredWindowHours) {
            const rules = computeCanReschedule(
                new Date(appt.scheduleAt),
                configuredWindowHours
            );

            if (!rules.canReschedule) {
                return NextResponse.json(
                    { ok: false, error: rules.reason ?? 'Bloqueado' },
                    { status: 409, headers }
                );
            }
        } else {
            // sem janela configurada: só bloqueia se já passou (defensivo)
            if (new Date(appt.scheduleAt).getTime() <= Date.now()) {
                return NextResponse.json(
                    { ok: false, error: 'Este agendamento já passou.' },
                    { status: 409, headers }
                );
            }
        }

        // 3) ✅ valida unidade/serviço/profissional no tenant
        const [unit, service, professional, profUnit, sp] = await Promise.all([
            prisma.unit.findFirst({
                where: { id: unitId, companyId, isActive: true },
                select: { id: true },
            }),
            prisma.service.findFirst({
                where: { id: serviceId, companyId, isActive: true },
                select: { id: true, name: true, durationMinutes: true },
            }),
            prisma.professional.findFirst({
                where: { id: professionalId, companyId, isActive: true },
                select: { id: true },
            }),
            prisma.professionalUnit.findFirst({
                where: {
                    companyId,
                    unitId,
                    professionalId,
                    isActive: true,
                },
                select: { id: true },
            }),
            prisma.serviceProfessional.findFirst({
                where: { companyId, serviceId, professionalId },
                select: { id: true },
            }),
        ]);

        if (!unit) {
            return NextResponse.json(
                { ok: false, error: 'Unidade não encontrada' },
                { status: 404, headers }
            );
        }

        if (!service) {
            return NextResponse.json(
                { ok: false, error: 'Serviço não encontrado' },
                { status: 404, headers }
            );
        }

        if (!professional) {
            return NextResponse.json(
                { ok: false, error: 'Profissional não encontrado ou inativo' },
                { status: 404, headers }
            );
        }

        if (!profUnit) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Profissional não vinculado a esta unidade',
                },
                { status: 400, headers }
            );
        }

        if (!sp) {
            return NextResponse.json(
                { ok: false, error: 'Profissional não executa este serviço' },
                { status: 400, headers }
            );
        }

        // 4) ✅ conflito REAL por intervalo (não só "mesmo horário")
        const newDuration = clampDurationMin(service.durationMinutes, 30);
        const newStart = scheduleAt;
        const newEnd = addMinutes(scheduleAt, newDuration);

        // janela pra buscar candidatos próximos
        const windowStart = addMinutes(newStart, -12 * 60);
        const windowEnd = addMinutes(newEnd, 12 * 60);

        const candidates = await prisma.appointment.findMany({
            where: {
                companyId,
                unitId,
                professionalId,
                status: { not: 'CANCELED' },
                id: { not: apptId },
                scheduleAt: { gte: windowStart, lte: windowEnd },
            } as any,
            select: {
                id: true,
                scheduleAt: true,
                service: { select: { durationMinutes: true } },
            },
            orderBy: { scheduleAt: 'asc' },
        });

        for (const c of candidates) {
            const existingStart = new Date(c.scheduleAt as any);
            const existingDuration = clampDurationMin(
                c.service?.durationMinutes,
                30
            );
            const existingEnd = addMinutes(existingStart, existingDuration);

            if (
                intervalsOverlap(existingStart, existingEnd, newStart, newEnd)
            ) {
                return NextResponse.json(
                    { ok: false, error: 'Horário indisponível' },
                    { status: 409, headers }
                );
            }
        }

        // 5) ✅ update protegido
        const updatedCount = await prisma.appointment.updateMany({
            where: {
                id: apptId,
                companyId,
                clientId: payload.sub,
            },
            data: {
                unitId,
                serviceId,
                professionalId,
                scheduleAt,
                description: service.name ?? appt.description,
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
                updatedAt: true,
            },
        });

        return NextResponse.json(
            { ok: true, appointment: updated },
            { status: 200, headers }
        );
    } catch (err: any) {
        console.error(
            '[mobile/me/appointments/[id]/reschedule POST] error:',
            err
        );

        const msg = String(err?.message || '').toLowerCase();
        const isAuth =
            msg.includes('missing_token') ||
            msg.includes('missing_company_id') ||
            msg.includes('jwt') ||
            msg.includes('token') ||
            msg.includes('signature');

        return NextResponse.json(
            {
                ok: false,
                error: isAuth
                    ? 'Não autorizado'
                    : 'Erro ao alterar agendamento',
            },
            { status: isAuth ? 401 : 500, headers }
        );
    }
}
