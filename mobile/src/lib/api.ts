// src/lib/api.ts
import * as SecureStore from 'expo-secure-store';
import { AUTH_TOKEN_KEY } from '../services/api';

const AUTH_STORAGE_KEY = 'auth_session';

/**
 * ✅ Mesma regra do src/services/api.ts
 * Evita autenticar num host e chamar APIs em outro.
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

if (!API_URL) {
    throw new Error(
        '[apiFetch] EXPO_PUBLIC_API_URL é obrigatório (ou use DEFAULT_API_URL).'
    );
}

type StoredSession = {
    appToken?: string;
    token?: string;
    accessToken?: string;
    app_token?: string;
    session?: any;
    data?: any;
};

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

async function getAppToken(): Promise<string | null> {
    const direct = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    if (direct && direct.trim()) return direct.trim();

    const sessionJson = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
    if (!sessionJson) return null;

    try {
        const parsed = JSON.parse(sessionJson) as StoredSession;
        return pickToken(parsed);
    } catch {
        return null;
    }
}

function joinUrl(base: string, path: string) {
    const b = base.endsWith('/') ? base.slice(0, -1) : base;
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${b}${p}`;
}

export async function apiFetch<T = any>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const appToken = await getAppToken();

    // Monta headers sem sobrescrever Authorization se já veio manualmente
    const mergedHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as any),
    };

    const hasAuthHeader =
        typeof mergedHeaders.Authorization === 'string' &&
        mergedHeaders.Authorization.trim().length > 0;

    if (appToken && !hasAuthHeader) {
        mergedHeaders.Authorization = `Bearer ${appToken}`;
    }

    const res = await fetch(joinUrl(API_URL, path), {
        ...options,
        headers: mergedHeaders,
    });

    const text = await res.text();
    const data = text ? safeJson(text) : null;

    if (!res.ok) {
        const msg =
            (data as any)?.error ||
            (data as any)?.message ||
            `HTTP ${res.status}`;
        throw new Error(msg);
    }

    return data as T;
}

function safeJson(text: string) {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}
