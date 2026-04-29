// src/proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE_NAME = 'painel_session';

// ✅ ajuste aqui se seu domínio base for diferente
const BASE_DOMAIN = 'atendeplay.com.br';

function getJwtSecretKey() {
    const secret = process.env.PAINEL_JWT_SECRET;
    if (!secret) throw new Error('PAINEL_JWT_SECRET não definido no .env');
    return new TextEncoder().encode(secret);
}

function getHostFromRequest(req: NextRequest): string {
    const xfHost =
        req.headers.get('x-forwarded-host') ||
        req.headers.get('x-original-host') ||
        req.headers.get('x-vercel-forwarded-host') ||
        '';

    const raw = (xfHost || req.headers.get('host') || '').trim().toLowerCase();
    const first = raw.split(',')[0]?.trim() ?? '';
    return first.split(':')[0]; // remove :3000
}

/**
 * Resolve tenant slug pelo host.
 *
 * PROD:
 *  - clientea.atendeplay.com.br -> "clientea"
 *  - atendeplay.com.br / www.atendeplay.com.br -> null
 *
 * DEV:
 *  - beautyacademy.localhost -> "beautyacademy"
 *  - localhost -> null (ou você pode escolher um default, mas eu recomendo null)
 */
function getTenantSlugFromHost(host: string): string | null {
    const cleanHost = String(host || '')
        .trim()
        .toLowerCase()
        .split(':')[0];

    if (!cleanHost) return null;

    // ✅ DEV: localhost puro NÃO tem tenant
    if (cleanHost === 'localhost') return null;

    // ✅ DEV: *.localhost usa o subdomínio como tenant
    if (cleanHost.endsWith('.localhost')) {
        const sub = cleanHost.replace(/\.localhost$/, '');
        const parts = sub.split('.').filter(Boolean);
        const first = parts[0] === 'www' ? parts[1] : parts[0];
        return first ? String(first) : null;
    }

    // ✅ domínio raiz não tem tenant
    if (cleanHost === BASE_DOMAIN || cleanHost === `www.${BASE_DOMAIN}`) {
        return null;
    }

    // ✅ padrão oficial: <tenant>.atendeplay.com.br
    if (cleanHost.endsWith(`.${BASE_DOMAIN}`)) {
        const sub = cleanHost.slice(0, -`.${BASE_DOMAIN}`.length);
        const parts = sub.split('.').filter(Boolean);

        const first = parts[0] === 'www' ? parts[1] : parts[0];
        return first ? String(first) : null;
    }

    return null;
}

function isPlatformRole(role: unknown) {
    const r = String(role ?? '')
        .trim()
        .toUpperCase();
    return r === 'PLATFORM_OWNER' || r === 'PLATFORM_STAFF';
}

async function isValidPainelSessionForTenant(
    token: string,
    tenantSlug: string
): Promise<boolean> {
    try {
        const { payload } = await jwtVerify(token, getJwtSecretKey());
        const p = payload as any;

        if (isPlatformRole(p?.role)) return true;

        const tokenTenant = String(p?.tenantSlug ?? '')
            .toLowerCase()
            .trim();

        return tokenTenant === tenantSlug;
    } catch {
        return false;
    }
}

function isPainelArea(pathname: string) {
    return (
        pathname.startsWith('/painel') ||
        pathname.startsWith('/admin') ||
        pathname.startsWith('/professional')
    );
}

function redirectToLogin(req: NextRequest, error?: string) {
    const url = req.nextUrl.clone();
    url.pathname = '/painel/login';
    if (error) url.search = `?error=${encodeURIComponent(error)}`;
    return NextResponse.redirect(url);
}

// Next 16.1+: proxy.ts precisa exportar uma função chamada `proxy`
export async function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;

    if (
        pathname.startsWith('/api') ||
        pathname.startsWith('/_next') ||
        pathname.startsWith('/uploads') ||
        pathname.startsWith('/media') ||
        pathname === '/favicon.ico' ||
        pathname === '/robots.txt' ||
        pathname === '/sitemap.xml'
    ) {
        return NextResponse.next();
    }

    const host = getHostFromRequest(req);
    const tenantSlug = getTenantSlugFromHost(host);

    // Login do painel sempre liberado
    if (pathname === '/painel/login') {
        const res = NextResponse.next();
        if (tenantSlug) res.headers.set('x-tenant-slug', tenantSlug);
        return res;
    }

    if (isPainelArea(pathname) && !tenantSlug) {
        return redirectToLogin(req, 'tenant_not_found');
    }

    if (isPainelArea(pathname)) {
        const safeTenantSlug = tenantSlug as string;

        const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

        if (!token) {
            return redirectToLogin(req, 'session_missing');
        }

        const ok = await isValidPainelSessionForTenant(token, safeTenantSlug);

        if (!ok) {
            return redirectToLogin(req, 'session_invalid');
        }

        const res = NextResponse.next();
        res.headers.set('x-tenant-slug', safeTenantSlug);
        return res;
    }

    const res = NextResponse.next();
    if (tenantSlug) res.headers.set('x-tenant-slug', tenantSlug);
    return res;
}

export const config = {
    matcher: ['/:path*'],
};
