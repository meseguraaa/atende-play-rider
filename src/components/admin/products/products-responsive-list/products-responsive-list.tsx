// src/components/admin/products/products-responsive-list/products-responsive-list.tsx
'use client';

import { useEffect, useState } from 'react';

import type { ProductForRow } from '@/app/admin/products/page';
import {
    ProductRow,
    ProductRowMobile,
} from '@/components/admin/products/product-row/product-row';

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

    // ✅ Evita mismatch SSR: só decide depois do mount
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 768px)'); // md

        const update = () => setIsDesktop(mq.matches);
        update();

        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', update);
            return () => mq.removeEventListener('change', update);
        }

        // eslint-disable-next-line deprecation/deprecation
        mq.addListener(update);
        // eslint-disable-next-line deprecation/deprecation
        return () => mq.removeListener(update);
    }, []);

    const list = Array.isArray(products) ? products : [];

    // ✅ Enquanto não sabe o breakpoint, não renderiza nada (evita piscar)
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
            <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                    <col className="w-95" />
                    <col className="w-55" />
                    <col className="w-27.5" />
                    <col className="w-27.5" />
                    <col className="w-27.5" />
                    <col className="w-27.5" />
                    <col className="w-27.5" />
                    <col className="w-60" />
                </colgroup>

                <thead>
                    <tr className="border-b border-border-primary bg-background-secondary">
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Produto
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Unidade
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Preço
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Comissão
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
