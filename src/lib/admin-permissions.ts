// src/lib/admin-permissions.ts
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { prisma } from '@/lib/prisma';
import { getCurrentPainelUser } from '@/lib/painel-session';

/* =========================================================
 * Admin (Tenant)
 * ========================================================= */

export type AdminModule =
    | 'DASHBOARD'
    | 'REPORTS'
    | 'APPOINTMENTS'
    | 'PROFESSIONALS'
    | 'SERVICES'
    | 'CATEGORIES'
    | 'REVIEWS'
    | 'PRODUCTS'
    | 'PLANS'
    | 'PARTNERS'
    | 'CLIENTS'
    | 'CLIENT_LEVELS'
    | 'FINANCE'
    | 'SETTINGS'
    | 'COMMUNICATION'
    | 'FAQ'
    | 'FAQ_REPORTS';

export type AdminSession = {
    id: string;
    name: string | null;
    email: string;
    role: 'ADMIN';
    isOwner: boolean;
    companyId: string;
    unitId: string | null;
    canSeeAllUnits: boolean;
};

type AdminAccessFlag =
    | 'canAccessDashboard'
    | 'canAccessReports'
    | 'canAccessAppointments'
    | 'canAccessProfessionals'
    | 'canAccessServices'
    | 'canAccessCategories'
    | 'canAccessReviews'
    | 'canAccessProducts'
    | 'canAccessPlans'
    | 'canAccessPartners'
    | 'canAccessClients'
    | 'canAccessClientLevels'
    | 'canAccessFinance'
    | 'canAccessSettings'
    | 'canAccessCommunication'
    | 'canAccessFaq'
    | 'canAccessFaqReports';

type AdminAccessSelect = Record<AdminAccessFlag, true>;
const ADMIN_ACCESS_SELECT: AdminAccessSelect = {
    canAccessDashboard: true,
    canAccessReports: true,
    canAccessAppointments: true,
    canAccessProfessionals: true,
    canAccessServices: true,
    canAccessCategories: true,
    canAccessReviews: true,
    canAccessProducts: true,
    canAccessPlans: true,
    canAccessPartners: true,
    canAccessClients: true,
    canAccessClientLevels: true,
    canAccessFinance: true,
    canAccessSettings: true,
    canAccessCommunication: true,
    canAccessFaq: true,
    canAccessFaqReports: true,
};

function moduleToAccessField(module: AdminModule): AdminAccessFlag | null {
    switch (module) {
        case 'DASHBOARD':
            return 'canAccessDashboard';
        case 'REPORTS':
            return 'canAccessReports';
        case 'APPOINTMENTS':
            return 'canAccessAppointments';
        case 'PROFESSIONALS':
            return 'canAccessProfessionals';
        case 'SERVICES':
            return 'canAccessServices';
        case 'CATEGORIES':
            return 'canAccessCategories';
        case 'REVIEWS':
            return 'canAccessReviews';
        case 'PRODUCTS':
            return 'canAccessProducts';
        case 'PLANS':
            return 'canAccessPlans';

        // ✅ IMPORTANTE:
        // Parceiros saiu do ADMIN (tenant) e agora pertence somente à PLATAFORMA.
        // Ao retornar null, o guard força redirect para o primeiro módulo permitido.
        case 'PARTNERS':
            return null;

        case 'CLIENTS':
            return 'canAccessClients';
        case 'CLIENT_LEVELS':
            return 'canAccessClientLevels';
        case 'FINANCE':
            return 'canAccessFinance';
        case 'SETTINGS':
            return 'canAccessSettings';
        case 'COMMUNICATION':
            return 'canAccessCommunication';
        case 'FAQ':
            return 'canAccessFaq';
        case 'FAQ_REPORTS':
            return 'canAccessFaqReports';
        default:
            return null;
    }
}

type AdminContext = {
    id: string;
    name: string | null;
    email: string;
    companyId: string;
    isOwner: boolean;
};

type AdminContextResult =
    | { ok: true; ctx: AdminContext }
    | {
          ok: false;
          reason:
              | 'no_session'
              | 'not_admin'
              | 'invalid_token'
              | 'user_inactive'
              | 'no_membership'
              | 'no_access';
      };

type AdminContextFailureReason = Extract<
    AdminContextResult,
    { ok: false }
>['reason'];

async function getAdminContext(): Promise<AdminContextResult> {
    const session = await getCurrentPainelUser();

    if (!session) return { ok: false, reason: 'no_session' };

    // ✅ IMPORTANTE: aqui é TENANT ADMIN apenas
    if (session.role !== 'ADMIN') return { ok: false, reason: 'not_admin' };

    const userId = String((session as any).sub || '').trim();
    const companyId = String((session as any).companyId || '').trim();

    if (!userId || !companyId) return { ok: false, reason: 'invalid_token' };

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, isActive: true },
    });

    if (!user?.id || !user.isActive) {
        return { ok: false, reason: 'user_inactive' };
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

    if (!membership?.role) return { ok: false, reason: 'no_membership' };

    const isOwner = membership.role === 'OWNER';

    // ✅ Sub-admin precisa existir em AdminAccess (OWNER não precisa)
    if (!isOwner) {
        const accessExists = await prisma.adminAccess.findFirst({
            where: { userId, companyId },
            select: { id: true },
        });

        if (!accessExists?.id) return { ok: false, reason: 'no_access' };
    }

    return {
        ok: true,
        ctx: {
            id: user.id,
            name: user.name ?? null,
            email: user.email,
            companyId,
            isOwner,
        },
    };
}

function redirectToLoginByReason(reason: AdminContextFailureReason): never {
    switch (reason) {
        case 'no_session':
            redirect('/painel/login?error=credenciais');
        case 'not_admin':
            redirect('/painel/login?error=permissao');
        case 'invalid_token':
        case 'user_inactive':
        case 'no_membership':
        case 'no_access':
        default:
            redirect('/painel/login?error=permissao');
    }
}

type ModuleRoute = { module: AdminModule; href: string };

/**
 * ✅ Ordem de “melhor destino” quando falta permissão.
 *
 * Mantemos DASHBOARD por último (se for o único liberado, vira fallback final).
 * O restante segue a ordem do menu que você pediu.
 */
const FALLBACK_ROUTES: ModuleRoute[] = [
    { module: 'APPOINTMENTS', href: '/admin/appointments' },
    {
        module: 'PROFESSIONALS',
        // ✅ FIX: rota correta (plural)
        href: '/admin/professionals',
    },
    { module: 'SERVICES', href: '/admin/services' },
    { module: 'CATEGORIES', href: '/admin/categories' },
    { module: 'PRODUCTS', href: '/admin/products' },
    { module: 'PLANS', href: '/admin/plans' },

    // ✅ PARTNERS REMOVIDO do fallback (agora é somente da PLATAFORMA)

    { module: 'CLIENTS', href: '/admin/clients' },
    { module: 'COMMUNICATION', href: '/admin/communication' },
    { module: 'CLIENT_LEVELS', href: '/admin/client-levels' },
    { module: 'REVIEWS', href: '/admin/review-tags' },
    { module: 'REPORTS', href: '/admin/reports' },
    { module: 'FINANCE', href: '/admin/finance' },
    { module: 'SETTINGS', href: '/admin/setting' },
    // deixa dashboard por último
    { module: 'DASHBOARD', href: '/admin/dashboard' },
];

function pickFirstAllowedHref(
    access: Record<string, any> | null
): string | null {
    if (!access) return null;

    for (const r of FALLBACK_ROUTES) {
        const flag = moduleToAccessField(r.module);
        if (!flag) continue;
        if (Boolean((access as any)[flag])) return r.href;
    }

    return null;
}

async function redirectToFirstAllowedOrLogin(params: {
    companyId: string;
    userId: string;
}): Promise<never> {
    const access = await prisma.adminAccess.findFirst({
        where: { companyId: params.companyId, userId: params.userId },
        select: ADMIN_ACCESS_SELECT,
    });

    const href = pickFirstAllowedHref(access as any);
    if (href) {
        redirect(`${href}?error=permissao`);
        throw new Error('unreachable');
    }

    redirect('/painel/login?error=permissao');
    throw new Error('unreachable');
}

async function resolveSelectedUnitForAdmin(params: {
    companyId: string;
    userId: string;
    isOwner: boolean;
}): Promise<{ unitId: string | null; canSeeAllUnits: boolean }> {
    const cookieStore = await cookies();
    const rawUnitId = String(
        cookieStore.get('admin_unit_context')?.value || ''
    ).trim();

    if (!rawUnitId || rawUnitId === 'all') {
        return {
            unitId: null,
            canSeeAllUnits: params.isOwner,
        };
    }

    const unit = await prisma.unit.findFirst({
        where: {
            id: rawUnitId,
            companyId: params.companyId,
            isActive: true,
        },
        select: { id: true },
    });

    if (!unit?.id) {
        return {
            unitId: null,
            canSeeAllUnits: params.isOwner,
        };
    }

    if (params.isOwner) {
        return {
            unitId: unit.id,
            canSeeAllUnits: true,
        };
    }

    const hasUnitAccess = await prisma.adminUnitAccess.findFirst({
        where: {
            companyId: params.companyId,
            userId: params.userId,
            unitId: unit.id,
        },
        select: { id: true },
    });

    if (!hasUnitAccess?.id) {
        return {
            unitId: null,
            canSeeAllUnits: false,
        };
    }

    return {
        unitId: unit.id,
        canSeeAllUnits: false,
    };
}

/**
 * ✅ Server Components / Layouts / Pages (bloqueia com redirect)
 */
export async function requireAdminForModule(
    module: AdminModule
): Promise<AdminSession> {
    const res = await getAdminContext();

    if (!res.ok) {
        redirectToLoginByReason(res.reason);
    }

    const ctx = res.ctx;
    const unitContext = await resolveSelectedUnitForAdmin({
        companyId: ctx.companyId,
        userId: ctx.id,
        isOwner: ctx.isOwner,
    });

    // OWNER: tudo liberado (mas mesmo assim, PARTNERS não existe mais no Admin)
    if (ctx.isOwner) {
        // ✅ Se tentarem acessar PARTNERS como admin-owner tenant, cai no redirect padrão
        if (module === 'PARTNERS') {
            await redirectToFirstAllowedOrLogin({
                companyId: ctx.companyId,
                userId: ctx.id,
            });
            throw new Error('unreachable');
        }

        return {
            id: ctx.id,
            name: ctx.name,
            email: ctx.email,
            role: 'ADMIN',
            isOwner: true,
            companyId: ctx.companyId,
            unitId: unitContext.unitId,
            canSeeAllUnits: unitContext.canSeeAllUnits,
        };
    }

    const accessField = moduleToAccessField(module);
    if (!accessField) {
        await redirectToFirstAllowedOrLogin({
            companyId: ctx.companyId,
            userId: ctx.id,
        });
        throw new Error('unreachable');
    }

    const access = await prisma.adminAccess.findFirst({
        where: { userId: ctx.id, companyId: ctx.companyId },
        select: ADMIN_ACCESS_SELECT,
    });

    if (!access) {
        await redirectToFirstAllowedOrLogin({
            companyId: ctx.companyId,
            userId: ctx.id,
        });
        throw new Error('unreachable');
    }

    const allowed = Boolean(access[accessField]);
    if (!allowed) {
        await redirectToFirstAllowedOrLogin({
            companyId: ctx.companyId,
            userId: ctx.id,
        });
        throw new Error('unreachable');
    }

    return {
        id: ctx.id,
        name: ctx.name,
        email: ctx.email,
        role: 'ADMIN',
        isOwner: false,
        companyId: ctx.companyId,
        unitId: unitContext.unitId,
        canSeeAllUnits: unitContext.canSeeAllUnits,
    };
}

/**
 * ✅ Route Handlers /api (bloqueia com 403 JSON)
 *
 * Uso:
 * const res = await requireAdminForModuleApi('DASHBOARD');
 * if (res instanceof NextResponse) return res;
 * const session = res;
 */
export async function requireAdminForModuleApi(
    module: AdminModule
): Promise<AdminSession | NextResponse> {
    const res = await getAdminContext();

    if (!res.ok) {
        return NextResponse.json(
            { ok: false, error: 'unauthorized' },
            { status: 401 }
        );
    }

    const ctx = res.ctx;
    const unitContext = await resolveSelectedUnitForAdmin({
        companyId: ctx.companyId,
        userId: ctx.id,
        isOwner: ctx.isOwner,
    });

    if (ctx.isOwner) {
        // ✅ trava PARTNERS também na API do Admin
        if (module === 'PARTNERS') {
            return NextResponse.json(
                { ok: false, error: 'forbidden' },
                { status: 403 }
            );
        }

        return {
            id: ctx.id,
            name: ctx.name,
            email: ctx.email,
            role: 'ADMIN',
            isOwner: true,
            companyId: ctx.companyId,
            unitId: unitContext.unitId,
            canSeeAllUnits: unitContext.canSeeAllUnits,
        };
    }

    const accessField = moduleToAccessField(module);
    if (!accessField) {
        return NextResponse.json(
            { ok: false, error: 'forbidden' },
            { status: 403 }
        );
    }

    const access = await prisma.adminAccess.findFirst({
        where: { userId: ctx.id, companyId: ctx.companyId },
        select: ADMIN_ACCESS_SELECT,
    });

    if (!access || !Boolean(access[accessField])) {
        const fallbackHref = pickFirstAllowedHref(access as any);
        return NextResponse.json(
            { ok: false, error: 'forbidden', fallback: fallbackHref },
            { status: 403 }
        );
    }

    return {
        id: ctx.id,
        name: ctx.name,
        email: ctx.email,
        role: 'ADMIN',
        isOwner: false,
        companyId: ctx.companyId,
        unitId: unitContext.unitId,
        canSeeAllUnits: unitContext.canSeeAllUnits,
    };
}

/* =========================================================
 * Platform (AtendePlay)
 * ========================================================= *
 * ✅ MOVED OUT:
 * A plataforma agora vive em src/lib/platform-permissions.ts
 * Mantemos re-export aqui por compat (caso algum import antigo exista).
 */

export type {
    PlatformModule,
    PlatformSession,
} from '@/lib/plataform-permissions';
export {
    requirePlatformForModule,
    requirePlatformForModuleApi,
} from '@/lib/plataform-permissions';

/**
 * Mantive esse export porque você já usou em outros pontos.
 * Implementamos de verdade quando chegar no painel do profissional.
 */
export async function requireProfessionalSession(): Promise<never> {
    throw new Error(
        'requireProfessionalSession ainda não foi implementado (não é necessário neste passo).'
    );
}
