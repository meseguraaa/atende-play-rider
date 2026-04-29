// src/app/api/mobile/units/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';

type Role = 'CLIENT' | 'BARBER' | 'ADMIN';

type MobileTokenPayload = {
    sub: string;
    role?: Role;

    // ⚠️ pode existir em alguns ambientes, mas não confiamos 100% nele
    companyId?: string;

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

function getCompanyIdFromHeader(req: Request): string | null {
    const raw =
        req.headers.get('x-company-id') ||
        req.headers.get('X-Company-Id') ||
        req.headers.get('x-companyid') ||
        req.headers.get('X-CompanyId');

    const v = typeof raw === 'string' ? raw.trim() : '';
    return v.length ? v : null;
}

function normalizeSub(payload: any) {
    const sub = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    return sub;
}

function normalizeCompanyIdFromToken(payload: any) {
    const companyId =
        typeof payload?.companyId === 'string'
            ? String(payload.companyId).trim()
            : '';
    return companyId.length ? companyId : null;
}

async function requireMobileAuth(req: Request, reqId: string) {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

    // ✅ log do header (sem vazar token inteiro)
    console.log(
        `[mobile/units:${reqId}] auth header:`,
        auth ? 'present' : 'missing'
    );
    console.log(
        `[mobile/units:${reqId}] token length:`,
        token ? String(token.length) : '0'
    );

    if (!token) throw new Error('Token ausente');

    // ✅ padroniza com o helper do projeto
    const payload = (await verifyAppJwt(token)) as any;

    const sub = normalizeSub(payload);
    if (!sub) throw new Error('Token inválido');

    const role = (payload as any)?.role as Role | undefined;

    const companyIdFromToken = normalizeCompanyIdFromToken(payload);

    const safePayload: MobileTokenPayload = {
        sub,
        role,
        companyId: companyIdFromToken ?? undefined,
        email:
            typeof (payload as any)?.email === 'string'
                ? (payload as any).email
                : undefined,
        name: (payload as any)?.name ?? null,
    };

    return safePayload;
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
    const reqId = Math.random().toString(16).slice(2, 8);
    const startedAt = Date.now();

    try {
        console.log(
            `\n[mobile/units:${reqId}] ====== GET /api/mobile/units ======`
        );
        console.log(`[mobile/units:${reqId}] url:`, req.url);
        console.log(`[mobile/units:${reqId}] time:`, new Date().toISOString());

        // ✅ ajuda a detectar “outro ambiente / outro banco”
        console.log(
            `[mobile/units:${reqId}] env DATABASE_URL:`,
            process.env.DATABASE_URL ? 'present' : 'missing'
        );
        console.log(
            `[mobile/units:${reqId}] env APP_JWT_SECRET:`,
            process.env.APP_JWT_SECRET ? 'present' : 'missing'
        );

        const payload = await requireMobileAuth(req, reqId);

        // ✅ multi-tenant: preferimos o header (padrão do app)
        const companyIdHeader = getCompanyIdFromHeader(req);
        const companyId = companyIdHeader ?? payload.companyId ?? null;

        console.log(`[mobile/units:${reqId}] auth payload:`, {
            sub: payload.sub,
            role: payload.role ?? null,
            companyIdFromHeader: companyIdHeader ?? null,
            companyIdFromToken: payload.companyId ?? null,
            resolvedCompanyId: companyId,
            email: payload.email ?? null,
        });

        if (!companyId) {
            throw new Error('companyId ausente (header x-company-id ou token)');
        }

        console.log(`[mobile/units:${reqId}] querying prisma.unit.findMany...`);

        // ✅ multi-tenant REAL: sempre filtra por companyId
        const units = await prisma.unit.findMany({
            where: {
                companyId,
                // ✅ compat: traz true e null (só exclui false)
                isActive: { not: false },
            },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
        });

        console.log(`[mobile/units:${reqId}] prisma returned:`, {
            count: units.length,
            sample: units.slice(0, 3),
        });

        console.log(
            `[mobile/units:${reqId}] done in(ms):`,
            Date.now() - startedAt
        );

        return NextResponse.json(
            {
                ok: true,
                units,
                auth: {
                    sub: payload.sub,
                    role: payload.role ?? null,
                    companyId,
                },
                count: units.length,
            },
            { status: 200, headers: corsHeaders() }
        );
    } catch (err: any) {
        const msg = String(err?.message ?? 'Erro');

        console.error(`[mobile/units:${reqId}] ❌ error name:`, err?.name);
        console.error(`[mobile/units:${reqId}] ❌ error message:`, msg);
        console.error(`[mobile/units:${reqId}] ❌ error stack:`, err?.stack);
        console.error(`[mobile/units:${reqId}] ❌ raw:`, err);

        // se for Prisma
        console.error(`[mobile/units:${reqId}] prisma code:`, err?.code);
        console.error(`[mobile/units:${reqId}] prisma meta:`, err?.meta);

        // ✅ auth/companyId: devolve 401
        const lower = msg.toLowerCase();
        if (
            lower.includes('token') ||
            lower.includes('jwt') ||
            lower.includes('signature') ||
            lower.includes('jws') ||
            lower.includes('unauthorized') ||
            lower.includes('não autorizado') ||
            lower.includes('companyid')
        ) {
            return NextResponse.json(
                { ok: false, error: 'Não autorizado' },
                { status: 401, headers: corsHeaders() }
            );
        }

        const isDev = process.env.NODE_ENV !== 'production';

        return NextResponse.json(
            {
                ok: false,
                error: 'Erro ao listar unidades',
                details: isDev ? msg || 'no-message' : undefined,
            },
            { status: 500, headers: corsHeaders() }
        );
    }
}
