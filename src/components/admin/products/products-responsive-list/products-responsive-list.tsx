'use client';

import { useEffect, useState } from 'react';

import type { ProductForRow } from '@/app/admin/products/page';
import { ProductRow } from '@/components/admin/products/product-row/product-row';

type CategoryOption = {
    id: string;
    name: string;
    isActive: boolean;
    showInProducts: boolean;
};

export function ProductsResponsiveList({
    products,
    categories = [],
}: {
    products: ProductForRow[];
    categories?: CategoryOption[];
}) {
    const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 768px)');

        const update = () => setIsDesktop(mq.matches);
        update();

        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', update);
            return () => mq.removeEventListener('change', update);
        }

        mq.addListener(update);
        return () => mq.removeListener(update);
    }, []);

    const list = Array.isArray(products) ? products : [];

    if (isDesktop === null) return null;

    if (!isDesktop) {
        return (
            <div className="space-y-2">
                {list.map((product) => (
                    <ProductRowMobile
                        key={product.id}
                        product={product}
                        categories={categories}
                    />
                ))}
            </div>
        );
    }

    return (
        <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
            <table className="min-w-250 w-full border-collapse text-sm">
                <colgroup>
                    <col className="w-90" />
                    <col className="w-35" />
                    <col className="w-35" />
                    <col className="w-35" />
                    <col className="w-35" />
                    <col className="w-60" />
                </colgroup>

                <thead>
                    <tr className="border-b border-border-primary bg-background-secondary">
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Produto
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Preço
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Categorias
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Estoque
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Prazo
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                            Ações
                        </th>
                    </tr>
                </thead>

                <tbody className="[&>tr>td]:align-middle">
                    {list.map((product) => (
                        <ProductRow
                            key={product.id}
                            product={product}
                            categories={categories}
                        />
                    ))}
                </tbody>
            </table>
        </section>
    );
}
