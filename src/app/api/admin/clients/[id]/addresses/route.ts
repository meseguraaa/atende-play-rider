// src/app/api/admin/clients/[id]/addresses/route.ts
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

    throw new Error('companyId ausente no contexto.');
}

/**
 * GET /api/admin/clients/:id/addresses
 */
export async function GET(
    _req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const session = await requireAdminForModule('CLIENTS');
        const companyId = await requireCompanyIdFromContext(session);

        const { id } = await ctx.params;
        const clientId = normalizeString(id);
        if (!clientId) return jsonErr('ID do cliente ausente.');

        // valida se cliente pertence à empresa
        const membership = await prisma.companyMember.findFirst({
            where: {
                companyId,
                userId: clientId,
                role: 'CLIENT',
            },
            select: { id: true },
        });

        if (!membership) {
            return jsonErr('Cliente não encontrado nesta empresa.', 404);
        }

        const addresses = await prisma.clientAddress.findMany({
            where: {
                companyId,
                clientId,
                isActive: true,
            },
            orderBy: [
                { isDefault: 'desc' }, // default primeiro
                { createdAt: 'asc' },
            ],
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
                createdAt: true,
            },
        });

        return jsonOk(addresses);
    } catch (err: any) {
        return jsonErr(
            String(err?.message ?? 'Erro ao listar endereços.'),
            500
        );
    }
}

/**
 * POST /api/admin/clients/:id/addresses
 */
export async function POST(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const session = await requireAdminForModule('CLIENTS');
        const companyId = await requireCompanyIdFromContext(session);

        const { id } = await ctx.params;
        const clientId = normalizeString(id);
        if (!clientId) return jsonErr('ID do cliente ausente.');

        const body = await req.json().catch(() => null);
        if (!body) return jsonErr('Body inválido.');

        const label = normalizeString(body.label);
        if (!label) {
            return jsonErr('Informe o label do endereço (ex: Casa, Trabalho).');
        }

        const membership = await prisma.companyMember.findFirst({
            where: {
                companyId,
                userId: clientId,
                role: 'CLIENT',
            },
            select: { id: true },
        });

        if (!membership) {
            return jsonErr('Cliente não encontrado nesta empresa.', 404);
        }

        const cep = normalizeString(body.cep);
        const street = normalizeString(body.street);
        const number = normalizeString(body.number);
        const complement = normalizeString(body.complement);
        const neighborhood = normalizeString(body.neighborhood);
        const city = normalizeString(body.city);
        const state = normalizeString(body.state);
        const reference = normalizeString(body.reference);

        const isDefault =
            typeof body.isDefault === 'boolean' ? body.isDefault : false;

        if (isDefault) {
            await prisma.clientAddress.updateMany({
                where: {
                    companyId,
                    clientId,
                    isDefault: true,
                },
                data: {
                    isDefault: false,
                },
            });
        }

        const address = await prisma.clientAddress.create({
            data: {
                companyId,
                clientId,
                label,
                cep: cep || null,
                street: street || null,
                number: number || null,
                complement: complement || null,
                neighborhood: neighborhood || null,
                city: city || null,
                state: state || null,
                reference: reference || null,
                isDefault,
            },
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
                createdAt: true,
            },
        });

        return jsonOk(address, { status: 201 });
    } catch (err: any) {
        const msg = String(err?.message ?? '');

        if (msg.toLowerCase().includes('unique')) {
            return jsonErr(
                'Já existe um endereço com esse label para este cliente.',
                409
            );
        }

        return jsonErr(msg || 'Erro ao criar endereço.', 500);
    }
}
