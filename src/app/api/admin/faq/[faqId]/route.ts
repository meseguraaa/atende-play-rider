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

function asOptionalBoolean(
    obj: Record<string, unknown>,
    key: string
): boolean | undefined {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
    return obj[key] === true;
}

function asNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : NaN;
    }

    return NaN;
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ faqId: string }> }
) {
    const session = await requireAdminForModuleApi('FAQ');
    if (session instanceof NextResponse) return session;

    const companyId = String(session.companyId || '').trim();
    const { faqId } = await ctx.params;

    if (!companyId) {
        return jsonErr('Empresa inválida.', 400);
    }

    const id = String(faqId || '').trim();
    if (!id) {
        return jsonErr('FAQ inválida.', 400);
    }

    const faq = await prisma.faqItem.findFirst({
        where: {
            id,
            companyId,
        },
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
        },
    });

    if (!faq) {
        return jsonErr('Dúvida não encontrada.', 404);
    }

    return jsonOk({ faq });
}

export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ faqId: string }> }
) {
    const session = await requireAdminForModuleApi('FAQ');
    if (session instanceof NextResponse) return session;

    const companyId = String(session.companyId || '').trim();
    const { faqId } = await ctx.params;

    if (!companyId) {
        return jsonErr('Empresa inválida.', 400);
    }

    const id = String(faqId || '').trim();
    if (!id) {
        return jsonErr('FAQ inválida.', 400);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return jsonErr('Payload inválido.', 400);
    }

    const payload = body as Record<string, unknown>;

    const current = await prisma.faqItem.findFirst({
        where: {
            id,
            companyId,
        },
        select: {
            id: true,
            categoryId: true,
            question: true,
            answer: true,
            sortOrder: true,
            isActive: true,
        },
    });

    if (!current) {
        return jsonErr('Dúvida não encontrada.', 404);
    }

    const nextCategoryId = Object.prototype.hasOwnProperty.call(
        payload,
        'categoryId'
    )
        ? asTrimmedString(payload.categoryId)
        : current.categoryId;

    const nextQuestion = Object.prototype.hasOwnProperty.call(
        payload,
        'question'
    )
        ? asTrimmedString(payload.question)
        : current.question;

    const nextAnswer = Object.prototype.hasOwnProperty.call(payload, 'answer')
        ? asTrimmedString(payload.answer)
        : current.answer;

    const nextSortOrder = Object.prototype.hasOwnProperty.call(
        payload,
        'sortOrder'
    )
        ? asNumber(payload.sortOrder)
        : current.sortOrder;

    const nextIsActive =
        asOptionalBoolean(payload, 'isActive') ?? current.isActive;

    if (!nextCategoryId) {
        return jsonErr('Categoria é obrigatória.', 400);
    }

    if (!nextQuestion) {
        return jsonErr('Pergunta é obrigatória.', 400);
    }

    if (!nextAnswer) {
        return jsonErr('Resposta é obrigatória.', 400);
    }

    if (!Number.isFinite(nextSortOrder)) {
        return jsonErr('Ordem inválida.', 400);
    }

    const category = await prisma.category.findFirst({
        where: {
            id: nextCategoryId,
            companyId,
            isActive: true,
            showInFaq: true,
        },
        select: { id: true },
    });

    if (!category?.id) {
        return jsonErr('Categoria inválida para uso em Tirar dúvidas.', 400);
    }

    const duplicate = await prisma.faqItem.findFirst({
        where: {
            companyId,
            id: { not: current.id },
            categoryId: nextCategoryId,
            question: {
                equals: nextQuestion,
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

    const updated = await prisma.faqItem.update({
        where: { id: current.id },
        data: {
            categoryId: nextCategoryId,
            question: nextQuestion,
            answer: nextAnswer,
            sortOrder: Math.trunc(nextSortOrder),
            isActive: nextIsActive,
        },
        select: {
            id: true,
            categoryId: true,
            question: true,
            answer: true,
            sortOrder: true,
            isActive: true,
            updatedAt: true,
        },
    });

    return jsonOk(updated);
}
