// src/app/api/admin/categories/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModuleApi } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function asTrimmedString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function asBoolean(value: unknown) {
    return value === true;
}

export async function GET() {
    const session = await requireAdminForModuleApi('CATEGORIES');
    if (session instanceof NextResponse) return session;

    const companyId = String(session.companyId || '').trim();
    if (!companyId) {
        return jsonErr('Empresa inválida.', 400);
    }

    const categories = await prisma.category.findMany({
        where: { companyId },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        select: {
            id: true,
            name: true,
            isActive: true,
            showInProducts: true,
            showInFaq: true,
            createdAt: true,
            updatedAt: true,
            _count: {
                select: {
                    productLinks: true,
                    faqItems: true,
                },
            },
        },
    });

    return jsonOk({ categories });
}

export async function POST(req: Request) {
    const session = await requireAdminForModuleApi('CATEGORIES');
    if (session instanceof NextResponse) return session;

    const companyId = String(session.companyId || '').trim();
    if (!companyId) {
        return jsonErr('Empresa inválida.', 400);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return jsonErr('Payload inválido.', 400);
    }

    const name = asTrimmedString((body as Record<string, unknown>).name);
    const showInProducts = asBoolean(
        (body as Record<string, unknown>).showInProducts
    );
    const showInFaq = asBoolean((body as Record<string, unknown>).showInFaq);

    if (!name) {
        return jsonErr('Nome da categoria é obrigatório.', 400);
    }

    if (!showInProducts && !showInFaq) {
        return jsonErr(
            'Marque pelo menos uma opção: Produtos e/ou Tirar dúvidas.',
            400
        );
    }

    const existing = await prisma.category.findFirst({
        where: {
            companyId,
            name: {
                equals: name,
                mode: 'insensitive',
            },
        },
        select: { id: true },
    });

    if (existing?.id) {
        return jsonErr('Já existe uma categoria com este nome.', 409);
    }

    const created = await prisma.category.create({
        data: {
            companyId,
            name,
            isActive: true,
            showInProducts,
            showInFaq,
        },
        select: {
            id: true,
        },
    });

    return jsonOk(created, { status: 201 });
}
