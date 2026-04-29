// src/app/api/mobile/auth/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { signAppJwt } from '@/lib/app-jwt';

export const dynamic = 'force-dynamic';

/* ---------------------------------------------------------
 * Helpers
 * --------------------------------------------------------- */
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

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

// ✅ header case-insensitive (padrão do projeto)
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

function computeProfileComplete(u: {
    phone: string | null;
    birthday: Date | null;
}) {
    const phoneOk = typeof u.phone === 'string' && u.phone.trim().length > 0;
    const birthdayOk =
        u.birthday instanceof Date && !Number.isNaN(u.birthday.getTime());
    return phoneOk && birthdayOk;
}

/* ---------------------------------------------------------
 * OPTIONS
 * --------------------------------------------------------- */
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/* ---------------------------------------------------------
 * POST /api/mobile/auth
 * Body: { email: string, password: string, companyId?: string }
 *
 * Regras:
 * - Multi-tenant: companyId obrigatório (body ou header x-company-id)
 * - Empresa precisa estar ativa
 * - Usuário precisa estar ativo
 * - Precisa ser membro ativo da empresa (CompanyMember)
 * - Verifica senha via bcrypt
 * - Retorna JWT do app (signAppJwt)
 * --------------------------------------------------------- */
export async function POST(req: Request) {
    const headers = corsHeaders();

    try {
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return jsonErr('Body inválido', 400, headers);
        }

        const email = toLowerEmail((body as any).email);
        const password = normalizeString((body as any).password);

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

        if (!password) {
            return jsonErr('Senha é obrigatória', 400, headers);
        }

        // ✅ valida empresa ativa
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, isActive: true },
        });

        if (!company || !company.isActive) {
            return jsonErr('Empresa inválida ou inativa', 400, headers);
        }

        // ✅ busca usuário (inclui hash)
        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                birthday: true,
                role: true,
                isActive: true,
                passwordHash: true,
                image: true,
            },
        });

        // Evita vazar existência do email (mensagem genérica)
        const invalidCreds = () =>
            jsonErr('Credenciais inválidas', 401, headers);

        if (!user || !user.isActive) return invalidCreds();
        if (!user.passwordHash) return invalidCreds();

        // ✅ precisa ser membro ativo da empresa
        const member = await prisma.companyMember.findUnique({
            where: { companyId_userId: { companyId, userId: user.id } },
            select: { id: true, isActive: true, role: true, lastUnitId: true },
        });

        if (!member || !member.isActive) return invalidCreds();

        // ✅ verifica senha
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return invalidCreds();

        const profileComplete = computeProfileComplete({
            phone: user.phone ?? null,
            birthday: user.birthday ?? null,
        });

        // ✅ assina token do app (agora com profile_complete)
        const token = await signAppJwt({
            sub: user.id,
            role: (user.role as any) ?? 'CLIENT',
            companyId,
            email: user.email,
            name: user.name ?? null,
            profile_complete: profileComplete,
        });

        return jsonOk(
            {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    birthday: user.birthday,
                    role: user.role,
                    image: user.image,
                    companyId,
                    memberRole: member.role,
                    lastUnitId: member.lastUnitId ?? null,
                    profileComplete,
                },
            },
            200,
            headers
        );
    } catch (err) {
        console.error('[mobile auth/login]', err);
        return jsonErr('Erro inesperado ao fazer login', 500, headers);
    }
}
