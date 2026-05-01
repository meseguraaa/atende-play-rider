// src/app/api/admin/members/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

const COMPANY_COOKIE_NAME = 'admin_company_context';

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function onlyDigits(v: string) {
    return String(v ?? '').replace(/\D/g, '');
}

function normalizeString(v: unknown) {
    return String(v ?? '').trim();
}

function normalizePlate(v: unknown) {
    return normalizeString(v)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

function parseCylinderCc(v: unknown): number | null {
    const digits = onlyDigits(normalizeString(v));
    if (!digits) return null;

    const n = Number(digits);
    if (!Number.isFinite(n) || n <= 0) return null;

    return n;
}

type SortKey = 'name_asc' | 'name_desc' | 'createdAt_desc' | 'createdAt_asc';

function normalizeSort(v: string | null): SortKey {
    const s = normalizeString(v);
    if (s === 'name_desc') return 'name_desc';
    if (s === 'createdAt_desc') return 'createdAt_desc';
    if (s === 'createdAt_asc') return 'createdAt_asc';
    return 'name_asc';
}

type MemberStatusFilter = 'active' | 'inactive' | 'all';

function normalizeStatus(v: string | null): MemberStatusFilter {
    const s = normalizeString(v).toLowerCase();
    if (s === 'inactive') return 'inactive';
    if (s === 'all') return 'all';
    return 'active';
}

function parseBirthday(input: string): Date | null {
    const raw = normalizeString(input);
    if (!raw) return null;

    if (raw.includes('/')) {
        const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!m) return null;

        const dd = Number(m[1]);
        const mm = Number(m[2]);
        const yyyy = Number(m[3]);

        if (!yyyy || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

        const d = new Date(yyyy, mm - 1, dd);

        if (
            d.getFullYear() !== yyyy ||
            d.getMonth() !== mm - 1 ||
            d.getDate() !== dd
        ) {
            return null;
        }

        return d;
    }

    if (raw.includes('-')) {
        const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;

        const yyyy = Number(m[1]);
        const mm = Number(m[2]);
        const dd = Number(m[3]);

        if (!yyyy || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

        const d = new Date(yyyy, mm - 1, dd);

        if (
            d.getFullYear() !== yyyy ||
            d.getMonth() !== mm - 1 ||
            d.getDate() !== dd
        ) {
            return null;
        }

        return d;
    }

    return null;
}

async function requireCompanyIdFromContext(session: any): Promise<string> {
    const sCompanyId = String(session?.companyId ?? '').trim();
    if (sCompanyId) return sCompanyId;

    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
    if (cookieCompanyId) return cookieCompanyId;

    const userId = String(session?.userId ?? '').trim();
    if (userId) {
        const membership = await prisma.companyMember.findFirst({
            where: { userId, isActive: true },
            orderBy: { createdAt: 'asc' },
            select: { companyId: true },
        });

        if (membership?.companyId) return membership.companyId;
    }

    throw new Error(
        `companyId ausente (session.companyId, cookie "${COMPANY_COOKIE_NAME}" e sem fallback por membership).`
    );
}

export async function GET(req: Request) {
    try {
        const auth = await requireAdminForModuleApi('MEMBERS');
        if (auth instanceof NextResponse) return auth;

        const companyId = await requireCompanyIdFromContext(auth);

        const url = new URL(req.url);

        const q = normalizeString(url.searchParams.get('q'));
        const sort = normalizeSort(url.searchParams.get('sort'));
        const status = normalizeStatus(url.searchParams.get('status'));

        const pageRaw = Number(url.searchParams.get('page') ?? '1');
        const pageSizeRaw = Number(url.searchParams.get('pageSize') ?? '10');

        const page = Number.isFinite(pageRaw)
            ? Math.max(1, Math.floor(pageRaw))
            : 1;

        const pageSize = clampInt(
            Number.isFinite(pageSizeRaw) ? Math.floor(pageSizeRaw) : 10,
            1,
            50
        );

        const membershipSomeWhere: any = {
            companyId,
            role: 'CLIENT',
            ...(status === 'active'
                ? { isActive: true }
                : status === 'inactive'
                  ? { isActive: false }
                  : {}),
        };

        const whereUser: any = {
            companyMemberships: {
                some: membershipSomeWhere,
            },
        };

        if (q) {
            whereUser.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
                {
                    memberVehicles: {
                        some: {
                            companyId,
                            isActive: true,
                            OR: [
                                { model: { contains: q, mode: 'insensitive' } },
                                { plate: { contains: q.toUpperCase() } },
                            ],
                        },
                    },
                },
            ];
        }

        const orderBy =
            sort === 'name_desc'
                ? ({ name: 'desc' } as const)
                : sort === 'createdAt_desc'
                  ? ({ createdAt: 'desc' } as const)
                  : sort === 'createdAt_asc'
                    ? ({ createdAt: 'asc' } as const)
                    : ({ name: 'asc' } as const);

        const total = await prisma.user.count({ where: whereUser });
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const safePage = clampInt(page, 1, totalPages);

        const users = await prisma.user.findMany({
            where: whereUser,
            orderBy,
            skip: (safePage - 1) * pageSize,
            take: pageSize,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                image: true,
                birthday: true,
                createdAt: true,
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
                memberVehicles: {
                    where: {
                        companyId,
                        isActive: true,
                    },
                    orderBy: [{ isMain: 'desc' }, { createdAt: 'desc' }],
                    select: {
                        id: true,
                        model: true,
                        plate: true,
                        cylinderCc: true,
                    },
                    take: 1,
                },
            },
        });

        return jsonOk({
            items: users.map((user) => ({
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                image: user.image,
                birthday: user.birthday,
                createdAt: user.createdAt,
                isActive: user.companyMemberships[0]?.isActive ?? true,
                vehicle: user.memberVehicles[0]
                    ? {
                          id: user.memberVehicles[0].id,
                          motorcycle: user.memberVehicles[0].model ?? '',
                          plate: user.memberVehicles[0].plate ?? '',
                          cylinderCc: user.memberVehicles[0].cylinderCc ?? null,
                      }
                    : null,
            })),
            page: safePage,
            pageSize,
            total,
            totalPages,
            status,
        });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro ao buscar membros.', 500);
    }
}

export async function POST(req: Request) {
    try {
        const auth = await requireAdminForModuleApi('MEMBERS');
        if (auth instanceof NextResponse) return auth;

        const companyId = await requireCompanyIdFromContext(auth);

        const body = await req.json().catch(() => null);
        if (!body) return jsonErr('Body inválido.');

        const name = normalizeString(body.name);
        const email = normalizeString(body.email).toLowerCase();
        const phone = normalizeString(body.phone);
        const birthdayRaw = normalizeString(body.birthday);

        const motorcycle = normalizeString(body.motorcycle);
        const plate = normalizePlate(body.plate);
        const cylinderCc = parseCylinderCc(body.cylinderCc);

        if (!name) return jsonErr('Informe o nome do membro.');
        if (!email) return jsonErr('Informe o e-mail do membro.');
        if (!phone) return jsonErr('Informe o telefone do membro.');
        if (!motorcycle) return jsonErr('Informe a moto do membro.');
        if (!plate) return jsonErr('Informe a placa da moto.');
        if (!cylinderCc) return jsonErr('Informe uma cilindrada válida.');

        const digits = onlyDigits(phone);
        if (digits.length < 10) {
            return jsonErr('Informe um telefone válido (com DDD).');
        }

        const birthday = parseBirthday(birthdayRaw);
        if (!birthday) {
            return jsonErr(
                'Informe uma data de nascimento válida (DD/MM/AAAA ou AAAA-MM-DD).'
            );
        }

        const user = await prisma.$transaction(async (tx) => {
            const createdOrUpdatedUser = await tx.user.upsert({
                where: { email },
                update: {
                    name,
                    phone,
                    birthday,
                },
                create: {
                    name,
                    email,
                    phone,
                    birthday,
                    role: 'CLIENT',
                    isActive: true,
                },
                select: { id: true },
            });

            await tx.companyMember.upsert({
                where: {
                    companyId_userId: {
                        companyId,
                        userId: createdOrUpdatedUser.id,
                    },
                },
                update: {
                    role: 'CLIENT',
                    isActive: true,
                },
                create: {
                    companyId,
                    userId: createdOrUpdatedUser.id,
                    role: 'CLIENT',
                    isActive: true,
                },
                select: { id: true },
            });

            await tx.memberVehicle.updateMany({
                where: {
                    companyId,
                    userId: createdOrUpdatedUser.id,
                    isMain: true,
                    isActive: true,
                },
                data: {
                    isMain: false,
                },
            });

            await tx.memberVehicle.create({
                data: {
                    companyId,
                    userId: createdOrUpdatedUser.id,
                    model: motorcycle,
                    plate,
                    cylinderCc,
                    isMain: true,
                    isActive: true,
                },
                select: { id: true },
            });

            return createdOrUpdatedUser;
        });

        return jsonOk({ id: user.id });
    } catch (err: any) {
        const msg = String(err?.message ?? '');

        if (
            msg.toLowerCase().includes('unique') &&
            msg.toLowerCase().includes('email')
        ) {
            return jsonErr('Já existe um usuário com esse e-mail.', 409);
        }

        return jsonErr(msg || 'Erro ao criar membro.', 500);
    }
}

export async function PATCH(req: Request) {
    try {
        const auth = await requireAdminForModuleApi('MEMBERS');
        if (auth instanceof NextResponse) return auth;

        const companyId = await requireCompanyIdFromContext(auth);

        const body = await req.json().catch(() => null);
        if (!body) return jsonErr('Body inválido.');

        const id = normalizeString(body.id);
        const name = normalizeString(body.name);
        const email = normalizeString(body.email).toLowerCase();
        const phone = normalizeString(body.phone);
        const birthdayRaw = normalizeString(body.birthday);

        const motorcycle = normalizeString(body.motorcycle);
        const plate = normalizePlate(body.plate);
        const cylinderCc = parseCylinderCc(body.cylinderCc);

        if (!id) return jsonErr('Informe o id do membro.');
        if (!name) return jsonErr('Informe o nome do membro.');
        if (!email) return jsonErr('Informe o e-mail do membro.');
        if (!phone) return jsonErr('Informe o telefone do membro.');

        const hasVehicleFields =
            Object.prototype.hasOwnProperty.call(body, 'motorcycle') ||
            Object.prototype.hasOwnProperty.call(body, 'plate') ||
            Object.prototype.hasOwnProperty.call(body, 'cylinderCc');

        if (hasVehicleFields) {
            if (!motorcycle) return jsonErr('Informe a moto do membro.');
            if (!plate) return jsonErr('Informe a placa da moto.');
            if (!cylinderCc) return jsonErr('Informe uma cilindrada válida.');
        }

        const digits = onlyDigits(phone);
        if (digits.length < 10) {
            return jsonErr('Informe um telefone válido (com DDD).');
        }

        const birthday = parseBirthday(birthdayRaw);
        if (!birthday) {
            return jsonErr(
                'Informe uma data de nascimento válida (DD/MM/AAAA ou AAAA-MM-DD).'
            );
        }

        const membership = await prisma.companyMember.findUnique({
            where: {
                companyId_userId: {
                    companyId,
                    userId: id,
                },
            },
            select: { id: true, userId: true, role: true, isActive: true },
        });

        if (!membership || membership.role !== 'CLIENT') {
            return jsonErr('Membro não encontrado para esta empresa.', 404);
        }

        const existingByEmail = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (existingByEmail && existingByEmail.id !== id) {
            return jsonErr('Já existe um usuário com esse e-mail.', 409);
        }

        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id },
                data: {
                    name,
                    email,
                    phone,
                    birthday,
                },
                select: { id: true },
            });

            await tx.companyMember.update({
                where: {
                    companyId_userId: {
                        companyId,
                        userId: id,
                    },
                },
                data: {
                    role: 'CLIENT',
                },
                select: { id: true },
            });

            if (hasVehicleFields) {
                const mainVehicle = await tx.memberVehicle.findFirst({
                    where: {
                        companyId,
                        userId: id,
                        isMain: true,
                        isActive: true,
                    },
                    select: { id: true },
                    orderBy: { createdAt: 'desc' },
                });

                if (mainVehicle) {
                    await tx.memberVehicle.update({
                        where: { id: mainVehicle.id },
                        data: {
                            model: motorcycle,
                            plate,
                            cylinderCc,
                            isMain: true,
                            isActive: true,
                        },
                        select: { id: true },
                    });
                } else {
                    await tx.memberVehicle.create({
                        data: {
                            companyId,
                            userId: id,
                            model: motorcycle,
                            plate,
                            cylinderCc,
                            isMain: true,
                            isActive: true,
                        },
                        select: { id: true },
                    });
                }
            }
        });

        return jsonOk({ id });
    } catch (err: any) {
        const msg = String(err?.message ?? '');

        if (
            msg.toLowerCase().includes('unique') &&
            msg.toLowerCase().includes('email')
        ) {
            return jsonErr('Já existe um usuário com esse e-mail.', 409);
        }

        return jsonErr(msg || 'Erro ao atualizar membro.', 500);
    }
}
