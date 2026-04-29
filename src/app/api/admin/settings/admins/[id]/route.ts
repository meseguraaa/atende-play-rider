// src/app/api/admin/settings/admins/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';

type PermissionsPayload = {
    canAccessDashboard: boolean;
    canAccessReports: boolean;
    canAccessAppointments: boolean;
    canAccessProfessionals: boolean;
    canAccessServices: boolean;
    canAccessCategories: boolean;
    canAccessReviews: boolean;
    canAccessFaq: boolean;
    canAccessCommunication: boolean;
    canAccessProducts: boolean;
    canAccessPartners: boolean;
    canAccessClients: boolean;
    canAccessClientLevels: boolean;
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
        canAccessAppointments: Boolean(partial?.canAccessAppointments ?? true),
        canAccessProfessionals: Boolean(
            partial?.canAccessProfessionals ?? false
        ),
        canAccessServices: Boolean(partial?.canAccessServices ?? false),
        canAccessCategories: Boolean(partial?.canAccessCategories ?? false),
        canAccessReviews: Boolean(partial?.canAccessReviews ?? false),
        canAccessCommunication: Boolean(
            partial?.canAccessCommunication ?? false
        ),
        canAccessFaq: Boolean(partial?.canAccessFaq ?? false),
        canAccessProducts: Boolean(partial?.canAccessProducts ?? false),
        canAccessPartners: Boolean(partial?.canAccessPartners ?? false),
        canAccessClients: Boolean(partial?.canAccessClients ?? true),
        canAccessClientLevels: Boolean(partial?.canAccessClientLevels ?? false),
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
        'canAccessAppointments',
        'canAccessProfessionals',
        'canAccessServices',
        'canAccessCategories',
        'canAccessReviews',
        'canAccessFaq',
        'canAccessCommunication',
        'canAccessProducts',
        'canAccessPartners',
        'canAccessClients',
        'canAccessClientLevels',
        'canAccessFinance',
        'canAccessSettings',
    ];

    const out: Partial<PermissionsPayload> = {};
    let hasAny = false;

    for (const k of keys) {
        if (k in patch) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const raw = (patch as any)[k];
            out[k] = Boolean(raw);
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
        canAccessAppointments:
            p.canAccessAppointments !== undefined
                ? Boolean(p.canAccessAppointments)
                : params.current.canAccessAppointments,
        canAccessProfessionals:
            p.canAccessProfessionals !== undefined
                ? Boolean(p.canAccessProfessionals)
                : params.current.canAccessProfessionals,
        canAccessServices:
            p.canAccessServices !== undefined
                ? Boolean(p.canAccessServices)
                : params.current.canAccessServices,
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

        canAccessClients:
            p.canAccessClients !== undefined
                ? Boolean(p.canAccessClients)
                : params.current.canAccessClients,
        canAccessClientLevels:
            p.canAccessClientLevels !== undefined
                ? Boolean(p.canAccessClientLevels)
                : params.current.canAccessClientLevels,
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

// ✅ Next (validator do projeto): params vem como Promise
type RouteCtx = { params: Promise<{ id: string }> };

async function getParamsId(ctx: RouteCtx): Promise<string> {
    const p = await ctx.params;
    return String(p?.id || '').trim();
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
    // ✅ API gate: precisa estar logado e ter SETTINGS
    const auth = await requireAdminForModuleApi('SETTINGS');
    if (auth instanceof NextResponse) return auth;
    const session = auth;

    // ✅ só OWNER pode alterar admins
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

    // Confere se o usuário alvo pertence à empresa e é admin/owner
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

    // Não deixa editar OWNER
    if (membership.role === 'OWNER') {
        return jsonErr('forbidden_cannot_edit_owner', 403);
    }

    // Confere user
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

    // Sanidade: precisa ser ADMIN no user
    if (targetUser.role !== 'ADMIN') {
        return jsonErr('target_not_admin', 400);
    }

    try {
        const updated = await prisma.$transaction(async (tx) => {
            // Pega permissões atuais (ou defaults do painel, se não existir)
            const currentAccess = await tx.adminAccess.findFirst({
                where: {
                    companyId: session.companyId,
                    userId: targetUserId,
                },
                select: {
                    id: true,
                    canAccessDashboard: true,
                    canAccessReports: true,
                    canAccessAppointments: true,
                    canAccessProfessionals: true,
                    canAccessServices: true,
                    canAccessCategories: true,
                    canAccessReviews: true,
                    canAccessFaq: true,
                    canAccessCommunication: true,
                    canAccessProducts: true,
                    canAccessPartners: true,
                    canAccessClients: true,
                    canAccessClientLevels: true,
                    canAccessFinance: true,
                    canAccessSettings: true,
                },
            });

            const currentPerms: PermissionsPayload = currentAccess
                ? {
                      canAccessDashboard: !!currentAccess.canAccessDashboard,
                      canAccessReports: !!currentAccess.canAccessReports,
                      canAccessAppointments:
                          !!currentAccess.canAccessAppointments,
                      canAccessProfessionals:
                          !!currentAccess.canAccessProfessionals,
                      canAccessServices: !!currentAccess.canAccessServices,
                      canAccessCategories: !!currentAccess.canAccessCategories,
                      canAccessReviews: !!currentAccess.canAccessReviews,
                      canAccessFaq: !!currentAccess.canAccessFaq,
                      canAccessCommunication:
                          !!currentAccess.canAccessCommunication,
                      canAccessProducts: !!currentAccess.canAccessProducts,

                      // ✅ NOVO
                      canAccessPartners: !!currentAccess.canAccessPartners,

                      canAccessClients: !!currentAccess.canAccessClients,
                      canAccessClientLevels:
                          !!currentAccess.canAccessClientLevels,
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

            // ✅ Persistir permissões sem depender de unique composto no schema
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
                            unitId: null,
                            ...nextPerms,
                        } as any,
                    });
                }
            }

            // Atualiza status do usuário (ativar/desativar)
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
