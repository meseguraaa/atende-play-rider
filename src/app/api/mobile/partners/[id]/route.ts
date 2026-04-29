// src/app/api/mobile/partners/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Role = 'CLIENT' | 'BARBER' | 'ADMIN';

type MobileTokenPayload = {
    sub: string;
    role: Role;
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

// ✅ header case-insensitive (padrão das rotas mobile)
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

/**
 * ✅ resolve origin correto atrás de proxy (ngrok/vercel/etc)
 */
function getRequestOrigin(req: Request): string {
    const protoRaw = getHeaderCI(req, 'x-forwarded-proto');
    const hostRaw =
        getHeaderCI(req, 'x-forwarded-host') || getHeaderCI(req, 'host');

    const proto = String(protoRaw ?? '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    const host = String(hostRaw ?? '')
        .split(',')[0]
        .trim();

    if (host) {
        const safeProto =
            proto === 'http' || proto === 'https' ? proto : 'https';
        return `${safeProto}://${host}`;
    }

    try {
        return new URL(req.url).origin;
    } catch {
        return '';
    }
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
        select: { id: true },
    });

    if (!membership) throw new Error('forbidden_company');

    return { ...(payload as any), sub, companyId } as MobileTokenPayload;
}

/**
 * ✅ normaliza logo (mesmo padrão do /products):
 * - se vier absoluta (http/https), mantém
 * - MAS se for localhost/127.0.0.1, reescreve pro origin calculado
 * - se vier "/uploads/...", transforma em "<origin>/uploads/..."
 * - se vier vazia, null
 */
function normalizeImageUrl(origin: string, raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();

    // absoluta
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
        try {
            const u = new URL(s);
            const h = u.hostname?.toLowerCase?.() ?? '';
            if (h === 'localhost' || h === '127.0.0.1') {
                const base = origin.endsWith('/')
                    ? origin.slice(0, -1)
                    : origin;
                return `${base}${u.pathname}${u.search}`;
            }
        } catch {
            // se der ruim no parse, mantém como está
        }
        return s;
    }

    // relativa
    const path = s.startsWith('/') ? s : `/${s}`;
    const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    return `${base}${path}`;
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * GET /api/mobile/partners/:id
 */
export async function GET(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    const headers = corsHeaders();

    try {
        const auth = await requireMobileAuth(req);
        const companyId = auth.companyId;

        const origin = getRequestOrigin(req);

        // defesa opcional: se vier header, precisa bater com o token
        const headerCompanyId = getHeaderCI(req, 'x-company-id');
        if (headerCompanyId && headerCompanyId !== companyId) {
            return NextResponse.json(
                { error: 'company_id_mismatch' },
                {
                    status: 400,
                    headers: { ...headers, 'Cache-Control': 'no-store' },
                }
            );
        }

        const { id } = await ctx.params;
        const partnerId = String(id ?? '').trim();
        if (!partnerId) {
            return NextResponse.json(
                { error: 'missing_id' },
                { status: 400, headers }
            );
        }

        const p = await prisma.partner.findFirst({
            where: {
                id: partnerId,
                isActive: true,
                OR: [
                    { visibilityMode: 'ALL' as any },
                    {
                        visibilityMode: 'SELECTED' as any,
                        companies: {
                            some: { companyId, isEnabled: true },
                        },
                    },
                ],
            },
            select: {
                id: true,
                name: true,
                logoUrl: true,
                logoKey: true,
                discountPct: true,
                description: true,
                rules: true,
                ctaUrl: true,
                ctaLabel: true,
            },
        });

        if (!p) {
            return NextResponse.json(
                { error: 'not_found' },
                { status: 404, headers }
            );
        }

        const item = {
            id: p.id,
            name: p.name,
            logoUrl: normalizeImageUrl(origin, p.logoUrl),
            discountPct:
                typeof (p as any).discountPct === 'number'
                    ? (p as any).discountPct
                    : Number((p as any).discountPct ?? 0),
            description: p.description ?? null,
            rules: p.rules ?? null,
            ctaUrl: p.ctaUrl,
            ctaLabel: p.ctaLabel ?? 'Ativar cashback e ir pra loja',
        };

        const res = NextResponse.json(
            { ok: true, partner: item, item },
            {
                status: 200,
                headers: { ...headers, 'Cache-Control': 'no-store' },
            }
        );

        res.headers.set('x-company-id', companyId);
        return res;
    } catch (e: any) {
        const msg = String(e?.message ?? '');

        if (msg.includes('missing_token')) {
            return NextResponse.json(
                { error: 'missing_token' },
                { status: 401, headers }
            );
        }

        if (msg.includes('missing_company_id')) {
            return NextResponse.json(
                { error: 'missing_company_id' },
                { status: 401, headers }
            );
        }

        if (msg.includes('forbidden_company')) {
            return NextResponse.json(
                { error: 'forbidden_company' },
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
                { error: 'invalid_token' },
                { status: 401, headers }
            );
        }

        console.error('[mobile partner detail] error:', e);
        return NextResponse.json(
            { error: 'server_error' },
            { status: 500, headers }
        );
    }
}
