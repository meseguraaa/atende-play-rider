// src/app/api/plataform/companies/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requirePlatformForModuleApi } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CreateOwnerPayload = {
    email?: string;
    name?: string | null;
    phone?: string | null;

    // ✅ obrigatório no create
    password?: string;
};

type CreateCompanyPayload = {
    name?: string;
    slug?: string | null;

    // ✅ texto livre e obrigatório
    segment?: string;

    isActive?: boolean;

    // ✅ NOVO: comunicação
    whatsappCredits?: number;
    birthdayMessageEnabled?: boolean;

    // ✅ obrigatório: 1+ owners (donos)
    owners?: CreateOwnerPayload[] | null;
};

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
    const s = String(raw ?? '')
        .trim()
        .toLowerCase();
    return s;
}

function isValidEmail(email: string) {
    // simples e prático (não regex-carnaval)
    if (!email) return false;
    if (!email.includes('@')) return false;
    if (email.startsWith('@') || email.endsWith('@')) return false;
    if (email.includes(' ')) return false;
    return true;
}

// ✅ mesmo padrão do professionals
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

function normalizeOwners(raw: unknown): Array<{
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
        if (password.length < 6) continue; // ✅ padrão professionals

        out.push({ email, name, phone, password });
    }

    return out;
}

function normalizeSlug(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    // ✅ slug no padrão URL: lowercase e sem espaços
    const normalized = s
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '');

    return normalized.length ? normalized : null;
}

const ADMIN_ACCESS_ALL_TRUE = {
    canAccessDashboard: true,
    canAccessReports: true,
    canAccessRides: true,
    canAccessReviews: true,
    canAccessProducts: true,
    canAccessPartners: true,
    canAccessMembers: true,
    canAccessFinance: true,
    canAccessSettings: true,
} as const;

/**
 * GET /api/plataform/companies?q=barbearia&active=1|0
 * - q pesquisa em name e slug (case-insensitive)
 * - active=1 só ativas, active=0 só inativas, omitido = todas
 */
export async function GET(request: Request) {
    const auth = await requirePlatformForModuleApi('COMPANIES');
    if (auth instanceof NextResponse) return auth;

    try {
        const url = new URL(request.url);

        const q = String(url.searchParams.get('q') ?? '').trim();
        const activeRaw = String(url.searchParams.get('active') ?? '').trim();
        const activeFilter =
            activeRaw === '1' ? true : activeRaw === '0' ? false : null;

        const where: any = {
            ...(activeFilter === null ? {} : { isActive: activeFilter }),
            ...(q
                ? {
                      OR: [
                          {
                              name: {
                                  contains: q,
                                  mode: 'insensitive',
                              },
                          },
                          {
                              slug: {
                                  contains: q,
                                  mode: 'insensitive',
                              },
                          },
                      ],
                  }
                : {}),
        };

        const companies = await prisma.company.findMany({
            where,
            orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
            select: {
                id: true,
                name: true,
                slug: true,
                segment: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,

                // comunicação
                communicationSettings: {
                    select: {
                        whatsappCredits: true,
                        birthdayMessageEnabled: true,
                    },
                },

                _count: {
                    select: {
                        members: true,
                        units: true,
                        professionals: true,
                    },
                },
            },
        });

        return jsonOk({
            companies: companies.map((c) => ({
                id: c.id,
                name: c.name,
                slug: c.slug ?? null,
                segment: String(c.segment),
                isActive: Boolean(c.isActive),
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,

                // comunicação
                whatsappCredits: c.communicationSettings?.whatsappCredits ?? 0,
                birthdayMessageEnabled:
                    c.communicationSettings?.birthdayMessageEnabled ?? false,

                counts: {
                    members: c._count.members,
                    units: c._count.units,
                    professionals: c._count.professionals,
                },
            })),
        });
    } catch (e) {
        console.error('[platform companies GET] error:', e);
        return jsonErr('Erro ao listar empresas.', 500);
    }
}

/**
 * POST /api/plataform/companies
 * Body:
 * {
 *   name: string,
 *   slug?: string | null,
 *   segment: string, // texto livre e obrigatório
 *   isActive?: boolean,
 *   owners: [{ email, name?, phone?, password }] // obrigatório: 1+ (senha min 6)
 * }
 *
 * ✅ transação: cria Company + upsert Users + cria CompanyMember OWNER + cria AdminAccess full
 */
export async function POST(request: Request) {
    const auth = await requirePlatformForModuleApi('COMPANIES');
    if (auth instanceof NextResponse) return auth;

    try {
        const body = (await request
            .json()
            .catch(() => null)) as CreateCompanyPayload | null;
        if (!body) return jsonErr('Body inválido.');

        const name = normalizeString(body.name);
        if (!name) return jsonErr('Nome é obrigatório.');

        const slug = normalizeSlug(body.slug);

        const segment = normalizeSegment(body.segment);
        if (!segment) return jsonErr('Segmento é obrigatório.');

        const isActive =
            typeof body.isActive === 'boolean' ? body.isActive : true;

        const whatsappCredits = Math.max(
            0,
            Number(body.whatsappCredits ?? 0) || 0
        );

        const birthdayMessageEnabled =
            typeof body.birthdayMessageEnabled === 'boolean'
                ? body.birthdayMessageEnabled
                : false;

        const owners = normalizeOwners(body.owners);
        if (owners.length === 0) {
            return jsonErr(
                'Informe pelo menos 1 admin dono em owners (email + password obrigatório; senha min 6).',
                400
            );
        }

        // ✅ checagem manual de slug duplicado (schema não tem unique)
        // não muda seu fluxo; só impede ambiguidade na resolução slug -> companyId
        if (slug) {
            const exists = await prisma.company.findFirst({
                where: { slug: { equals: slug, mode: 'insensitive' } },
                select: { id: true },
            });
            if (exists?.id) {
                return jsonErr('slug já está em uso por outra empresa.', 400);
            }
        }

        const result = await prisma.$transaction(async (tx) => {
            const company = await tx.company.create({
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
                    isActive: true,
                    segment: true,
                },
            });

            const createdOwners: Array<{
                userId: string;
                email: string;
                name: string | null;
            }> = [];

            for (const owner of owners) {
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
                        // ✅ garante que esse usuário consegue acessar /admin
                        role: 'ADMIN' as any,
                        isOwner: true,
                        ...(owner.name ? { name: owner.name } : {}),
                        ...(owner.phone ? { phone: owner.phone } : {}),
                        isActive: true,
                        passwordHash, // ✅ garante login imediato
                    },
                    select: { id: true, email: true, name: true },
                });

                // ✅ vínculo na empresa como OWNER
                await tx.companyMember.upsert({
                    where: {
                        companyId_userId: {
                            companyId: company.id,
                            userId: user.id,
                        },
                    },
                    create: {
                        companyId: company.id,
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

                // ✅ acesso total explícito no Admin (mesmo OWNER já tendo bypass)
                await tx.adminAccess.upsert({
                    where: {
                        companyId_userId: {
                            companyId: company.id,
                            userId: user.id,
                        },
                    },
                    create: {
                        companyId: company.id,
                        userId: user.id,
                        ...ADMIN_ACCESS_ALL_TRUE,
                    },
                    update: {
                        ...ADMIN_ACCESS_ALL_TRUE,
                    },
                    select: { id: true },
                });

                createdOwners.push({
                    userId: user.id,
                    email: user.email,
                    name: user.name ?? null,
                });
            }

            await tx.companyCommunicationSettings.create({
                data: {
                    companyId: company.id,
                    whatsappCredits,
                    birthdayMessageEnabled,
                },
                select: { id: true },
            });

            return {
                companyId: company.id,
                owners: createdOwners,
            };
        });

        return jsonOk(result, { status: 201 });
    } catch (e: any) {
        const msg = typeof e?.message === 'string' ? e.message : '';

        if (msg.includes('bcryptjs')) return jsonErr(msg, 500);

        if (String(e?.code) === 'P2002') {
            return jsonErr('Já existe um registro com estes dados.', 409);
        }

        console.error('[platform companies POST] error:', e);
        return jsonErr('Erro ao criar empresa.', 500);
    }
}
