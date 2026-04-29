// src/app/admin/report/faq/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import {
    ArrowLeft,
    MessageCircleQuestion,
    List,
    HelpCircle,
    Eye,
} from 'lucide-react';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';
import { MonthPicker } from '@/components/month-picker';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Relatório de FAQ',
};

const COMPANY_COOKIE_NAME = 'admin_company_context';

type SummaryCardProps = {
    title: string;
    value: string;
    description: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type RankingItem = {
    id: string;
    name: string;
    total: number;
};

function SummaryCard({
    title,
    value,
    description,
    icon: Icon,
}: SummaryCardProps) {
    return (
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-4">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-primary bg-brand-primary/10 text-brand-primary">
                    <Icon className="h-5 w-5" />
                </div>

                <div className="space-y-1">
                    <p className="text-label-small text-content-secondary">
                        {title}
                    </p>
                    <p className="text-title text-content-primary">{value}</p>
                    <p className="text-paragraph-small text-content-secondary">
                        {description}
                    </p>
                </div>
            </div>
        </div>
    );
}

function RankingCard({
    title,
    description,
    items,
    emptyMessage,
}: {
    title: string;
    description: string;
    items: RankingItem[];
    emptyMessage: string;
}) {
    return (
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5">
            <div className="space-y-2">
                <h3 className="text-paragraph-medium text-content-primary">
                    {title}
                </h3>

                <p className="text-paragraph-small text-content-secondary">
                    {description}
                </p>
            </div>

            <div className="mt-4">
                {items.length === 0 ? (
                    <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                        <p className="text-paragraph-small text-content-secondary">
                            {emptyMessage}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map((item, index) => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                            >
                                <div className="min-w-0">
                                    <p className="text-paragraph-small text-content-secondary">
                                        #{index + 1}
                                    </p>

                                    <p className="truncate text-label-medium-size text-content-primary">
                                        {item.name}
                                    </p>
                                </div>

                                <div className="text-right">
                                    <p className="text-label-medium-size text-content-primary">
                                        {formatNumberBR(item.total)}
                                    </p>

                                    <p className="text-[11px] text-content-secondary">
                                        Visualizações
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function getSingleParam(v: string | string[] | undefined) {
    if (v == null) return undefined;
    return Array.isArray(v) ? v[0] : v;
}

function formatNumberBR(value: number) {
    return new Intl.NumberFormat('pt-BR').format(value);
}

async function requireCompanyIdFromContext(session: any) {
    const sCompanyId = String(session?.companyId ?? '').trim();
    if (sCompanyId) return sCompanyId;

    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
    if (cookieCompanyId) return cookieCompanyId;

    throw new Error('companyId ausente.');
}

export default async function AdminFaqReportPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await requireAdminForModule('DASHBOARD');
    const companyId = await requireCompanyIdFromContext(session);

    const resolvedSearchParams = await searchParams;

    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(
        now.getUTCMonth() + 1
    ).padStart(2, '0')}`;

    const month = getSingleParam(resolvedSearchParams.month) ?? currentMonth;

    const [y, m] = month.split('-').map(Number);

    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));

    const baseWhere = {
        companyId,
        createdAt: {
            gte: start,
            lt: end,
        },
    };

    const [
        menuEntries,
        categoriesSelected,
        questionsSelected,
        answersViewed,
        topCategoriesRaw,
        topQuestionsRaw,
    ] = await Promise.all([
        prisma.faqEvent.count({
            where: { ...baseWhere, eventType: 'FAQ_MENU_ENTRY' },
        }),

        prisma.faqEvent.count({
            where: { ...baseWhere, eventType: 'FAQ_CATEGORY_SELECTED' },
        }),

        prisma.faqEvent.count({
            where: { ...baseWhere, eventType: 'FAQ_QUESTION_SELECTED' },
        }),

        prisma.faqEvent.count({
            where: { ...baseWhere, eventType: 'FAQ_ANSWER_VIEWED' },
        }),

        prisma.faqEvent.groupBy({
            by: ['categoryId'],
            where: {
                ...baseWhere,
                eventType: 'FAQ_CATEGORY_SELECTED',
                categoryId: { not: null },
            },
            _count: {
                categoryId: true,
            },
            orderBy: {
                _count: {
                    categoryId: 'desc',
                },
            },
            take: 5,
        }),

        prisma.faqEvent.groupBy({
            by: ['faqItemId'],
            where: {
                ...baseWhere,
                eventType: 'FAQ_QUESTION_SELECTED',
                faqItemId: { not: null },
            },
            _count: {
                faqItemId: true,
            },
            orderBy: {
                _count: {
                    faqItemId: 'desc',
                },
            },
            take: 5,
        }),
    ]);

    const categoryIds = topCategoriesRaw
        .map((item) => item.categoryId)
        .filter((id): id is string => !!id);

    const faqItemIds = topQuestionsRaw
        .map((item) => item.faqItemId)
        .filter((id): id is string => !!id);

    const [categories, faqItems] = await Promise.all([
        categoryIds.length
            ? prisma.category.findMany({
                  where: {
                      id: { in: categoryIds },
                  },
                  select: {
                      id: true,
                      name: true,
                  },
              })
            : [],

        faqItemIds.length
            ? prisma.faqItem.findMany({
                  where: {
                      id: { in: faqItemIds },
                  },
                  select: {
                      id: true,
                      question: true,
                  },
              })
            : [],
    ]);

    const categoriesMap = new Map(
        categories.map((item) => [item.id, item.name])
    );
    const faqItemsMap = new Map(
        faqItems.map((item) => [item.id, item.question])
    );

    const topCategoriesRanking: RankingItem[] = topCategoriesRaw.map(
        (item) => ({
            id: item.categoryId!,
            name: categoriesMap.get(item.categoryId!) ?? 'Categoria',
            total: item._count.categoryId,
        })
    );

    const topQuestionsRanking: RankingItem[] = topQuestionsRaw.map((item) => ({
        id: item.faqItemId!,
        name: faqItemsMap.get(item.faqItemId!) ?? 'Pergunta',
        total: item._count.faqItemId,
    }));

    return (
        <div className="space-y-6 w-full">
            <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <Link
                        href="/admin/report"
                        className="inline-flex items-center gap-2 text-paragraph-small text-content-secondary hover:text-content-primary"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Voltar para relatórios
                    </Link>

                    <h1 className="text-title text-content-primary mt-2">
                        Relatório de FAQ
                    </h1>

                    <p className="text-paragraph-small text-content-secondary">
                        Analise o comportamento dos clientes no fluxo de dúvidas
                        via WhatsApp.
                    </p>
                </div>

                <MonthPicker />
            </header>

            <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    title="Entradas no FAQ"
                    value={formatNumberBR(menuEntries)}
                    description="Quantas vezes o FAQ foi acessado."
                    icon={MessageCircleQuestion}
                />

                <SummaryCard
                    title="Categorias acessadas"
                    value={formatNumberBR(categoriesSelected)}
                    description="Seleções de categorias no FAQ."
                    icon={List}
                />

                <SummaryCard
                    title="Perguntas abertas"
                    value={formatNumberBR(questionsSelected)}
                    description="Perguntas selecionadas pelos clientes."
                    icon={HelpCircle}
                />

                <SummaryCard
                    title="Respostas visualizadas"
                    value={formatNumberBR(answersViewed)}
                    description="Total de respostas exibidas."
                    icon={Eye}
                />
            </section>

            <section className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <RankingCard
                    title="Categorias mais acessadas"
                    description="Top categorias com maior volume de acessos no FAQ no mês selecionado."
                    items={topCategoriesRanking}
                    emptyMessage="Nenhuma categoria acessada neste período."
                />

                <RankingCard
                    title="Perguntas mais vistas"
                    description="Top perguntas com maior volume de visualizações no FAQ no mês selecionado."
                    items={topQuestionsRanking}
                    emptyMessage="Nenhuma pergunta visualizada neste período."
                />
            </section>
        </div>
    );
}
