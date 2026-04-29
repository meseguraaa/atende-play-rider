// src/app/api/mobile/auth/apple/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
    createRemoteJWKSet,
    jwtVerify,
    decodeJwt,
    type JWTPayload,
} from 'jose';

import { prisma } from '@/lib/prisma';
import { signAppJwt } from '@/lib/app-jwt';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type AppRole = 'CLIENT' | 'BARBER' | 'ADMIN';
type MemberRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'CLIENT';

type AppleBody = {
    companyId?: string; // pode ser id OU slug
    identityToken?: string; // JWT da Apple (credential.identityToken)
    email?: string | null; // opcional (credential.email só vem 1ª vez)
    fullName?: { givenName?: string | null; familyName?: string | null } | null; // opcional
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

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function normalizeEmail(v: unknown): string {
    return String(v ?? '')
        .trim()
        .toLowerCase();
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

function getCompanyKey(req: NextRequest, body?: AppleBody): string {
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
    if (role === 'STAFF') return 'BARBER';
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

function buildNameFromFullName(fullName?: AppleBody['fullName'] | null) {
    const given = normalizeString(fullName?.givenName);
    const family = normalizeString(fullName?.familyName);
    const joined = [given, family].filter(Boolean).join(' ').trim();
    return joined.length ? joined : null;
}

function pickAppleEmail(payload: JWTPayload, bodyEmail?: string | null) {
    const fromToken = normalizeEmail((payload as any)?.email);
    const fromBody = normalizeEmail(bodyEmail);
    return fromToken || fromBody || '';
}

const APPLE_ISSUER = 'https://appleid.apple.com';
const jwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function getAppleAudiences(): string[] {
    // O "aud" do identityToken costuma ser o Bundle ID (ou Services ID, dependendo do fluxo).
    // Aqui aceitamos múltiplos valores:
    // - APPLE_AUDIENCES="com.atendeplay.app,com.espacofk.app"
    // - ou APPLE_CLIENT_ID / APPLE_BUNDLE_ID (single)
    const raw =
        normalizeString(process.env.APPLE_AUDIENCES) ||
        normalizeString(process.env.APPLE_CLIENT_ID) ||
        normalizeString(process.env.APPLE_BUNDLE_ID);

    if (raw) {
        const list = raw
            .split(',')
            .map((s) => normalizeString(s))
            .filter(Boolean);
        if (list.length) return list;
    }

    // fallback seguro: aceita os dois apps
    return ['com.atendeplay.app', 'com.espacofk.app'];
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
    let body: AppleBody | null = null;

    try {
        body = (await req.json()) as AppleBody;
    } catch {
        body = null;
    }

    const companyKey = getCompanyKey(req, body ?? undefined);
    if (!companyKey) return jsonErr('missing_company_id', 400);

    const identityToken = normalizeString(body?.identityToken);
    if (!identityToken) return jsonErr('missing_identity_token', 400);

    // ✅ resolve company por id OU slug (ativa)
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

    // ✅ valida identityToken (JWT) com as chaves públicas da Apple
    let appleSub = '';
    let email = '';
    try {
        const audiences = getAppleAudiences();

        // 🔎 debug: ver o que a Apple está mandando em "aud"
        try {
            const decoded = decodeJwt(identityToken) as any;
            console.log('[apple:identityToken decoded]', {
                iss: decoded?.iss,
                aud: decoded?.aud,
                sub: decoded?.sub,
                email: decoded?.email,
                expectedAudiences: audiences,
            });
        } catch (e) {
            console.log('[apple:identityToken decode failed]');
        }

        const { payload } = await jwtVerify(identityToken, jwks, {
            issuer: APPLE_ISSUER,
            audience: audiences,
        });

        appleSub = normalizeString(payload.sub);
        email = pickAppleEmail(payload, body?.email ?? null);

        if (!appleSub) return jsonErr('invalid_apple_token', 401);
    } catch {
        return jsonErr('invalid_apple_token', 401);
    }

    // ✅ tenta achar usuário por email (case-insensitive)
    let user = email
        ? await prisma.user.findFirst({
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
              },
          })
        : null;

    // ✅ se não existir, cria usuário (apple pode ser 1º login)
    if (!user) {
        if (!email) return jsonErr('missing_email', 400);

        const nameFromBody = buildNameFromFullName(body?.fullName ?? null);
        const fallbackName = email.includes('@')
            ? email.split('@')[0]
            : 'Usuário';

        const created = await prisma.user.create({
            data: {
                email,
                name: nameFromBody || fallbackName,
                image: null,
                isActive: true,
                // campos opcionais no seu schema (se existirem) ficam nulos por padrão
            } as any,
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                phone: true,
                birthday: true,
                isActive: true,
            },
        });

        user = created;
    } else {
        if (!user.isActive) return jsonErr('user_inactive', 403);

        // ✅ se vier nome e o user não tem, preenche
        const nameFromBody = buildNameFromFullName(body?.fullName ?? null);
        if (nameFromBody && !normalizeString(user.name)) {
            try {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { name: nameFromBody } as any,
                });
                user = { ...user, name: nameFromBody };
            } catch {
                // noop
            }
        }
    }

    // ✅ membership: garante acesso à company
    let membership = await prisma.companyMember.findFirst({
        where: { companyId, userId: user.id, isActive: true },
        select: {
            role: true,
            companyId: true,
            lastUnitId: true,
            isActive: true,
        },
    });

    // ✅ se não tem membership, cria como CLIENT
    if (!membership) {
        membership = await prisma.companyMember.create({
            data: {
                companyId,
                userId: user.id,
                role: 'CLIENT',
                isActive: true,
                lastUnitId: null,
            } as any,
            select: {
                role: true,
                companyId: true,
                lastUnitId: true,
                isActive: true,
            },
        });
    }

    if (!membership || membership.isActive === false) {
        return jsonErr('company_not_allowed', 403);
    }

    const derivedRole = mapMemberRoleToAppRole(membership.role as MemberRole);

    const profileComplete = computeProfileComplete({
        phone: (user as any).phone ?? null,
        birthday: (user as any).birthday ?? null,
    });

    // ✅ token no padrão do mobile
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
            image: (user as any).image ?? null,
            phone: (user as any).phone ?? null,
            birthday: (user as any).birthday ?? null,
            role: derivedRole,
            memberRole: membership.role,
            lastUnitId: membership.lastUnitId ?? null,
        },
    };

    return jsonOk(payload, 200);
}
