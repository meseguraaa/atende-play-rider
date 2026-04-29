// src/app/api/mobile/me/appointments/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';

export const dynamic = 'force-dynamic';

type MobileTokenPayload = {
    sub: string;
    role: 'CLIENT' | 'BARBER' | 'ADMIN';
    companyId: string; // ✅ multi-tenant obrigatório
    profile_complete?: boolean;
};

// ⚠️ Mantemos a constante, mas NÃO usamos mais como default automático.
// Ela só serve se você quiser reativar a regra global no futuro.
const DEFAULT_RESCHEDULE_WINDOW_HOURS = 24;

const SP_TZ = 'America/Sao_Paulo';

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
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

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

/**
 * ✅ Extrai YYYY-MM-DD + HH:mm em America/Sao_Paulo sem depender do timezone do server.
 */
function getSaoPauloParts(scheduleAt: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: SP_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(scheduleAt);

    const get = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? '';

    const y = Number(get('year'));
    const m = Number(get('month'));
    const d = Number(get('day'));
    const hh = Number(get('hour'));
    const mm = Number(get('minute'));

    return {
        y,
        m,
        d,
        hh,
        mm,
        dateKey: y && m && d ? `${y}-${pad2(m)}-${pad2(d)}` : '',
        timeHHMM:
            Number.isFinite(hh) && Number.isFinite(mm)
                ? `${pad2(hh)}:${pad2(mm)}`
                : '',
    };
}

/**
 * ✅ dateISO ao meio-dia do DIA EM SÃO PAULO, mas em ISO UTC (como o app espera).
 * Ex: 2026-01-17 (SP) => 2026-01-17T15:00:00.000Z (porque 12:00 -03 = 15:00Z)
 */
function toMobileDateISOAndStartTime(scheduleAt: Date) {
    const sp = getSaoPauloParts(scheduleAt);

    // fallback bem defensivo
    if (!sp.dateKey || !sp.timeHHMM) {
        const dateISO = new Date(
            scheduleAt.getFullYear(),
            scheduleAt.getMonth(),
            scheduleAt.getDate(),
            12,
            0,
            0,
            0
        ).toISOString();

        const startTime = `${pad2(scheduleAt.getHours())}:${pad2(
            scheduleAt.getMinutes()
        )}`;

        return { dateISO, startTime };
    }

    // 12:00 em SP (-03) => 15:00Z (sem depender do timezone do node)
    const dateISO = new Date(`${sp.dateKey}T12:00:00-03:00`).toISOString();

    return { dateISO, startTime: sp.timeHHMM };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const payload = await requireMobileAuth(req);
        const companyId = payload.companyId;

        // ✅ mobile “me/*” é só CLIENT
        if (payload.role !== 'CLIENT') {
            return NextResponse.json(
                { ok: false, error: 'Sem permissão' },
                { status: 403, headers: corsHeaders() }
            );
        }

        const { id } = await params;
        const apptId = String(id ?? '').trim();

        if (!apptId) {
            return NextResponse.json(
                { ok: false, error: 'Id ausente' },
                { status: 400, headers: corsHeaders() }
            );
        }

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
                professionalId: true,
                serviceId: true,

                unit: { select: { id: true, name: true } },
                professional: { select: { id: true, name: true } },
                service: {
                    select: {
                        id: true,
                        name: true,
                        durationMinutes: true,
                        cancelLimitHours: true,
                    },
                },
            },
        });

        if (!appt) {
            return NextResponse.json(
                { ok: false, error: 'Agendamento não encontrado' },
                { status: 404, headers: corsHeaders() }
            );
        }

        // ✅ Regra NOVA:
        // - Se o serviço tiver cancelLimitHours definido e válido => aplica janela.
        // - Se não tiver => pode remarcar (contanto que não esteja no passado).
        const configuredWindowHours = normalizeWindowHours(
            appt.service?.cancelLimitHours
        );

        let canReschedule = true;
        let reason: string | null = null;
        let diffHours: number | null = null;
        let windowHoursUsed: number | null = null;

        const now = new Date();

        // Não faz sentido remarcar algo já no passado
        if (appt.scheduleAt.getTime() <= now.getTime()) {
            canReschedule = false;
            reason = 'Este agendamento já passou.';
        } else if (configuredWindowHours) {
            const rules = computeCanReschedule(
                appt.scheduleAt,
                configuredWindowHours
            );
            canReschedule = rules.canReschedule;
            reason = rules.reason;
            diffHours = rules.diffHours;
            windowHoursUsed = rules.windowHours;
        } else {
            // Sem janela configurada: fica liberado
            // Mantemos campos de debug coerentes
            diffHours =
                (appt.scheduleAt.getTime() - now.getTime()) / (1000 * 60 * 60);
            windowHoursUsed = null;
        }

        const mobileParts = toMobileDateISOAndStartTime(appt.scheduleAt);

        return NextResponse.json(
            {
                ok: true,
                appointment: {
                    id: appt.id,
                    status: appt.status,

                    unitId: appt.unitId ?? null,
                    unitName: appt.unit?.name ?? null,

                    serviceId: appt.serviceId ?? null,
                    serviceName: appt.service?.name ?? null,

                    // ✅ compat com o app (barberId/barberName)
                    barberId: appt.professionalId ?? null,
                    barberName: appt.professional?.name ?? null,

                    scheduleAt: appt.scheduleAt.toISOString(),

                    // ✅ extras pro app
                    dateISO: mobileParts.dateISO,
                    startTime: mobileParts.startTime,

                    canReschedule,
                },
                rules: {
                    canReschedule,
                    reason,
                    diffHours,
                    windowHours:
                        windowHoursUsed ??
                        configuredWindowHours ??
                        DEFAULT_RESCHEDULE_WINDOW_HOURS,
                },
            },
            { status: 200, headers: corsHeaders() }
        );
    } catch (err: any) {
        console.error('[mobile/me/appointments/[id] GET] error:', err);

        const msg = String(err?.message ?? '');
        const isAuth =
            msg === 'missing_token' ||
            msg === 'missing_company_id' ||
            msg.includes('Invalid token payload') ||
            msg.toLowerCase().includes('jwt') ||
            msg.toLowerCase().includes('token') ||
            msg.toLowerCase().includes('signature');

        return NextResponse.json(
            {
                ok: false,
                error: isAuth
                    ? 'Não autorizado'
                    : 'Erro ao carregar agendamento',
            },
            { status: isAuth ? 401 : 500, headers: corsHeaders() }
        );
    }
}
