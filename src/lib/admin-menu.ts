// src/lib/admin-menu.ts
import type { AdminMenuKey } from '@/lib/admin-access-map';

export type AdminMenuItem = {
    href: string;
    label: string;
    menuKey: AdminMenuKey;
    enabled: boolean;
};

/**
 * Desativar módulos temporariamente (sem mexer em permissões):
 * - Use ENV: ADMIN_DISABLED_MODULES="reviews,finance"
 * - Ou no client: NEXT_PUBLIC_ADMIN_DISABLED_MODULES="reviews,finance"
 *
 * Observação:
 * - Faz match por "menuKey" (ex: "reviews", "finance", "settings", "faq")
 * - Espaços são ignorados
 */
function readDisabledKeys(): Set<string> {
    const raw =
        process.env.ADMIN_DISABLED_MODULES ??
        process.env.NEXT_PUBLIC_ADMIN_DISABLED_MODULES ??
        '';

    const keys = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    return new Set(keys);
}

const DISABLED_KEYS = readDisabledKeys();

function isEnabled(menuKey: AdminMenuKey): boolean {
    // ✅ partners agora é SOMENTE da Plataforma (AtendePlay), não do Admin tenant
    if (menuKey === 'partners') return false;

    return !DISABLED_KEYS.has(String(menuKey));
}

/**
 * ✅ Fonte única do menu (ordem + href + key).
 */
export const ADMIN_MENU: AdminMenuItem[] = [
    {
        href: '/admin/dashboard',
        label: 'Dashboard',
        menuKey: 'dashboard',
        enabled: isEnabled('dashboard'),
    },
    {
        href: '/admin/rides',
        label: 'Rolês',
        menuKey: 'appointments',
        enabled: isEnabled('appointments'),
    },
    {
        href: '/admin/services',
        label: 'Serviços',
        menuKey: 'services',
        enabled: isEnabled('services'),
    },

    // 🆕 PLANOS
    {
        href: '/admin/plans',
        label: 'Planos',
        menuKey: 'plans',
        enabled: isEnabled('plans'),
    },

    {
        href: '/admin/categories',
        label: 'Categorias',
        menuKey: 'categories',
        enabled: isEnabled('categories'),
    },

    // ✅ NOVO: FAQ / Dúvidas
    {
        href: '/admin/faq',
        label: 'Dúvidas',
        menuKey: 'faq',
        enabled: isEnabled('faq'),
    },

    {
        href: '/admin/products',
        label: 'Produtos',
        menuKey: 'products',
        enabled: isEnabled('products'),
    },
    {
        // ✅ Parceiros desativado no Admin (ficou só na Plataforma)
        href: '/admin/partners',
        label: 'Parceiros',
        menuKey: 'partners',
        enabled: isEnabled('partners'),
    },
    {
        href: '/admin/clients',
        label: 'Clientes',
        menuKey: 'clients',
        enabled: isEnabled('clients'),
    },
    {
        href: '/admin/communication',
        label: 'Comunicação',
        menuKey: 'communication',
        enabled: isEnabled('communication'),
    },
    {
        href: '/admin/client-levels',
        label: 'Nível de Cliente',
        menuKey: 'clientLevels',
        enabled: isEnabled('clientLevels'),
    },
    {
        href: '/admin/review-tags',
        label: 'Avaliação',
        menuKey: 'reviews',
        enabled: isEnabled('reviews'),
    },
    {
        href: '/admin/reports',
        label: 'Relatórios',
        menuKey: 'reports',
        enabled: isEnabled('reports'),
    },
    {
        href: '/admin/finance',
        label: 'Financeiro',
        menuKey: 'finance',
        enabled: isEnabled('finance'),
    },
    {
        href: '/admin/setting',
        label: 'Configurações',
        menuKey: 'settings',
        enabled: isEnabled('settings'),
    },
];

/**
 * Helper: retorna o primeiro href habilitado na ordem do menu.
 */
export function getFirstEnabledAdminHref(): string | null {
    return ADMIN_MENU.find((i) => i.enabled)?.href ?? null;
}
