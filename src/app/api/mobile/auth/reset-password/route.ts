// src/app/api/mobile/auth/reset-password/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

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

function hashToken(token: string): string {
    // ✅ nunca guardar token puro
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * ✅ Padrão de senha (igual ao signup)
 * - mínimo 6
 * - 1 maiúscula
 * - 1 número
 * - 1 especial na whitelist: !@#$%^&*()_+-=[];':",.<>/?\|
 */
const PASSWORD_REGEX =
    /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\];':",.<>\/?\|]).{6,}$/;

function isStrongPassword(pw: string) {
    return PASSWORD_REGEX.test(String(pw || ''));
}

function passwordRuleMessage() {
    return 'A senha deve ter no mínimo 6 caracteres, incluindo 1 letra maiúscula, 1 número e 1 caractere especial.';
}

/* ---------------------------------------------------------
 * OPTIONS
 * --------------------------------------------------------- */
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/* ---------------------------------------------------------
 * POST /api/mobile/auth/reset-password
 * Body: { token: string, password: string, companyId?: string }
 *
 * Regras:
 * - Multi-tenant: companyId obrigatório (body ou header x-company-id)
 * - Token: nunca salvo puro, compara por hash
 * - Token não pode estar usado (usedAt null) e não pode estar expirado
 * - Ao usar: marca usedAt e atualiza passwordHash do user
 * --------------------------------------------------------- */
export async function POST(req: Request) {
    const headers = corsHeaders();

    try {
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return jsonErr('Body inválido', 400, headers);
        }

        const token = normalizeString((body as any).token);
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

        if (!token) {
            return jsonErr('Token é obrigatório', 400, headers);
        }

        if (!isStrongPassword(password)) {
            return jsonErr(passwordRuleMessage(), 400, headers);
        }

        // ✅ valida empresa ativa
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, isActive: true },
        });

        if (!company || !company.isActive) {
            return jsonErr('Empresa inválida ou inativa', 400, headers);
        }

        const tokenHash = hashToken(token);
        const now = new Date();

        // ✅ acha token válido (não expirado e não usado)
        const prt = await prisma.passwordResetToken.findUnique({
            where: { tokenHash },
            select: {
                id: true,
                companyId: true,
                userId: true,
                expiresAt: true,
                usedAt: true,
            },
        });

        if (!prt || prt.companyId !== companyId) {
            return jsonErr('Token inválido', 400, headers);
        }

        if (prt.usedAt) {
            return jsonErr('Token já utilizado', 400, headers);
        }

        if (prt.expiresAt.getTime() <= now.getTime()) {
            return jsonErr('Token expirado', 400, headers);
        }

        // ✅ garante que usuário ainda está ativo e vinculado
        const user = await prisma.user.findUnique({
            where: { id: prt.userId },
            select: { id: true, isActive: true },
        });

        if (!user || !user.isActive) {
            return jsonErr('Usuário inválido', 400, headers);
        }

        const member = await prisma.companyMember.findUnique({
            where: { companyId_userId: { companyId, userId: user.id } },
            select: { id: true, isActive: true },
        });

        if (!member || !member.isActive) {
            return jsonErr('Usuário não pertence a esta empresa', 400, headers);
        }

        const passwordHash = await bcrypt.hash(password, 10);

        // ✅ transação: troca senha + consome token + consome outros tokens vivos
        await prisma.$transaction([
            prisma.user.update({
                where: { id: user.id },
                data: { passwordHash },
            }),
            prisma.passwordResetToken.update({
                where: { id: prt.id },
                data: { usedAt: now },
            }),
            prisma.passwordResetToken.updateMany({
                where: {
                    companyId,
                    userId: user.id,
                    usedAt: null,
                    expiresAt: { gt: now },
                    NOT: { id: prt.id },
                },
                data: { usedAt: now },
            }),
        ]);

        return jsonOk(
            {
                message: 'Senha redefinida com sucesso.',
            },
            200,
            headers
        );
    } catch (err) {
        console.error('[mobile reset-password]', err);
        return jsonErr('Erro inesperado', 500, headers);
    }
}
