// src/lib/platform-permissions.ts
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentPainelUser } from '@/lib/painel-session';

/* =========================================================
 * Platform (AtendePlay)
 * ========================================================= */

export type PlatformModule =
    | 'DASHBOARD'
    | 'PARTNERS'
    | 'COMPANIES'
    | 'ANALYTICS'
    | 'BILLING'
    | 'SETTINGS';

export type PlatformSession = {
    id: string;
    name: string | null;
    email: string;
    role: 'PLATFORM_OWNER' | 'PLATFORM_STAFF';
};

type PlatformContext = {
    id: string;
    name: string | null;
    email: string;
    role: PlatformSession['role'];
};

type PlatformContextResult =
    | { ok: true; ctx: PlatformContext }
    | {
          ok: false;
          reason:
              | 'no_session'
              | 'not_platform'
              | 'invalid_token'
              | 'user_inactive';
      };

type PlatformContextFailureReason = Extract<
    PlatformContextResult,
    { ok: false }
>['reason'];

async function getPlatformContext(): Promise<PlatformContextResult> {
    const session = await getCurrentPainelUser();

    if (!session) return { ok: false, reason: 'no_session' };

    const role = String((session as any).role || '').trim();
    const isPlatform = role === 'PLATFORM_OWNER' || role === 'PLATFORM_STAFF';

    if (!isPlatform) return { ok: false, reason: 'not_platform' };

    const userId = String((session as any).sub || '').trim();
    if (!userId) return { ok: false, reason: 'invalid_token' };

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            role: true,
        },
    });

    if (!user?.id || !user.isActive) {
        return { ok: false, reason: 'user_inactive' };
    }

    // ✅ trava pelo role do banco também (não só do token)
    const dbRole = String((user as any).role || '').trim();
    const dbIsPlatform =
        dbRole === 'PLATFORM_OWNER' || dbRole === 'PLATFORM_STAFF';

    if (!dbIsPlatform) return { ok: false, reason: 'not_platform' };

    return {
        ok: true,
        ctx: {
            id: user.id,
            name: user.name ?? null,
            email: user.email,
            role: dbRole as PlatformSession['role'],
        },
    };
}

function redirectToPlatformLoginByReason(
    _reason: PlatformContextFailureReason
): never {
    // ✅ por enquanto reaproveita o mesmo login do painel.
    // Depois você pode separar /plataform/login sem dor.
    redirect('/painel/login?error=permissao');
}

function platformModuleAllowed(
    session: PlatformSession,
    module: PlatformModule
): boolean {
    // ✅ OWNER: tudo
    if (session.role === 'PLATFORM_OWNER') return true;

    // ✅ STAFF: por padrão não mexe em billing/config sensível
    if (session.role === 'PLATFORM_STAFF') {
        return module !== 'BILLING' && module !== 'SETTINGS';
    }

    return false;
}

/**
 * ✅ Server Components / Layouts / Pages (bloqueia com redirect)
 */
export async function requirePlatformForModule(
    module: PlatformModule
): Promise<PlatformSession> {
    const res = await getPlatformContext();

    if (!res.ok) {
        redirectToPlatformLoginByReason(res.reason);
    }

    const session: PlatformSession = {
        id: res.ctx.id,
        name: res.ctx.name,
        email: res.ctx.email,
        role: res.ctx.role,
    };

    if (!platformModuleAllowed(session, module)) {
        redirect('/painel/login?error=permissao');
    }

    return session;
}

/**
 * ✅ Route Handlers /api (bloqueia com 401/403 JSON)
 */
export async function requirePlatformForModuleApi(
    module: PlatformModule
): Promise<PlatformSession | NextResponse> {
    const res = await getPlatformContext();

    if (!res.ok) {
        return NextResponse.json(
            { ok: false, error: 'unauthorized' },
            { status: 401 }
        );
    }

    const session: PlatformSession = {
        id: res.ctx.id,
        name: res.ctx.name,
        email: res.ctx.email,
        role: res.ctx.role,
    };

    if (!platformModuleAllowed(session, module)) {
        return NextResponse.json(
            { ok: false, error: 'forbidden' },
            { status: 403 }
        );
    }

    return session;
}
