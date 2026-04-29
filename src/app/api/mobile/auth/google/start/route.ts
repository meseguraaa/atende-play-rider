// src/app/api/mobile/auth/google/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';

export const dynamic = 'force-dynamic';

function normalizeBaseUrl(raw: string) {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.endsWith('/') ? s.slice(0, -1) : s;
}

function firstHeaderValue(v: string | null): string {
    // alguns proxies mandam "https,http" etc
    return String(v || '')
        .split(',')[0]
        .trim();
}

function getBaseUrlFromHeaders(req: NextRequest) {
    // funciona bem atrás de proxy também
    const protoRaw =
        req.headers.get('x-forwarded-proto') ||
        req.headers.get('x-forwarded-scheme') ||
        (req.headers.get('x-forwarded-ssl') === 'on' ? 'https' : '') ||
        '';

    const proto = firstHeaderValue(protoRaw) || 'http';

    const hostRaw =
        req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    const host = firstHeaderValue(hostRaw);

    return normalizeBaseUrl(`${proto}://${host}`);
}

/**
 * ✅ Base URL pública do backend:
 * 1) PUBLIC_BASE_URL (recomendado em dev/prod, ex: https://xxxx.ngrok-free.dev)
 * 2) NEXTAUTH_URL (se você já usa)
 * 3) headers (x-forwarded-*)
 */
function getPublicBaseUrl(req: NextRequest) {
    const envBase = normalizeBaseUrl(
        process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || ''
    );
    if (envBase) return envBase;
    return getBaseUrlFromHeaders(req);
}

function getStateSecretKey() {
    const secret = (
        process.env.PAINEL_JWT_SECRET ||
        process.env.APP_JWT_SECRET ||
        ''
    ).trim();
    if (!secret) {
        throw new Error(
            'PAINEL_JWT_SECRET (ou APP_JWT_SECRET) não definido no .env'
        );
    }
    return new TextEncoder().encode(secret);
}

/**
 * Às vezes o client manda redirect_uri já encoded (ou até duplamente).
 * Aqui tentamos decodificar até 2 vezes, sem explodir.
 */
function safeDecodeURIComponentOnce(v: string) {
    try {
        return decodeURIComponent(v);
    } catch {
        return v;
    }
}

function safeDecodeURIComponentTwice(v: string) {
    const once = safeDecodeURIComponentOnce(v);
    const twice = safeDecodeURIComponentOnce(once);
    return twice;
}

function safeUrl(raw: string): URL | null {
    try {
        return new URL(raw);
    } catch {
        return null;
    }
}

/**
 * Normaliza deep link esquisito:
 * - atendeplay:/auth  -> atendeplay://auth
 * Mantém querystring.
 */
function normalizeMobileRedirectUri(raw: string): string {
    const s = String(raw || '').trim();
    if (!s) return s;

    // se já tem "://", deixa quieto
    if (s.includes('://')) return s;

    // se vier "scheme:/path", tenta converter para "scheme://path" (sem duplicar slashes)
    const m = s.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*):\/(.*)$/);
    if (!m) return s;

    const scheme = m[1];
    const rest = m[2] || '';
    // rest pode começar com "/" se vier "scheme:///" (raro). Normaliza para não virar triple slash.
    const rest2 = rest.replace(/^\/+/, '');
    return `${scheme}://${rest2}`;
}

/**
 * ✅ Schemes permitidos para deep links (white-label friendly)
 * Configure por ENV:
 * MOBILE_ALLOWED_REDIRECT_SCHEMES=atendeplay,agendaplay,exp,clienteX
 */
function getAllowedSchemes(): Set<string> {
    const raw = String(
        process.env.MOBILE_ALLOWED_REDIRECT_SCHEMES || ''
    ).trim();

    const list = raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

    // ✅ defaults seguros (mantém compat + dev)
    if (!list.length) {
        return new Set(['agendaplay', 'atendeplay', 'exp']);
    }

    return new Set(list);
}

/**
 * Segurança básica: no start a gente só aceita redirect_uri que seja deep link do app.
 * Isso evita alguém passar um https://qualquer-coisa e você virar open-redirect.
 */
function isAllowedAppRedirectUri(u: URL) {
    const scheme = String(u.protocol || '')
        .toLowerCase()
        .replace(':', '');
    if (!scheme || scheme === 'http' || scheme === 'https') return false;

    const allowed = getAllowedSchemes();
    if (!allowed.has(scheme)) return false;

    // ✅ regra extra: exp:// só em dev (evita abrir porta pra open-redirect em produção)
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && scheme === 'exp') return false;

    return true;
}

/**
 * companyKey pode vir como:
 * - companyId
 * - company_id
 * - tenant
 * - slug
 */
function readCompanyKey(searchParams: URLSearchParams): string {
    const raw =
        searchParams.get('companyId') ??
        searchParams.get('company_id') ??
        searchParams.get('tenant') ??
        searchParams.get('slug') ??
        '';
    return String(raw).trim();
}

/**
 * Lê redirect_uri aceitando:
 * - cru (atendeplay://auth?x=1)
 * - cru esquisito (atendeplay:/auth)
 * - encoded 1x
 * - encoded 2x
 */
function readRedirectUri(searchParams: URLSearchParams): URL | null {
    const raw0 = String(searchParams.get('redirect_uri') || '').trim();
    if (!raw0) return null;

    // 1) tenta direto (caso venha cru)
    const raw1 = normalizeMobileRedirectUri(raw0);
    const direct = safeUrl(raw1);
    if (direct) return direct;

    // 2) só tenta decode se parece ter encoding
    if (!raw0.includes('%')) return null;

    // 3) tenta decode 1x/2x
    const decoded = safeDecodeURIComponentTwice(raw0);
    if (!decoded) return null;

    const decoded2 = normalizeMobileRedirectUri(decoded);
    return safeUrl(decoded2);
}

/** Redirect 302 + no-store (mobile friendly) */
function redirect302(target: string) {
    const res = NextResponse.redirect(target, { status: 302 });
    res.headers.set(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.headers.set('Pragma', 'no-cache');
    res.headers.set('Expires', '0');
    return res;
}

function isDebugEnabled() {
    const v = String(process.env.AUTH_DEBUG || '')
        .trim()
        .toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

function debugLog(...args: any[]) {
    if (!isDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.log('[AUTH][GOOGLE][START]', ...args);
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);

    const companyId = readCompanyKey(searchParams);
    const redirectUri = readRedirectUri(searchParams);

    debugLog('req.url:', req.url);
    debugLog('companyId:', companyId || '(missing)');
    debugLog('redirect_uri (parsed):', redirectUri?.toString() || '(missing)');
    debugLog('allowed_schemes:', Array.from(getAllowedSchemes()));

    if (!companyId || !redirectUri) {
        return NextResponse.json(
            {
                ok: false,
                error: 'missing_company_id_or_redirect_uri',
                message:
                    'Parâmetros obrigatórios: companyId (ou tenant/slug) e redirect_uri',
            },
            { status: 400 }
        );
    }

    if (!isAllowedAppRedirectUri(redirectUri)) {
        // ⚠️ Mantém o código "invalid_redirect_uri" pq o app já exibiu isso
        return NextResponse.json(
            {
                ok: false,
                error: 'invalid_redirect_uri',
                message:
                    'redirect_uri inválido (precisa ser deep link do app e ter scheme permitido).',
                allowed_schemes: Array.from(getAllowedSchemes()),
                received: redirectUri.toString(),
                hint_prod:
                    process.env.NODE_ENV === 'production'
                        ? 'Em produção, exp:// é bloqueado de propósito.'
                        : undefined,
            },
            { status: 400 }
        );
    }

    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    if (!clientId) {
        return NextResponse.json(
            { ok: false, error: 'GOOGLE_CLIENT_ID não definido no .env' },
            { status: 500 }
        );
    }

    const baseUrl = getPublicBaseUrl(req);
    if (!baseUrl) {
        return NextResponse.json(
            {
                ok: false,
                error: 'Não foi possível determinar a URL pública do backend. Defina PUBLIC_BASE_URL no .env (ex: https://xxxx.ngrok-free.dev).',
            },
            { status: 500 }
        );
    }

    // ✅ ESTE callback precisa bater com o Google Console (Authorized redirect URIs)
    const callbackUrl = new URL('/api/mobile/auth/google/callback', baseUrl);

    debugLog('PUBLIC_BASE_URL resolved:', baseUrl);
    debugLog('GOOGLE callback redirect_uri:', callbackUrl.toString());

    // state assinado (curto) para transportar dados do app com segurança
    const stateToken = await new SignJWT({
        companyId,
        redirectUri: redirectUri.toString(),
        provider: 'google',
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(getStateSecretKey());

    const googleAuth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuth.searchParams.set('client_id', clientId);

    // ✅ ESTE é o redirect_uri que precisa estar cadastrado no Google Cloud
    googleAuth.searchParams.set('redirect_uri', callbackUrl.toString());

    googleAuth.searchParams.set('response_type', 'code');
    googleAuth.searchParams.set('scope', 'openid email profile');

    // qualidade de vida em alguns cenários
    googleAuth.searchParams.set('include_granted_scopes', 'true');
    googleAuth.searchParams.set('access_type', 'offline');

    googleAuth.searchParams.set('state', stateToken);

    // mantém seu comportamento atual (selecionar conta)
    googleAuth.searchParams.set('prompt', 'select_account');

    const finalUrl = googleAuth.toString();
    debugLog('redirecting to google:', finalUrl);

    return redirect302(finalUrl);
}
