'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    ListChecks,
    Package,
    Wallet,
    Users,
    CalendarCheck,
    Tag,
    Settings,
    BarChart3,
    Building2,
    Medal,
    Handshake,
    FolderTree,
    Ticket,
    CircleHelp,
    MessageSquare,
} from 'lucide-react';

import { canAccess } from '@/lib/admin-access-map';
import { ADMIN_MENU } from '@/lib/admin-menu';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type AdminAccessLike = Partial<
    Record<
        | 'canAccessDashboard'
        | 'canAccessReports'
        | 'canAccessAppointments'
        | 'canAccessCategories'
        | 'canAccessReviews'
        | 'canAccessProducts'
        | 'canAccessPartners'
        | 'canAccessClients'
        | 'canAccessCommunication'
        | 'canAccessClientLevels'
        | 'canAccessFinance'
        | 'canAccessSettings'
        | 'canAccessFaq'
        | 'canAccessFaqReports',
        boolean
    >
>;

export type UnitOption = {
    id: string; // unitId
    name: string;
};

export type AdminNavProps = {
    className?: string;

    /**
     * Permissões do admin (sub-admin vem do banco).
     * OWNER normalmente não tem linha em adminAccess, então pode vir null.
     */
    adminAccess?: AdminAccessLike | null;

    /**
     * ✅ IMPORTANTE:
     * O menu precisa saber quando é OWNER, porque o canAccess() é fail-closed.
     * Se for OWNER, mostramos todos os menus habilitados.
     */
    isOwner?: boolean;

    /**
     * Se informado, o unit-picker aparece no topo do menu e o `unit` é preservado nos links.
     * ✅ Nosso padrão agora: unit vem via cookie (admin_unit_context), não via querystring.
     */
    unitOptions?: UnitOption[];
};

const ICON_BY_KEY: Record<
    (typeof ADMIN_MENU)[number]['menuKey'],
    React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
    dashboard: LayoutDashboard,
    reports: BarChart3,
    appointments: CalendarCheck,
    categories: FolderTree,
    reviews: Tag,
    faq: CircleHelp,
    faqReports: BarChart3,
    products: Package,

    // ⚠️ Parceiros agora é PLATAFORMA, mas mantemos o ícone mapeado
    // caso o ADMIN_MENU ainda tenha a entrada (vamos filtrar na renderização).
    partners: Handshake,

    clients: Users,

    // ✅ “Nível do cliente” com medalha bonita
    clientLevels: Medal,

    communication: MessageSquare,

    finance: Wallet,
    settings: Settings,
};

const UNIT_COOKIE_NAME = 'admin_unit_context';
const UNIT_ALL_VALUE = 'all';

// ✅ Tenant Admin NÃO deve ver menu de Parceiros (agora é Plataforma/AtendePlay)
const HIDDEN_TENANT_MENU_KEYS = new Set<string>([
    'partners',
    'checkout',
    'professionals',
]);

// ✅ Ordem visual forçada no NAV
const MENU_DISPLAY_ORDER: Record<string, number> = {
    dashboard: 10,
    appointments: 20,
    categories: 50,
    services: 60,
    products: 70,
    clients: 90,
    clientLevels: 100,
    communication: 101,
    reviews: 110,
    faq: 111,
    reports: 120,
    finance: 130,
    settings: 140,
    partners: 999,
};

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(
        new RegExp(
            `(?:^|; )${name.replace(/[$()*+.?[\\\]^{|}-]/g, '\\$&')}=([^;]*)`
        )
    );
    return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string) {
    if (typeof document === 'undefined') return;

    const maxAge = 60 * 60 * 24 * 365; // 1 ano
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
        value
    )}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function withPreservedSearchParams(
    href: string,
    sp: URLSearchParams,
    keepKeys?: string[]
) {
    const next = new URLSearchParams();

    if (keepKeys?.length) {
        for (const k of keepKeys) {
            const v = sp.get(k);
            if (v) next.set(k, v);
        }
    } else {
        sp.forEach((value, key) => next.set(key, value));
    }

    const qs = next.toString();
    return qs ? `${href}?${qs}` : href;
}

function mapAdminHref(link: (typeof ADMIN_MENU)[number]) {
    // ✅ clients -> client (singular)
    if (link.menuKey === 'clients')
        return link.href.replace('/clients', '/client');

    // ✅ client-levels -> client-level (singular)
    if (link.menuKey === 'clientLevels')
        return link.href.replace('/client-levels', '/client-level');

    // ✅ review-tags -> review-tag (singular)
    if (link.menuKey === 'reviews')
        return link.href.replace('/review-tags', '/review-tag');

    // ✅ reports -> report (singular)
    if (link.menuKey === 'reports')
        return link.href.replace('/reports', '/report');

    return link.href;
}

function isPathActive(pathname: string | null, href: string) {
    if (!pathname) return false;

    // match exato
    if (pathname === href) return true;

    // match por “segmento” (evita /client ativar /client-level)
    const withSlash = href.endsWith('/') ? href : `${href}/`;
    return pathname.startsWith(withSlash);
}

function buildOwnerAccess(): AdminAccessLike {
    return {
        canAccessDashboard: true,
        canAccessReports: true,
        canAccessAppointments: true,
        canAccessCategories: true,
        canAccessReviews: true,
        canAccessProducts: true,
        canAccessPartners: false,
        canAccessClients: true,
        canAccessCommunication: true,
        canAccessClientLevels: true,
        canAccessFinance: true,
        canAccessSettings: true,
        canAccessFaq: true,
        canAccessFaqReports: true,
    };
}

export function AdminNav({
    className,
    adminAccess,
    isOwner,
    unitOptions,
}: AdminNavProps) {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();

    // ✅ OWNER: não depende de adminAccess (que pode ser null)
    const effectiveAccess: AdminAccessLike | null | undefined = isOwner
        ? buildOwnerAccess()
        : adminAccess;

    const visibleLinks = ADMIN_MENU.filter((link) => {
        if (!link.enabled) return false;

        // ✅ remove menus que são somente PLATAFORMA
        if (HIDDEN_TENANT_MENU_KEYS.has(String(link.menuKey))) return false;

        return canAccess(effectiveAccess as any, link.menuKey);
    }).sort((a, b) => {
        const orderA = MENU_DISPLAY_ORDER[String(a.menuKey)] ?? 9999;
        const orderB = MENU_DISPLAY_ORDER[String(b.menuKey)] ?? 9999;
        return orderA - orderB;
    });

    const shouldShowUnitPicker = !!unitOptions?.length;

    const [currentUnit, setCurrentUnit] = React.useState<string>('');

    const didNormalizeRef = React.useRef(false);

    React.useEffect(() => {
        if (!shouldShowUnitPicker) return;
        if (didNormalizeRef.current) return;

        const options = unitOptions ?? [];
        if (options.length === 0) return;

        const cookieValue = getCookie(UNIT_COOKIE_NAME) ?? '';
        const isValid =
            !!cookieValue && options.some((u) => u.id === cookieValue);

        if (isValid) {
            setCurrentUnit(cookieValue);
            didNormalizeRef.current = true;
            return;
        }

        const fallback = options[0]?.id;
        if (!fallback) return;

        setCookie(UNIT_COOKIE_NAME, fallback);
        setCurrentUnit(fallback);
        didNormalizeRef.current = true;

        router.refresh();
    }, [router, shouldShowUnitPicker, unitOptions]);

    function setUnitOnCurrentRoute(nextUnit: string) {
        const value = nextUnit || UNIT_ALL_VALUE;

        setCookie(UNIT_COOKIE_NAME, value);
        setCurrentUnit(value);

        router.refresh();
    }

    return (
        <nav
            className={cn(
                'group fixed left-0 top-0 z-40 flex h-screen flex-col',
                'border-r border-border-primary bg-background-primary',
                'w-14 hover:w-55 transition-[width] duration-200 ease-in-out',
                'pt-5 overflow-hidden',
                className
            )}
        >
            {shouldShowUnitPicker && (
                <div className="shrink-0 px-2 pb-3">
                    <div className={cn('rounded-xl p-2')}>
                        <div className="flex items-center gap-2 px-2 pb-2">
                            <Building2 className="h-4 w-4 shrink-0 text-content-brand" />
                            <span
                                className={cn(
                                    'text-label-small text-content-secondary whitespace-nowrap',
                                    'opacity-0 -translate-x-1',
                                    'transition-all duration-200',
                                    'group-hover:opacity-100 group-hover:translate-x-0'
                                )}
                            >
                                Grupo
                            </span>
                        </div>

                        <div
                            className={cn(
                                'opacity-0 -translate-x-1 pointer-events-none',
                                'transition-all duration-200',
                                'group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto'
                            )}
                        >
                            <Select
                                value={currentUnit || undefined}
                                onValueChange={(v) => setUnitOnCurrentRoute(v)}
                            >
                                <SelectTrigger
                                    className={cn(
                                        'h-9 w-full',
                                        'bg-background-secondary border-border-primary',
                                        'text-content-primary hover:border-border-secondary',
                                        'focus:border-border-brand focus:ring-0'
                                    )}
                                >
                                    <SelectValue placeholder="Selecione" />
                                </SelectTrigger>

                                <SelectContent className="border-border-primary bg-background-primary">
                                    {unitOptions!.map((u) => (
                                        <SelectItem key={u.id} value={u.id}>
                                            {u.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            )}

            <div
                className={cn(
                    'flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 pb-4',
                    'space-y-1'
                )}
            >
                {visibleLinks.map((link) => {
                    const rawHref = mapAdminHref(link);

                    const isActive = isPathActive(pathname, rawHref);
                    const Icon = ICON_BY_KEY[link.menuKey];

                    const href = withPreservedSearchParams(
                        rawHref,
                        new URLSearchParams(searchParams?.toString() ?? '')
                    );

                    return (
                        <Link
                            key={link.href}
                            href={href}
                            className={cn(
                                'flex items-center gap-2 rounded-lg px-3 py-2 text-label-small transition-colors',
                                'text-content-secondary hover:bg-background-tertiary/50',
                                isActive &&
                                    'bg-background-tertiary/50 font-medium text-content-brand'
                            )}
                        >
                            <div className="relative shrink-0">
                                <Icon
                                    className={cn(
                                        'h-4 w-4',
                                        isActive
                                            ? 'text-content-brand'
                                            : 'text-content-secondary'
                                    )}
                                />
                            </div>

                            <span
                                className={cn(
                                    'whitespace-nowrap',
                                    'opacity-0 -translate-x-1',
                                    'transition-all duration-200',
                                    'group-hover:opacity-100 group-hover:translate-x-0'
                                )}
                            >
                                {link.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
