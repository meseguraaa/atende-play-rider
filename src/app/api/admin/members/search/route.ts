// src/app/api/admin/members/search/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

function jsonOk<T extends Record<string, unknown>>(
    data: T,
    init?: ResponseInit
) {
    return NextResponse.json({ ok: true, ...data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function normalizeString(v: unknown) {
    return String(v ?? '').trim();
}

type ClientStatusFilter = 'active' | 'inactive' | 'all';
function normalizeStatus(v: string | null): ClientStatusFilter {
    const s = normalizeString(v).toLowerCase();
    if (s === 'inactive') return 'inactive';
    if (s === 'all') return 'all';
    return 'active';
}

async function requireCompanyIdFromContext(session: any): Promise<string> {
    const companyId = String(session?.companyId ?? '').trim();

    if (!companyId) {
        throw new Error('companyId ausente na sessão.');
    }

    return companyId;
}

/**
 * GET /api/admin/members/search
 * Query:
 * - q: string
 * - take: number (default 20, max 50)
 * - status: active | inactive | all (default active)
 */
export async function GET(req: Request) {
    try {
        const auth = await requireAdminForModuleApi('MEMBERS');
        if (auth instanceof NextResponse) return auth;

        const companyId = await requireCompanyIdFromContext(auth);

        const url = new URL(req.url);
        const q = normalizeString(url.searchParams.get('q'));
        const status = normalizeStatus(url.searchParams.get('status'));

        const takeRaw = Number(url.searchParams.get('take') ?? '20');
        const take = Number.isFinite(takeRaw)
            ? Math.max(1, Math.min(50, Math.floor(takeRaw)))
            : 20;

        if (q.length < 2) {
            return jsonOk({ members: [], status });
        }

        const digits = q.replace(/\D/g, '');
        const nameTokens = q.split(/\s+/).filter(Boolean);

        const membershipSomeWhere: any = {
            companyId,
            role: 'CLIENT',
            ...(status === 'active'
                ? { isActive: true }
                : status === 'inactive'
                  ? { isActive: false }
                  : {}),
        };

        const members = await prisma.user.findMany({
            where: {
                companyMemberships: {
                    some: membershipSomeWhere,
                },
                OR: [
                    {
                        name: {
                            contains: q,
                            mode: 'insensitive',
                        },
                    },
                    ...nameTokens.map((token) => ({
                        name: {
                            contains: token,
                            mode: 'insensitive' as const,
                        },
                    })),
                    {
                        email: {
                            contains: q,
                            mode: 'insensitive',
                        },
                    },
                    ...(digits
                        ? [
                              {
                                  phone: {
                                      contains: digits,
                                  },
                              },
                              {
                                  phone: {
                                      contains: q,
                                  },
                              },
                          ]
                        : [
                              {
                                  phone: {
                                      contains: q,
                                  },
                              },
                          ]),
                ],
            },
            orderBy: [{ name: 'asc' }],
            take,
            select: {
                id: true,
                name: true,
                phone: true,
                companyMemberships: {
                    where: {
                        companyId,
                        role: 'CLIENT',
                    },
                    select: {
                        isActive: true,
                    },
                    take: 1,
                },
            },
        });

        return jsonOk({
            status,
            members: members
                .map((member) => ({
                    id: member.id,
                    name: String(member.name ?? '').trim(),
                    phone: String(member.phone ?? '').trim() || null,
                    isActive: member.companyMemberships[0]?.isActive ?? true,
                }))
                .filter((member) => member.name.length > 0),
        });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro ao buscar membros.', 500);
    }
}
