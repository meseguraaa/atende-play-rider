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

function asNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : NaN;
    }

    return NaN;
}

export async function GET() {
    const session = await requireAdminForModuleApi('FAQ');
    if (session instanceof NextResponse) return session;

    const companyId = String(session.companyId || '').trim();
    if (!companyId) {
        return jsonErr('Empresa inválida.', 400);
    }

    const [faqItems, categories] = await Promise.all([
        prisma.faqItem.findMany({
            where: { companyId },
            orderBy: [
                { isActive: 'desc' },
                { sortOrder: 'asc' },
                { question: 'asc' },
            ],
            select: {
                id: true,
                companyId: true,
                categoryId: true,
                question: true,
                answer: true,
                sortOrder: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                category: {
                    select: {
                        id: true,
                        name: true,
                        isActive: true,
                        showInFaq: true,
                    },
                },
            },
        }),
        prisma.category.findMany({
            where: {
                companyId,
                isActive: true,
                showInFaq: true,
            },
            orderBy: [{ name: 'asc' }],
            select: {
                id: true,
                name: true,
                isActive: true,
                showInProducts: true,
                showInFaq: true,
            },
        }),
    ]);

    return jsonOk({
        faqItems,
        categories,
    });
}

export async function POST(req: Request) {
    const session = await requireAdminForModuleApi('FAQ');
    if (session instanceof NextResponse) return session;

    const companyId = String(session.companyId || '').trim();
    if (!companyId) {
        return jsonErr('Empresa inválida.', 400);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return jsonErr('Payload inválido.', 400);
    }

    const payload = body as Record<string, unknown>;

    const categoryId = asTrimmedString(payload.categoryId);
    const question = asTrimmedString(payload.question);
    const answer = asTrimmedString(payload.answer);
    const sortOrderRaw = hasOwn(payload, 'sortOrder')
        ? asNumber(payload.sortOrder)
        : 100;

    if (!categoryId) {
        return jsonErr('Categoria é obrigatória.', 400);
    }

    if (!question) {
        return jsonErr('Pergunta é obrigatória.', 400);
    }

    if (!answer) {
        return jsonErr('Resposta é obrigatória.', 400);
    }

    if (!Number.isFinite(sortOrderRaw)) {
        return jsonErr('Ordem de exibição inválida.', 400);
    }

    const category = await prisma.category.findFirst({
        where: {
            id: categoryId,
            companyId,
            isActive: true,
            showInFaq: true,
        },
        select: {
            id: true,
        },
    });

    if (!category?.id) {
        return jsonErr('Categoria inválida para uso em Tirar dúvidas.', 400);
    }

    const duplicate = await prisma.faqItem.findFirst({
        where: {
            companyId,
            categoryId,
            question: {
                equals: question,
                mode: 'insensitive',
            },
        },
        select: { id: true },
    });

    if (duplicate?.id) {
        return jsonErr(
            'Já existe uma dúvida com essa pergunta nesta categoria.',
            409
        );
    }

    const created = await prisma.faqItem.create({
        data: {
            companyId,
            categoryId,
            question,
            answer,
            sortOrder: Math.trunc(sortOrderRaw),
            isActive: true,
        },
        select: {
            id: true,
        },
    });

    return jsonOk(created, { status: 201 });
}

function hasOwn(obj: Record<string, unknown>, key: string) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}
