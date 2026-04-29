// src/app/api/mobile/auth/forgot-password/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'node:crypto';

/* ---------------------------------------------------------
 * Helpers
 * --------------------------------------------------------- */
function jsonErr(message: string, status = 400, headers?: HeadersInit) {
    return NextResponse.json(
        { ok: false, error: message },
        { status, headers }
    );
}

function jsonOk(data: unknown, status = 200, headers?: HeadersInit) {
    return NextResponse.json({ ok: true, data }, { status, headers });
}

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function toLowerEmail(v: unknown): string {
    return normalizeString(v).toLowerCase();
}

// ✅ header case-insensitive (padrão que usamos em outras rotas)
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

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

function hashToken(token: string): string {
    // ✅ nunca guardar token puro
    return crypto.createHash('sha256').update(token).digest('hex');
}

function makeOpaqueToken(): string {
    // ✅ token forte e “manuseável”
    return crypto.randomBytes(32).toString('hex'); // 64 chars
}

function shouldReturnTokenInResponse(req: Request): boolean {
    // 1) debug por querystring
    try {
        const url = new URL(req.url);
        const v = String(url.searchParams.get('debug') || '').trim();
        if (v === '1' || v === 'true') return true;
    } catch {
        // ignore
    }

    // 2) DEV: retorna token automaticamente
    // (para fechar o fluxo no app sem email)
    if (process.env.NODE_ENV !== 'production') return true;

    // 3) override por env se quiser ligar em prod temporariamente
    // (não recomendo manter ligado)
    const envFlag = String(
        process.env.PASSWORD_RESET_RETURN_TOKEN || ''
    ).trim();
    if (envFlag === '1' || envFlag === 'true') return true;

    return false;
}

/* ---------------------------------------------------------
 * OPTIONS
 * --------------------------------------------------------- */
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/* ---------------------------------------------------------
 * POST /api/mobile/auth/forgot-password
 * Body: { email: string, companyId?: string }
 *
 * Regras:
 * - Multi-tenant: companyId obrigatório (body ou header x-company-id)
 * - Não revela se email existe
 * - Cria PasswordResetToken (hash) expira rápido (ex: 20 min)
 * - Em DEV retorna token para fechar fluxo no app
 * - Em PROD não retorna token (apenas mensagem genérica)
 * --------------------------------------------------------- */
export async function POST(req: Request) {
    const headers = corsHeaders();

    try {
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return jsonErr('Body inválido', 400, headers);
        }

        const email = toLowerEmail((body as any).email);

        const companyIdFromBody = normalizeString((body as any).companyId);
        const companyIdFromHeader =
            getHeaderCI(req, 'x-company-id') ||
            getHeaderCI(req, 'x-companyid') ||
            null;

        const companyId = companyIdFromBody || companyIdFromHeader || '';

        if (!companyId) {
            return jsonErr('companyId é obrigatório', 400, headers);
        }

        if (!email || !email.includes('@')) {
            return jsonErr('Email inválido', 400, headers);
        }

        // ✅ valida empresa ativa
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, isActive: true },
        });

        if (!company || !company.isActive) {
            return jsonErr('Empresa inválida ou inativa', 400, headers);
        }

        // ✅ resposta “sempre ok” para não vazar se existe
        const genericMessage =
            'Se este email estiver cadastrado, enviaremos instruções para redefinir sua senha.';

        // ✅ procura usuário por email
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, isActive: true },
        });

        // ✅ checa membership ativo nessa company
        const member = user?.id
            ? await prisma.companyMember.findUnique({
                  where: {
                      companyId_userId: { companyId, userId: user.id },
                  },
                  select: { id: true, isActive: true },
              })
            : null;

        // Se não existe user, ou não é membro ativo, ou user inativo: devolve genérico
        if (!user || !user.isActive || !member || !member.isActive) {
            return jsonOk({ message: genericMessage }, 200, headers);
        }

        const now = new Date();

        // ✅ gera token opaco e salva hash
        const token = makeOpaqueToken();
        const tokenHash = hashToken(token);

        // ✅ expira rápido (20 min)
        const expiresAt = new Date(now.getTime() + 20 * 60 * 1000);

        // ✅ Invalida tokens anteriores não usados desse user+company
        // (deixa 1 token vivo por vez)
        await prisma.passwordResetToken.updateMany({
            where: {
                companyId,
                userId: user.id,
                usedAt: null,
                expiresAt: { gt: now },
            },
            data: { usedAt: now },
        });

        await prisma.passwordResetToken.create({
            data: {
                companyId,
                userId: user.id,
                tokenHash,
                expiresAt,
            },
        });

        // ✅ DEV: retorna token para fechar o fluxo no app
        if (shouldReturnTokenInResponse(req)) {
            return jsonOk(
                {
                    message: genericMessage,
                    token,
                    expiresAt: expiresAt.toISOString(),
                },
                200,
                headers
            );
        }

        // ✅ PROD: não retorna token
        return jsonOk({ message: genericMessage }, 200, headers);
    } catch (err) {
        console.error('[mobile forgot-password]', err);
        return jsonErr('Erro inesperado', 500, headers);
    }
}
