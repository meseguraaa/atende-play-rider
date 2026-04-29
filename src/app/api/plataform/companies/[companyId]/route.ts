// src/app/api/plataform/companies/[companyId]/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requirePlatformForModuleApi } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type OwnerDraft = {
    email?: string;
    name?: string | null;
    phone?: string | null;
    password?: string; // obrigatório ao adicionar; opcional no reset (mas se vier, min 6)
};

type PromotableMember = {
    userId: string;
    name: string | null;
    email: string;
    phone: string | null;
    isActive: boolean;
    role: string;
    isOwner: boolean;
};

type UpdateCompanyPayload = {
    name?: string;
    slug?: string | null;

    // texto livre e obrigatório quando enviado
    segment?: string;

    isActive?: boolean;

    // comunicação com clientes
    whatsappCredits?: number;
    birthdayMessageEnabled?: boolean;

    // adiciona novos owners (email + password obrigatórios)
    addOwners?: OwnerDraft[] | null;

    // promove membros já existentes da empresa para OWNER
    promoteMemberUserIds?: string[] | null;

    // reseta senha de owners existentes por email (password obrigatório)
    resetOwnerPasswords?: Array<{ email?: string; password?: string }> | null;
};

type PatchPayload = { toggleActive: true } | { update: UpdateCompanyPayload };

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function normalizeString(raw: unknown) {
    const s = String(raw ?? '').trim();
    return s.length ? s : '';
}

function normalizeNullableString(raw: unknown) {
    const s = String(raw ?? '').trim();
    return s.length ? s : null;
}

function normalizeEmail(raw: unknown) {
    return String(raw ?? '')
        .trim()
        .toLowerCase();
}

function isValidEmail(email: string) {
    if (!email) return false;
    if (!email.includes('@')) return false;
    if (email.startsWith('@') || email.endsWith('@')) return false;
    if (email.includes(' ')) return false;
    return true;
}

function isValidPassword(raw: unknown) {
    return String(raw ?? '').trim().length >= 6;
}

async function hashPasswordIfPossible(password: string): Promise<string> {
    try {
        const bcrypt = await import('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(password, salt);
    } catch {
        throw new Error(
            'Dependência de hash não encontrada (bcryptjs). Instale bcryptjs para usar senha.'
        );
    }
}

function normalizeSegment(raw: unknown): string {
    return String(raw ?? '').trim();
}

function normalizeSlug(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const normalized = s
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '');

    return normalized.length ? normalized : null;
}

const ADMIN_ACCESS_ALL_TRUE = {
    canAccessDashboard: true,
    canAccessReports: true,
    canAccessCheckout: true,
    canAccessAppointments: true,
    canAccessProfessionals: true,
    canAccessServices: true,
    canAccessReviews: true,
    canAccessProducts: true,
    canAccessPartners: true,
    canAccessClients: true,
    canAccessClientLevels: true,
    canAccessFinance: true,
    canAccessSettings: true,
} as const;

function normalizeOwnerDrafts(raw: unknown): Array<{
    email: string;
    name: string | null;
    phone: string | null;
    password: string;
}> {
    if (!Array.isArray(raw)) return [];

    const out: Array<{
        email: string;
        name: string | null;
        phone: string | null;
        password: string;
    }> = [];

    const seen = new Set<string>();

    for (const it of raw) {
        const email = normalizeEmail((it as any)?.email);
        if (!isValidEmail(email)) continue;
        if (seen.has(email)) continue;
        seen.add(email);

        const name = normalizeNullableString((it as any)?.name);
        const phone = normalizeNullableString((it as any)?.phone);

        const password = String((it as any)?.password ?? '').trim();
        if (!isValidPassword(password)) continue;

        out.push({ email, name, phone, password });
    }

    return out;
}

function normalizeResets(
    raw: unknown
): Array<{ email: string; password: string }> {
    if (!Array.isArray(raw)) return [];

    const out: Array<{ email: string; password: string }> = [];
    const seen = new Set<string>();

    for (const it of raw) {
        const email = normalizeEmail((it as any)?.email);
        const password = String((it as any)?.password ?? '').trim();

        if (!isValidEmail(email)) continue;
        if (!isValidPassword(password)) continue;
        if (seen.has(email)) continue;

        seen.add(email);
        out.push({ email, password });
    }

    return out;
}

function normalizePromoteMemberUserIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];

    const seen = new Set<string>();
    const out: string[] = [];

    for (const it of raw) {
        const userId = normalizeString(it);
        if (!userId) continue;
        if (seen.has(userId)) continue;
        seen.add(userId);
        out.push(userId);
    }

    return out;
}

async function listOwners(companyId: string) {
    const members = await prisma.companyMember.findMany({
        where: {
            companyId,
            role: 'OWNER' as any,
            isActive: true,
        },
        select: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    isActive: true,
                    role: true,
                    isOwner: true,
                },
            },
            createdAt: true,
        },
        orderBy: [{ createdAt: 'asc' }],
    });

    return members
        .map((m) => m.user)
        .filter((u) => u && u.id && u.email)
        .map((u) => ({
            userId: u.id,
            name: u.name ?? null,
            email: u.email,
            phone: u.phone ?? null,
            isActive: Boolean(u.isActive),
            role: String(u.role),
            isOwner: Boolean((u as any).isOwner),
        }));
}

async function listPromotableMembers(
    companyId: string
): Promise<PromotableMember[]> {
    const members = await prisma.companyMember.findMany({
        where: {
            companyId,
            isActive: true,
            NOT: {
                role: 'OWNER' as any,
            },
            user: {
                role: 'ADMIN' as any,
                isActive: true,
            },
        },
        select: {
            role: true,
            createdAt: true,
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    isActive: true,
                    role: true,
                    isOwner: true,
                },
            },
        },
        orderBy: [{ createdAt: 'asc' }],
    });

    return members
        .map((m) => ({
            userId: m.user?.id ?? '',
            name: m.user?.name ?? null,
            email: m.user?.email ?? '',
            phone: m.user?.phone ?? null,
            isActive: Boolean(m.user?.isActive),
            role: String(m.role ?? m.user?.role ?? ''),
            isOwner: Boolean(m.user?.isOwner),
        }))
        .filter((u) => u.userId && u.email);
}

/**
 * GET /api/plataform/companies/:companyId
 */
export async function GET(
    _request: Request,
    ctx: { params: Promise<{ companyId: string }> }
) {
    const auth = await requirePlatformForModuleApi('COMPANIES');
    if (auth instanceof NextResponse) return auth;

    try {
        const { companyId } = await ctx.params;
        const id = normalizeString(companyId);
        if (!id) return jsonErr('companyId é obrigatório.', 400);

        const company = await prisma.company.findFirst({
            where: { id },
            select: {
                id: true,
                name: true,
                slug: true,
                segment: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,

                communicationSettings: {
                    select: {
                        whatsappCredits: true,
                        birthdayMessageEnabled: true,
                    },
                },
            },
        });

        if (!company) return jsonErr('Empresa não encontrada.', 404);

        const owners = await listOwners(company.id);
        const promotableMembers = await listPromotableMembers(company.id);

        return jsonOk({
            company: {
                id: company.id,
                name: company.name,
                slug: company.slug ?? null,
                segment: String(company.segment),
                isActive: Boolean(company.isActive),
                createdAt: company.createdAt,
                updatedAt: company.updatedAt,

                whatsappCredits:
                    company.communicationSettings?.whatsappCredits ?? 0,
                birthdayMessageEnabled:
                    company.communicationSettings?.birthdayMessageEnabled ??
                    false,
            },
            owners,
            promotableMembers,
        });
    } catch (e) {
        console.error('[platform company GET] error:', e);
        return jsonErr('Erro ao acessar empresa.', 500);
    }
}

/**
 * PATCH /api/plataform/companies/:companyId
 * Body:
 * - { toggleActive: true }
 * - { update: { name?, slug?, segment?, isActive?, addOwners?, promoteMemberUserIds?, resetOwnerPasswords? } }
 */
export async function PATCH(
    request: Request,
    ctx: { params: Promise<{ companyId: string }> }
) {
    const auth = await requirePlatformForModuleApi('COMPANIES');
    if (auth instanceof NextResponse) return auth;

    try {
        const { companyId } = await ctx.params;
        const id = normalizeString(companyId);
        if (!id) return jsonErr('companyId é obrigatório.', 400);

        const body = (await request
            .json()
            .catch(() => null)) as PatchPayload | null;
        if (!body) return jsonErr('Body inválido.', 400);

        const current = await prisma.company.findFirst({
            where: { id },
            select: {
                id: true,
                name: true,
                slug: true,
                segment: true,
                isActive: true,
            },
        });

        if (!current) return jsonErr('Empresa não encontrada.', 404);

        if ('toggleActive' in body && body.toggleActive === true) {
            const updated = await prisma.company.update({
                where: { id: current.id },
                data: { isActive: !current.isActive },
                select: { id: true, isActive: true },
            });

            return jsonOk({ id: updated.id, isActive: updated.isActive });
        }

        if (
            !('update' in body) ||
            !body.update ||
            typeof body.update !== 'object'
        ) {
            return jsonErr('Patch inválido.', 400);
        }

        const u = body.update;

        const name =
            u.name !== undefined ? normalizeString(u.name) : current.name;
        if (!name) return jsonErr('Nome é obrigatório.', 400);

        const slug =
            u.slug !== undefined
                ? normalizeSlug(u.slug)
                : (current.slug ?? null);

        const segment =
            u.segment !== undefined
                ? normalizeSegment(u.segment)
                : String(current.segment);

        if (!segment) {
            return jsonErr('Segmento é obrigatório.', 400);
        }

        const isActive =
            u.isActive !== undefined
                ? Boolean(u.isActive)
                : Boolean(current.isActive);

        const birthdayMessageEnabled =
            u.birthdayMessageEnabled !== undefined
                ? Boolean(u.birthdayMessageEnabled)
                : undefined;

        const whatsappCredits =
            u.whatsappCredits !== undefined
                ? Math.max(0, Number(u.whatsappCredits) || 0)
                : undefined;

        if (slug) {
            const exists = await prisma.company.findFirst({
                where: {
                    id: { not: current.id },
                    slug: { equals: slug, mode: 'insensitive' },
                },
                select: { id: true },
            });
            if (exists?.id) {
                return jsonErr('slug já está em uso por outra empresa.', 400);
            }
        }

        const addOwners = normalizeOwnerDrafts(u.addOwners);
        const promoteMemberUserIds = normalizePromoteMemberUserIds(
            u.promoteMemberUserIds
        );
        const resets = normalizeResets(u.resetOwnerPasswords);

        if (
            u.addOwners !== undefined &&
            Array.isArray(u.addOwners) &&
            u.addOwners.length > 0 &&
            addOwners.length === 0
        ) {
            return jsonErr(
                'addOwners inválido. Envie owners com email válido e password min 6.',
                400
            );
        }

        if (
            u.promoteMemberUserIds !== undefined &&
            Array.isArray(u.promoteMemberUserIds) &&
            u.promoteMemberUserIds.length > 0 &&
            promoteMemberUserIds.length === 0
        ) {
            return jsonErr(
                'promoteMemberUserIds inválido. Envie 1+ userIds válidos.',
                400
            );
        }

        if (
            u.resetOwnerPasswords !== undefined &&
            Array.isArray(u.resetOwnerPasswords) &&
            u.resetOwnerPasswords.length > 0 &&
            resets.length === 0
        ) {
            return jsonErr(
                'resetOwnerPasswords inválido. Envie {email, password} com senha min 6.',
                400
            );
        }

        const result = await prisma.$transaction(async (tx) => {
            const updatedCompany = await tx.company.update({
                where: { id: current.id },
                data: {
                    name,
                    slug,
                    segment,
                    isActive,
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    segment: true,
                    isActive: true,
                    updatedAt: true,
                },
            });

            if (
                whatsappCredits !== undefined ||
                birthdayMessageEnabled !== undefined
            ) {
                await tx.companyCommunicationSettings.upsert({
                    where: {
                        companyId: updatedCompany.id,
                    },
                    create: {
                        companyId: updatedCompany.id,
                        whatsappCredits: whatsappCredits ?? 0,
                        birthdayMessageEnabled: birthdayMessageEnabled ?? false,
                    },
                    update: {
                        ...(whatsappCredits !== undefined
                            ? { whatsappCredits }
                            : {}),
                        ...(birthdayMessageEnabled !== undefined
                            ? { birthdayMessageEnabled }
                            : {}),
                    },
                });
            }

            for (const owner of addOwners) {
                const passwordHash = await hashPasswordIfPossible(
                    owner.password
                );

                const user = await tx.user.upsert({
                    where: { email: owner.email },
                    create: {
                        email: owner.email,
                        name: owner.name ?? null,
                        phone: owner.phone ?? null,
                        role: 'ADMIN' as any,
                        isOwner: true,
                        isActive: true,
                        passwordHash,
                    },
                    update: {
                        role: 'ADMIN' as any,
                        isOwner: true,
                        ...(owner.name ? { name: owner.name } : {}),
                        ...(owner.phone ? { phone: owner.phone } : {}),
                        isActive: true,
                        passwordHash,
                    },
                    select: { id: true, email: true, name: true },
                });

                await tx.companyMember.upsert({
                    where: {
                        companyId_userId: {
                            companyId: updatedCompany.id,
                            userId: user.id,
                        },
                    },
                    create: {
                        companyId: updatedCompany.id,
                        userId: user.id,
                        role: 'OWNER' as any,
                        isActive: true,
                    },
                    update: {
                        role: 'OWNER' as any,
                        isActive: true,
                    },
                    select: { id: true },
                });

                await tx.adminAccess.upsert({
                    where: {
                        companyId_userId: {
                            companyId: updatedCompany.id,
                            userId: user.id,
                        },
                    },
                    create: {
                        companyId: updatedCompany.id,
                        userId: user.id,
                        ...ADMIN_ACCESS_ALL_TRUE,
                    },
                    update: { ...ADMIN_ACCESS_ALL_TRUE },
                    select: { id: true },
                });
            }

            for (const userId of promoteMemberUserIds) {
                const member = await tx.companyMember.findFirst({
                    where: {
                        companyId: updatedCompany.id,
                        userId,
                        isActive: true,
                    },
                    select: {
                        userId: true,
                        role: true,
                        user: {
                            select: {
                                id: true,
                                email: true,
                            },
                        },
                    },
                });

                if (
                    !member?.userId ||
                    !member.user?.id ||
                    !member.user?.email
                ) {
                    continue;
                }

                await tx.user.update({
                    where: { id: member.user.id },
                    data: {
                        role: 'ADMIN' as any,
                        isOwner: true,
                        isActive: true,
                    },
                    select: { id: true },
                });

                await tx.companyMember.upsert({
                    where: {
                        companyId_userId: {
                            companyId: updatedCompany.id,
                            userId: member.user.id,
                        },
                    },
                    create: {
                        companyId: updatedCompany.id,
                        userId: member.user.id,
                        role: 'OWNER' as any,
                        isActive: true,
                    },
                    update: {
                        role: 'OWNER' as any,
                        isActive: true,
                    },
                    select: { id: true },
                });

                await tx.adminAccess.upsert({
                    where: {
                        companyId_userId: {
                            companyId: updatedCompany.id,
                            userId: member.user.id,
                        },
                    },
                    create: {
                        companyId: updatedCompany.id,
                        userId: member.user.id,
                        ...ADMIN_ACCESS_ALL_TRUE,
                    },
                    update: {
                        ...ADMIN_ACCESS_ALL_TRUE,
                    },
                    select: { id: true },
                });
            }

            for (const r of resets) {
                const email = normalizeEmail(r.email);
                const password = String(r.password ?? '').trim();

                if (!isValidEmail(email) || !isValidPassword(password)) {
                    continue;
                }

                const member = await tx.companyMember.findFirst({
                    where: {
                        companyId: updatedCompany.id,
                        role: 'OWNER' as any,
                        isActive: true,
                        user: { email },
                    },
                    select: { userId: true },
                });

                if (!member?.userId) continue;

                const passwordHash = await hashPasswordIfPossible(password);

                await tx.user.update({
                    where: { id: member.userId },
                    data: { passwordHash, isActive: true },
                    select: { id: true },
                });
            }

            return updatedCompany;
        });

        const owners = await listOwners(result.id);
        const promotableMembers = await listPromotableMembers(result.id);

        const communicationSettings =
            await prisma.companyCommunicationSettings.findUnique({
                where: { companyId: result.id },
                select: {
                    whatsappCredits: true,
                    birthdayMessageEnabled: true,
                },
            });

        return jsonOk({
            company: {
                id: result.id,
                name: result.name,
                slug: result.slug ?? null,
                segment: String(result.segment),
                isActive: Boolean(result.isActive),
                updatedAt: result.updatedAt,

                whatsappCredits: communicationSettings?.whatsappCredits ?? 0,
                birthdayMessageEnabled:
                    communicationSettings?.birthdayMessageEnabled ?? false,
            },
            owners,
            promotableMembers,
        });
    } catch (e: any) {
        const msg = typeof e?.message === 'string' ? e.message : '';

        if (msg.includes('bcryptjs')) return jsonErr(msg, 500);

        if (String(e?.code) === 'P2002') {
            return jsonErr('Já existe um registro com estes dados.', 409);
        }

        console.error('[platform company PATCH] error:', e);
        return jsonErr('Erro ao editar empresa.', 500);
    }
}
