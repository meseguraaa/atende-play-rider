// src/lib/painel-session.ts
import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';
import type { AuthenticatedUser } from './auth';

const SESSION_COOKIE_NAME = 'painel_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const DEV_DEFAULT_TENANT = 'atendeplayrider';
const BASE_DOMAIN = 'atendeplay.com.br';
const COOKIE_DOMAIN_PROD = `.${BASE_DOMAIN}`;

function getJwtSecretKey() {
    const secret = process.env.PAINEL_JWT_SECRET;
    if (!secret) throw new Error('PAINEL_JWT_SECRET não definido no .env');
    return new TextEncoder().encode(secret);
}

function getHostFromHeaders(h: Headers): string {
    const xfHost =
        h.get('x-forwarded-host') ||
        h.get('x-original-host') ||
        h.get('x-vercel-forwarded-host') ||
        '';

    const raw = (xfHost || h.get('host') || '').trim().toLowerCase();
    const first = raw.split(',')[0]?.trim() ?? '';
    return first.split(':')[0];
}

function isHttpsFromHeaders(h: Headers): boolean {
    const xfProtoRaw = (h.get('x-forwarded-proto') || '').toLowerCase();
    const xfProto = xfProtoRaw.split(',')[0]?.trim() ?? '';

    if (xfProto === 'https') return true;
    if (xfProto === 'http') return false;

    const cfVisitor = h.get('cf-visitor');
    if (cfVisitor && cfVisitor.toLowerCase().includes('"scheme":"https"')) {
        return true;
    }

    const xfSsl = (h.get('x-forwarded-ssl') || '').toLowerCase();
    if (xfSsl === 'on') return true;

    return false;
}

function getCookieDomainForHost(host: string): string | undefined {
    const cleanHost = String(host || '')
        .trim()
        .toLowerCase();
    if (!cleanHost) return undefined;

    if (cleanHost === 'localhost' || cleanHost.endsWith('.localhost')) {
        return undefined;
    }

    if (cleanHost === BASE_DOMAIN || cleanHost.endsWith(`.${BASE_DOMAIN}`)) {
        return COOKIE_DOMAIN_PROD;
    }

    return undefined;
}

function getTenantSlugFromHost(host: string): string | null {
    const cleanHost = String(host || '')
        .trim()
        .toLowerCase()
        .split(':')[0];
    if (!cleanHost) return null;

    if (cleanHost === 'localhost') return DEV_DEFAULT_TENANT;

    if (cleanHost.endsWith('.localhost')) {
        const sub = cleanHost.replace(/\.localhost$/, '');
        const parts = sub.split('.').filter(Boolean);
        const first = parts[0] === 'www' ? parts[1] : parts[0];
        return first ? String(first) : null;
    }

    if (cleanHost === BASE_DOMAIN || cleanHost === `www.${BASE_DOMAIN}`) {
        return null;
    }

    if (cleanHost.endsWith(`.${BASE_DOMAIN}`)) {
        const sub = cleanHost.slice(0, -`.${BASE_DOMAIN}`.length);
        const parts = sub.split('.').filter(Boolean);
        const first = parts[0] === 'www' ? parts[1] : parts[0];
        return first ? String(first) : null;
    }

    return null;
}

async function getTenantSlugFromRequestHeaders(): Promise<string> {
    const h = await headers();
    const host = getHostFromHeaders(h);

    const slug = getTenantSlugFromHost(host);
    if (!slug) throw new Error('tenant_not_found');

    return slug;
}

export type PainelRole = 'ADMIN' | 'PLATFORM_OWNER' | 'PLATFORM_STAFF';

export type PainelSessionPayload = {
    sub: string;
    role: PainelRole;
    email: string;
    name?: string | null;

    tenantSlug?: string;
    companyId?: string;

    unitId?: string | null;
    canSeeAllUnits?: boolean;
};

function isPlatformRole(role: string) {
    const r = String(role || '').toUpperCase();
    return r === 'PLATFORM_OWNER' || r === 'PLATFORM_STAFF';
}

async function resolveCompanyByTenantSlug(tenantSlug: string) {
    const company = await prisma.company.findFirst({
        where: { slug: tenantSlug, isActive: true },
        select: { id: true, slug: true },
    });

    if (!company?.id) throw new Error('missing_company');

    return {
        companyId: String(company.id),
        tenantSlug: String(company.slug ?? tenantSlug),
    };
}

type AdminAccessPerms = {
    canAccessDashboard: boolean;
    canAccessReports: boolean;
    canAccessRides: boolean;
    canAccessCategories: boolean;
    canAccessReviews: boolean;
    canAccessProducts: boolean;
    canAccessPartners: boolean;
    canAccessMembers: boolean;
    canAccessFinance: boolean;
    canAccessSettings: boolean;
    canAccessCommunication: boolean;
    canAccessFaq: boolean;
    canAccessFaqReports: boolean;
};

function defaultAdminPerms(): AdminAccessPerms {
    return {
        canAccessDashboard: true,
        canAccessReports: true,
        canAccessRides: true,
        canAccessCategories: true,
        canAccessReviews: true,
        canAccessProducts: true,
        canAccessPartners: false,
        canAccessMembers: true,
        canAccessFinance: true,
        canAccessSettings: true,
        canAccessCommunication: true,
        canAccessFaq: true,
        canAccessFaqReports: true,
    };
}

const adminAccessSelect = {
    companyId: true,
    unitId: true,
    canAccessDashboard: true,
    canAccessReports: true,
    canAccessRides: true,
    canAccessCategories: true,
    canAccessReviews: true,
    canAccessProducts: true,
    canAccessPartners: true,
    canAccessMembers: true,
    canAccessFinance: true,
    canAccessSettings: true,
    canAccessCommunication: true,
    canAccessFaq: true,
    canAccessFaqReports: true,
} as const;

export async function createSessionToken(
    user: AuthenticatedUser
): Promise<string> {
    const userId = String(user.id ?? '').trim();
    const email = String(user.email ?? '')
        .trim()
        .toLowerCase();
    const name = user.name ?? null;

    if (!userId) throw new Error('Sem acesso (id ausente).');
    if (!email) throw new Error('Sem acesso (email ausente).');

    const role = String(user.role || '').toUpperCase();

    if (isPlatformRole(role)) {
        const payload: PainelSessionPayload = {
            sub: userId,
            role: role as PainelRole,
            email,
            name,
        };

        return await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
            .sign(getJwtSecretKey());
    }

    if (role !== 'ADMIN') {
        throw new Error('permissao');
    }

    const tenantSlugFromHost = await getTenantSlugFromRequestHeaders();

    const { companyId, tenantSlug } =
        await resolveCompanyByTenantSlug(tenantSlugFromHost);

    const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            adminAccesses: {
                where: { companyId },
                select: adminAccessSelect,
            },
            companyMemberships: {
                where: { isActive: true, companyId },
                select: { companyId: true, role: true },
            },
        },
    });

    if (!dbUser) throw new Error('Sem acesso');

    const membership = dbUser.companyMemberships?.[0] ?? null;
    const access0 = dbUser.adminAccesses?.[0] ?? null;

    if (!membership && !access0) {
        throw new Error('missing_company');
    }

    const isOwner = String(membership?.role ?? '') === 'OWNER';

    if (isOwner) {
        const payload: PainelSessionPayload = {
            sub: userId,
            role: 'ADMIN',
            email,
            name,
            tenantSlug,
            companyId,
            unitId: null,
            canSeeAllUnits: true,
        };

        return await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
            .sign(getJwtSecretKey());
    }

    if (!membership) throw new Error('missing_company');

    let access = access0;

    if (!access) {
        access = await prisma.adminAccess.create({
            data: {
                companyId,
                userId,
                unitId: null,
                ...defaultAdminPerms(),
            },
            select: adminAccessSelect,
        });
    }

    const payload: PainelSessionPayload = {
        sub: userId,
        role: 'ADMIN',
        email,
        name,
        tenantSlug,
        companyId,
        unitId: access.unitId == null ? null : String(access.unitId),
        canSeeAllUnits: false,
    };

    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
        .sign(getJwtSecretKey());
}

export async function verifySessionToken(
    token: string
): Promise<PainelSessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getJwtSecretKey());
        const p = payload as any;

        const role = String(p?.role ?? '').toUpperCase();

        const isValidRole =
            role === 'ADMIN' ||
            role === 'PLATFORM_OWNER' ||
            role === 'PLATFORM_STAFF';

        if (!isValidRole) return null;

        const base: PainelSessionPayload = {
            sub: String(p?.sub ?? ''),
            role: role as PainelRole,
            email: String(p?.email ?? ''),
            name: (p?.name ?? null) as string | null,
            unitId: p?.unitId == null ? null : String(p.unitId),
            canSeeAllUnits:
                typeof p?.canSeeAllUnits === 'boolean'
                    ? p.canSeeAllUnits
                    : undefined,
        };

        if (isPlatformRole(role)) {
            if (!base.sub || !base.email) return null;
            return base;
        }

        const tenantSlug = String(p?.tenantSlug ?? '')
            .trim()
            .toLowerCase();
        const companyId = String(p?.companyId ?? '').trim();

        if (!tenantSlug || !companyId) return null;

        return {
            ...base,
            tenantSlug,
            companyId,
        };
    } catch {
        return null;
    }
}

export async function getCurrentPainelUser(): Promise<PainelSessionPayload | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return await verifySessionToken(token);
}

export async function createPainelSessionCookie(user: AuthenticatedUser) {
    const token = await createSessionToken(user);
    const cookieStore = await cookies();

    const h = await headers();
    const host = getHostFromHeaders(h);
    const secure = isHttpsFromHeaders(h);
    const domain = getCookieDomainForHost(host);

    cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
        domain,
    });
}

export async function clearPainelSessionCookie() {
    const cookieStore = await cookies();

    const h = await headers();
    const host = getHostFromHeaders(h);
    const secure = isHttpsFromHeaders(h);
    const domain = getCookieDomainForHost(host);

    cookieStore.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
        domain,
    });

    cookieStore.delete(SESSION_COOKIE_NAME);
}
