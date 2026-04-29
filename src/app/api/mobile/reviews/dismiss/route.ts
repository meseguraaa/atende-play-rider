import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Role = 'CLIENT' | 'PROFESSIONAL' | 'ADMIN' | 'BARBER';

type MobileTokenPayload = {
    sub: string;
    role?: Role;
    companyId: string;
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

function getJwtSecretKey() {
    const secret = process.env.APP_JWT_SECRET;
    if (!secret) throw new Error('APP_JWT_SECRET não definido no .env');
    return new TextEncoder().encode(secret);
}

// ✅ header case-insensitive
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
    const auth = req.headers.get('authorization') || '';
    const token = auth.toLowerCase().startsWith('bearer ')
        ? auth.slice(7).trim()
        : '';
    if (!token) throw new Error('missing_token');

    const { payload } = await jwtVerify(token, getJwtSecretKey());

    const sub = String((payload as any)?.sub || '').trim();
    if (!sub) throw new Error('invalid_token');

    const tokenCompanyId =
        typeof (payload as any)?.companyId === 'string'
            ? String((payload as any).companyId).trim()
            : '';

    const headerCompanyId = getHeaderCI(req, 'x-company-id') ?? '';
    const companyId = tokenCompanyId || headerCompanyId;
    if (!companyId) throw new Error('companyId_missing');

    // ✅ anti-spoof
    const membership = await prisma.companyMember.findFirst({
        where: { userId: sub, companyId, isActive: true },
        select: { id: true, role: true },
    });

    if (!membership) throw new Error('forbidden_company');

    return { sub, role: (payload as any)?.role, companyId };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

const schema = z.object({
    appointmentId: z.string().min(1, 'appointmentId é obrigatório'),
});

export async function POST(req: Request) {
    const headers = corsHeaders();

    try {
        const me = await requireMobileAuth(req);

        if (me.role && me.role !== 'CLIENT') {
            return NextResponse.json(
                { ok: false, error: 'Sem permissão.' },
                { status: 403, headers }
            );
        }

        const body = await req.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { ok: false, error: 'Dados inválidos.' },
                { status: 400, headers }
            );
        }

        const { appointmentId } = parsed.data;

        const appointment = await prisma.appointment.findFirst({
            where: { id: appointmentId, companyId: me.companyId },
            select: {
                id: true,
                clientId: true,
                reviewModalShown: true,
                review: { select: { id: true } },
            },
        });

        if (!appointment) {
            return NextResponse.json(
                { ok: false, error: 'Atendimento não encontrado.' },
                { status: 404, headers }
            );
        }

        if (appointment.clientId !== me.sub) {
            return NextResponse.json(
                { ok: false, error: 'Você não pode alterar esse atendimento.' },
                { status: 403, headers }
            );
        }

        // idempotente: se já tem review ou já foi marcado, ok
        if (appointment.review || appointment.reviewModalShown) {
            const res = NextResponse.json(
                { ok: true },
                { status: 200, headers }
            );
            res.headers.set('x-company-id', me.companyId);
            return res;
        }

        await prisma.appointment.updateMany({
            where: {
                id: appointmentId,
                companyId: me.companyId,
                clientId: me.sub,
            },
            data: { reviewModalShown: true },
        });

        const res = NextResponse.json({ ok: true }, { status: 200, headers });
        res.headers.set('x-company-id', me.companyId);
        return res;
    } catch (err: any) {
        const msg = String(err?.message ?? 'Erro ao atualizar.');
        const lower = msg.toLowerCase();

        const isAuth =
            lower.includes('missing_token') ||
            lower.includes('invalid_token') ||
            lower.includes('jwt') ||
            lower.includes('signature') ||
            lower.includes('companyid') ||
            lower.includes('forbidden_company');

        return NextResponse.json(
            { ok: false, error: isAuth ? 'Não autorizado' : msg },
            { status: isAuth ? 401 : 500, headers }
        );
    }
}
