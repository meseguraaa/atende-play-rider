'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    Package,
    Wallet,
    Users,
    CalendarCheck,
    Tag,
    Settings,
    BarChart3,
    Handshake,
    FolderTree,
    CircleHelp,
    MessageSquare,
} from 'lucide-react';

import { canAccess } from '@/lib/admin-access-map';
import { ADMIN_MENU } from '@/lib/admin-menu';

type AdminAccessLike = Partial<
    Record<
        | 'canAccessDashboard'
        | 'canAccessReports'
        | 'canAccessRides'
        | 'canAccessCategories'
        | 'canAccessReviews'
        | 'canAccessProducts'
        | 'canAccessPartners'
        | 'canAccessMembers'
        | 'canAccessCommunication'
        | 'canAccessFinance'
        | 'canAccessSettings'
        | 'canAccessFaq'
        | 'canAccessFaqReports',
        boolean
    >
>;

export type AdminNavProps = {
    className?: string;
    adminAccess?: AdminAccessLike | null;
    isOwner?: boolean;
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
    partners: Handshake,
    clients: Users,
    communication: MessageSquare,
    finance: Wallet,
    settings: Settings,
};

const HIDDEN_TENANT_MENU_KEYS = new Set<string>([
    'partners',
    'checkout',
    'professionals',
]);

const MENU_DISPLAY_ORDER: Record<string, number> = {
    dashboard: 10,
    appointments: 20,
    categories: 50,
    products: 70,
    clients: 90,
    communication: 101,
    reviews: 110,
    faq: 111,
    reports: 120,
    finance: 130,
    settings: 140,
    partners: 999,
};

function withPreservedSearchParams(href: string, sp: URLSearchParams) {
    const next = new URLSearchParams();
    sp.forEach((value, key) => {
        if (key === 'unit') return;
        next.set(key, value);
    });

    const qs = next.toString();
    return qs ? `${href}?${qs}` : href;
}

function mapAdminHref(link: (typeof ADMIN_MENU)[number]) {
    if (link.menuKey === 'clients')
        return link.href.replace('/clients', '/members');

    if (link.menuKey === 'reviews')
        return link.href.replace('/review-tags', '/review-tag');

    if (link.menuKey === 'reports')
        return link.href.replace('/reports', '/report');

    if (link.menuKey === 'appointments')
        return link.href.replace('/appointments', '/rides');

    return link.href;
}

function isPathActive(pathname: string | null, href: string) {
    if (!pathname) return false;
    if (pathname === href) return true;

    const withSlash = href.endsWith('/') ? href : `${href}/`;
    return pathname.startsWith(withSlash);
}

function buildOwnerAccess(): AdminAccessLike {
    return {
        canAccessDashboard: true,
        canAccessReports: true,
        canAccessRides: true,
        canAccessCategories: true,
        canAccessReviews: true,
        canAccessProducts: true,
        canAccessPartners: false,
        canAccessMembers: true,
        canAccessCommunication: true,
        canAccessFinance: true,
        canAccessSettings: true,
        canAccessFaq: true,
        canAccessFaqReports: true,
    };
}

export function AdminNav({ className, adminAccess, isOwner }: AdminNavProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const effectiveAccess: AdminAccessLike | null | undefined = isOwner
        ? buildOwnerAccess()
        : adminAccess;

    const visibleLinks = ADMIN_MENU.filter((link) => {
        if (!link.enabled) return false;
        if (HIDDEN_TENANT_MENU_KEYS.has(String(link.menuKey))) return false;

        return canAccess(effectiveAccess as any, link.menuKey);
    }).sort((a, b) => {
        const orderA = MENU_DISPLAY_ORDER[String(a.menuKey)] ?? 9999;
        const orderB = MENU_DISPLAY_ORDER[String(b.menuKey)] ?? 9999;
        return orderA - orderB;
    });

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
