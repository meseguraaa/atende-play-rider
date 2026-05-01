// src/app/api/admin/members/[id]/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

const COMPANY_COOKIE_NAME = 'admin_company_context';

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function normalizeString(v: unknown) {
    return String(v ?? '').trim();
}

function onlyDigits(v: string) {
    return String(v ?? '').replace(/\D/g, '');
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

function parseOptionalBoolean(v: unknown): boolean | null {
    if (typeof v === 'boolean') return v;

    const s = normalizeString(v).toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;

    return null;
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

/**
 * PATCH /api/admin/members/:id
 */
export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const session = await requireAdminForModule('MEMBERS');
        const companyId = await requireCompanyIdFromContext(session);

        const { id } = await ctx.params;
        const userId = normalizeString(id);
        if (!userId) return jsonErr('ID do membro ausente.');

        const body = await req.json().catch(() => null);
        if (!body) return jsonErr('Body inválido.');

        const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
        const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email');
        const hasPhone = Object.prototype.hasOwnProperty.call(body, 'phone');
        const hasBirthday = Object.prototype.hasOwnProperty.call(
            body,
            'birthday'
        );
        const hasIsActive = Object.prototype.hasOwnProperty.call(
            body,
            'isActive'
        );

        const hasMotorcycle = Object.prototype.hasOwnProperty.call(
            body,
            'motorcycle'
        );
        const hasPlate = Object.prototype.hasOwnProperty.call(body, 'plate');
        const hasCylinderCc = Object.prototype.hasOwnProperty.call(
            body,
            'cylinderCc'
        );

        const wantsProfileUpdate =
            hasName || hasEmail || hasPhone || hasBirthday;

        const wantsVehicleUpdate = hasMotorcycle || hasPlate || hasCylinderCc;

        const nextIsActive = hasIsActive
            ? parseOptionalBoolean(body.isActive)
            : null;

        if (!wantsProfileUpdate && !hasIsActive && !wantsVehicleUpdate) {
            return jsonErr('Nenhum campo para atualizar foi informado.');
        }

        if (hasIsActive && nextIsActive === null) {
            return jsonErr('O campo isActive deve ser true ou false.');
        }

        const membership = await prisma.companyMember.findFirst({
            where: {
                companyId,
                userId,
                role: 'CLIENT',
            },
            select: {
                id: true,
                isActive: true,
            },
        });

        if (!membership) {
            return jsonErr('Membro não encontrado nesta empresa.', 404);
        }

        let parsedBirthday: Date | undefined;

        if (wantsProfileUpdate) {
            const name = normalizeString(body.name);
            const email = normalizeString(body.email).toLowerCase();
            const phone = normalizeString(body.phone);
            const birthdayRaw = normalizeString(body.birthday);

            if (!name) return jsonErr('Informe o nome do membro.');
            if (!email) return jsonErr('Informe o e-mail do membro.');
            if (!phone) return jsonErr('Informe o telefone do membro.');

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

            const existingByEmail = await prisma.user.findUnique({
                where: { email },
                select: { id: true },
            });

            if (existingByEmail && existingByEmail.id !== userId) {
                return jsonErr('Já existe um usuário com esse e-mail.', 409);
            }

            parsedBirthday = birthday;
        }

        let motorcycle = '';
        let plate = '';
        let cylinderCc: number | null = null;

        if (wantsVehicleUpdate) {
            motorcycle = normalizeString(body.motorcycle);
            plate = normalizePlate(body.plate);
            cylinderCc = parseCylinderCc(body.cylinderCc);

            if (!motorcycle) return jsonErr('Informe a moto do membro.');
            if (!plate) return jsonErr('Informe a placa da moto.');
            if (!cylinderCc) return jsonErr('Informe uma cilindrada válida.');
        }

        await prisma.$transaction(async (tx) => {
            if (wantsProfileUpdate) {
                await tx.user.update({
                    where: { id: userId },
                    data: {
                        name: normalizeString(body.name),
                        email: normalizeString(body.email).toLowerCase(),
                        phone: normalizeString(body.phone),
                        birthday: parsedBirthday!,
                    },
                    select: { id: true },
                });
            }

            if (wantsVehicleUpdate) {
                const mainVehicle = await tx.memberVehicle.findFirst({
                    where: {
                        companyId,
                        userId,
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
                            userId,
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

            if (hasIsActive && nextIsActive !== null) {
                await tx.companyMember.update({
                    where: {
                        companyId_userId: {
                            companyId,
                            userId,
                        },
                    },
                    data: {
                        isActive: nextIsActive,
                    },
                    select: { id: true, isActive: true },
                });
            }
        });

        const updatedMembership = await prisma.companyMember.findUnique({
            where: {
                companyId_userId: {
                    companyId,
                    userId,
                },
            },
            select: {
                isActive: true,
            },
        });

        return jsonOk({
            id: userId,
            isActive: updatedMembership?.isActive ?? membership.isActive,
        });
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
