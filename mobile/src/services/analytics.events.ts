// src/services/analytics.events.ts

import type { AnalyticsContext } from './analytics';

/**
 * 🔒 Single source of truth para nomes de eventos (tipados).
 * Evita drift de strings ao longo do app.
 */
export const AnalyticsEvents = {
    // ===== Navegação / páginas
    PAGE_VIEWED: 'page_viewed',
    NAV_CLICK: 'nav_click',

    // ===== Produtos
    PRODUCT_IMPRESSION: 'product_impression',
    PRODUCT_CLICK: 'product_click',

    // ===== Busca / filtros
    SEARCH_CHANGE: 'search_change',
    FILTER_CATEGORY: 'filter_category',

    // ===== Carrinho
    ADD_TO_CART_ATTEMPT: 'add_to_cart_attempt',
    ADD_TO_CART_SUCCESS: 'add_to_cart_success',
    ADD_TO_CART_ERROR: 'add_to_cart_error',

    // ===== Ações genéricas
    ACTION_CLICK: 'action_click',
} as const;

/** Union type com todos os eventos válidos */
export type AnalyticsEventName =
    (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

/**
 * 🧠 Payloads tipados por evento
 * Cresce com o produto, sem virar bagunça
 */
export type AnalyticsEventPayloadMap = {
    [AnalyticsEvents.PAGE_VIEWED]: {
        page: string;
        referrer?: string | null;
    };

    [AnalyticsEvents.NAV_CLICK]: {
        from: string;
        to: string;
    };

    [AnalyticsEvents.PRODUCT_IMPRESSION]: {
        page: string;
        productId: string;
        placement?: 'featured' | 'grid' | string;
        isOutOfStock?: boolean;
        category?: string | null;
        unitId?: string | null;
    };

    [AnalyticsEvents.PRODUCT_CLICK]: {
        from: string;
        productId: string;
        unitId?: string | null;
    };

    [AnalyticsEvents.SEARCH_CHANGE]: {
        page: string;
        queryLen: number;
    };

    [AnalyticsEvents.FILTER_CATEGORY]: {
        page: string;
        category: string;
    };

    [AnalyticsEvents.ADD_TO_CART_ATTEMPT]: {
        from: string;
        productId: string;
        quantity: number;
        unitId?: string | null;
    };

    [AnalyticsEvents.ADD_TO_CART_SUCCESS]: {
        from: string;
        productId: string;
        quantity: number;
        orderId: string;
        unitId?: string | null;
    };

    [AnalyticsEvents.ADD_TO_CART_ERROR]: {
        from: string;
        productId: string;
        message?: string;
        unitId?: string | null;
    };

    [AnalyticsEvents.ACTION_CLICK]: {
        page: string;
        action: string;
        [k: string]: any;
    };
};

/**
 * ✅ Helper opcional para payload tipado
 */
export function analyticsPayload<E extends AnalyticsEventName>(
    _event: E,
    data: AnalyticsEventPayloadMap[E]
) {
    return data;
}

/**
 * ✅ Helper opcional para contexto
 */
export function analyticsContext(
    data: Partial<AnalyticsContext>
): AnalyticsContext {
    return {
        source: data.source ?? 'direct',
        pushId: data.pushId ?? null,
        pushType: data.pushType ?? null,
        secondsSincePush: data.secondsSincePush ?? null,
    };
}
