// src/app/api/admin/settings/admins/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';
import crypto from 'crypto';

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

type CreateAdminPayload = {
    name: string;
    email: string;
    phone?: string | null;
    password: string;
    permissions?: Partial<PermissionsPayload>;
};

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function onlyDigits(v: string) {
    return (v || '').replace(/\D/g, '');
}

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPasswordScrypt(password: string) {
    const salt = crypto.randomBytes(16);
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `scrypt:${salt.toString('base64')}:${derivedKey.toString('base64')}`;
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

export async function GET() {
    const auth = await requireAdminForModuleApi('SETTINGS');
    if (auth instanceof NextResponse) return auth;
    const session = auth;

    try {
        const rows = await prisma.companyMember.findMany({
            where: {
                companyId: session.companyId,
                isActive: true,
                role: { in: ['ADMIN', 'OWNER'] },
            },
            select: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        isOwner: true,
                        isActive: true,
                        createdAt: true,
                    },
                },
                userId: true,
            },
            orderBy: [{ createdAt: 'asc' }],
        });

        const userIds = rows.map((r) => r.userId).filter(Boolean);

        const accessRows = userIds.length
            ? await prisma.adminAccess.findMany({
                  where: {
                      companyId: session.companyId,
                      userId: { in: userIds },
                  },
                  select: {
                      userId: true,
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
              })
            : [];

        const accessByUserId = accessRows.reduce<
            Record<string, PermissionsPayload>
        >((acc, a) => {
            acc[a.userId] = {
                canAccessDashboard: !!a.canAccessDashboard,
                canAccessReports: !!a.canAccessReports,
                canAccessRides: !!a.canAccessRides,
                canAccessCategories: !!a.canAccessCategories,
                canAccessReviews: !!a.canAccessReviews,
                canAccessFaq: !!a.canAccessFaq,
                canAccessFaqReports: !!a.canAccessFaqReports,
                canAccessCommunication: !!a.canAccessCommunication,
                canAccessProducts: !!a.canAccessProducts,
                canAccessPartners: !!a.canAccessPartners,
                canAccessMembers: !!a.canAccessMembers,
                canAccessFinance: !!a.canAccessFinance,
                canAccessSettings: !!a.canAccessSettings,
            };
            return acc;
        }, {});

        const data = rows
            .map((r) => {
                const u = r.user;
                const perms =
                    accessByUserId[u.id] ??
                    normalizePermissions(
                        u.isOwner
                            ? {
                                  canAccessDashboard: true,
                                  canAccessReports: true,
                                  canAccessRides: true,
                                  canAccessReviews: true,
                                  canAccessProducts: true,
                                  canAccessFaq: true,
                                  canAccessFaqReports: true,
                                  canAccessCommunication: true,
                                  canAccessPartners: false,
                                  canAccessMembers: true,
                                  canAccessFinance: true,
                                  canAccessSettings: true,
                              }
                            : undefined
                    );

                return {
                    id: u.id,
                    name: u.name ?? null,
                    email: u.email,
                    phone: u.phone ?? null,
                    createdAt: u.createdAt.toISOString(),
                    isOwner: !!u.isOwner,
                    isActive: !!u.isActive,
                    permissions: perms,
                };
            })
            .sort((a, b) => {
                if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
                return (
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                );
            });

        return jsonOk(data);
    } catch {
        return jsonErr('internal_error', 500);
    }
}

export async function POST(req: Request) {
    const auth = await requireAdminForModuleApi('SETTINGS');
    if (auth instanceof NextResponse) return auth;
    const session = auth;

    if (!session.isOwner) {
        return jsonErr('forbidden_owner_only', 403);
    }

    let body: CreateAdminPayload | null = null;

    try {
        body = (await req.json()) as CreateAdminPayload;
    } catch {
        return jsonErr('invalid_json', 400);
    }

    const name = String(body?.name || '').trim();
    const email = String(body?.email || '')
        .trim()
        .toLowerCase();
    const phoneRaw = String(body?.phone ?? '').trim();
    const password = String(body?.password || '');

    if (!name) return jsonErr('admin_name_required', 400);
    if (!email) return jsonErr('admin_email_required', 400);
    if (!isValidEmail(email)) return jsonErr('admin_email_invalid', 400);

    const phoneDigits = onlyDigits(phoneRaw);
    const phone = phoneRaw ? phoneRaw : null;

    if (phone && phoneDigits.length > 0 && phoneDigits.length < 10) {
        return jsonErr('admin_phone_invalid', 400);
    }

    if (!password || password.length < 6) {
        return jsonErr('admin_password_invalid', 400);
    }

    const permissions = normalizePermissions(body?.permissions);

    const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });

    if (existing?.id) {
        return jsonErr('email_in_use', 409);
    }

    try {
        const created = await prisma.$transaction(async (tx) => {
            const passwordHash = hashPasswordScrypt(password);

            const user = await tx.user.create({
                data: {
                    name,
                    email,
                    phone: phoneDigits ? phone : null,
                    passwordHash,
                    role: 'ADMIN',
                    isOwner: false,
                    isActive: true,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    createdAt: true,
                },
            });

            await tx.companyMember.create({
                data: {
                    companyId: session.companyId,
                    userId: user.id,
                    role: 'ADMIN',
                    isActive: true,
                },
                select: { id: true },
            });

            await tx.adminAccess.create({
                data: {
                    companyId: session.companyId,
                    userId: user.id,
                    ...permissions,
                },
                select: { id: true },
            });

            return {
                id: user.id,
                name: user.name ?? null,
                email: user.email,
                phone: user.phone ?? null,
                createdAt: user.createdAt.toISOString(),
                isOwner: false,
                isActive: true,
                permissions,
            };
        });

        return jsonOk(created, { status: 201 });
    } catch {
        return jsonErr('internal_error', 500);
    }
}
