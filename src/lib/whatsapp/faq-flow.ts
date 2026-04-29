import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export type FaqCategoryListItem = {
    id: string;
    label: string;
};

export type FaqQuestionListItem = {
    id: string;
    label: string;
};

export type FaqAnswerItem = {
    id: string;
    categoryId: string;
    categoryLabel: string;
    question: string;
    answer: string;
    sortOrder: number;
};

function toInputJsonValue(
    value: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue | undefined {
    if (!value) return undefined;
    return value as Prisma.InputJsonValue;
}

export function isBackCommand(cleaned: string) {
    return ['voltar', 'volta', 'v', '9'].includes(
        String(cleaned || '')
            .trim()
            .toLowerCase()
    );
}

export function isFaqEntryCommand(cleaned: string) {
    return [
        '4',
        'duvidas',
        'dúvidas',
        'tirar duvidas',
        'tirar dúvidas',
        'faq',
        'perguntas',
    ].includes(
        String(cleaned || '')
            .trim()
            .toLowerCase()
    );
}

export function clearFaqPayload(payload: Record<string, unknown>) {
    payload.faqCategoryId = null;
    payload.faqCategoryLabel = null;
    payload.faqQuestionId = null;
    payload.faqQuestionLabel = null;
    payload.faqAnswerText = null;
}

export async function listFaqCategories(companyId: string) {
    const categories = await prisma.category.findMany({
        where: {
            companyId,
            isActive: true,
            showInFaq: true,
            faqItems: {
                some: {
                    isActive: true,
                },
            },
        },
        orderBy: [{ name: 'asc' }],
        select: {
            id: true,
            name: true,
        },
    });

    return categories.map<FaqCategoryListItem>((c) => ({
        id: c.id,
        label: c.name,
    }));
}

export async function listFaqQuestions(companyId: string, categoryId: string) {
    const items = await prisma.faqItem.findMany({
        where: {
            companyId,
            categoryId,
            isActive: true,
            category: {
                isActive: true,
                showInFaq: true,
            },
        },
        orderBy: [{ sortOrder: 'asc' }, { question: 'asc' }],
        select: {
            id: true,
            question: true,
        },
    });

    return items.map<FaqQuestionListItem>((item) => ({
        id: item.id,
        label: item.question,
    }));
}

export async function getFaqAnswer(companyId: string, faqId: string) {
    const item = await prisma.faqItem.findFirst({
        where: {
            id: faqId,
            companyId,
            isActive: true,
            category: {
                isActive: true,
                showInFaq: true,
            },
        },
        select: {
            id: true,
            categoryId: true,
            question: true,
            answer: true,
            sortOrder: true,
            category: {
                select: {
                    name: true,
                },
            },
        },
    });

    if (!item) return null;

    return {
        id: item.id,
        categoryId: item.categoryId,
        categoryLabel: item.category.name,
        question: item.question,
        answer: item.answer,
        sortOrder:
            typeof item.sortOrder === 'number' &&
            Number.isFinite(item.sortOrder)
                ? item.sortOrder
                : 100,
    } satisfies FaqAnswerItem;
}

export async function createFaqEvent(args: {
    companyId: string;
    channelId?: string | null;
    fromPhone?: string | null;
    categoryId?: string | null;
    faqItemId?: string | null;
    whatsappSessionId?: string | null;
    eventType:
        | 'FAQ_MENU_ENTRY'
        | 'FAQ_COMPANY_SELECTED'
        | 'FAQ_CATEGORY_SELECTED'
        | 'FAQ_QUESTION_SELECTED'
        | 'FAQ_ANSWER_VIEWED'
        | 'FAQ_BACK_TO_QUESTIONS'
        | 'FAQ_BACK_TO_MENU'
        | 'FAQ_SESSION_EXPIRED';
    payload?: Record<string, unknown> | null;
}) {
    try {
        await prisma.faqEvent.create({
            data: {
                companyId: args.companyId,
                channelId: args.channelId ?? null,
                fromPhone: args.fromPhone ?? null,
                categoryId: args.categoryId ?? null,
                faqItemId: args.faqItemId ?? null,
                whatsappSessionId: args.whatsappSessionId ?? null,
                eventType: args.eventType,
                payload: toInputJsonValue(args.payload),
            },
            select: { id: true },
        });
    } catch (error) {
        console.error('[whatsapp][faq_event][create_failed]', {
            companyId: args.companyId,
            eventType: args.eventType,
            error: String(error),
        });
    }
}

export function renderFaqCategories(items: FaqCategoryListItem[]) {
    const lines: string[] = ['📚 Tire suas dúvidas', ''];

    if (!items.length) {
        lines.push('Ainda não encontrei categorias de dúvidas disponíveis.');
        lines.push('');
        lines.push('Digite “menu” para voltar.');
        return lines.join('\n');
    }

    lines.push('Escolha uma categoria:');
    lines.push('');

    items.forEach((item, idx) => {
        lines.push(`${idx + 1}) ${item.label}`);
    });

    lines.push('');
    lines.push('Responda com o número');
    lines.push('(Digite “menu” para voltar)');
    return lines.join('\n');
}

export function renderFaqQuestions(
    categoryLabel: string,
    items: FaqQuestionListItem[]
) {
    const lines: string[] = [`📌 Categoria: ${categoryLabel}`, ''];

    if (!items.length) {
        lines.push('Ainda não encontrei perguntas ativas nessa categoria.');
        lines.push('');
        lines.push('Digite “voltar” para categorias ou “menu” para o início.');
        return lines.join('\n');
    }

    lines.push('Escolha sua dúvida:');
    lines.push('');

    items.forEach((item, idx) => {
        lines.push(`${idx + 1}) ${item.label}`);
    });

    lines.push('');
    lines.push('Responda com o número');
    lines.push('(Digite “voltar” para categorias ou “menu” para o início)');
    return lines.join('\n');
}

export function renderFaqAnswer(args: { question: string; answer: string }) {
    return [
        `💡 ${args.question}`,
        '',
        args.answer,
        '',
        'Digite:',
        '1) Voltar para perguntas',
        '2) Menu inicial',
    ].join('\n');
}

export function renderFaqEmpty() {
    return [
        'Ainda não encontrei dúvidas cadastradas para esta empresa. 🙂',
        '',
        'Digite “menu” para voltar ao início.',
    ].join('\n');
}
