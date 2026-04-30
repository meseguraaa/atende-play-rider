// src/app/api/mobile/account/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type MobileTokenPayload = {
    sub: string;
    role?: 'CLIENT' | 'ADMIN' | 'PLATFORM_OWNER' | 'PLATFORM_STAFF';
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
    if (parts.length !== 3) {
        throw new InvalidAppTokenError('invalid token payload');
    }

    const [h, p, s] = parts;

    const expected = signHs256(secret, `${h}.${p}`);
    if (expected !== s) {
        throw new InvalidAppTokenError('invalid token payload');
    }

    const payload = base64UrlDecodeJson<any>(p);

    if (payload?.exp) {
        const now = Math.floor(Date.now() / 1000);
        if (Number(payload.exp) < now) {
            throw new InvalidAppTokenError('invalid token payload');
        }
    }

    const sub = String(payload?.sub || '').trim();
    const companyId = String(payload?.companyId || '').trim();

    if (!sub) throw new InvalidAppTokenError('invalid token payload');
    if (!companyId) throw new InvalidAppTokenError('missing_company_id');

    return payload as MobileTokenPayload;
}

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function buildDeletedEmail(args: { userId: string }) {
    const id = args.userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'user';
    const ts = Date.now();

    return `deleted+${id}.${ts}@atendeplay.invalid`.toLowerCase();
}

/**
 * Soft delete + anonimização.
 *
 * Mantém histórico financeiro e operacional, mas remove PII do usuário.
 */
async function softDeleteAndAnonymizeUser(args: {
    userId: string;
    companyId: string;
}) {
    const { userId, companyId } = args;

    await prisma.$transaction(async (tx) => {
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

        const membership = await tx.companyMember.findFirst({
            where: {
                userId,
                companyId,
            },
            select: {
                id: true,
            },
        });

        if (!membership) {
            const e: any = new Error('user_not_found');
            e.code = 'USER_NOT_FOUND';
            throw e;
        }

        await tx.account.deleteMany({
            where: { userId },
        });

        await tx.session.deleteMany({
            where: { userId },
        });

        await tx.order.updateMany({
            where: {
                memberId: userId,
            },
            data: {
                memberId: null,
            },
        });

        await tx.analyticsEvent.updateMany({
            where: {
                userId,
            },
            data: {
                userId: null,
            },
        });

        await tx.pushDevice.updateMany({
            where: {
                userId,
            },
            data: {
                isActive: false,
            },
        });

        await tx.memberVehicle.updateMany({
            where: {
                userId,
            },
            data: {
                brand: null,
                model: null,
                plate: null,
                cylinderCc: null,
                color: null,
                year: null,
                isMain: false,
                isActive: false,
            },
        });

        await tx.companyMember.updateMany({
            where: {
                userId,
            },
            data: {
                isActive: false,
            },
        });

        await tx.passwordResetToken.updateMany({
            where: {
                userId,
                usedAt: null,
            },
            data: {
                usedAt: new Date(),
            },
        });

        await tx.user.update({
            where: {
                id: userId,
            },
            data: {
                isActive: false,
                isOwner: false,
                email: buildDeletedEmail({ userId }),
                name: null,
                image: null,
                phone: null,
                birthday: null,
                passwordHash: null,
                emailVerified: null,
            },
            select: {
                id: true,
            },
        });
    });
}

export async function POST(req: NextRequest) {
    try {
        const bearer = getBearerToken(req);
        if (!bearer) return jsonErr('missing_token', 401);

        const payload = await verifyAppJwt(bearer);

        const userId = normalizeString(payload?.sub);
        const companyId = normalizeString(payload?.companyId);

        if (!userId) return jsonErr('invalid_token', 401);
        if (!companyId) return jsonErr('missing_company_id', 401);

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return jsonErr('invalid_body');
        }

        const confirm = normalizeString((body as any).confirm).toUpperCase();

        if (confirm !== 'DELETE') {
            return jsonErr('confirm_required');
        }

        await softDeleteAndAnonymizeUser({ userId, companyId });

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
