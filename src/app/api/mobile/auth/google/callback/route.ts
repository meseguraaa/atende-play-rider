// src/app/api/mobile/auth/google/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

type StatePayload = {
    companyId: string;
    redirectUri: string; // deep link do app
    provider?: 'google';
};

type SidPayload = {
    userId: string;
    email?: string;
    iat: number;
    exp: number;
};

function normalizeBaseUrl(raw: string) {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.endsWith('/') ? s.slice(0, -1) : s;
}

function getBaseUrlFromHeaders(req: NextRequest) {
    const proto = req.headers.get('x-forwarded-proto') || 'http';
    const host =
        req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    return normalizeBaseUrl(`${proto}://${host}`);
}

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

function isAllowedAppRedirectUri(uri: string) {
    const u = String(uri || '').trim();
    if (!u) return false;

    // tenta parsear (preferível). Se falhar, faz fallback simples.
    try {
        const parsed = new URL(u);
        const scheme = String(parsed.protocol || '')
            .toLowerCase()
            .replace(':', '');

        if (!scheme || scheme === 'http' || scheme === 'https') return false;

        const allowed = getAllowedSchemes();
        return allowed.has(scheme);
    } catch {
        // fallback por prefix
        const allowed = getAllowedSchemes();
        for (const scheme of allowed) {
            if (u.toLowerCase().startsWith(`${scheme}://`)) return true;
        }
        return false;
    }
}

/**
 * ✅ Monta URL final anexando params com segurança (funciona bem com deep links).
 * Evita quebrar quando o baseUrl já tem querystring.
 *
 * Observação: em alguns runtimes, `new URL("agendaplay://...")` pode falhar.
 * Por isso tem fallback que usa concatenação simples quando necessário.
 */
function withParams(baseUrl: string, params: Record<string, string>) {
    try {
        const u = new URL(baseUrl);
        for (const [k, v] of Object.entries(params)) {
            u.searchParams.set(k, v);
        }
        return u.toString();
    } catch {
        const sep = baseUrl.includes('?') ? '&' : '?';
        const qs = Object.entries(params)
            .map(
                ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
            )
            .join('&');
        return `${baseUrl}${sep}${qs}`;
    }
}

/** Redirect 302 + no-store (mobile deep link friendly) */
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

async function verifyState(state: string): Promise<StatePayload | null> {
    const raw = String(state || '').trim();
    if (!raw) return null;

    try {
        const { payload } = await jwtVerify(raw, getStateSecretKey());
        const companyId = String((payload as any)?.companyId || '').trim();
        const redirectUri = String((payload as any)?.redirectUri || '').trim();

        if (!companyId || !redirectUri) return null;
        if (!isAllowedAppRedirectUri(redirectUri)) return null;

        return {
            companyId,
            redirectUri,
            provider: 'google',
        };
    } catch {
        return null;
    }
}

async function exchangeCodeForTokens(args: {
    code: string;
    redirectUri: string;
}) {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();

    if (!clientId || !clientSecret) {
        throw new Error('missing_google_env');
    }

    const body = new URLSearchParams();
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
    body.set('code', args.code);
    body.set('grant_type', 'authorization_code');
    body.set('redirect_uri', args.redirectUri);

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
        const msg = String((data as any)?.error || 'token_exchange_failed');
        const desc = String((data as any)?.error_description || '');
        const err: any = new Error(msg);
        err.data = data;
        err.desc = desc;
        throw err;
    }

    return data as {
        access_token: string;
        id_token?: string;
        token_type?: string;
        scope?: string;
        expires_in?: number;
        refresh_token?: string;
    };
}

async function fetchGoogleUser(accessToken: string) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
        const err: any = new Error('google_userinfo_failed');
        err.data = data;
        throw err;
    }

    return data as {
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
        given_name?: string;
        family_name?: string;
    };
}

/**
 * ✅ Cria/atualiza User e garante membership na company.
 */
async function upsertUserAndMembership(args: {
    companyId: string;
    email: string;
    name: string | null;
    image: string | null;
}) {
    const email = String(args.email || '')
        .trim()
        .toLowerCase();
    if (!email) throw new Error('missing_email');

    // 0) valida company (existe + ativa)
    const company = await prisma.company.findFirst({
        where: { id: args.companyId },
        select: { id: true, isActive: true },
    });

    if (!company) throw new Error('company_not_found');
    if (company.isActive === false) throw new Error('company_inactive');

    // 1) user
    const user = await prisma.user.upsert({
        where: { email },
        create: {
            email,
            name: args.name,
            image: args.image,
            isActive: true,
        } as any,
        update: {
            name: args.name ?? undefined,
            image: args.image ?? undefined,
        } as any,
        select: { id: true, isActive: true },
    });

    if (!user.isActive) throw new Error('user_inactive');

    // 2) membership
    await prisma.companyMember.upsert({
        where: {
            companyId_userId: { companyId: args.companyId, userId: user.id },
        },
        create: {
            companyId: args.companyId,
            userId: user.id,
            role: 'CLIENT',
            isActive: true,
        } as any,
        update: { isActive: true } as any,
    });

    return { userId: user.id };
}

// -----------------------------
// ✅ SID assinado (fallback do auth-redirect)
// -----------------------------
function base64UrlEncode(input: Buffer | string) {
    const buf = typeof input === 'string' ? Buffer.from(input) : input;
    return buf
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlEncodeJson(obj: unknown) {
    return base64UrlEncode(Buffer.from(JSON.stringify(obj)));
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

/**
 * ✅ SID: base64url(payload).base64url(hmac(payload))
 * Duração curta (10 min).
 */
function signSid(payload: SidPayload) {
    const secret = getAppJwtSecret();
    if (!secret) throw new Error('missing_app_jwt_secret');

    const body = base64UrlEncodeJson(payload);
    const sig = signHs256(secret, body);
    return `${body}.${sig}`;
}

// -----------------------------
// Handler
// -----------------------------
export async function GET(req: NextRequest) {
    const url = new URL(req.url);

    const code = String(url.searchParams.get('code') || '').trim();
    const state = String(url.searchParams.get('state') || '').trim();
    const oauthError = String(url.searchParams.get('error') || '').trim();

    // tenta extrair redirectUri mesmo em fluxo de erro
    const statePayloadForAny = await verifyState(state);
    const fallbackRedirectUri = statePayloadForAny?.redirectUri || '';

    // Se o Google devolveu erro, precisamos de um redirectUri (vem do state)
    if (oauthError) {
        if (fallbackRedirectUri) {
            return redirect302(
                withParams(fallbackRedirectUri, {
                    error: oauthError,
                    message: 'Erro retornado pelo Google durante o login.',
                })
            );
        }

        return NextResponse.json(
            { ok: false, error: oauthError },
            { status: 400 }
        );
    }

    const statePayload = statePayloadForAny;
    if (!statePayload) {
        return NextResponse.json(
            { ok: false, error: 'invalid_state' },
            { status: 400 }
        );
    }

    if (!code) {
        return redirect302(
            withParams(statePayload.redirectUri, {
                error: 'missing_code',
                message: 'Código de autorização ausente.',
            })
        );
    }

    try {
        const baseUrl = getPublicBaseUrl(req);
        if (!baseUrl) {
            return redirect302(
                withParams(statePayload.redirectUri, {
                    error: 'server_error',
                    message:
                        'Não foi possível determinar a URL pública do backend (PUBLIC_BASE_URL).',
                })
            );
        }

        // Esse redirect_uri precisa ser exatamente o mesmo do /start (e do Google Console)
        const callbackUrl = new URL(
            '/api/mobile/auth/google/callback',
            baseUrl
        );

        const tokens = await exchangeCodeForTokens({
            code,
            redirectUri: callbackUrl.toString(),
        });

        const accessToken = String(tokens?.access_token || '').trim();
        if (!accessToken) {
            return redirect302(
                withParams(statePayload.redirectUri, {
                    error: 'server_error',
                    message: 'Falha ao obter access_token do Google.',
                })
            );
        }

        const userInfo = await fetchGoogleUser(accessToken);

        const email = String(userInfo.email || '')
            .trim()
            .toLowerCase();
        if (!email) {
            return redirect302(
                withParams(statePayload.redirectUri, {
                    error: 'missing_email',
                    message:
                        'Não foi possível obter email do Google. Verifique permissões (scope).',
                })
            );
        }

        const name = String(userInfo.name || '').trim() || null;
        const image = String(userInfo.picture || '').trim() || null;

        // ✅ garante user + membership nessa empresa
        const { userId } = await upsertUserAndMembership({
            companyId: statePayload.companyId,
            email,
            name,
            image,
        });

        // ✅ gera sid (10 min) pra /api/mobile/auth-redirect não depender de cookie NextAuth
        const now = Math.floor(Date.now() / 1000);
        const sid = signSid({
            userId,
            email,
            iat: now,
            exp: now + 60 * 10,
        });

        // ✅ redireciona pro auth-redirect (server) que devolve o deep link com token do app
        const authRedirect = new URL('/api/mobile/auth-redirect', baseUrl);
        authRedirect.searchParams.set('companyId', statePayload.companyId);

        // ⚠️ NÃO dar encode manual aqui. URLSearchParams já codifica.
        authRedirect.searchParams.set('redirect_uri', statePayload.redirectUri);

        // fallback seguro sem cookie
        authRedirect.searchParams.set('sid', sid);

        return redirect302(authRedirect.toString());
    } catch (err: any) {
        console.log(
            '[AUTH][GOOGLE][CALLBACK][ERROR]',
            err?.message,
            err?.desc,
            err?.data
        );
        const msg = String(err?.message || 'server_error');

        const error =
            msg === 'missing_google_env'
                ? 'server_error'
                : msg === 'company_not_found'
                  ? 'company_not_found'
                  : msg === 'company_inactive'
                    ? 'company_inactive'
                    : msg === 'user_inactive'
                      ? 'user_inactive'
                      : msg === 'missing_app_jwt_secret'
                        ? 'missing_app_jwt_secret'
                        : 'server_error';

        const message =
            msg === 'missing_google_env'
                ? 'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados no backend.'
                : msg === 'company_not_found'
                  ? 'Empresa não encontrada.'
                  : msg === 'company_inactive'
                    ? 'Empresa inativa.'
                    : msg === 'user_inactive'
                      ? 'Usuário inativo.'
                      : msg === 'missing_app_jwt_secret'
                        ? 'APP_JWT_SECRET (ou JWT_SECRET/NEXTAUTH_SECRET) não configurado no backend.'
                        : 'Erro no servidor ao concluir login.';

        // ✅ Se temos deep link seguro do state, devolve pro app.
        if (fallbackRedirectUri) {
            return redirect302(
                withParams(fallbackRedirectUri, {
                    error,
                    message,
                })
            );
        }

        // ✅ Sem redirectUri seguro, não inventa redirect: devolve JSON.
        return NextResponse.json(
            { ok: false, error, message },
            { status: 500 }
        );
    }
}
