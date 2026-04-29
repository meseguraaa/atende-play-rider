// src/app/api/admin/categories/[categoryId]/route.ts
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

function hasOwn(obj: Record<string, unknown>, key: string) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function asOptionalBoolean(
    obj: Record<string, unknown>,
    key: string
): boolean | undefined {
    if (!hasOwn(obj, key)) return undefined;
    return obj[key] === true;
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ categoryId: string }> }
) {
    const session = await requireAdminForModuleApi('CATEGORIES');
    if (session instanceof NextResponse) return session;

    const companyId = String(session.companyId || '').trim();
    const { categoryId } = await ctx.params;

    if (!companyId) {
        return jsonErr('Empresa inválida.', 400);
    }

    const id = String(categoryId || '').trim();
    if (!id) {
        return jsonErr('Categoria inválida.', 400);
    }

    const category = await prisma.category.findFirst({
        where: {
            id,
            companyId,
        },
        select: {
            id: true,
            companyId: true,
            name: true,
            isActive: true,
            showInServices: true,
            showInProducts: true,
            showInFaq: true,
            createdAt: true,
            updatedAt: true,
            _count: {
                select: {
                    serviceLinks: true,
                    productLinks: true,
                },
            },
        },
    });

    if (!category) {
        return jsonErr('Categoria não encontrada.', 404);
    }

    return jsonOk({ category });
}

export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ categoryId: string }> }
) {
    const session = await requireAdminForModuleApi('CATEGORIES');
    if (session instanceof NextResponse) return session;

    const companyId = String(session.companyId || '').trim();
    const { categoryId } = await ctx.params;

    if (!companyId) {
        return jsonErr('Empresa inválida.', 400);
    }

    const id = String(categoryId || '').trim();
    if (!id) {
        return jsonErr('Categoria inválida.', 400);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return jsonErr('Payload inválido.', 400);
    }

    const payload = body as Record<string, unknown>;

    const current = await prisma.category.findFirst({
        where: {
            id,
            companyId,
        },
        select: {
            id: true,
            companyId: true,
            name: true,
            isActive: true,
            showInServices: true,
            showInProducts: true,
            showInFaq: true,
            _count: {
                select: {
                    serviceLinks: true,
                    productLinks: true,
                },
            },
        },
    });

    if (!current) {
        return jsonErr('Categoria não encontrada.', 404);
    }

    const nextName = hasOwn(payload, 'name')
        ? asTrimmedString(payload.name)
        : current.name;

    const nextShowInServices =
        asOptionalBoolean(payload, 'showInServices') ?? current.showInServices;

    const nextShowInProducts =
        asOptionalBoolean(payload, 'showInProducts') ?? current.showInProducts;

    const nextShowInFaq =
        asOptionalBoolean(payload, 'showInFaq') ?? current.showInFaq;

    const nextIsActive =
        asOptionalBoolean(payload, 'isActive') ?? current.isActive;

    if (!nextName) {
        return jsonErr('Nome da categoria é obrigatório.', 400);
    }

    if (!nextShowInServices && !nextShowInProducts && !nextShowInFaq) {
        return jsonErr(
            'Marque pelo menos uma opção: Serviços, Produtos e/ou Tirar dúvidas.',
            400
        );
    }

    const duplicate = await prisma.category.findFirst({
        where: {
            companyId,
            id: { not: current.id },
            name: {
                equals: nextName,
                mode: 'insensitive',
            },
        },
        select: { id: true },
    });

    if (duplicate?.id) {
        return jsonErr('Já existe uma categoria com este nome.', 409);
    }

    const hasLinks =
        current._count.serviceLinks > 0 || current._count.productLinks > 0;

    if (current.isActive && !nextIsActive && hasLinks) {
        return jsonErr(
            'Esta categoria não pode ser inativada porque possui serviços ou produtos vinculados. Edite os itens relacionados e associe-os a categorias ativas antes de inativá-la.',
            409
        );
    }

    const updated = await prisma.category.update({
        where: { id: current.id },
        data: {
            name: nextName,
            showInServices: nextShowInServices,
            showInProducts: nextShowInProducts,
            showInFaq: nextShowInFaq,
            isActive: nextIsActive,
        },
        select: {
            id: true,
            companyId: true,
            name: true,
            isActive: true,
            showInServices: true,
            showInProducts: true,
            showInFaq: true,
            updatedAt: true,
        },
    });

    return jsonOk(updated);
}
