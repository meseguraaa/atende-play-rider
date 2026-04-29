// src/app/api/admin/clients/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

const COMPANY_COOKIE_NAME = 'admin_company_context';
const UNIT_COOKIE_NAME = 'admin_unit_context';
const UNIT_ALL_VALUE = 'all';

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

type SortKey = 'name_asc' | 'name_desc' | 'createdAt_desc' | 'createdAt_asc';
function normalizeSort(v: string | null): SortKey {
    const s = normalizeString(v);
    if (s === 'name_desc') return 'name_desc';
    if (s === 'createdAt_desc') return 'createdAt_desc';
    if (s === 'createdAt_asc') return 'createdAt_asc';
    return 'name_asc';
}

type ClientStatusFilter = 'active' | 'inactive' | 'all';
function normalizeStatus(v: string | null): ClientStatusFilter {
    const s = normalizeString(v).toLowerCase();
    if (s === 'inactive') return 'inactive';
    if (s === 'all') return 'all';
    return 'active';
}

function parseBirthday(input: string): Date | null {
    const raw = normalizeString(input);
    if (!raw) return null;

    // aceita "DD/MM/AAAA"
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

    // aceita "YYYY-MM-DD"
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
    // 1) session (se vier)
    const sCompanyId = String(session?.companyId ?? '').trim();
    if (sCompanyId) return sCompanyId;

    // 2) cookie (compat)
    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
    if (cookieCompanyId) return cookieCompanyId;

    // 3) fallback: membership pela userId (se vier)
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

async function getSelectedUnitId(): Promise<string | null> {
    const cookieStore = await cookies();
    const selectedUnit =
        cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;
    if (!selectedUnit || selectedUnit === UNIT_ALL_VALUE) return null;
    return selectedUnit;
}

/**
 * GET /api/admin/clients
 * Query:
 * - q: string (nome/email/telefone)
 * - page: number (default 1)
 * - pageSize: number (default 10, max 50)
 * - sort: name_asc | name_desc | createdAt_desc | createdAt_asc
 * - status: active | inactive | all (default active)
 */
export async function GET(req: Request) {
    try {
        const auth = await requireAdminForModuleApi('CLIENTS');
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
            },
        });

        const selectedUnitId = await getSelectedUnitId();

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
            })),
            page: safePage,
            pageSize,
            total,
            totalPages,
            selectedUnitId,
            status,
        });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro ao buscar clientes.', 500);
    }
}

/**
 * POST /api/admin/clients
 * body JSON:
 * - name: string
 * - email: string
 * - phone: string
 * - birthday: string ("DD/MM/AAAA" ou "YYYY-MM-DD")
 */
export async function POST(req: Request) {
    try {
        const auth = await requireAdminForModuleApi('CLIENTS');
        if (auth instanceof NextResponse) return auth;

        const companyId = await requireCompanyIdFromContext(auth);

        const body = await req.json().catch(() => null);
        if (!body) return jsonErr('Body inválido.');

        const name = normalizeString(body.name);
        const email = normalizeString(body.email).toLowerCase();
        const phone = normalizeString(body.phone);
        const birthdayRaw = normalizeString(body.birthday);

        if (!name) return jsonErr('Informe o nome do cliente.');
        if (!email) return jsonErr('Informe o e-mail do cliente.');
        if (!phone) return jsonErr('Informe o telefone do cliente.');

        const digits = onlyDigits(phone);
        if (digits.length < 10)
            return jsonErr('Informe um telefone válido (com DDD).');

        const birthday = parseBirthday(birthdayRaw);
        if (!birthday) {
            return jsonErr(
                'Informe uma data de nascimento válida (DD/MM/AAAA ou AAAA-MM-DD).'
            );
        }

        const selectedUnitId = await getSelectedUnitId();

        const addressesInput = Array.isArray(body.addresses)
            ? body.addresses
            : [];

        // 1) cria ou atualiza user (email é unique)
        const user = await prisma.user.upsert({
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

        // 2) garante membership como CLIENT na empresa
        await prisma.companyMember.upsert({
            where: {
                companyId_userId: {
                    companyId,
                    userId: user.id,
                },
            },
            update: {
                role: 'CLIENT',
                isActive: true,
                ...(selectedUnitId ? { lastUnitId: selectedUnitId } : {}),
            },
            create: {
                companyId,
                userId: user.id,
                role: 'CLIENT',
                isActive: true,
                ...(selectedUnitId ? { lastUnitId: selectedUnitId } : {}),
            },
            select: { id: true },
        });

        // 🔥 NOVO: cria endereços se vierem
        if (addressesInput.length > 0) {
            // garante só 1 default
            let hasDefault = false;

            for (const addr of addressesInput) {
                const label = normalizeString(addr.label);
                if (!label) continue;

                const isDefault =
                    typeof addr.isDefault === 'boolean'
                        ? addr.isDefault && !hasDefault
                        : false;

                if (isDefault) hasDefault = true;

                await prisma.clientAddress.create({
                    data: {
                        companyId,
                        clientId: user.id,
                        label,
                        cep: normalizeString(addr.cep) || null,
                        street: normalizeString(addr.street) || null,
                        number: normalizeString(addr.number) || null,
                        complement: normalizeString(addr.complement) || null,
                        neighborhood:
                            normalizeString(addr.neighborhood) || null,
                        city: normalizeString(addr.city) || null,
                        state: normalizeString(addr.state) || null,
                        reference: normalizeString(addr.reference) || null,
                        isDefault,
                    },
                });
            }
        }

        return jsonOk({ id: user.id });
    } catch (err: any) {
        const msg = String(err?.message ?? '');

        if (
            msg.toLowerCase().includes('unique') &&
            msg.toLowerCase().includes('email')
        ) {
            return jsonErr('Já existe um usuário com esse e-mail.', 409);
        }

        return jsonErr(msg || 'Erro ao criar cliente.', 500);
    }
}

/**
 * PATCH /api/admin/clients
 * body JSON:
 * - id: string
 * - name: string
 * - email: string
 * - phone: string
 * - birthday: string ("DD/MM/AAAA" ou "YYYY-MM-DD")
 */
export async function PATCH(req: Request) {
    try {
        const auth = await requireAdminForModuleApi('CLIENTS');
        if (auth instanceof NextResponse) return auth;

        const companyId = await requireCompanyIdFromContext(auth);

        const body = await req.json().catch(() => null);
        if (!body) return jsonErr('Body inválido.');

        const id = normalizeString(body.id);
        const name = normalizeString(body.name);
        const email = normalizeString(body.email).toLowerCase();
        const phone = normalizeString(body.phone);
        const birthdayRaw = normalizeString(body.birthday);

        if (!id) return jsonErr('Informe o id do cliente.');
        if (!name) return jsonErr('Informe o nome do cliente.');
        if (!email) return jsonErr('Informe o e-mail do cliente.');
        if (!phone) return jsonErr('Informe o telefone do cliente.');

        const digits = onlyDigits(phone);
        if (digits.length < 10)
            return jsonErr('Informe um telefone válido (com DDD).');

        const birthday = parseBirthday(birthdayRaw);
        if (!birthday) {
            return jsonErr(
                'Informe uma data de nascimento válida (DD/MM/AAAA ou AAAA-MM-DD).'
            );
        }

        // ✅ garante que esse user é CLIENT dessa empresa
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
            return jsonErr('Cliente não encontrado para esta empresa.', 404);
        }

        // ✅ se tentou trocar email, impede colisão com outro user
        const existingByEmail = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (existingByEmail && existingByEmail.id !== id) {
            return jsonErr('Já existe um usuário com esse e-mail.', 409);
        }

        const selectedUnitId = await getSelectedUnitId();

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

            // mantém o membership consistente sem alterar o status atual
            await tx.companyMember.update({
                where: {
                    companyId_userId: {
                        companyId,
                        userId: id,
                    },
                },
                data: {
                    role: 'CLIENT',
                    ...(selectedUnitId ? { lastUnitId: selectedUnitId } : {}),
                },
                select: { id: true },
            });
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

        return jsonErr(msg || 'Erro ao atualizar cliente.', 500);
    }
}
