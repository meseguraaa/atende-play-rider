// src/app/api/admin/settings/admins/route.ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';

import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';

type PermissionsPayload = {
    canAccessDashboard: boolean;
    canAccessRides: boolean;
    canAccessCategories: boolean;
    canAccessProducts: boolean;
    canAccessMembers: boolean;
    canAccessCommunication: boolean;
    canAccessReviews: boolean;
    canAccessFaq: boolean;
    canAccessReports: boolean;
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
        canAccessRides: Boolean(partial?.canAccessRides ?? true),
        canAccessCategories: Boolean(partial?.canAccessCategories ?? false),
        canAccessProducts: Boolean(partial?.canAccessProducts ?? false),
        canAccessMembers: Boolean(partial?.canAccessMembers ?? true),
        canAccessCommunication: Boolean(
            partial?.canAccessCommunication ?? false
        ),
        canAccessReviews: Boolean(partial?.canAccessReviews ?? false),
        canAccessFaq: Boolean(partial?.canAccessFaq ?? false),
        canAccessReports: Boolean(partial?.canAccessReports ?? false),
        canAccessFinance: Boolean(partial?.canAccessFinance ?? false),
        canAccessSettings: Boolean(partial?.canAccessSettings ?? false),
    };
}

function ownerPermissions(): PermissionsPayload {
    return {
        canAccessDashboard: true,
        canAccessRides: true,
        canAccessCategories: true,
        canAccessProducts: true,
        canAccessMembers: true,
        canAccessCommunication: true,
        canAccessReviews: true,
        canAccessFaq: true,
        canAccessReports: true,
        canAccessFinance: true,
        canAccessSettings: true,
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
                userId: true,
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
                      canAccessRides: true,
                      canAccessCategories: true,
                      canAccessProducts: true,
                      canAccessMembers: true,
                      canAccessCommunication: true,
                      canAccessReviews: true,
                      canAccessFaq: true,
                      canAccessReports: true,
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
                canAccessRides: !!a.canAccessRides,
                canAccessCategories: !!a.canAccessCategories,
                canAccessProducts: !!a.canAccessProducts,
                canAccessMembers: !!a.canAccessMembers,
                canAccessCommunication: !!a.canAccessCommunication,
                canAccessReviews: !!a.canAccessReviews,
                canAccessFaq: !!a.canAccessFaq,
                canAccessReports: !!a.canAccessReports,
                canAccessFinance: !!a.canAccessFinance,
                canAccessSettings: !!a.canAccessSettings,
            };

            return acc;
        }, {});

        const data = rows
            .map((r) => {
                const u = r.user;

                const permissions =
                    accessByUserId[u.id] ??
                    (u.isOwner ? ownerPermissions() : normalizePermissions());

                return {
                    id: u.id,
                    name: u.name ?? null,
                    email: u.email,
                    phone: u.phone ?? null,
                    createdAt: u.createdAt.toISOString(),
                    isOwner: !!u.isOwner,
                    isActive: !!u.isActive,
                    permissions,
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
    } catch (err) {
        console.error('[GET /api/admin/settings/admins]', err);
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
    } catch (err) {
        console.error('[POST /api/admin/settings/admins]', err);
        return jsonErr('internal_error', 500);
    }
}
