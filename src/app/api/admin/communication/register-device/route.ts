import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type RegisterPushDevicePayload = {
    deviceToken?: string;
    platform?: string | null;
    projectSlug?: string | null;
};

type MobileTokenPayload = {
    sub: string;
    role?: 'CLIENT' | 'PROFESSIONAL' | 'ADMIN';
    companyId: string;
    profile_complete?: boolean;
    email?: string;
    name?: string | null;
};

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function normalizeString(value: unknown) {
    return String(value ?? '').trim();
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

export async function POST(request: Request) {
    const bearer = getBearerToken(request);

    if (!bearer) {
        return jsonErr('missing_token', 401);
    }

    let payload: MobileTokenPayload;
    try {
        payload = await verifyAppJwt(bearer);
    } catch {
        return jsonErr('invalid_token', 401);
    }

    const userId = normalizeString(payload.sub);
    if (!userId) {
        return jsonErr('invalid_token', 401);
    }

    let body: RegisterPushDevicePayload | null = null;
    try {
        body = (await request.json()) as RegisterPushDevicePayload;
    } catch {
        return jsonErr('invalid_json', 400);
    }

    const deviceToken = normalizeString(body?.deviceToken);
    const platform = normalizeString(body?.platform) || null;
    const projectSlug = normalizeString(body?.projectSlug) || null;

    console.log('[push][register-device] payload', {
        userId,
        deviceToken,
        platform,
        projectSlug,
        rawBody: body,
    });

    if (!deviceToken) {
        return jsonErr('device_token_required', 400);
    }

    if (!projectSlug) {
        return jsonErr('project_slug_required', 400);
    }

    const device = await prisma.pushDevice.upsert({
        where: {
            deviceToken,
        },
        update: {
            userId,
            platform,
            projectSlug,
            isActive: true,
        },
        create: {
            userId,
            deviceToken,
            platform,
            projectSlug,
            isActive: true,
        },
        select: {
            id: true,
            userId: true,
            deviceToken: true,
            platform: true,
            projectSlug: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    console.log('[push][register-device] saved', device);

    return jsonOk(device, { status: 201 });
}
