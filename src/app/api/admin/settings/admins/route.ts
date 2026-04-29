// src/app/api/admin/settings/admins/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';
import crypto from 'crypto';

type PermissionsPayload = {
    canAccessDashboard: boolean;
    canAccessReports: boolean;
    canAccessAppointments: boolean;
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
    // simples e eficiente pro painel
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPasswordScrypt(password: string) {
    // Formato: scrypt:<saltB64>:<hashB64>
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
        canAccessAppointments: Boolean(partial?.canAccessAppointments ?? true),
        canAccessCategories: Boolean(partial?.canAccessCategories ?? false),
        canAccessReviews: Boolean(partial?.canAccessReviews ?? false),
        canAccessFaq: Boolean(partial?.canAccessFaq ?? false),
        canAccessCommunication: Boolean(
            partial?.canAccessCommunication ?? false
        ),
        canAccessProducts: Boolean(partial?.canAccessProducts ?? false),

        // ✅ NOVO: Parceiros
        canAccessPartners: Boolean(partial?.canAccessPartners ?? false),

        canAccessClients: Boolean(partial?.canAccessClients ?? true),
        canAccessClientLevels: Boolean(partial?.canAccessClientLevels ?? false),
        canAccessFinance: Boolean(partial?.canAccessFinance ?? false),
        canAccessSettings: Boolean(partial?.canAccessSettings ?? false),
    };
}

export async function GET() {
    // ✅ API gate: precisa estar logado e ter SETTINGS (mesmo gate do POST)
    const auth = await requireAdminForModuleApi('SETTINGS');
    if (auth instanceof NextResponse) return auth;
    const session = auth;

    try {
        // Lista admins da empresa:
        // - membership garante vínculo com company
        // - user traz dados básicos e flags (isOwner, isActive)
        // - adminAccess traz permissões (por companyId + userId)
        const rows = await prisma.companyMember.findMany({
            where: {
                companyId: session.companyId,
                isActive: true,
                role: { in: ['ADMIN', 'OWNER'] }, // ✅ inclui owner também
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
                      canAccessAppointments: true,
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
              })
            : [];

        const accessByUserId = accessRows.reduce<
            Record<string, PermissionsPayload>
        >((acc, a) => {
            acc[a.userId] = {
                canAccessDashboard: !!a.canAccessDashboard,
                canAccessReports: !!a.canAccessReports,
                canAccessAppointments: !!a.canAccessAppointments,
                canAccessCategories: !!a.canAccessCategories,
                canAccessCommunication: !!a.canAccessCommunication,
                canAccessReviews: !!a.canAccessReviews,
                canAccessFaq: !!a.canAccessFaq,
                canAccessProducts: !!a.canAccessProducts,
                canAccessPartners: !!a.canAccessPartners,
                canAccessClients: !!a.canAccessClients,
                canAccessClientLevels: !!a.canAccessClientLevels,
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
                                  canAccessAppointments: true,
                                  canAccessReviews: true,
                                  canAccessProducts: true,
                                  canAccessFaq: true,
                                  canAccessCommunication: true,

                                  // ✅ OWNER vê parceiros também
                                  canAccessPartners: true,

                                  canAccessClients: true,
                                  canAccessClientLevels: true,
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
            // owner primeiro, depois mais recente
            .sort((a, b) => {
                if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
                return (
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                );
            });

        return jsonOk(data);
    } catch (e: any) {
        return jsonErr('internal_error', 500);
    }
}

export async function POST(req: Request) {
    // ✅ API gate: precisa estar logado e ter SETTINGS
    const auth = await requireAdminForModuleApi('SETTINGS');
    if (auth instanceof NextResponse) return auth;
    const session = auth;

    // regra: só OWNER cria admins
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

    // unidades: como ainda não tem seletor na UI, vincula a TODAS unidades ativas da empresa
    const unitIds = await prisma.unit.findMany({
        where: { companyId: session.companyId, isActive: true },
        select: { id: true },
    });

    if (!unitIds.length) {
        return jsonErr('missing_unit', 400);
    }

    // garante email único
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

            // vínculo com a empresa como ADMIN
            await tx.companyMember.create({
                data: {
                    companyId: session.companyId,
                    userId: user.id,
                    role: 'ADMIN',
                    isActive: true,
                    lastUnitId: null,
                },
                select: { id: true },
            });

            // permissões do painel
            await tx.adminAccess.create({
                data: {
                    companyId: session.companyId,
                    userId: user.id,
                    unitId: null, // legado/compat
                    ...permissions,
                },
                select: { id: true },
            });

            // vincula o admin nas unidades (Opção B)
            await tx.adminUnitAccess.createMany({
                data: unitIds.map((u) => ({
                    companyId: session.companyId,
                    userId: user.id,
                    unitId: u.id,
                })),
                skipDuplicates: true,
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
    } catch (e: any) {
        return jsonErr('internal_error', 500);
    }
}
