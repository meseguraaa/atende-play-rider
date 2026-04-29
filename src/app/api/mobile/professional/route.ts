// src/app/api/mobile/professional/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';

export const dynamic = 'force-dynamic';

type Role = 'CLIENT' | 'BARBER' | 'ADMIN';

type MobileTokenPayload = {
    sub: string;
    role: Role;
    companyId: string; // ✅ multi-tenant obrigatório
    profile_complete?: boolean;

    // compat (tokens antigos / logs). Não confie nisso pra auth.
    email?: string;
    name?: string | null;
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

// ✅ header case-insensitive (padrão que você já usa em /orders e /products)
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
 * - prioriza x-forwarded-proto + x-forwarded-host
 * - fallback host
 * - fallback final: req.url origin
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

    // último fallback
    try {
        return new URL(req.url).origin;
    } catch {
        return '';
    }
}

/**
 * ✅ normaliza imagem (mesmo conceito do /products):
 * - se vier absoluta (http/https), mantém
 * - se vier "/uploads/..." ou "uploads/...", transforma em "<origin>/uploads/..."
 * - se vier "data:image/..." (base64), mantém
 * - se vier vazia, null
 */
function normalizeImageUrl(origin: string, raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();

    // ✅ já é absoluta
    if (lower.startsWith('http://') || lower.startsWith('https://')) return s;

    // ✅ base64/data uri
    if (lower.startsWith('data:image/')) return s;

    // ✅ paths relativos: garante leading slash
    const path = s.startsWith('/') ? s : `/${s}`;
    const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;

    // se origin falhar, ao menos devolve o path (pra app tentar resolver)
    return base ? `${base}${path}` : path;
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

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * GET /api/mobile/professional?unitId=...&serviceId=... (serviceId opcional no novo fluxo)
 */
export async function GET(req: Request) {
    const headers = corsHeaders();

    try {
        const auth = await requireMobileAuth(req);
        const companyId = auth.companyId;

        // ✅ origem correta atrás de proxy (ngrok/vercel/etc)
        const origin = getRequestOrigin(req);

        // defesa opcional: se vier header, precisa bater com o token
        const headerCompanyId = getHeaderCI(req, 'x-company-id');
        if (headerCompanyId && headerCompanyId !== companyId) {
            return NextResponse.json(
                { error: 'company_id_mismatch' },
                { status: 400, headers }
            );
        }

        const url = new URL(req.url);
        const unitId = String(url.searchParams.get('unitId') ?? '').trim();

        // ✅ NOVO FLUXO: serviceId é opcional
        const serviceId = String(
            url.searchParams.get('serviceId') ?? ''
        ).trim();

        if (!unitId) {
            return NextResponse.json(
                { error: 'unitId é obrigatório' },
                { status: 400, headers }
            );
        }

        // ✅ valida unidade no tenant antes de listar
        const unit = await prisma.unit.findFirst({
            where: { id: unitId, companyId, isActive: true },
            select: { id: true },
        });

        if (!unit) {
            return NextResponse.json(
                { error: 'Unidade não encontrada' },
                { status: 404, headers }
            );
        }

        /**
         * ✅ Regra:
         * - Sempre filtra por: (companyId + isActive) + vínculo na unidade
         * - Se serviceId vier: também filtra por vínculo no serviço
         */
        const where: any = {
            companyId,
            isActive: true,
            units: {
                some: {
                    companyId,
                    unitId,
                    isActive: true,
                },
            },
        };

        if (serviceId) {
            // ✅ valida service no tenant (opcional, mas bom pra erro limpo)
            const service = await prisma.service.findFirst({
                where: { id: serviceId, companyId, isActive: true },
                select: { id: true },
            });

            if (!service) {
                return NextResponse.json(
                    { error: 'Serviço não encontrado' },
                    { status: 404, headers }
                );
            }

            where.services = {
                some: {
                    companyId,
                    serviceId,
                },
            };
        }

        const rows = await prisma.professional.findMany({
            where,
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,

                // ✅ novo padrão
                imageUrl: true,

                // ✅ legado (caso tenha user.image ainda)
                user: {
                    select: {
                        image: true,
                    },
                },
            },
        });

        const professionals = rows.map((p) => {
            // ✅ pega o raw do novo padrão ou legado
            const rawImage = (p as any).imageUrl ?? (p as any)?.user?.image;

            return {
                id: p.id,
                name: p.name,
                imageUrl: normalizeImageUrl(origin, rawImage),
            };
        });

        const res = NextResponse.json(
            { ok: true, professionals },
            { status: 200, headers }
        );

        res.headers.set('x-company-id', companyId);
        return res;
    } catch (err: any) {
        const msg = String(err?.message ?? '');

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

        console.error('[mobile/professional] error:', err);
        return NextResponse.json(
            { error: 'server_error' },
            { status: 500, headers }
        );
    }
}
