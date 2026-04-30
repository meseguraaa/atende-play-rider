'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CategoryEditDialog } from '@/components/admin/categories/category-edit-dialog/category-edit-dialog';

import type { CategoryRowItem } from '@/components/admin/categories/category-row/category-row';
import {
    CategoryRow,
    patchCategory,
} from '@/components/admin/categories/category-row/category-row';

/* --------------------------------------------- */
function useMediaQuery(query: string) {
    const getMatch = React.useCallback(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(query).matches;
    }, [query]);

    const [matches, setMatches] = React.useState<boolean>(() => getMatch());

    React.useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = () => setMatches(mql.matches);

        setMatches(mql.matches);

        if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', onChange);
            return () => mql.removeEventListener('change', onChange);
        }

        mql.addListener(onChange);
        return () => mql.removeListener(onChange);
    }, [query]);

    return matches;
}

/* --------------------------------------------- */

function CategoryCard({ category }: { category: CategoryRowItem }) {
    const router = useRouter();

    const isActive = Boolean(category.isActive);
    const [isToggling, setIsToggling] = React.useState(false);

    const categoryLikeForDialog = React.useMemo(
        () => ({
            id: category.id,
            companyId: category.companyId ?? null,
            name: category.name,
            showInProducts: Boolean(category.showInProducts),
            showInFaq: Boolean(category.showInFaq),
            isActive: Boolean(category.isActive),
        }),
        [category]
    );

    async function handleToggleActive() {
        if (isToggling) return;

        setIsToggling(true);

        const res = await patchCategory(category.id, { isActive: !isActive });

        setIsToggling(false);

        if (!res.ok) {
            toast.error(res.error);
            return;
        }

        toast.success(
            isActive ? 'Categoria desativada!' : 'Categoria ativada!'
        );
        router.refresh();
    }

    return (
        <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3">
            <p className="text-paragraph-medium-size font-semibold text-content-primary">
                {category.name}
            </p>

            <div className="grid grid-cols-2 gap-3">
                <Info label="Produtos" value={category.showInProducts} />
                <Info label="FAQ" value={category.showInFaq} />

                <Count
                    label="Produtos vinculados"
                    value={category.productsCount}
                />
                <Count label="FAQ usado" value={category.faqCount} />
            </div>

            <div className="flex flex-col gap-2 pt-1">
                <CategoryEditDialog category={categoryLikeForDialog} />

                <Button
                    variant={isActive ? 'destructive' : 'active'}
                    size="sm"
                    onClick={handleToggleActive}
                    disabled={isToggling}
                    className="w-full"
                >
                    {isToggling
                        ? 'Salvando...'
                        : isActive
                          ? 'Desativar'
                          : 'Ativar'}
                </Button>
            </div>
        </div>
    );
}

function Info({ label, value }: { label: string; value: boolean }) {
    return (
        <div>
            <p className="text-[11px] text-content-tertiary">{label}</p>
            <p className="text-paragraph-small text-content-primary font-medium">
                {value ? 'Sim' : 'Não'}
            </p>
        </div>
    );
}

function Count({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <p className="text-[11px] text-content-tertiary">{label}</p>
            <p className="text-paragraph-small text-content-primary font-medium">
                {value}
            </p>
        </div>
    );
}

/* --------------------------------------------- */

export function CategoriesResponsiveList({
    categories,
}: {
    categories: CategoryRowItem[];
}) {
    const list = Array.isArray(categories) ? categories : [];

    const isDesktop = useMediaQuery('(min-width: 768px)');

    if (!isDesktop) {
        return (
            <section className="space-y-2">
                {list.length === 0 ? (
                    <Empty />
                ) : (
                    list.map((c) => <CategoryCard key={c.id} category={c} />)
                )}
            </section>
        );
    }

    return (
        <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
            <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                    <col className="w-60" />
                    <col className="w-20" />
                    <col className="w-20" />
                    <col className="w-20" />
                    <col className="w-20" />
                    <col className="w-27.5" />
                </colgroup>

                <thead>
                    <tr className="border-b border-border-primary bg-background-secondary">
                        <Th>Categoria</Th>
                        <Th>Produtos</Th>
                        <Th>FAQ</Th>
                        <Th>Vínc. produtos</Th>
                        <Th>Vínc. FAQ</Th>
                        <Th align="right">Ações</Th>
                    </tr>
                </thead>

                <tbody>
                    {list.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="px-4 py-6 text-center">
                                Nenhuma categoria cadastrada ainda.
                            </td>
                        </tr>
                    ) : (
                        list.map((category) => (
                            <CategoryRow
                                key={category.id}
                                category={category}
                            />
                        ))
                    )}
                </tbody>
            </table>
        </section>
    );
}

/* --------------------------------------------- */

function Th({
    children,
    align = 'left',
}: {
    children: React.ReactNode;
    align?: 'left' | 'right';
}) {
    return (
        <th
            className={`px-4 py-3 text-xs text-content-secondary text-${align}`}
        >
            {children}
        </th>
    );
}

function Empty() {
    return (
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6 text-center text-content-secondary">
            Nenhuma categoria cadastrada ainda.
        </div>
    );
}
