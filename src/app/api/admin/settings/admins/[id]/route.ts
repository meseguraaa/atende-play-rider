// src/app/api/admin/settings/admins/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';

type PermissionsPayload = {
    canAccessDashboard: boolean;
    canAccessReports: boolean;
    canAccessRides: boolean;
    canAccessCategories: boolean;
    canAccessReviews: boolean;
    canAccessFaq: boolean;
    canAccessFaqReports: boolean;
    canAccessCommunication: boolean;
    canAccessProducts: boolean;
    canAccessPartners: boolean;
    canAccessMembers: boolean;
    canAccessFinance: boolean;
    canAccessSettings: boolean;
};

type PatchAdminPayload = {
    permissions?: Partial<PermissionsPayload>;
    isActive?: boolean;
};

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function normalizePermissions(
    partial?: Partial<PermissionsPayload>
): PermissionsPayload {
    return {
        canAccessDashboard: Boolean(partial?.canAccessDashboard ?? true),
        canAccessReports: Boolean(partial?.canAccessReports ?? false),
        canAccessRides: Boolean(partial?.canAccessRides ?? true),
        canAccessCategories: Boolean(partial?.canAccessCategories ?? false),
        canAccessReviews: Boolean(partial?.canAccessReviews ?? false),
        canAccessFaq: Boolean(partial?.canAccessFaq ?? false),
        canAccessFaqReports: Boolean(partial?.canAccessFaqReports ?? false),
        canAccessCommunication: Boolean(
            partial?.canAccessCommunication ?? false
        ),
        canAccessProducts: Boolean(partial?.canAccessProducts ?? false),
        canAccessPartners: Boolean(partial?.canAccessPartners ?? false),
        canAccessMembers: Boolean(partial?.canAccessMembers ?? true),
        canAccessFinance: Boolean(partial?.canAccessFinance ?? false),
        canAccessSettings: Boolean(partial?.canAccessSettings ?? false),
    };
}

function sanitizePatchPermissions(
    patch?: Partial<PermissionsPayload>
): Partial<PermissionsPayload> | undefined {
    if (!patch || typeof patch !== 'object') return undefined;

    const keys: (keyof PermissionsPayload)[] = [
        'canAccessDashboard',
        'canAccessReports',
        'canAccessRides',
        'canAccessCategories',
        'canAccessReviews',
        'canAccessFaq',
        'canAccessFaqReports',
        'canAccessCommunication',
        'canAccessProducts',
        'canAccessPartners',
        'canAccessMembers',
        'canAccessFinance',
        'canAccessSettings',
    ];

    const out: Partial<PermissionsPayload> = {};
    let hasAny = false;

    for (const k of keys) {
        if (k in patch) {
            out[k] = Boolean((patch as any)[k]);
            hasAny = true;
        }
    }

    return hasAny ? out : undefined;
}

function mergePermissions(params: {
    current: PermissionsPayload;
    patch?: Partial<PermissionsPayload>;
}): PermissionsPayload {
    const p = params.patch ?? {};

    return {
        canAccessDashboard:
            p.canAccessDashboard !== undefined
                ? Boolean(p.canAccessDashboard)
                : params.current.canAccessDashboard,
        canAccessReports:
            p.canAccessReports !== undefined
                ? Boolean(p.canAccessReports)
                : params.current.canAccessReports,
        canAccessRides:
            p.canAccessRides !== undefined
                ? Boolean(p.canAccessRides)
                : params.current.canAccessRides,
        canAccessCategories:
            p.canAccessCategories !== undefined
                ? Boolean(p.canAccessCategories)
                : params.current.canAccessCategories,
        canAccessReviews:
            p.canAccessReviews !== undefined
                ? Boolean(p.canAccessReviews)
                : params.current.canAccessReviews,
        canAccessFaq:
            p.canAccessFaq !== undefined
                ? Boolean(p.canAccessFaq)
                : params.current.canAccessFaq,
        canAccessFaqReports:
            p.canAccessFaqReports !== undefined
                ? Boolean(p.canAccessFaqReports)
                : params.current.canAccessFaqReports,
        canAccessCommunication:
            p.canAccessCommunication !== undefined
                ? Boolean(p.canAccessCommunication)
                : params.current.canAccessCommunication,
        canAccessProducts:
            p.canAccessProducts !== undefined
                ? Boolean(p.canAccessProducts)
                : params.current.canAccessProducts,
        canAccessPartners:
            p.canAccessPartners !== undefined
                ? Boolean(p.canAccessPartners)
                : params.current.canAccessPartners,
        canAccessMembers:
            p.canAccessMembers !== undefined
                ? Boolean(p.canAccessMembers)
                : params.current.canAccessMembers,
        canAccessFinance:
            p.canAccessFinance !== undefined
                ? Boolean(p.canAccessFinance)
                : params.current.canAccessFinance,
        canAccessSettings:
            p.canAccessSettings !== undefined
                ? Boolean(p.canAccessSettings)
                : params.current.canAccessSettings,
    };
}

type RouteCtx = { params: Promise<{ id: string }> };

async function getParamsId(ctx: RouteCtx): Promise<string> {
    const p = await ctx.params;
    return String(p?.id || '').trim();
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
    const auth = await requireAdminForModuleApi('SETTINGS');
    if (auth instanceof NextResponse) return auth;
    const session = auth;

    if (!session.isOwner) {
        return jsonErr('forbidden_owner_only', 403);
    }

    const targetUserId = await getParamsId(ctx);
    if (!targetUserId) return jsonErr('invalid_id', 400);

    let body: PatchAdminPayload | null = null;

    try {
        body = (await req.json()) as PatchAdminPayload;
    } catch {
        return jsonErr('invalid_json', 400);
    }

    const patchPermissions = sanitizePatchPermissions(body?.permissions);
    const patchIsActive =
        typeof body?.isActive === 'boolean' ? body.isActive : undefined;

    if (!patchPermissions && patchIsActive === undefined) {
        return jsonErr('nothing_to_update', 400);
    }

    const membership = await prisma.companyMember.findFirst({
        where: {
            companyId: session.companyId,
            userId: targetUserId,
            isActive: true,
            role: { in: ['ADMIN', 'OWNER'] },
        },
        select: { role: true },
    });

    if (!membership?.role) {
        return jsonErr('target_not_found', 404);
    }

    if (membership.role === 'OWNER') {
        return jsonErr('forbidden_cannot_edit_owner', 403);
    }

    const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isOwner: true,
            isActive: true,
            createdAt: true,
            role: true,
        },
    });

    if (!targetUser?.id) {
        return jsonErr('target_not_found', 404);
    }

    if (targetUser.role !== 'ADMIN') {
        return jsonErr('target_not_admin', 400);
    }

    try {
        const updated = await prisma.$transaction(async (tx) => {
            const currentAccess = await tx.adminAccess.findFirst({
                where: {
                    companyId: session.companyId,
                    userId: targetUserId,
                },
                select: {
                    id: true,
                    canAccessDashboard: true,
                    canAccessReports: true,
                    canAccessRides: true,
                    canAccessCategories: true,
                    canAccessReviews: true,
                    canAccessFaq: true,
                    canAccessFaqReports: true,
                    canAccessCommunication: true,
                    canAccessProducts: true,
                    canAccessPartners: true,
                    canAccessMembers: true,
                    canAccessFinance: true,
                    canAccessSettings: true,
                },
            });

            const currentPerms: PermissionsPayload = currentAccess
                ? {
                      canAccessDashboard: !!currentAccess.canAccessDashboard,
                      canAccessReports: !!currentAccess.canAccessReports,
                      canAccessRides: !!currentAccess.canAccessRides,
                      canAccessCategories: !!currentAccess.canAccessCategories,
                      canAccessReviews: !!currentAccess.canAccessReviews,
                      canAccessFaq: !!currentAccess.canAccessFaq,
                      canAccessFaqReports: !!currentAccess.canAccessFaqReports,
                      canAccessCommunication:
                          !!currentAccess.canAccessCommunication,
                      canAccessProducts: !!currentAccess.canAccessProducts,
                      canAccessPartners: !!currentAccess.canAccessPartners,
                      canAccessMembers: !!currentAccess.canAccessMembers,
                      canAccessFinance: !!currentAccess.canAccessFinance,
                      canAccessSettings: !!currentAccess.canAccessSettings,
                  }
                : normalizePermissions(undefined);

            const nextPerms: PermissionsPayload = patchPermissions
                ? mergePermissions({
                      current: currentPerms,
                      patch: patchPermissions,
                  })
                : currentPerms;

            if (patchPermissions) {
                if (currentAccess?.id) {
                    await tx.adminAccess.update({
                        where: { id: currentAccess.id },
                        data: { ...nextPerms },
                    });
                } else {
                    await tx.adminAccess.create({
                        data: {
                            companyId: session.companyId,
                            userId: targetUserId,
                            ...nextPerms,
                        },
                    });
                }
            }

            if (patchIsActive !== undefined) {
                await tx.user.update({
                    where: { id: targetUserId },
                    data: { isActive: patchIsActive },
                });
            }

            const freshUser = await tx.user.findUnique({
                where: { id: targetUserId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    isOwner: true,
                    isActive: true,
                    createdAt: true,
                },
            });

            return {
                id: freshUser!.id,
                name: freshUser!.name ?? null,
                email: freshUser!.email,
                phone: freshUser!.phone ?? null,
                createdAt: freshUser!.createdAt.toISOString(),
                isOwner: !!freshUser!.isOwner,
                isActive: !!freshUser!.isActive,
                permissions: nextPerms,
            };
        });

        return jsonOk(updated);
    } catch {
        return jsonErr('internal_error', 500);
    }
}
