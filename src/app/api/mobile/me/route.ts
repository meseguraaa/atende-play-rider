// src/app/api/mobile/me/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'node:crypto';
import path from 'node:path';
import { ensureCustomerLevelUpToDate } from '@/lib/customer-level-engine';

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
        'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

function getBearerToken(req: Request): string | null {
    const auth =
        req.headers.get('authorization') || req.headers.get('Authorization');
    if (!auth) return null;

    const [type, token] = auth.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !token) return null;

    return token.trim();
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

function selectUser() {
    return {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
        phone: true,
        birthday: true,
        isOwner: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
    } as const;
}

function parseBirthday(input: unknown): Date | null {
    if (input === null || input === undefined || input === '') return null;
    if (typeof input !== 'string') return null;

    const s = input.trim();

    const iso = new Date(s);
    if (!Number.isNaN(iso.getTime())) return iso;

    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (m) {
        const dd = Number(m[1]);
        const mm = Number(m[2]);
        const yyyy = Number(m[3]);
        const d = new Date(Date.UTC(yyyy, mm - 1, dd));
        if (!Number.isNaN(d.getTime())) return d;
    }

    return null;
}

function computeProfileStatus(user: {
    phone: string | null;
    birthday: Date | null;
}) {
    const missingFields: Array<'phone' | 'birthday'> = [];

    const phoneOk =
        typeof user.phone === 'string' && user.phone.trim().length > 0;
    const birthdayOk =
        user.birthday instanceof Date && !Number.isNaN(user.birthday.getTime());

    if (!phoneOk) missingFields.push('phone');
    if (!birthdayOk) missingFields.push('birthday');

    return {
        profileComplete: missingFields.length === 0,
        missingFields,
    };
}

type CustomerLevelDTO = {
    level: 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';
    label: string;
    icon: string;
};

function levelToDTO(levelRaw: any): CustomerLevelDTO {
    const level = String(levelRaw || 'BRONZE').toUpperCase();

    switch (level) {
        case 'DIAMANTE':
            return { level: 'DIAMANTE', label: 'Diamante', icon: 'diamond' };
        case 'OURO':
            return { level: 'OURO', label: 'Ouro', icon: 'trophy' };
        case 'PRATA':
            return { level: 'PRATA', label: 'Prata', icon: 'star' };
        case 'BRONZE':
        default:
            return { level: 'BRONZE', label: 'Bronze', icon: 'star-o' };
    }
}

// -----------------------------
// ✅ JWT HS256 inline (substitui "@/lib/app-jwt")
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

    // valida assinatura
    const expected = signHs256(secret, `${h}.${p}`);
    if (expected !== s) throw new InvalidAppTokenError('invalid token payload');

    const payload = base64UrlDecodeJson<any>(p);

    // exp (se existir)
    if (payload?.exp) {
        const now = Math.floor(Date.now() / 1000);
        if (Number(payload.exp) < now)
            throw new InvalidAppTokenError('invalid token payload');
    }

    // valida mínimos
    const sub = String(payload?.sub || '').trim();
    const companyId = String(payload?.companyId || '').trim();

    if (!sub) throw new InvalidAppTokenError('invalid token payload');
    if (!companyId) throw new InvalidAppTokenError('missing_company_id');

    return payload as MobileTokenPayload;
}

// -----------------------------
// Membership + Level
// -----------------------------
async function ensureCompanyMembership(args: {
    companyId: string;
    userId: string;
}) {
    const { companyId, userId } = args;

    await prisma.companyMember.upsert({
        where: { companyId_userId: { companyId, userId } },
        create: { companyId, userId, role: 'CLIENT', isActive: true },
        update: { isActive: true },
    });
}

async function resolveClientUnitId(args: {
    userId: string;
    companyId: string;
}): Promise<string | null> {
    const { userId, companyId } = args;
    const now = new Date();

    const LOOKBACK_HOURS = 24;
    const lookbackStart = new Date(
        now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000
    );

    const next = await prisma.appointment.findFirst({
        where: {
            companyId,
            clientId: userId,
            status: 'PENDING',
            scheduleAt: { gte: lookbackStart },
        },
        orderBy: { scheduleAt: 'asc' },
        select: { unitId: true },
    });

    if (next?.unitId) return next.unitId;

    const lastAny = await prisma.appointment.findFirst({
        where: { companyId, clientId: userId },
        orderBy: { scheduleAt: 'desc' },
        select: { unitId: true },
    });

    if (lastAny?.unitId) return lastAny.unitId;

    const unit =
        (await prisma.unit.findFirst({
            where: { companyId, isActive: true },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
        })) ??
        (await prisma.unit.findFirst({
            where: { companyId },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
        }));

    return unit?.id ?? null;
}

async function ensureUnitBelongsToCompany(args: {
    unitId: string;
    companyId: string;
}): Promise<boolean> {
    try {
        const u = await prisma.unit.findFirst({
            where: { id: args.unitId, companyId: args.companyId },
            select: { id: true },
        });
        return !!u;
    } catch {
        return false;
    }
}

async function getUserLevelForUnit(userId: string, unitId: string) {
    const state = await prisma.customerLevelState.findUnique({
        where: { unitId_userId: { unitId, userId } },
        select: {
            levelCurrent: true,
            unitId: true,
            levelEffectiveFrom: true,
            updatedAt: true,
        },
    });

    const dto = levelToDTO(state?.levelCurrent);
    return { customerLevel: dto, _debugLevelState: state };
}

// -----------------------------
// ✅ Guard do engine
// -----------------------------
function getSaoPauloYearMonth(now: Date): { year: number; month: number } {
    const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
    });

    const parts = dtf.formatToParts(now);
    const map: Record<string, string> = {};
    for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;

    return { year: Number(map.year), month: Number(map.month) };
}

function previousMonthPeriodKeySP(now: Date): string {
    const { year, month } = getSaoPauloYearMonth(now);

    let y = year;
    let m = month - 1;
    if (m <= 0) {
        m = 12;
        y = year - 1;
    }

    const mm = String(m).padStart(2, '0');
    return `${y}-${mm}`;
}

async function shouldRunCustomerLevelEngine(args: {
    userId: string;
    unitId: string;
    now: Date;
}): Promise<boolean> {
    const periodKey = previousMonthPeriodKeySP(args.now);

    const existing = await prisma.customerLevelPeriod.findUnique({
        where: {
            unitId_userId_periodKey: {
                unitId: args.unitId,
                userId: args.userId,
                periodKey,
            },
        },
        select: { id: true },
    });

    return !existing;
}

/**
 * ✅ Engine opcional sem TS2307:
 * Não usamos import('@/lib/...') (TS tenta resolver).
 * Usamos require() com path dinâmico.
 */
async function tryRunCustomerLevelEngine(args: {
    userId: string;
    unitId: string;
    now: Date;
}) {
    try {
        const run = await shouldRunCustomerLevelEngine(args);
        if (!run) return;

        await ensureCustomerLevelUpToDate({
            userId: args.userId,
            unitId: args.unitId,
            now: args.now,
        });
    } catch {
        // engine falhou: não quebra o /me
    }
}

function buildMeErrorResponse(err: any) {
    const msg = String(err?.message || '');
    const lower = msg.toLowerCase();

    const isTokenish =
        lower.includes('invalid token payload') ||
        lower.includes('jwt') ||
        lower.includes('token') ||
        lower.includes('signature') ||
        lower.includes('missing_company_id') ||
        lower.includes('missing token payload') ||
        lower.includes('missing companyid');

    if (isTokenish) {
        return NextResponse.json(
            { error: 'invalid_token' },
            { status: 401, headers: corsHeaders() }
        );
    }

    return NextResponse.json(
        {
            error: 'server_error',
            ...(process.env.NODE_ENV === 'development'
                ? { debug: { message: msg } }
                : {}),
        },
        { status: 500, headers: corsHeaders() }
    );
}

export async function GET(req: Request) {
    try {
        const bearer = getBearerToken(req);
        if (!bearer) {
            return NextResponse.json(
                { error: 'missing_token' },
                { status: 401, headers: corsHeaders() }
            );
        }

        const payload = (await verifyAppJwt(bearer)) as MobileTokenPayload;

        const userId = String(payload.sub || '').trim();
        const companyId = String((payload as any).companyId || '').trim();
        const role = String(payload.role || '')
            .trim()
            .toUpperCase();

        if (!userId) {
            return NextResponse.json(
                { error: 'invalid_token' },
                { status: 401, headers: corsHeaders() }
            );
        }

        if (!companyId) {
            return NextResponse.json(
                { error: 'missing_company_id' },
                { status: 401, headers: corsHeaders() }
            );
        }

        await ensureCompanyMembership({ companyId, userId });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: selectUser(),
        });

        if (!user) {
            return NextResponse.json(
                { error: 'user_not_found' },
                { status: 401, headers: corsHeaders() }
            );
        }

        if (!user.isActive) {
            return NextResponse.json(
                { error: 'user_inactive' },
                { status: 403, headers: corsHeaders() }
            );
        }

        const now = new Date();

        let unitId: string | null = null;

        if (role === 'CLIENT') {
            unitId = await resolveClientUnitId({ userId, companyId });

            if (unitId) {
                const ok = await ensureUnitBelongsToCompany({
                    unitId,
                    companyId,
                });
                if (!ok) unitId = null;
            }

            if (unitId) {
                await tryRunCustomerLevelEngine({ userId, unitId, now });
            }
        }

        const { customerLevel, _debugLevelState } = unitId
            ? await getUserLevelForUnit(userId, unitId)
            : {
                  customerLevel: levelToDTO('BRONZE'),
                  _debugLevelState: null as any,
              };

        const { profileComplete, missingFields } = computeProfileStatus({
            phone: user.phone ?? null,
            birthday: user.birthday ?? null,
        });

        const headerCid = getCompanyIdFromHeader(req);

        const res = NextResponse.json(
            {
                user: {
                    ...user,
                    customerLevel,
                    adminAccess: null,
                    companyId,
                    profileComplete,
                    missingFields,
                },
                profileComplete,
                companyId,
                _debug:
                    process.env.NODE_ENV === 'development'
                        ? {
                              unitIdResolved: unitId,
                              levelState: _debugLevelState,
                              companyIdFromToken: companyId,
                              companyHeader: headerCid,
                              headerMismatch: headerCid
                                  ? headerCid !== companyId
                                  : false,
                          }
                        : undefined,
            },
            { status: 200, headers: corsHeaders() }
        );

        res.headers.set('x-company-id', companyId);

        return res;
    } catch (err) {
        console.error('[api/mobile/me] GET error:', err);
        return buildMeErrorResponse(err);
    }
}

export async function PATCH(req: Request) {
    try {
        const bearer = getBearerToken(req);
        if (!bearer) {
            return NextResponse.json(
                { error: 'missing_token' },
                { status: 401, headers: corsHeaders() }
            );
        }

        const payload = (await verifyAppJwt(bearer)) as MobileTokenPayload;

        const userId = String(payload.sub || '').trim();
        const companyId = String((payload as any).companyId || '').trim();
        const role = String(payload.role || '')
            .trim()
            .toUpperCase();

        if (!userId) {
            return NextResponse.json(
                { error: 'invalid_token' },
                { status: 401, headers: corsHeaders() }
            );
        }

        if (!companyId) {
            return NextResponse.json(
                { error: 'missing_company_id' },
                { status: 401, headers: corsHeaders() }
            );
        }

        await ensureCompanyMembership({ companyId, userId });

        const existing = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, isActive: true },
        });

        if (!existing) {
            return NextResponse.json(
                { error: 'user_not_found' },
                { status: 401, headers: corsHeaders() }
            );
        }

        if (!existing.isActive) {
            return NextResponse.json(
                { error: 'user_inactive' },
                { status: 403, headers: corsHeaders() }
            );
        }

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json(
                { error: 'invalid_body' },
                { status: 400, headers: corsHeaders() }
            );
        }

        const nameRaw = (body as any).name as unknown;
        const phoneRaw = (body as any).phone as unknown;
        const birthdayRaw = (body as any).birthday as unknown;

        let phone: string | null | undefined = undefined;
        if (phoneRaw === null) {
            phone = null;
        } else if (typeof phoneRaw === 'string') {
            const p = phoneRaw.trim();
            phone = p.length ? p : null;

            if (phone && phone.length > 32) {
                return NextResponse.json(
                    { error: 'phone_too_long' },
                    { status: 400, headers: corsHeaders() }
                );
            }
        } else if (phoneRaw !== undefined) {
            return NextResponse.json(
                { error: 'invalid_phone' },
                { status: 400, headers: corsHeaders() }
            );
        }

        let name: string | null | undefined = undefined;
        if (nameRaw === null) {
            name = null;
        } else if (typeof nameRaw === 'string') {
            const n = nameRaw.trim();
            name = n.length ? n : null;

            if (name !== null && name.length > 120) {
                return NextResponse.json(
                    { error: 'name_too_long' },
                    { status: 400, headers: corsHeaders() }
                );
            }
        } else if (nameRaw !== undefined) {
            return NextResponse.json(
                { error: 'invalid_name' },
                { status: 400, headers: corsHeaders() }
            );
        }

        let birthday: Date | null | undefined = undefined;
        if (birthdayRaw !== undefined) {
            const parsed = parseBirthday(birthdayRaw);
            if (birthdayRaw && !parsed) {
                return NextResponse.json(
                    { error: 'invalid_birthday' },
                    { status: 400, headers: corsHeaders() }
                );
            }
            birthday = parsed;
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(phone !== undefined ? { phone } : {}),
                ...(birthday !== undefined ? { birthday } : {}),
            },
            select: selectUser(),
        });

        const now = new Date();

        let unitId: string | null = null;

        if (role === 'CLIENT') {
            unitId = await resolveClientUnitId({ userId, companyId });

            if (unitId) {
                const ok = await ensureUnitBelongsToCompany({
                    unitId,
                    companyId,
                });
                if (!ok) unitId = null;
            }

            if (unitId) {
                await tryRunCustomerLevelEngine({ userId, unitId, now });
            }
        }

        const { customerLevel, _debugLevelState } = unitId
            ? await getUserLevelForUnit(userId, unitId)
            : {
                  customerLevel: levelToDTO('BRONZE'),
                  _debugLevelState: null as any,
              };

        const { profileComplete, missingFields } = computeProfileStatus({
            phone: user.phone ?? null,
            birthday: user.birthday ?? null,
        });

        const headerCid = getCompanyIdFromHeader(req);

        const res = NextResponse.json(
            {
                user: {
                    ...user,
                    customerLevel,
                    adminAccess: null,
                    companyId,
                    profileComplete,
                    missingFields,
                },
                profileComplete,
                companyId,
                _debug:
                    process.env.NODE_ENV === 'development'
                        ? {
                              unitIdResolved: unitId,
                              levelState: _debugLevelState,
                              companyIdFromToken: companyId,
                              companyHeader: headerCid,
                              headerMismatch: headerCid
                                  ? headerCid !== companyId
                                  : false,
                          }
                        : undefined,
            },
            { status: 200, headers: corsHeaders() }
        );

        res.headers.set('x-company-id', companyId);

        return res;
    } catch (err) {
        console.error('[api/mobile/me] PATCH error:', err);
        return buildMeErrorResponse(err);
    }
}
