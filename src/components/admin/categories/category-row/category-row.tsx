'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CategoryEditDialog } from '@/components/admin/categories/category-edit-dialog/category-edit-dialog';

export type CategoryRowItem = {
    id: string;
    companyId: string;
    name: string;
    isActive: boolean;
    showInProducts: boolean;
    showInFaq: boolean;
    productsCount: number;
    faqCount: number;
};

type CategoryRowProps = {
    category: CategoryRowItem;
};

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error?: string };

export async function patchCategory(
    categoryId: string,
    payload: Record<string, unknown>
) {
    const res = await fetch(`/api/admin/categories/${categoryId}`, {
        method: 'PATCH',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => null)) as
        | ApiOk<unknown>
        | ApiErr
        | null;

    if (!res.ok || !json || json.ok !== true) {
        const msg =
            (json && json.ok === false && json.error) ||
            'Não foi possível salvar.';
        return { ok: false as const, error: msg };
    }

    return { ok: true as const, data: json.data };
}

export function CategoryRow({ category }: CategoryRowProps) {
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
        <tr className="border-t border-border-primary">
            <td className="px-4 py-3">
                <p className="text-paragraph-medium-size text-content-primary">
                    {category.name}
                </p>
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {category.showInProducts ? 'Sim' : 'Não'}
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {category.showInFaq ? 'Sim' : 'Não'}
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {category.productsCount}
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {category.faqCount}
            </td>

            <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                    <CategoryEditDialog category={categoryLikeForDialog} />

                    <Button
                        variant={isActive ? 'destructive' : 'active'}
                        size="sm"
                        type="button"
                        onClick={handleToggleActive}
                        disabled={isToggling}
                        className="border-border-primary hover:bg-muted/40"
                        title={
                            isToggling
                                ? 'Salvando...'
                                : isActive
                                  ? 'Desativar categoria'
                                  : 'Ativar categoria'
                        }
                    >
                        {isToggling
                            ? 'Salvando...'
                            : isActive
                              ? 'Desativar'
                              : 'Ativar'}
                    </Button>
                </div>
            </td>
        </tr>
    );
}
