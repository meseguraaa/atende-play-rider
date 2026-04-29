// src/app/painel/login/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { loginWithCredentialsWithPrisma, AuthError } from '@/lib/auth';
import { createPainelSessionCookie } from '@/lib/painel-session';
import { ADMIN_MENU } from '@/lib/admin-menu';
import { canAccess } from '@/lib/admin-access-map';

function redirectWithError(code: string): never {
    redirect(`/painel/login?error=${encodeURIComponent(code)}`);
}

type AdminAccessRow = {
    canAccessDashboard: boolean;
    canAccessReports: boolean;
    canAccessCheckout: boolean;
    canAccessAppointments: boolean;
    canAccessProfessionals: boolean;
    canAccessServices: boolean;
    canAccessReviews: boolean;
    canAccessProducts: boolean;
    canAccessClients: boolean;
    canAccessClientLevels: boolean;
    canAccessFinance: boolean;
    canAccessSettings: boolean;
};

function pickFirstAdminRouteWithFallback(access: AdminAccessRow | null) {
    if (!access) return null;

    for (const item of ADMIN_MENU) {
        if (!item.enabled) continue;
        if (!canAccess(access as any, item.menuKey)) continue;
        return item.href;
    }

    return null;
}

function isPlatformRole(role: string) {
    const r = String(role || '').toUpperCase();
    return r === 'PLATFORM_OWNER' || r === 'PLATFORM_STAFF';
}

/**
 * ✅ Resolve tenant pelo Host (serve pra DEV e PROD).
 * - beautyacademy.localhost:3000 -> beautyacademy
 * - clientea.atendeplay.com.br -> clientea
 * - localhost:3000 -> null
 */
function resolveTenantSlugFromHost(hostRaw: string): string | null {
    const host = String(hostRaw || '')
        .trim()
        .toLowerCase()
        .split(':')[0];
    if (!host) return null;

    // DEV
    if (host === 'localhost') return null;
    if (host.endsWith('.localhost')) {
        const sub = host.replace(/\.localhost$/, '');
        const parts = sub.split('.').filter(Boolean);
        const first = parts[0] === 'www' ? parts[1] : parts[0];
        return first ? String(first) : null;
    }

    // PROD (ajuste se seu domínio base for outro)
    const BASE_DOMAIN = 'atendeplay.com.br';

    if (host === BASE_DOMAIN || host === `www.${BASE_DOMAIN}`) return null;

    if (host.endsWith(`.${BASE_DOMAIN}`)) {
        const sub = host.slice(0, -`.${BASE_DOMAIN}`.length);
        const parts = sub.split('.').filter(Boolean);
        const first = parts[0] === 'www' ? parts[1] : parts[0];
        return first ? String(first) : null;
    }

    return null;
}

export async function loginPainel(formData: FormData) {
    const email = String(formData.get('email') ?? '')
        .trim()
        .toLowerCase();
    const password = String(formData.get('password') ?? '');

    if (!email || !password) {
        redirectWithError('credenciais');
    }

    try {
        const user = await loginWithCredentialsWithPrisma(
            prisma,
            email,
            password
        );

        // ✅ PLATAFORMA: não depende de tenant
        if (isPlatformRole(user.role)) {
            await createPainelSessionCookie({
                ...user,
                tenantSlug: null,
                companyId: null,
            } as any);

            redirect('/plataform/dashboard');
        }

        // ✅ ADMIN (tenant obrigatório)
        if (user.role === 'ADMIN') {
            const h = await headers();
            const host = h.get('x-forwarded-host') || h.get('host') || '';
            const tenantSlug = resolveTenantSlugFromHost(host);

            if (!tenantSlug) {
                redirectWithError('tenant_not_found');
            }

            const company = await prisma.company.findFirst({
                where: {
                    slug: { equals: tenantSlug, mode: 'insensitive' },
                    isActive: true,
                },
                select: { id: true },
            });

            if (!company?.id) {
                redirectWithError('missing_company');
            }

            const dbUser = await prisma.user.findUnique({
                where: { id: user.id },
                select: { isOwner: true, isActive: true },
            });

            if (!dbUser?.isActive) {
                redirectWithError('permissao');
            }

            // ✅ owner global pode entrar, MAS precisamos setar companyId no cookie
            if (!dbUser.isOwner) {
                const member = await prisma.companyMember.findFirst({
                    where: {
                        companyId: company.id,
                        userId: user.id,
                        isActive: true,
                    },
                    select: { id: true },
                });

                if (!member?.id) {
                    redirectWithError('missing_company'); // “sem vínculo”
                }
            }

            // ✅ Agora sim: cria cookie com tenant + companyId
            await createPainelSessionCookie({
                ...user,
                tenantSlug,
                companyId: company.id,
            } as any);

            // Owner: pode ir direto
            if (dbUser.isOwner) {
                redirect('/admin/dashboard');
            }

            const access = await prisma.adminAccess.findFirst({
                where: { companyId: company.id, userId: user.id },
                select: {
                    canAccessDashboard: true,
                    canAccessReports: true,
                    canAccessCheckout: true,
                    canAccessAppointments: true,
                    canAccessProfessionals: true,
                    canAccessServices: true,
                    canAccessReviews: true,
                    canAccessProducts: true,
                    canAccessClients: true,
                    canAccessClientLevels: true,
                    canAccessFinance: true,
                    canAccessSettings: true,
                },
            });

            const nextRoute = pickFirstAdminRouteWithFallback(access);

            if (!nextRoute) {
                redirectWithError('permissao');
            }

            return redirect(nextRoute);
        }

        // ✅ PROFESSIONAL
        if (user.role === 'PROFESSIONAL') {
            await createPainelSessionCookie({
                ...user,
                tenantSlug: null,
                companyId: null,
            } as any);

            redirect('/professional/dashboard');
        }

        redirectWithError('permissao');
    } catch (err: any) {
        if (
            err?.message === 'NEXT_REDIRECT' ||
            String(err?.digest || '').startsWith('NEXT_REDIRECT')
        ) {
            throw err;
        }

        if (err instanceof AuthError) {
            redirectWithError(err.code);
        }

        const msg = String(err?.message ?? '')
            .trim()
            .toLowerCase();

        if (msg.includes('tenant_not_found'))
            redirectWithError('tenant_not_found');
        if (msg.includes('missing_company'))
            redirectWithError('missing_company');
        if (msg.includes('missing_unit')) redirectWithError('missing_unit');
        if (msg === 'permissao') redirectWithError('permissao');

        console.error('[loginPainel] erro real:', err);
        redirectWithError('desconhecido');
    }
}
