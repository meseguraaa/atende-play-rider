// src/services/api.ts
import { BRAND } from '../config/brand';

import * as SecureStore from 'expo-secure-store';

export const AUTH_TOKEN_KEY = 'auth_token';

// ✅ mesmo storage key que vamos usar no AuthProvider / bootstrap
export const COMPANY_ID_STORAGE_KEY = 'company_context_id';

// ✅ sessão inteira do auth (mesma key do AuthProvider)
const AUTH_SESSION_STORAGE_KEY = 'auth_session';

// ✅ cache em memória (evita race logo após login)
let MEMORY_TOKEN: string | null = null;
let MEMORY_COMPANY_ID: string | null = null;

/**
 * ✅ Injeta token em memória para requests imediatas (sem depender do SecureStore)
 */
export function setApiAuthToken(token: string | null) {
    MEMORY_TOKEN =
        typeof token === 'string' && token.trim() ? token.trim() : null;
}

/**
 * ✅ Injeta companyId em memória para requests imediatas (sem depender do SecureStore)
 */
export function setApiCompanyId(companyId: string | null) {
    MEMORY_COMPANY_ID =
        typeof companyId === 'string' && companyId.trim()
            ? companyId.trim()
            : null;
}

/**
 * ✅ Limpa caches em memória (útil em casos de 401 / troca de sessão)
 */
function clearMemoryAuth() {
    MEMORY_TOKEN = null;
}

function clearMemoryCompany() {
    MEMORY_COMPANY_ID = null;
}

/**
 * Base URL do backend
 *
 * ✅ Regra (multi-app): se EXPO_PUBLIC_API_URL existir, ela manda.
 * ✅ Caso contrário, este app é "hardcoded" para o tenant atendeplay.
 *
 * Importante:
 * - NUNCA usar localhost como fallback (quebra no celular físico).
 * - Mantemos override por env pra você gerar outros apps sem alterar código.
 */
const DEFAULT_API_URL = 'https://atendeplay.atendeplay.com.br';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_URL;
console.log('[API_URL]', API_URL);

// Em produção, não aceitamos base vazia.
if (!API_URL) {
    throw new Error(
        '[api] EXPO_PUBLIC_API_URL é obrigatório (ou use DEFAULT_API_URL).'
    );
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type HeadersMap = Record<string, string>;
type HeadersLike = HeadersMap | { headers?: HeadersMap };

type RequestOptions = {
    method?: HttpMethod;
    body?: any;
    headers?: HeadersLike;
};

function normalizeHeaders(input?: HeadersLike): HeadersMap {
    if (!input) return {};
    if (typeof (input as any).headers === 'object') {
        return (((input as any).headers ?? {}) as HeadersMap) || {};
    }
    return (input as HeadersMap) || {};
}

function getHeaderValueCI(headers: HeadersMap, key: string): string | null {
    const target = key.toLowerCase();
    for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === target) {
            const v = headers[k];
            return typeof v === 'string' && v.trim().length ? v.trim() : null;
        }
    }
    return null;
}

function deleteHeaderCI(headers: HeadersMap, key: string) {
    const target = key.toLowerCase();
    for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === target) {
            delete headers[k];
            return;
        }
    }
}

async function safeReadBody(res: Response) {
    try {
        return await res.json();
    } catch {
        try {
            const text = await res.text();
            return text ? { raw: text } : null;
        } catch {
            return null;
        }
    }
}

function pickToken(obj: any): string | null {
    const candidates = [
        obj?.appToken,
        obj?.token,
        obj?.accessToken,
        obj?.app_token,
        obj?.session?.appToken,
        obj?.session?.token,
        obj?.session?.accessToken,
        obj?.data?.appToken,
        obj?.data?.token,
        obj?.data?.accessToken,
    ];

    for (const c of candidates) {
        if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return null;
}

function tryExtractTokenFromSession(sessionJson: string | null): string | null {
    if (!sessionJson) return null;
    try {
        const parsed = JSON.parse(sessionJson);
        const t = pickToken(parsed);
        return typeof t === 'string' && t.length >= 10 ? t : null;
    } catch {
        return null;
    }
}

async function getAuthToken(): Promise<string | null> {
    // ✅ 0) cache em memória
    if (MEMORY_TOKEN) return MEMORY_TOKEN;

    // 1) fonte principal: auth_token
    const direct = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    if (direct && direct.trim()) {
        MEMORY_TOKEN = direct.trim();
        return MEMORY_TOKEN;
    }

    // 2) fallback: auth_session.*
    const sessionJson = await SecureStore.getItemAsync(
        AUTH_SESSION_STORAGE_KEY
    );
    const fromSession = tryExtractTokenFromSession(sessionJson);
    if (fromSession) {
        // “cura” pra próximas requests
        await SecureStore.setItemAsync(AUTH_TOKEN_KEY, fromSession);
        MEMORY_TOKEN = fromSession;
        return fromSession;
    }

    return null;
}

// ✅ companyId vem do SecureStore (com cache em memória)
async function getCompanyId(): Promise<string | null> {
    const fixed = String(BRAND.companyId ?? '').trim();
    return fixed.length ? fixed : null;
}

function joinUrl(base: string, path: string) {
    const b = base.endsWith('/') ? base.slice(0, -1) : base;
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${b}${p}`;
}

function shouldLogApiErrors() {
    // ✅ liga log só em DEV e quando você quiser
    // Se quiser forçar: EXPO_PUBLIC_API_DEBUG=1
    const forced = String(process.env.EXPO_PUBLIC_API_DEBUG ?? '').trim();
    return __DEV__ || forced === '1' || forced.toLowerCase() === 'true';
}

function looksLikeAuthError(status: number, data: any) {
    const msg = String(data?.message || data?.error || '').toLowerCase();
    return (
        status === 401 ||
        msg.includes('missing_token') ||
        msg.includes('invalid_token') ||
        msg.includes('user_not_found') ||
        msg.includes('não autorizado') ||
        msg.includes('token ausente') ||
        msg.includes('http 401')
    );
}

function looksLikeTenantError(status: number, data: any) {
    const msg = String(data?.message || data?.error || '').toLowerCase();
    return (
        status === 401 ||
        status === 403 ||
        msg.includes('missing_company') ||
        msg.includes('companyid') ||
        msg.includes('tenant') ||
        msg.includes('x-company-id') ||
        msg.includes('company_id')
    );
}

async function request<T = any>(
    path: string,
    options: RequestOptions = {}
): Promise<T> {
    const method = options.method ?? 'GET';

    const extraHeaders = normalizeHeaders(options.headers);

    // ✅ flags internas (não devem ir pro backend)
    // Use: { "x-skip-company-id": "1" } para NÃO mandar x-company-id numa request específica.
    const skipCompanyId =
        getHeaderValueCI(extraHeaders, 'x-skip-company-id') === '1' ||
        getHeaderValueCI(extraHeaders, 'x-skip-company-id')?.toLowerCase() ===
            'true';

    if (skipCompanyId) {
        deleteHeaderCI(extraHeaders, 'x-skip-company-id');
    }

    // ✅ Authorization (case-insensitive)
    const authHeader = getHeaderValueCI(extraHeaders, 'Authorization');
    const hasAuthHeader = !!authHeader;

    // ✅ x-company-id (case-insensitive)
    const companyHeader = getHeaderValueCI(extraHeaders, 'x-company-id');
    const hasCompanyHeader = !!companyHeader;

    // ✅ otimização: só busca token/companyId se a request NÃO veio com header manual
    const token = hasAuthHeader ? null : await getAuthToken();
    const companyId =
        hasCompanyHeader || skipCompanyId ? null : await getCompanyId();

    const hasBody =
        options.body !== undefined &&
        options.body !== null &&
        method !== 'GET' &&
        method !== 'DELETE';

    // ✅ headers finais
    const finalHeaders: HeadersMap = {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(companyId ? { 'x-company-id': companyId } : {}),
        ...extraHeaders,
    };

    const res = await fetch(joinUrl(API_URL, path), {
        method,
        headers: finalHeaders,
        body: hasBody ? JSON.stringify(options.body) : undefined,
    });

    const data = await safeReadBody(res);

    if (!res.ok) {
        const message =
            (data as any)?.message ||
            (data as any)?.error ||
            `Erro ${res.status} ao acessar ${path}`;

        // ✅ se deu erro de auth, zera cache do token em memória
        if (looksLikeAuthError(res.status, data)) {
            clearMemoryAuth();
        }

        // ✅ só limpa company cache se parecer realmente de tenant
        if (looksLikeTenantError(res.status, data)) {
            clearMemoryCompany();
        }

        const error: any = new Error(message);
        error.status = res.status;
        error.data = data;
        error.path = path;
        error.method = method;

        if (shouldLogApiErrors()) {
            // ✅ não loga token, só status + payload do erro
            console.log('[api:error]', {
                method,
                path,
                status: res.status,
                message,
                data,
            });
        }

        throw error;
    }

    return data as T;
}

export const api = {
    get: <T = any>(path: string, headers?: HeadersLike) =>
        request<T>(path, { method: 'GET', headers }),

    post: <T = any>(path: string, body?: any, headers?: HeadersLike) =>
        request<T>(path, { method: 'POST', body, headers }),

    put: <T = any>(path: string, body?: any, headers?: HeadersLike) =>
        request<T>(path, { method: 'PUT', body, headers }),

    patch: <T = any>(path: string, body?: any, headers?: HeadersLike) =>
        request<T>(path, { method: 'PATCH', body, headers }),

    delete: <T = any>(path: string, headers?: HeadersLike) =>
        request<T>(path, { method: 'DELETE', headers }),

    /**
     * ✅ quando precisar forçar tenant manualmente (ex: super-admin trocando contexto)
     * Observação: aqui a request já vai com x-company-id, então o request() não lê do storage.
     */
    withCompany: (companyId: string) => {
        const id = String(companyId ?? '').trim();

        return {
            get: <T = any>(path: string, headers?: HeadersLike) =>
                request<T>(path, {
                    method: 'GET',
                    headers: {
                        ...normalizeHeaders(headers),
                        'x-company-id': id,
                    },
                }),

            post: <T = any>(path: string, body?: any, headers?: HeadersLike) =>
                request<T>(path, {
                    method: 'POST',
                    body,
                    headers: {
                        ...normalizeHeaders(headers),
                        'x-company-id': id,
                    },
                }),

            put: <T = any>(path: string, body?: any, headers?: HeadersLike) =>
                request<T>(path, {
                    method: 'PUT',
                    body,
                    headers: {
                        ...normalizeHeaders(headers),
                        'x-company-id': id,
                    },
                }),

            patch: <T = any>(path: string, body?: any, headers?: HeadersLike) =>
                request<T>(path, {
                    method: 'PATCH',
                    body,
                    headers: {
                        ...normalizeHeaders(headers),
                        'x-company-id': id,
                    },
                }),

            delete: <T = any>(path: string, headers?: HeadersLike) =>
                request<T>(path, {
                    method: 'DELETE',
                    headers: {
                        ...normalizeHeaders(headers),
                        'x-company-id': id,
                    },
                }),
        };
    },
};
