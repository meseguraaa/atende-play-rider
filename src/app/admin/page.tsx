// src/app/admin/page.tsx
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { getCurrentPainelUser } from '@/lib/painel-session';
import { ADMIN_MENU } from '@/lib/admin-menu';
import { canAccess } from '@/lib/admin-access-map';

export const dynamic = 'force-dynamic';

type AdminAccessLike = {
    canAccessDashboard: boolean;
    canAccessReports: boolean;
    canAccessAppointments: boolean;
    canAccessServices: boolean;
    canAccessCategories: boolean;
    canAccessReviews: boolean;
    canAccessProducts: boolean;
    canAccessPlans: boolean;
    canAccessClients: boolean;
    canAccessClientLevels: boolean;
    canAccessFinance: boolean;
    canAccessSettings: boolean;
};

function firstAllowedEnabledHref(
    access: AdminAccessLike | null
): string | null {
    if (!access) return null;

    for (const item of ADMIN_MENU) {
        if (!item.enabled) continue;
        if (!canAccess(access as any, item.menuKey)) continue;
        return item.href;
    }

    return null;
}

export default async function AdminIndexPage() {
    const session = await getCurrentPainelUser();

    if (!session) {
        redirect('/painel/login?error=credenciais');
    }

    if (session.role !== 'ADMIN') {
        redirect('/painel/login?error=permissao');
    }

    const userId = String((session as any).sub || '').trim();
    const companyId = String((session as any).companyId || '').trim();

    if (!userId || !companyId) {
        redirect('/painel/login?error=permissao');
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true },
    });

    if (!user?.id || !user.isActive) {
        redirect('/painel/login?error=permissao');
    }

    const membership = await prisma.companyMember.findFirst({
        where: {
            userId,
            companyId,
            isActive: true,
            role: { in: ['OWNER', 'ADMIN'] },
        },
        select: { role: true },
    });

    if (!membership?.role) {
        redirect('/painel/login?error=permissao');
    }

    const isOwner = membership.role === 'OWNER';

    // OWNER: entra no dashboard (ele pode tudo)
    if (isOwner) {
        redirect('/admin/dashboard');
    }

    // Sub-admin: pega permissões
    const adminAccess = await prisma.adminAccess.findFirst({
        where: { companyId, userId },
        select: {
            canAccessDashboard: true,
            canAccessReports: true,
            canAccessAppointments: true,
            canAccessServices: true,
            canAccessCategories: true,
            canAccessReviews: true,
            canAccessProducts: true,
            canAccessPlans: true,
            canAccessClients: true,
            canAccessClientLevels: true,
            canAccessFinance: true,
            canAccessSettings: true,
        },
    });

    if (!adminAccess) {
        redirect('/painel/login?error=permissao');
    }

    const next = firstAllowedEnabledHref(adminAccess as any);

    if (!next) {
        redirect('/painel/login?error=permissao');
    }

    redirect(next);
}
