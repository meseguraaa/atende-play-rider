// src/app/admin/products/page.tsx
import type { Metadata } from 'next';
import { headers, cookies } from 'next/headers';

import { requireAdminForModule } from '@/lib/admin-permissions';

import { ProductNewDialog } from '@/components/admin/products/product-new-dialog/product-new-dialog';
import { ProductsResponsiveList } from '@/components/admin/products/products-responsive-list/products-responsive-list';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Produtos',
};

export type ProductForRow = {
    id: string;
    name: string;

    imageUrl: string;

    description: string | null;
    price: number;
    barberPercentage: number | null;

    // legado
    category: string | null;

    // novo
    categoryIds?: string[];
    categoryNames?: string[];
    categories?: Array<{ id: string; name: string }>;

    stockQuantity: number;
    isActive: boolean;

    pickupDeadlineDays: number;

    hasLevelPrices: boolean;
    levelDiscounts?: Partial<
        Record<'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE', number>
    >;

    isFeatured: boolean;
};

type CategoryOption = {
    id: string;
    name: string;
    isActive: boolean;
    showInProducts: boolean;
};

type ProductsApiResponse = {
    ok: boolean;
    data?: {
        products: ProductForRow[];
        categories: CategoryOption[];
    };
    error?: string;
};

function getBaseUrlFromHeaders(h: Headers) {
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? 'http';
    if (!host) return null;
    return `${proto}://${host}`;
}

function sortProductsForAdmin(a: ProductForRow, b: ProductForRow) {
    const an = String(a.name ?? '').trim();
    const bn = String(b.name ?? '').trim();
    return an.localeCompare(bn, 'pt-BR', { sensitivity: 'base' });
}

export default async function AdminProductsPage() {
    await requireAdminForModule('PRODUCTS');

    const h = await headers();
    const baseUrl = getBaseUrlFromHeaders(h);

    const cookieStore = await cookies();
    const cookieHeader = cookieStore
        .getAll()
        .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
        .join('; ');

    let products: ProductForRow[] = [];
    let categories: CategoryOption[] = [];

    try {
        const url = baseUrl
            ? `${baseUrl}/api/admin/products`
            : '/api/admin/products';

        const res = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                cookie: cookieHeader,
                accept: 'application/json',
            },
        });

        const json = (await res
            .json()
            .catch(() => null)) as ProductsApiResponse | null;

        if (res.ok && json?.ok && json.data) {
            products = json.data.products ?? [];
            categories = json.data.categories ?? [];
        }
    } catch {
        products = [];
        categories = [];
    }

    const activeProducts = products
        .filter((p) => Boolean(p.isActive))
        .slice()
        .sort(sortProductsForAdmin);

    const inactiveProducts = products
        .filter((p) => !Boolean(p.isActive))
        .slice()
        .sort(sortProductsForAdmin);

    return (
        <div className="space-y-8 max-w-7xl">
            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <h1 className="text-title text-content-primary">
                        Produtos
                    </h1>
                    <p className="text-paragraph-medium-size text-content-secondary">
                        Gerencie os produtos vendidos, estoque e categorias.
                    </p>

                    <div className="mt-3 md:hidden">
                        <ProductNewDialog categories={categories} />
                    </div>
                </div>

                <div className="hidden md:block">
                    <ProductNewDialog categories={categories} />
                </div>
            </header>

            <section className="space-y-4">
                <h2 className="text-paragraph-medium text-content-primary">
                    Produtos ativos
                </h2>

                {activeProducts.length === 0 ? (
                    <p className="text-paragraph-small text-content-secondary px-2">
                        Nenhum produto ativo no momento.
                    </p>
                ) : (
                    <ProductsResponsiveList
                        products={activeProducts}
                        categories={categories}
                    />
                )}
            </section>

            <section className="space-y-3">
                <h2 className="text-paragraph-medium text-content-primary">
                    Produtos inativos
                </h2>

                {inactiveProducts.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhum produto inativo no momento.
                        </p>
                    </div>
                ) : (
                    <ProductsResponsiveList
                        products={inactiveProducts}
                        categories={categories}
                    />
                )}
            </section>
        </div>
    );
}
