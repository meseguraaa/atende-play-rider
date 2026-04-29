import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';
import { AppointmentPlanUsageType } from '@prisma/client';

export const dynamic = 'force-dynamic';

type MobileTokenPayload = {
    sub: string;
    role?: 'CLIENT' | 'PROFESSIONAL' | 'ADMIN' | 'BARBER';
    email?: string;
    name?: string | null;
    companyId: string;
};

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

function toNumberDecimal(v: any): number {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;

    if (typeof v === 'string') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : NaN;
    }

    if (typeof v === 'object') {
        try {
            const s =
                typeof (v as any).toString === 'function'
                    ? String((v as any).toString())
                    : '';
            const n = Number(s.replace(',', '.'));
            return Number.isFinite(n) ? n : NaN;
        } catch {
            return NaN;
        }
    }

    return NaN;
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
    const auth = getHeaderCI(req, 'authorization') || '';
    const token = auth.toLowerCase().startsWith('bearer ')
        ? auth.slice(7).trim()
        : '';
    if (!token) throw new Error('missing_token');

    const payload = (await verifyAppJwt(token)) as any;

    let companyId =
        typeof payload?.companyId === 'string'
            ? String(payload.companyId).trim()
            : '';

    if (!companyId) {
        const h = getHeaderCI(req, 'x-company-id');
        if (h) companyId = h;
    }

    if (!companyId) throw new Error('missing_company_id');

    return { ...(payload as any), companyId } as MobileTokenPayload;
}

function formatPtBrDateTime(date: Date) {
    const d = new Date(date);
    const dateLabel = d.toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    const timeLabel = d.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
    });
    return `${dateLabel} • ${timeLabel}`;
}

function computeStatusLabel(status?: string | null) {
    const s = String(status ?? '').toUpperCase();
    if (s === 'PENDING') return 'CONFIRMADO';
    if (s === 'DONE') return 'CONCLUÍDO';
    if (s === 'CANCELED') return 'CANCELADO';
    return 'CONFIRMADO';
}

function hoursDiff(dateFuture: Date, now: Date) {
    return (dateFuture.getTime() - now.getTime()) / (1000 * 60 * 60);
}

function computePolicy(params: {
    now: Date;
    scheduleAt: Date;
    appointmentStatus: string;
    cancelLimitHours?: number | null;
    cancelFeePercentage?: number | null;
}) {
    const {
        now,
        scheduleAt,
        appointmentStatus,
        cancelLimitHours,
        cancelFeePercentage,
    } = params;

    const statusUpper = String(appointmentStatus ?? '').toUpperCase();

    if (statusUpper !== 'PENDING') {
        return {
            status: statusUpper,
            statusLabel: computeStatusLabel(statusUpper),
            canCancel: false,
            canReschedule: false,
            cancellationFeeEligible: false,
            cancellationFeeNotice: null as string | null,
            isInService: false,
        };
    }

    const isInService = now.getTime() >= scheduleAt.getTime();
    if (isInService) {
        return {
            status: 'IN_SERVICE',
            statusLabel: 'ATENDIMENTO',
            canCancel: false,
            canReschedule: false,
            cancellationFeeEligible: false,
            cancellationFeeNotice: null,
            isInService: true,
        };
    }

    const canCancel = true;

    const h = hoursDiff(scheduleAt, now);
    const hasLimit =
        typeof cancelLimitHours === 'number' && cancelLimitHours > 0;
    const canReschedule = !hasLimit || h >= cancelLimitHours;

    const hasFee =
        typeof cancelFeePercentage === 'number' &&
        Number.isFinite(cancelFeePercentage) &&
        cancelFeePercentage > 0;

    const cancellationFeeEligible =
        hasLimit && hasFee && h < (cancelLimitHours as number);

    const cancellationFeeNotice = cancellationFeeEligible
        ? 'Este cancelamento pode gerar uma taxa de cancelamento, conforme a política do estabelecimento.'
        : null;

    return {
        status: 'PENDING',
        statusLabel: computeStatusLabel('PENDING'),
        canCancel,
        canReschedule,
        cancellationFeeEligible,
        cancellationFeeNotice,
        isInService: false,
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

type NextAppointmentRow = {
    id: string;
    status: string;
    confirmationStatus: string | null;
    scheduleAt: Date;
    createdAt: Date;
    description: string | null;
    planUsageType: AppointmentPlanUsageType;
    unit: { id: string; name: string } | null;
    professional: { id: string; name: string } | null;
    service: {
        id: string;
        name: string;
        cancelLimitHours: number | null;
        cancelFeePercentage: any;
    } | null;
};

export async function GET(req: Request) {
    try {
        const payload = await requireMobileAuth(req);

        if (payload.role && payload.role !== 'CLIENT') {
            return NextResponse.json(
                { error: 'Sem permissão' },
                { status: 403, headers: corsHeaders() }
            );
        }

        const now = new Date();
        const LOOKBACK_HOURS = 24;
        const lookbackStart = new Date(
            now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000
        );

        const appointments = (await prisma.appointment.findMany({
            where: {
                companyId: payload.companyId,
                clientId: payload.sub,
                status: 'PENDING',
                confirmationStatus: { not: 'CANCELED' },
                scheduleAt: { gte: lookbackStart },
            },
            orderBy: [{ scheduleAt: 'asc' }, { createdAt: 'asc' }],
            select: {
                id: true,
                status: true,
                confirmationStatus: true,
                scheduleAt: true,
                createdAt: true,
                description: true,
                planUsageType: true,
                unit: { select: { id: true, name: true } },
                professional: { select: { id: true, name: true } },
                service: {
                    select: {
                        id: true,
                        name: true,
                        cancelLimitHours: true,
                        cancelFeePercentage: true,
                    },
                },
            },
        })) as NextAppointmentRow[];

        if (!appointments.length) {
            return NextResponse.json(
                { ok: true, next: null, appointments: [] },
                { status: 200, headers: corsHeaders() }
            );
        }

        const normalizedAppointments = appointments.map((item) => {
            const feePct = toNumberDecimal(item.service?.cancelFeePercentage);
            const feePctSafe = Number.isFinite(feePct) ? feePct : null;

            const policy = computePolicy({
                now,
                scheduleAt: item.scheduleAt,
                appointmentStatus: item.status,
                cancelLimitHours: item.service?.cancelLimitHours ?? null,
                cancelFeePercentage: feePctSafe,
            });

            const usesPlanCredit =
                item.planUsageType === AppointmentPlanUsageType.PLAN_CREDIT;

            const planCancellationNotice = usesPlanCredit
                ? 'Este cancelamento pode gerar o débito de 1 crédito do seu plano, conforme a política do estabelecimento.'
                : null;

            return {
                id: item.id,
                serviceName:
                    item.service?.name ?? item.description ?? 'Serviço',
                unitName: item.unit?.name ?? 'Unidade',
                barberName: item.professional?.name ?? 'Profissional',
                startsAtLabel: formatPtBrDateTime(item.scheduleAt),

                status: policy.status,
                statusLabel: policy.statusLabel,

                canCancel: policy.canCancel,
                canReschedule: policy.canReschedule,
                cancellationFeeEligible: policy.cancellationFeeEligible,
                cancellationFeeNotice: policy.cancellationFeeNotice,

                usesPlanCredit,
                planCancellationNotice,

                unitId: item.unit?.id ?? null,
                serviceId: item.service?.id ?? null,
                barberId: item.professional?.id ?? null,

                scheduleAt: item.scheduleAt,
                createdAt: item.createdAt,
            };
        });

        return NextResponse.json(
            {
                ok: true,
                next: normalizedAppointments[0] ?? null,
                appointments: normalizedAppointments,
            },
            { status: 200, headers: corsHeaders() }
        );
    } catch (err: any) {
        const msg = String(err?.message ?? '');
        const lower = msg.toLowerCase();

        const isAuth =
            msg === 'missing_token' ||
            msg === 'missing_company_id' ||
            lower.includes('jwt') ||
            lower.includes('token') ||
            lower.includes('signature');

        if (isAuth) {
            return NextResponse.json(
                { error: 'Não autorizado' },
                { status: 401, headers: corsHeaders() }
            );
        }

        console.error('[mobile/me/appointments/next] error:', err);
        return NextResponse.json(
            { error: 'Erro ao buscar próximo agendamento' },
            { status: 500, headers: corsHeaders() }
        );
    }
}
