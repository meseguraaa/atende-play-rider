// src/lib/analytics.ts
import { api } from '../services/api';

/**
 * ===========================================
 * 📈 Analytics (mobile)
 * ===========================================
 * - Silencioso: nunca quebra UX
 * - Suporta contexto de push via `globalThis.__lastPushContext`
 */

export type AnalyticsSource = 'direct' | 'push' | 'menu' | 'deep_link' | 'flow';

export type PushContext = {
    pushId?: string | null;
    pushType?: string | null;
    viewedAt?: string | null; // ISO
};

export type AnalyticsContext = {
    source: AnalyticsSource;
    unitId?: string | null;
    pushId?: string | null;
    pushType?: string | null;
    secondsSincePush?: number | null;
};

declare global {
    // eslint-disable-next-line no-var
    var __lastPushContext: PushContext | undefined;
}

function safeNowISO() {
    try {
        return new Date().toISOString();
    } catch {
        return '';
    }
}

function secondsBetween(aISO?: string | null, bISO?: string | null) {
    try {
        if (!aISO || !bISO) return null;
        const a = new Date(aISO).getTime();
        const b = new Date(bISO).getTime();
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        const s = Math.floor((b - a) / 1000);
        return Number.isFinite(s) ? Math.max(0, s) : null;
    } catch {
        return null;
    }
}

/**
 * ✅ Define/atualiza o contexto de push global
 * Chame isso quando o app abrir via push/deeplink.
 */
export function setLastPushContext(ctx: PushContext) {
    try {
        globalThis.__lastPushContext = {
            pushId: ctx?.pushId ?? null,
            pushType: ctx?.pushType ?? null,
            viewedAt: ctx?.viewedAt ?? safeNowISO(),
        };
    } catch {
        // silencioso
    }
}

export function getAnalyticsContext(
    override?: Partial<AnalyticsContext>
): AnalyticsContext {
    const lastPush = globalThis.__lastPushContext;

    const base: AnalyticsContext = lastPush?.pushId
        ? {
              source: 'push',
              pushId: lastPush.pushId ?? null,
              pushType: lastPush.pushType ?? null,
              secondsSincePush: secondsBetween(
                  lastPush.viewedAt ?? null,
                  safeNowISO()
              ),
          }
        : { source: 'direct' };

    return {
        ...base,
        ...(override ?? {}),
    };
}

export async function trackEvent(
    name: string,
    payload: Record<string, any> = {},
    ctx?: Partial<AnalyticsContext>
) {
    try {
        const context = getAnalyticsContext(ctx);

        await api.post(
            '/api/mobile/analytics/events',
            {
                name,
                ts: safeNowISO(),
                context,
                payload,
            },
            {}
        );
    } catch {
        // silencioso: analytics nunca pode quebrar UX
    }
}
