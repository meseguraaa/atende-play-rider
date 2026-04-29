// src/app/api/mobile/reviews/pending/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Role = 'CLIENT' | 'BARBER' | 'ADMIN';

type MobileTokenPayload = {
    sub: string;
    role?: Role;
    companyId: string; // ✅ multi-tenant obrigatório
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

// ✅ header case-insensitive (mesmo padrão do /products)
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
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) throw new Error('missing_token');

    const payload = await verifyAppJwt(token);

    const sub =
        typeof (payload as any)?.sub === 'string'
            ? String((payload as any).sub).trim()
            : '';
    if (!sub) throw new Error('invalid_token');

    // 1) companyId do JWT
    let companyId =
        typeof (payload as any)?.companyId === 'string'
            ? String((payload as any).companyId).trim()
            : '';

    // 2) fallback: x-company-id
    if (!companyId) {
        const h = getHeaderCI(req, 'x-company-id');
        if (h) companyId = h;
    }

    if (!companyId) throw new Error('missing_company_id');

    // ✅ valida membership (anti-spoof)
    const membership = await prisma.companyMember.findFirst({
        where: { userId: sub, companyId, isActive: true },
        select: { id: true, role: true },
    });

    if (!membership) throw new Error('forbidden_company');

    return { ...(payload as any), sub, companyId } as MobileTokenPayload;
}

function pickScheduleIso(a: any) {
    const d = a?.doneAt ?? a?.checkedOutAt ?? a?.scheduleAt ?? a?.updatedAt;
    const dt = new Date(d ?? Date.now());
    return Number.isFinite(dt.getTime())
        ? dt.toISOString()
        : new Date().toISOString();
}

function pickProfessionalName(a: any) {
    const s = String(a?.professional?.name ?? '').trim();
    return s || 'Profissional';
}

function pickServiceName(a: any) {
    const s1 = String(a?.service?.name ?? '').trim();
    if (s1) return s1;

    const s2 = String(a?.description ?? '').trim();
    if (s2) return s2;

    return 'Serviço';
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * GET /api/mobile/reviews/pending
 * Retorna:
 * { ok, pendings: [{ appointmentId, scheduleAt, barberName, serviceName }], tags: [{id,label}] }
 *
 * Obs: mantive "barberName" no JSON por compat com o app mobile.
 */
export async function GET(req: Request) {
    const headers = corsHeaders();

    try {
        const me = await requireMobileAuth(req);
        const companyId = me.companyId;

        if (me.role && me.role !== 'CLIENT') {
            return NextResponse.json(
                { ok: false, error: 'Sem permissão.' },
                { status: 403, headers }
            );
        }

        // defesa opcional: se vier header, precisa bater com o token
        const headerCompanyId = getHeaderCI(req, 'x-company-id');
        if (headerCompanyId && headerCompanyId !== companyId) {
            return NextResponse.json(
                { ok: false, error: 'company_id_mismatch' },
                { status: 400, headers }
            );
        }

        const clientId = me.sub;

        // ✅ pendências = DONE + sem review + ainda não dispensado
        const pendingsRaw = await prisma.appointment.findMany({
            where: {
                companyId,
                clientId,
                status: 'DONE',
                professionalId: { not: null }, // ✅ existe no schema
                review: { is: null },
                reviewModalShown: false,
            },
            orderBy: [
                { doneAt: 'desc' },
                { checkedOutAt: 'desc' },
                { updatedAt: 'desc' },
            ],
            take: 20,
            select: {
                id: true,
                scheduleAt: true,
                updatedAt: true,
                doneAt: true,
                checkedOutAt: true,
                description: true,
                professional: { select: { name: true } },
                service: { select: { name: true } },
            },
        });

        const pendings = pendingsRaw.map((a) => ({
            appointmentId: a.id,
            scheduleAt: pickScheduleIso(a),
            barberName: a.professional?.name?.trim() || 'Profissional',
            serviceName:
                a.service?.name?.trim() || a.description?.trim() || 'Serviço',
        }));

        const tags = await prisma.reviewTag.findMany({
            where: { companyId, isActive: true },
            orderBy: [{ label: 'asc' }],
            select: { id: true, label: true },
            take: 50,
        });

        const _debug =
            process.env.NODE_ENV === 'development'
                ? {
                      companyId,
                      clientId,
                      pendingsCount: pendings.length,
                      tagsCount: tags.length,
                  }
                : undefined;

        const res = NextResponse.json(
            { ok: true, pendings, tags, _debug },
            { status: 200, headers }
        );
        res.headers.set('x-company-id', companyId);
        return res;
    } catch (e: any) {
        const msg = String(e?.message ?? '');

        if (msg.includes('missing_token')) {
            return NextResponse.json(
                { ok: false, error: 'missing_token' },
                { status: 401, headers }
            );
        }

        if (msg.includes('missing_company_id')) {
            return NextResponse.json(
                { ok: false, error: 'missing_company_id' },
                { status: 401, headers }
            );
        }

        if (msg.includes('forbidden_company')) {
            return NextResponse.json(
                { ok: false, error: 'forbidden_company' },
                { status: 403, headers }
            );
        }

        if (
            msg.includes('Invalid token') ||
            msg.includes('JWT') ||
            msg.toLowerCase().includes('token') ||
            msg.includes('invalid_token')
        ) {
            return NextResponse.json(
                { ok: false, error: 'invalid_token' },
                { status: 401, headers }
            );
        }

        console.error('[mobile reviews pending] error:', e);
        return NextResponse.json(
            { ok: false, error: 'server_error' },
            { status: 500, headers }
        );
    }
}
