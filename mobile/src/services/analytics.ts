// src/services/analytics.ts
import { api } from './api';

type AnalyticsSource = 'direct' | 'push' | 'menu' | 'deep_link' | 'flow';

type PushContext = {
    pushId?: string | null;
    pushType?: string | null;
    viewedAt?: string | null; // ISO
};

export type AnalyticsContext = {
    source: AnalyticsSource;
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

export function getAnalyticsContext(): AnalyticsContext {
    const lastPush = globalThis.__lastPushContext;

    if (lastPush?.pushId) {
        const nowISO = safeNowISO();
        return {
            source: 'push',
            pushId: lastPush.pushId ?? null,
            pushType: lastPush.pushType ?? null,
            secondsSincePush: secondsBetween(lastPush.viewedAt ?? null, nowISO),
        };
    }

    return { source: 'direct' };
}

export async function trackEvent(
    name: string,
    payload: Record<string, any> = {},
    ctx?: AnalyticsContext
) {
    try {
        const context = ctx ?? getAnalyticsContext();

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
        // ✅ silencioso: analytics nunca pode quebrar UX
    }
}
