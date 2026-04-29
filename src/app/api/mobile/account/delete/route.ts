// src/app/api/mobile/account/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

type MobileTokenPayload = {
    sub: string;
    role?: 'CLIENT' | 'PROFESSIONAL' | 'ADMIN';
    companyId: string;
    profile_complete?: boolean;

    email?: string;
    name?: string | null;
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id, X-Company-Id, x-companyid, X-CompanyId',
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

function jsonErr(message: string, status = 400) {
    return NextResponse.json(
        { ok: false, error: message },
        { status, headers: corsHeaders() }
    );
}

function jsonOk(data: unknown, status = 200) {
    return NextResponse.json(
        { ok: true, data },
        { status, headers: corsHeaders() }
    );
}

function getBearerToken(req: Request): string | null {
    const auth =
        req.headers.get('authorization') || req.headers.get('Authorization');
    if (!auth) return null;

    const [type, token] = auth.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !token) return null;

    return token.trim();
}

// -----------------------------
// ✅ JWT HS256 inline (igual /me)
// -----------------------------
class InvalidAppTokenError extends Error {
    constructor(message = 'invalid token payload') {
        super(message);
        this.name = 'InvalidAppTokenError';
    }
}

function base64UrlDecodeToBuffer(input: string) {
    const pad =
        input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
    const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
    return Buffer.from(b64, 'base64');
}

function base64UrlDecodeJson<T = any>(input: string): T {
    const buf = base64UrlDecodeToBuffer(input);
    return JSON.parse(buf.toString('utf-8')) as T;
}

function base64UrlEncode(input: Buffer | string) {
    const buf = typeof input === 'string' ? Buffer.from(input) : input;
    return buf
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function signHs256(secret: string, data: string) {
    const sig = crypto.createHmac('sha256', secret).update(data).digest();
    return base64UrlEncode(sig);
}

function getAppJwtSecret() {
    return (
        process.env.APP_JWT_SECRET?.trim() ||
        process.env.MOBILE_JWT_SECRET?.trim() ||
        process.env.JWT_SECRET?.trim() ||
        process.env.NEXTAUTH_SECRET?.trim() ||
        ''
    );
}

async function verifyAppJwt(token: string): Promise<MobileTokenPayload> {
    const secret = getAppJwtSecret();
    if (!secret) throw new InvalidAppTokenError('missing token payload');

    const parts = String(token || '').split('.');
    if (parts.length !== 3)
        throw new InvalidAppTokenError('invalid token payload');

    const [h, p, s] = parts;

    const expected = signHs256(secret, `${h}.${p}`);
    if (expected !== s) throw new InvalidAppTokenError('invalid token payload');

    const payload = base64UrlDecodeJson<any>(p);

    // exp (se existir)
    if (payload?.exp) {
        const now = Math.floor(Date.now() / 1000);
        if (Number(payload.exp) < now)
            throw new InvalidAppTokenError('invalid token payload');
    }

    const sub = String(payload?.sub || '').trim();
    const companyId = String(payload?.companyId || '').trim();

    if (!sub) throw new InvalidAppTokenError('invalid token payload');
    if (!companyId) throw new InvalidAppTokenError('missing_company_id');

    return payload as MobileTokenPayload;
}

// -----------------------------
// Helpers
// -----------------------------
function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function buildDeletedEmail(args: { userId: string; prevEmail: string }) {
    // Objetivo: liberar o e-mail original para o usuário voltar no futuro.
    // Usamos domínio .invalid (reservado p/ docs/testes) para evitar envio real.
    const id = args.userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'user';
    const ts = Date.now();
    const local = `deleted+${id}.${ts}`;
    return `${local}@atendeplay.invalid`.toLowerCase();
}

// Para anonimizar telefone do Appointment (campo é obrigatório no schema)
function anonymizedAppointmentPhone() {
    // Mantém formato de "string" sem PII.
    return '00000000000';
}

function anonymizedAppointmentName() {
    return 'Cliente removido';
}

/**
 * ✅ Soft delete + anonimização (mantém histórico)
 * - Desativa o usuário e remove PII
 * - Desconecta logins (Accounts/Sessions)
 * - Anonimiza Appointment.clientName e Appointment.phone
 * - Mantém agendamentos, checkouts, dashboards, etc.
 * - Libera o e-mail original para permitir novo cadastro no futuro
 */
async function softDeleteAndAnonymizeUser(userId: string) {
    await prisma.$transaction(async (tx) => {
        // 0) Carrega user atual (precisamos do email para liberar)
        const user = await tx.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                isActive: true,
                isOwner: true,
            },
        });

        if (!user) {
            const e: any = new Error('user_not_found');
            e.code = 'USER_NOT_FOUND';
            throw e;
        }

        // 1) Se por acaso estiver vinculado a Professional, solta o vínculo (pra não carregar PII por lá)
        // (relation em Professional.userId não tem onDelete)
        await tx.professional.updateMany({
            where: { userId },
            data: { userId: null },
        });

        // 2) Desconecta métodos de login e sessões (Apple/Google/credenciais)
        await tx.account.deleteMany({ where: { userId } });
        await tx.session.deleteMany({ where: { userId } });

        // 3) Anonimiza agendamentos do cliente (mantém para financeiro/dash)
        await tx.appointment.updateMany({
            where: { clientId: userId },
            data: {
                clientName: anonymizedAppointmentName(),
                phone: anonymizedAppointmentPhone(),
            },
        });

        // 4) Orders: remove vínculo do clientId para reduzir PII, mantendo o histórico financeiro
        await tx.order.updateMany({
            where: { clientId: userId },
            data: { clientId: null },
        });

        // 5) AnalyticsEvent: remove vínculo ao user (PII) mantendo telemetria agregada
        await tx.analyticsEvent.updateMany({
            where: { userId },
            data: { userId: null },
        });

        // 6) CompanyMember: desativa memberships (opcional, mas bom para não aparecer como ativo)
        await tx.companyMember.updateMany({
            where: { userId },
            data: { isActive: false },
        });

        // 7) Finalmente: anonimiza o User, desativa, e troca email para liberar reutilização
        const newEmail = buildDeletedEmail({
            userId,
            prevEmail: user.email,
        });

        await tx.user.update({
            where: { id: userId },
            data: {
                isActive: false,
                isOwner: false,

                // libera re-cadastro com o email original:
                email: newEmail,

                // remove PII:
                name: null,
                image: null,
                phone: null,
                birthday: null,

                // impede login por senha
                passwordHash: null,

                // remove status
                emailVerified: null,

                // mantém role como está (não impacta histórico)
            },
        });
    });
}

// -----------------------------
// Handler
// -----------------------------
export async function POST(req: NextRequest) {
    try {
        const bearer = getBearerToken(req);
        if (!bearer) return jsonErr('missing_token', 401);

        const payload = await verifyAppJwt(bearer);
        const userId = normalizeString(payload?.sub);

        if (!userId) return jsonErr('invalid_token', 401);

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') return jsonErr('invalid_body');

        // ✅ confirmação anti-acidente
        // o app deve enviar { "confirm": "DELETE" }
        const confirm = normalizeString((body as any).confirm).toUpperCase();
        if (confirm !== 'DELETE') {
            return jsonErr('confirm_required');
        }

        await softDeleteAndAnonymizeUser(userId);

        return jsonOk({ deleted: true });
    } catch (err: any) {
        const msg = String(err?.message || '').toLowerCase();

        const tokenish =
            msg.includes('invalid token payload') ||
            msg.includes('jwt') ||
            msg.includes('token') ||
            msg.includes('signature') ||
            msg.includes('missing_company_id') ||
            msg.includes('missing token payload');

        if (tokenish) return jsonErr('invalid_token', 401);

        if (
            String(err?.code || '') === 'USER_NOT_FOUND' ||
            msg === 'user_not_found'
        ) {
            return jsonErr('user_not_found', 404);
        }

        console.error('[api/mobile/account/delete] error:', err);
        return jsonErr('server_error', 500);
    }
}
