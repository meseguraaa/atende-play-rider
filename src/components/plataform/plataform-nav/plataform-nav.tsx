// src/components/plataform/plataform-nav.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    Building2,
    Handshake,
    BarChart3,
    Settings,
} from 'lucide-react';

type PlatformLink = {
    href: string;
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

/**
 * ⚠️ Rotas:
 * - Aqui estou usando /platform/...
 * - Se você estiver usando /plataform/... (com "a"), troque os hrefs.
 */
const platformLinks: PlatformLink[] = [
    {
        href: '/plataform/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
    },
    {
        href: '/plataform/companies',
        label: 'Empresas',
        icon: Building2,
    },
    {
        href: '/plataform/partners',
        label: 'Parceiros',
        icon: Handshake,
    },
    {
        href: '/plataform/reports',
        label: 'Relatórios',
        icon: BarChart3,
    },
    {
        href: '/plataform/settings',
        label: 'Configurações',
        icon: Settings,
    },
];

function isPathActive(pathname: string | null, href: string) {
    if (!pathname) return false;

    // match exato
    if (pathname === href) return true;

    // match por “segmento” (evita /platform/company ativar /platform/company-x)
    const withSlash = href.endsWith('/') ? href : `${href}/`;
    return pathname.startsWith(withSlash);
}

export type PlataformNavProps = {
    className?: string;
};

export function PlataformNav({ className }: PlataformNavProps) {
    const pathname = usePathname();

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
            {/* HEADER (opcional, mas mantém consistência visual) */}
            <div className="px-2 pb-3">
                <div className={cn('rounded-xl p-2')}>
                    <div
                        className={cn(
                            'opacity-0 -translate-x-1 pointer-events-none',
                            'transition-all duration-200',
                            'group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto'
                        )}
                    >
                        <div
                            className={cn(
                                'h-9 w-full flex items-center px-3 rounded-lg',
                                'bg-background-secondary border border-border-primary',
                                'text-content-primary'
                            )}
                            title="AtendePlay"
                        >
                            <span className="truncate text-label-small">
                                AtendePlay
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* LINKS */}
            <div className="flex-1 space-y-1 px-2 pb-4">
                {platformLinks.map((link) => {
                    const isActive = isPathActive(pathname, link.href);
                    const Icon = link.icon;

                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-lg text-label-small transition-colors',
                                'text-content-secondary hover:bg-background-tertiary/50',
                                isActive &&
                                    'text-content-brand font-medium bg-background-tertiary/50'
                            )}
                        >
                            <Icon
                                className={cn(
                                    'h-4 w-4 shrink-0',
                                    isActive
                                        ? 'text-content-brand'
                                        : 'text-content-secondary'
                                )}
                            />
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
