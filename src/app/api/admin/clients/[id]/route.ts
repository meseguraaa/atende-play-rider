// src/app/api/admin/clients/[id]/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

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

function normalizeString(v: unknown) {
    return String(v ?? '').trim();
}

function onlyDigits(v: string) {
    return String(v ?? '').replace(/\D/g, '');
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

type AddressInput = {
    id?: unknown;
    label?: unknown;
    cep?: unknown;
    street?: unknown;
    number?: unknown;
    complement?: unknown;
    neighborhood?: unknown;
    city?: unknown;
    state?: unknown;
    reference?: unknown;
    isDefault?: unknown;
};

function normalizeAddressesInput(value: unknown) {
    if (!Array.isArray(value)) return null;

    const rawItems = value as AddressInput[];
    const normalized = rawItems
        .map((item) => ({
            id: normalizeString(item?.id),
            label: normalizeString(item?.label),
            cep: normalizeString(item?.cep),
            street: normalizeString(item?.street),
            number: normalizeString(item?.number),
            complement: normalizeString(item?.complement),
            neighborhood: normalizeString(item?.neighborhood),
            city: normalizeString(item?.city),
            state: normalizeString(item?.state).toUpperCase().slice(0, 2),
            reference: normalizeString(item?.reference),
            isDefault:
                typeof item?.isDefault === 'boolean' ? item.isDefault : false,
        }))
        .filter(
            (item) =>
                item.id ||
                item.label ||
                item.cep ||
                item.street ||
                item.number ||
                item.complement ||
                item.neighborhood ||
                item.city ||
                item.state ||
                item.reference
        );

    for (const item of normalized) {
        if (!item.label) {
            throw new Error(
                'Todo endereço informado precisa ter um label (ex: Casa, Trabalho).'
            );
        }
    }

    const seenIds = new Set<string>();
    const seenLabels = new Set<string>();

    for (const item of normalized) {
        if (item.id) {
            if (seenIds.has(item.id)) {
                throw new Error('Há endereços duplicados no envio.');
            }
            seenIds.add(item.id);
        }

        const labelKey = item.label.toLowerCase();
        if (seenLabels.has(labelKey)) {
            throw new Error(
                'Não é permitido repetir o label de endereço para o mesmo cliente.'
            );
        }
        seenLabels.add(labelKey);
    }

    let defaultAssigned = false;
    const withSingleDefault = normalized.map((item) => {
        const shouldBeDefault = item.isDefault && !defaultAssigned;
        if (shouldBeDefault) defaultAssigned = true;

        return {
            ...item,
            isDefault: shouldBeDefault,
        };
    });

    return withSingleDefault;
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

async function getSelectedUnitId(): Promise<string | null> {
    const cookieStore = await cookies();
    const selectedUnit =
        cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;
    if (!selectedUnit || selectedUnit === UNIT_ALL_VALUE) return null;
    return selectedUnit;
}

/**
 * PATCH /api/admin/clients/:id
 * body JSON:
 * - name?: string
 * - email?: string
 * - phone?: string
 * - birthday?: string ("DD/MM/AAAA" ou "YYYY-MM-DD")
 * - isActive?: boolean
 * - addresses?: Array<{
 *     id?: string
 *     label: string
 *     cep?: string
 *     street?: string
 *     number?: string
 *     complement?: string
 *     neighborhood?: string
 *     city?: string
 *     state?: string
 *     reference?: string
 *     isDefault?: boolean
 *   }>
 *
 * Regras:
 * - Se vier name/email/phone/birthday => atualiza dados do cliente
 * - Se vier isActive => inativa/reativa vínculo do cliente nesta empresa
 * - Se vier addresses => sincroniza os endereços ativos do cliente nesta empresa
 * - Pode fazer tudo na mesma chamada
 */
export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const session = await requireAdminForModule('CLIENTS');
        const companyId = await requireCompanyIdFromContext(session);

        const { id } = await ctx.params;
        const userId = normalizeString(id);
        if (!userId) return jsonErr('ID do cliente ausente.');

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
        const hasAddresses = Object.prototype.hasOwnProperty.call(
            body,
            'addresses'
        );

        const wantsProfileUpdate =
            hasName || hasEmail || hasPhone || hasBirthday;
        const nextIsActive = hasIsActive
            ? parseOptionalBoolean(body.isActive)
            : null;

        if (!wantsProfileUpdate && !hasIsActive && !hasAddresses) {
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
            return jsonErr('Cliente não encontrado nesta empresa.', 404);
        }

        const selectedUnitId = await getSelectedUnitId();

        let parsedBirthday: Date | undefined;
        let normalizedAddresses:
            | ReturnType<typeof normalizeAddressesInput>
            | undefined;

        if (wantsProfileUpdate) {
            const name = normalizeString(body.name);
            const email = normalizeString(body.email).toLowerCase();
            const phone = normalizeString(body.phone);
            const birthdayRaw = normalizeString(body.birthday);

            if (!name) return jsonErr('Informe o nome do cliente.');
            if (!email) return jsonErr('Informe o e-mail do cliente.');
            if (!phone) return jsonErr('Informe o telefone do cliente.');

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

        if (hasAddresses) {
            try {
                normalizedAddresses = normalizeAddressesInput(body.addresses);
            } catch (err: any) {
                return jsonErr(
                    String(err?.message ?? 'Endereços inválidos.'),
                    400
                );
            }

            if (normalizedAddresses === null) {
                return jsonErr(
                    'O campo addresses deve ser um array de endereços.',
                    400
                );
            }
        }

        await prisma.$transaction(async (tx) => {
            if (wantsProfileUpdate) {
                const name = normalizeString(body.name);
                const email = normalizeString(body.email).toLowerCase();
                const phone = normalizeString(body.phone);

                await tx.user.update({
                    where: { id: userId },
                    data: {
                        name,
                        email,
                        phone,
                        birthday: parsedBirthday!,
                    },
                    select: { id: true },
                });
            }

            const membershipData: Record<string, unknown> = {};

            if (hasIsActive && nextIsActive !== null) {
                membershipData.isActive = nextIsActive;
            }

            if (selectedUnitId) {
                membershipData.lastUnitId = selectedUnitId;
            }

            if (Object.keys(membershipData).length > 0) {
                await tx.companyMember.update({
                    where: {
                        companyId_userId: {
                            companyId,
                            userId,
                        },
                    },
                    data: membershipData,
                    select: { id: true, isActive: true },
                });
            }

            if (hasAddresses && normalizedAddresses) {
                const existingAddresses = await tx.clientAddress.findMany({
                    where: {
                        companyId,
                        clientId: userId,
                        isActive: true,
                    },
                    select: {
                        id: true,
                    },
                });

                const existingIds = new Set(existingAddresses.map((a) => a.id));
                const incomingIds = new Set(
                    normalizedAddresses
                        .map((a) => a.id)
                        .filter(Boolean) as string[]
                );

                for (const addr of normalizedAddresses) {
                    if (addr.id) {
                        if (!existingIds.has(addr.id)) {
                            throw new Error(
                                'Um dos endereços informados não pertence a este cliente.'
                            );
                        }

                        await tx.clientAddress.update({
                            where: { id: addr.id },
                            data: {
                                label: addr.label,
                                cep: addr.cep || null,
                                street: addr.street || null,
                                number: addr.number || null,
                                complement: addr.complement || null,
                                neighborhood: addr.neighborhood || null,
                                city: addr.city || null,
                                state: addr.state || null,
                                reference: addr.reference || null,
                                isDefault: addr.isDefault,
                                isActive: true,
                            },
                            select: { id: true },
                        });
                    } else {
                        await tx.clientAddress.create({
                            data: {
                                companyId,
                                clientId: userId,
                                label: addr.label,
                                cep: addr.cep || null,
                                street: addr.street || null,
                                number: addr.number || null,
                                complement: addr.complement || null,
                                neighborhood: addr.neighborhood || null,
                                city: addr.city || null,
                                state: addr.state || null,
                                reference: addr.reference || null,
                                isDefault: addr.isDefault,
                                isActive: true,
                            },
                            select: { id: true },
                        });
                    }
                }

                const idsToDeactivate = existingAddresses
                    .map((a) => a.id)
                    .filter((id) => !incomingIds.has(id));

                if (idsToDeactivate.length > 0) {
                    await tx.clientAddress.updateMany({
                        where: {
                            companyId,
                            clientId: userId,
                            id: { in: idsToDeactivate },
                        },
                        data: {
                            isActive: false,
                            isDefault: false,
                        },
                    });
                }

                await tx.clientAddress.updateMany({
                    where: {
                        companyId,
                        clientId: userId,
                        isActive: true,
                    },
                    data: {
                        isDefault: false,
                    },
                });

                const chosenDefault = normalizedAddresses.find(
                    (addr) => addr.isDefault
                );

                if (chosenDefault?.id) {
                    await tx.clientAddress.update({
                        where: { id: chosenDefault.id },
                        data: { isDefault: true },
                        select: { id: true },
                    });
                } else if (chosenDefault) {
                    const createdDefault = await tx.clientAddress.findFirst({
                        where: {
                            companyId,
                            clientId: userId,
                            isActive: true,
                            label: chosenDefault.label,
                        },
                        orderBy: { createdAt: 'desc' },
                        select: { id: true },
                    });

                    if (createdDefault?.id) {
                        await tx.clientAddress.update({
                            where: { id: createdDefault.id },
                            data: { isDefault: true },
                            select: { id: true },
                        });
                    }
                }
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

        const activeAddresses = await prisma.clientAddress.findMany({
            where: {
                companyId,
                clientId: userId,
                isActive: true,
            },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            select: {
                id: true,
                label: true,
                cep: true,
                street: true,
                number: true,
                complement: true,
                neighborhood: true,
                city: true,
                state: true,
                reference: true,
                isDefault: true,
                isActive: true,
                createdAt: true,
            },
        });

        return jsonOk({
            id: userId,
            isActive: updatedMembership?.isActive ?? membership.isActive,
            addresses: activeAddresses,
        });
    } catch (err: any) {
        const msg = String(err?.message ?? '');

        if (
            msg.toLowerCase().includes('unique') &&
            msg.toLowerCase().includes('email')
        ) {
            return jsonErr('Já existe um usuário com esse e-mail.', 409);
        }

        if (
            msg.toLowerCase().includes('unique') &&
            msg.toLowerCase().includes('label')
        ) {
            return jsonErr(
                'Já existe um endereço com esse label para este cliente.',
                409
            );
        }

        return jsonErr(msg || 'Erro ao atualizar cliente.', 500);
    }
}
