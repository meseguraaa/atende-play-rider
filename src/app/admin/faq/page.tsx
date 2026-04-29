import type { Metadata } from 'next';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

import { FaqNewDialog } from '@/components/admin/faq/faq-new-dialog/faq-new-dialog';
import { FaqResponsiveList } from '@/components/admin/faq/faq-responsive-list/faq-responsive-list';

import type { FaqRowItem } from '@/components/admin/faq/faq-row/faq-row';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Dúvidas',
};

type SessionWithAdminContext = {
    companyId?: string;
    unitId?: string | null;
};

export default async function AdminFaqPage() {
    const session = (await requireAdminForModule(
        'FAQ'
    )) as unknown as SessionWithAdminContext;

    const companyId = session.companyId?.trim();

    if (!companyId) {
        return (
            <div className="space-y-8 max-w-7xl">
                <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-title text-content-primary">
                            Dúvidas
                        </h1>
                        <p className="text-paragraph-medium text-content-secondary">
                            Gerencie perguntas e respostas que aparecem no
                            WhatsApp para tirar dúvidas dos clientes.
                        </p>

                        <div className="mt-3 md:hidden">
                            <FaqNewDialog />
                        </div>
                    </div>

                    <div className="hidden md:block">
                        <FaqNewDialog />
                    </div>
                </header>

                <section className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                    <p className="text-paragraph-small text-content-secondary text-center">
                        Sessão sem <b>companyId</b>. Este painel é multi-tenant:
                        vincule o admin a uma empresa.
                    </p>
                </section>
            </div>
        );
    }

    const faqItems = await prisma.faqItem.findMany({
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
            category: {
                select: {
                    name: true,
                },
            },
        },
    });

    const rows: FaqRowItem[] = faqItems.map((item) => ({
        id: item.id,
        companyId: item.companyId,
        categoryId: item.categoryId,
        categoryName: item.category.name,
        question: item.question,
        answer: item.answer,
        sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : 100,
        isActive: Boolean(item.isActive),
    }));

    return (
        <div className="space-y-8 max-w-7xl">
            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <h1 className="text-title text-content-primary">Dúvidas</h1>
                    <p className="text-paragraph-medium text-content-secondary">
                        Gerencie perguntas e respostas que aparecem no WhatsApp
                        para tirar dúvidas dos clientes.
                    </p>

                    <div className="mt-3 md:hidden">
                        <FaqNewDialog />
                    </div>
                </div>

                <div className="hidden md:block">
                    <FaqNewDialog />
                </div>
            </header>

            <section className="space-y-4">
                <h2 className="text-paragraph-medium text-content-primary">
                    Lista de dúvidas
                </h2>

                <FaqResponsiveList faqs={rows} />
            </section>
        </div>
    );
}
