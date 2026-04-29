// src/app/api/mobile/auth-redirect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'node:crypto';
import { signAppJwt } from '@/lib/app-jwt';

export const dynamic = 'force-dynamic';

/**
 * ✅ AJUSTE: app é só para CLIENTES
 * - Mantém o contrato do token do app sempre "CLIENT"
 * - Ainda valida membership na company (segurança multi-tenant)
 */
type AppRole = 'CLIENT';
type MemberRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'CLIENT';

type NextAuthJwtTokenLike = {
    id?: string;
    sub?: string;
    companyId?: string | null;
    email?: string | null;
    [k: string]: unknown;
};

type SidPayload = {
    userId: string;
    email?: string;
    iat: number;
    exp: number;
};

function mapMemberRoleToAppRole(_role: MemberRole): AppRole {
    // ✅ Força CLIENT sempre (o app é somente para clientes)
    return 'CLIENT';
}

function mapOauthError(code: string) {
    const c = String(code || '').trim();

    if (c === 'OAuthAccountNotLinked') {
        return 'Essa conta já existe com outro método de login. Use o método anterior ou peça para vincular o Google.';
    }
    if (c === 'AccessDenied') return 'Acesso negado. Tente novamente.';
    if (c === 'Configuration') return 'Configuração de login inválida.';

    if (c === 'user_inactive') return 'Usuário inativo.';
    if (c === 'user_not_found') return 'Usuário não encontrado.';
    if (c === 'not_authenticated') return 'Não autenticado.';
    if (c === 'missing_user_id') return 'Falha ao identificar usuário.';
    if (c === 'missing_company_id') return 'Falha ao identificar empresa.';
    if (c === 'company_not_allowed')
        return 'Você não tem acesso a esta empresa neste app.';
    if (c === 'company_inactive') return 'Empresa inativa.';
    if (c === 'company_not_found') return 'Empresa não encontrada.';
    if (c === 'invalid_redirect_uri') return 'Redirect inválido.';
    if (c === 'server_error') return 'Erro no servidor.';
    if (c === 'nextauth_secret_missing')
        return 'NEXTAUTH_SECRET não configurado no backend.';
    if (c === 'invalid_sid') return 'Sessão temporária inválida ou expirada.';
    if (c === 'missing_app_jwt_secret')
        return 'APP_JWT_SECRET (ou JWT_SECRET) não configurado no backend.';

    return 'Não foi possível autenticar. Tente novamente.';
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

/**
 * companyKey pode vir como:
 * - companyId
 * - company_id
 * - tenant
 * - slug
 */
function readCompanyKey(url: URL): string {
    const raw =
        url.searchParams.get('companyId') ??
        url.searchParams.get('company_id') ??
        url.searchParams.get('tenant') ??
        url.searchParams.get('slug') ??
        '';
    return String(raw).trim();
}

/**
 * ✅ Monta URL final anexando params com segurança (funciona bem com deep links).
 * Evita quebrar quando o baseUrl já tem querystring.
 */
function withParams(baseUrl: string, params: Record<string, string>) {
    try {
        const u = new URL(baseUrl);
        for (const [k, v] of Object.entries(params)) {
            u.searchParams.set(k, v);
        }
        return u.toString();
    } catch {
        const [noHash, hash] = baseUrl.split('#');
        const sep = noHash.includes('?') ? '&' : '?';
        const qs = Object.entries(params)
            .map(
                ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
            )
            .join('&');
        const full = `${noHash}${sep}${qs}`;
        return hash ? `${full}#${hash}` : full;
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

    // defaults compatíveis
    if (!list.length) return new Set(['atendeplay', 'agendaplay', 'exp']);
    return new Set(list);
}

/**
 * Segurança básica contra open-redirect:
 * Aceita apenas deep links do app (schemes permitidos) ou exp:// (Expo)
 *
 * Fonte:
 * - MOBILE_ALLOWED_REDIRECT_SCHEMES="atendeplay,agendaplay,exp"
 */
function isAllowedRedirectUri(uri: string) {
    const u = String(uri || '').trim();
    if (!u) return false;

    // pega lista do env (fallback seguro)
    const raw = String(
        process.env.MOBILE_ALLOWED_REDIRECT_SCHEMES || ''
    ).trim();
    const allowed = raw
        ? raw
              .split(',')
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean)
        : ['agendaplay', 'exp']; // fallback conservador

    // pega scheme: "atendeplay://xxx" -> "atendeplay"
    const scheme = u.split(':', 1)[0]?.toLowerCase() || '';
    if (!scheme) return false;

    // permite apenas deep links ("://")
    if (!u.includes('://')) return false;

    return allowed.includes(scheme);
}

/**
 * ✅ Lê token do NextAuth (se NextAuth existir).
 * IMPORTANTe: usa require “dinâmico” (eval) para evitar o bundler tentar resolver
 * 'next-auth/jwt' durante o build quando o pacote não está instalado.
 */
async function tryGetNextAuthToken(
    req: NextRequest
): Promise<NextAuthJwtTokenLike | null> {
    if (!process.env.NEXTAUTH_SECRET) return null;

    try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const dynamicRequire = eval('require') as (id: string) => any;

        const mod = dynamicRequire('next-auth/jwt') as {
            getToken?: (args: { req: any; secret: string }) => Promise<any>;
        };

        if (typeof mod?.getToken !== 'function') return null;

        const t = await mod.getToken({
            req: req as any,
            secret: process.env.NEXTAUTH_SECRET,
        });

        return (t ?? null) as NextAuthJwtTokenLike | null;
    } catch {
        return null;
    }
}

/**
 * ✅ SID (fallback sem NextAuth cookie)
 * Formato: base64url(payload).base64url(hmac(payload))
 * Obs: assina com um segredo "compartilhado" (APP_JWT_SECRET ou NEXTAUTH_SECRET)
 */
function getSharedSecretForSid(): string {
    return (
        process.env.APP_JWT_SECRET?.trim() ||
        process.env.MOBILE_JWT_SECRET?.trim() ||
        process.env.JWT_SECRET?.trim() ||
        process.env.NEXTAUTH_SECRET?.trim() ||
        ''
    );
}

function base64UrlEncode(input: Buffer | string) {
    const buf = typeof input === 'string' ? Buffer.from(input) : input;
    return buf
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecodeToBuffer(input: string) {
    const s = String(input || '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    return Buffer.from(`${s}${pad}`, 'base64');
}

function signHs256(secret: string, data: string) {
    const sig = crypto.createHmac('sha256', secret).update(data).digest();
    return base64UrlEncode(sig);
}

function safeJsonParse<T>(raw: string): T | null {
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function timingSafeEq(a: string, b: string) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

function verifySid(sid: string): SidPayload | null {
    const secret = getSharedSecretForSid();
    if (!secret) return null;

    const raw = String(sid || '').trim();
    const [b64, sig] = raw.split('.');
    if (!b64 || !sig) return null;

    const expected = signHs256(secret, b64);
    if (!timingSafeEq(sig, expected)) return null;

    const json = base64UrlDecodeToBuffer(b64).toString('utf8');
    const payload = safeJsonParse<SidPayload>(json);
    if (!payload?.userId || !payload?.exp) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
}

function extractUserIdFromNextAuthToken(token: NextAuthJwtTokenLike | null) {
    if (!token) return '';
    return typeof token.id === 'string'
        ? String(token.id).trim()
        : typeof token.sub === 'string'
          ? String(token.sub).trim()
          : '';
}

// -----------------------------
// Handler
// -----------------------------
export async function GET(req: NextRequest) {
    const url = new URL(req.url);

    console.log('[AUTH-REDIRECT] req.url =', req.url);
    console.log(
        '[AUTH-REDIRECT] redirect_uri =',
        url.searchParams.get('redirect_uri')
    );
    console.log(
        '[AUTH-REDIRECT] companyId =',
        url.searchParams.get('companyId')
    );
    console.log(
        '[AUTH-REDIRECT] sid exists =',
        Boolean(url.searchParams.get('sid'))
    );

    const redirectUriRaw = url.searchParams.get('redirect_uri');
    if (!redirectUriRaw) {
        return NextResponse.json(
            { error: 'redirect_uri ausente' },
            { status: 400 }
        );
    }

    // ⚠️ não faz decodeURIComponent aqui
    const redirectUri = String(redirectUriRaw).trim();

    if (!isAllowedRedirectUri(redirectUri)) {
        return NextResponse.json(
            { ok: false, error: 'invalid_redirect_uri' },
            { status: 400 }
        );
    }

    const oauthError = url.searchParams.get('error');
    if (oauthError) {
        const message = mapOauthError(oauthError);
        return redirect302(
            withParams(redirectUri, { error: String(oauthError), message })
        );
    }

    try {
        const requestedCompanyKey = readCompanyKey(url);
        const defaultSlug = String(
            process.env.DEFAULT_TENANT_SLUG || ''
        ).trim();

        // 1) tenta NextAuth cookie
        const nextAuthToken = await tryGetNextAuthToken(req);
        const nextAuthUserId = extractUserIdFromNextAuthToken(nextAuthToken);

        // 2) fallback: sid assinado (vindo do callback)
        const sid = String(url.searchParams.get('sid') || '').trim();
        const sidPayload = sid ? verifySid(sid) : null;

        if (sid && !sidPayload && !nextAuthUserId) {
            const message = mapOauthError('invalid_sid');
            return redirect302(
                withParams(redirectUri, { error: 'invalid_sid', message })
            );
        }

        const userId = nextAuthUserId || sidPayload?.userId || '';
        if (!userId) {
            const message = mapOauthError('not_authenticated');
            return redirect302(
                withParams(redirectUri, { error: 'not_authenticated', message })
            );
        }

        const tokenCompanyId =
            typeof nextAuthToken?.companyId === 'string'
                ? String(nextAuthToken.companyId).trim()
                : '';

        // ✅ ordem: querystring > token (web) > defaultSlug (dev)
        const companyKey = requestedCompanyKey || tokenCompanyId || defaultSlug;

        if (!companyKey) {
            const message = mapOauthError('missing_company_id');
            return redirect302(
                withParams(redirectUri, {
                    error: 'missing_company_id',
                    message,
                })
            );
        }

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

            if (!exists) {
                const message = mapOauthError('company_not_found');
                return redirect302(
                    withParams(redirectUri, {
                        error: 'company_not_found',
                        message,
                    })
                );
            }

            const message = mapOauthError('company_inactive');
            return redirect302(
                withParams(redirectUri, { error: 'company_inactive', message })
            );
        }

        const companyId = company.id;

        // ✅ valida user
        const dbUser = await prisma.user.findFirst({
            where: { id: userId },
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

        if (!dbUser) {
            const message = mapOauthError('user_not_found');
            return redirect302(
                withParams(redirectUri, { error: 'user_not_found', message })
            );
        }

        if (!dbUser.isActive) {
            const message = mapOauthError('user_inactive');
            return redirect302(
                withParams(redirectUri, { error: 'user_inactive', message })
            );
        }

        // ✅ valida membership ativo nessa company
        const membership = await prisma.companyMember.findFirst({
            where: { companyId, userId: dbUser.id, isActive: true },
            select: {
                role: true,
                companyId: true,
                lastUnitId: true,
                isActive: true,
            },
        });

        if (!membership || membership.isActive === false) {
            const message = mapOauthError('company_not_allowed');
            return redirect302(
                withParams(redirectUri, {
                    error: 'company_not_allowed',
                    message,
                })
            );
        }

        const profileComplete = computeProfileComplete({
            phone: dbUser.phone ?? null,
            birthday: dbUser.birthday ?? null,
        });

        // ✅ app é cliente-only
        const derivedRole = mapMemberRoleToAppRole(
            membership.role as MemberRole
        );

        // ✅ token do app sempre CLIENT
        const appToken = await signAppJwt({
            sub: dbUser.id,
            role: derivedRole, // "CLIENT"
            companyId: membership.companyId,
            email: dbUser.email ?? undefined,
            name: dbUser.name ?? null,
        });

        return redirect302(
            withParams(redirectUri, {
                token: appToken,
                companyId: membership.companyId,
                profile_complete: profileComplete ? '1' : '0',
            })
        );
    } catch (err: any) {
        const msg = String(err?.message || '');

        if (
            msg.includes('APP_JWT_SECRET') ||
            msg.includes('missing_app_jwt_secret')
        ) {
            const message = mapOauthError('missing_app_jwt_secret');
            return redirect302(
                withParams(redirectUri, {
                    error: 'missing_app_jwt_secret',
                    message,
                })
            );
        }

        console.error('[mobile auth-redirect] error:', err);
        const message = mapOauthError('server_error');
        return redirect302(
            withParams(redirectUri, { error: 'server_error', message })
        );
    }
}
