// src/app/api/mobile/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import { prisma } from '@/lib/prisma';
import { signAppJwt } from '@/lib/app-jwt';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type AppRole = 'CLIENT' | 'BARBER' | 'ADMIN';
type MemberRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'CLIENT';

type LoginBody = {
    email?: string;
    password?: string;
    companyId?: string; // pode ser id OU slug
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id, X-Company-Id, x-companyid, X-CompanyId',
    };
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

function normalizeEmail(v: unknown): string {
    return String(v ?? '')
        .trim()
        .toLowerCase();
}

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

// ✅ header case-insensitive (compat)
function getHeaderCI(req: NextRequest, key: string): string | null {
    const target = key.toLowerCase();
    for (const [k, v] of req.headers.entries()) {
        if (k.toLowerCase() === target) {
            const s = String(v ?? '').trim();
            return s.length ? s : null;
        }
    }
    return null;
}

function getCompanyKey(req: NextRequest, body?: LoginBody): string {
    const fromBody = normalizeString(body?.companyId);
    if (fromBody) return fromBody;

    const fromHeader =
        getHeaderCI(req, 'x-company-id') ||
        getHeaderCI(req, 'x-companyid') ||
        getHeaderCI(req, 'X-Company-Id') ||
        getHeaderCI(req, 'X-CompanyId');

    return normalizeString(fromHeader);
}

function mapMemberRoleToAppRole(role: MemberRole): AppRole {
    if (role === 'OWNER') return 'ADMIN';
    if (role === 'ADMIN') return 'ADMIN';
    if (role === 'STAFF') return 'BARBER'; // ✅ mobile usa BARBER
    return 'CLIENT';
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

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
    let body: LoginBody | null = null;

    try {
        body = (await req.json()) as LoginBody;
    } catch {
        body = null;
    }

    const companyKey = getCompanyKey(req, body ?? undefined);
    if (!companyKey) return jsonErr('missing_company_id', 400);

    const email = normalizeEmail(body?.email);
    const password = normalizeString(body?.password);

    if (!email) return jsonErr('missing_email', 400);
    if (!password) return jsonErr('missing_password', 400);

    // ✅ resolve company por id OU slug (ativa) igual ao auth-redirect
    const company = await prisma.company.findFirst({
        where: {
            isActive: true,
            OR: [{ id: companyKey }, { slug: companyKey }],
        },
        select: { id: true },
    });

    if (!company) {
        const exists = await prisma.company.findFirst({
            where: { OR: [{ id: companyKey }, { slug: companyKey }] },
            select: { id: true, isActive: true },
        });

        if (!exists) return jsonErr('company_not_found', 404);
        return jsonErr('company_inactive', 403);
    }

    const companyId = company.id;

    // ✅ mensagem neutra (não vaza se email existe)
    const badCreds = () => jsonErr('invalid_credentials', 401);

    // ✅ email case-insensitive (evita 401 por case diferente no DB)
    const user = await prisma.user.findFirst({
        where: {
            email: {
                equals: email,
                mode: 'insensitive',
            },
        },
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            phone: true,
            birthday: true,
            isActive: true,
            passwordHash: true,
        },
    });

    if (!user) return badCreds();
    if (!user.isActive) return jsonErr('user_inactive', 403);

    // ✅ precisa ter senha setada (usuário google-only pode não ter)
    const hash = normalizeString(user.passwordHash);
    if (!hash) return jsonErr('password_login_not_enabled', 403);

    const ok = await bcrypt.compare(password, hash);
    if (!ok) return badCreds();

    // ✅ valida membership ativo nessa company
    const membership = await prisma.companyMember.findFirst({
        where: { companyId, userId: user.id, isActive: true },
        select: {
            role: true,
            companyId: true,
            lastUnitId: true,
            isActive: true,
        },
    });

    if (!membership || membership.isActive === false) {
        return jsonErr('company_not_allowed', 403);
    }

    const derivedRole = mapMemberRoleToAppRole(membership.role as MemberRole);

    const profileComplete = computeProfileComplete({
        phone: user.phone ?? null,
        birthday: user.birthday ?? null,
    });

    // ✅ token no padrão do mobile: role CLIENT|BARBER|ADMIN
    const appToken = await signAppJwt({
        sub: user.id,
        role: derivedRole,
        companyId: membership.companyId,
        email: user.email ?? undefined,
        name: user.name ?? null,
    });

    const payload = {
        token: appToken,
        companyId: membership.companyId,
        role: derivedRole,
        profile_complete: profileComplete ? 1 : 0,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            phone: user.phone,
            birthday: user.birthday,
            role: derivedRole,
            memberRole: membership.role,
            lastUnitId: membership.lastUnitId ?? null,
        },
    };

    return jsonOk(payload, 200);
}
