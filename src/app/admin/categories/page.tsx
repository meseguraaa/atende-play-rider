// src/app/admin/categories/page.tsx
import type { Metadata } from 'next';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

import { CategoryNewDialog } from '@/components/admin/categories/category-new-dialog/category-new-dialog';
import { CategoriesResponsiveList } from '@/components/admin/categories/categories-responsive-list/categories-responsive-list';
import type { CategoryRowItem } from '@/components/admin/categories/category-row/category-row';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Categorias',
};

type SessionWithCompanyId = { companyId?: string };

export default async function AdminCategoriesPage() {
    const session = (await requireAdminForModule(
        'CATEGORIES'
    )) as unknown as SessionWithCompanyId;

    const companyId = session.companyId?.trim();

    if (!companyId) {
        return (
            <div className="space-y-8 max-w-7xl">
                <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-title text-content-primary">
                            Categorias
                        </h1>
                        <p className="text-paragraph-medium text-content-secondary">
                            Gerencie as categorias usadas em serviços e
                            produtos.
                        </p>

                        {/* ✅ MOBILE */}
                        <div className="mt-3 md:hidden">
                            <CategoryNewDialog />
                        </div>
                    </div>

                    {/* ✅ DESKTOP */}
                    <div className="hidden md:block">
                        <CategoryNewDialog />
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

    const categories = await prisma.category.findMany({
        where: { companyId },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        select: {
            id: true,
            companyId: true,
            name: true,
            isActive: true,
            showInProducts: true,
            showInFaq: true,
            _count: {
                select: {
                    productLinks: true,
                    faqItems: true,
                },
            },
        },
    });

    const rows: CategoryRowItem[] = categories.map((c) => ({
        id: c.id,
        companyId: c.companyId,
        name: c.name,
        isActive: Boolean(c.isActive),
        showInProducts: Boolean(c.showInProducts),
        showInFaq: Boolean(c.showInFaq),
        productsCount: c._count.productLinks,
        faqCount: c._count.faqItems,
    }));

    const activeRows = rows.filter((r) => r.isActive);
    const inactiveRows = rows.filter((r) => !r.isActive);

    return (
        <div className="space-y-8 max-w-7xl">
            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <h1 className="text-title text-content-primary">
                        Categorias
                    </h1>
                    <p className="text-paragraph-medium text-content-secondary">
                        Gerencie as categorias usadas em serviços e produtos.
                    </p>

                    {/* ✅ MOBILE: botão abaixo do texto */}
                    <div className="mt-3 md:hidden">
                        <CategoryNewDialog />
                    </div>
                </div>

                {/* ✅ DESKTOP: botão à direita */}
                <div className="hidden md:block">
                    <CategoryNewDialog />
                </div>
            </header>

            {/* ===== ATIVAS ===== */}
            <section className="space-y-4">
                <h2 className="text-paragraph-medium text-content-primary">
                    Categorias ativas
                </h2>

                {activeRows.length === 0 ? (
                    <p className="text-paragraph-small text-content-secondary px-2">
                        Nenhuma categoria ativa no momento.
                    </p>
                ) : (
                    <CategoriesResponsiveList categories={activeRows} />
                )}
            </section>

            {/* ===== INATIVAS ===== */}
            <section className="space-y-3">
                <h2 className="text-paragraph-medium text-content-primary">
                    Categorias inativas
                </h2>

                {inactiveRows.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhuma categoria inativa no momento.
                        </p>
                    </div>
                ) : (
                    <CategoriesResponsiveList categories={inactiveRows} />
                )}
            </section>
        </div>
    );
}
