'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { ProductForRow } from '@/app/admin/products/page';
import { Button } from '@/components/ui/button';
import { ProductEditDialog } from '@/components/admin/products/product-edit-dialog/product-edit-dialog';

type CategoryOption = {
    id: string;
    name: string;
    isActive: boolean;
    showInProducts: boolean;
};

type ProductRowProps = {
    product: ProductForRow;
    categories?: CategoryOption[];
};

const MAX_TEXT_LENGTH = 50;

function truncate(text: string | null | undefined, max = MAX_TEXT_LENGTH) {
    if (!text) return '';
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + '…';
}

function formatDeadline(days: number) {
    if (!Number.isFinite(days) || days <= 0) return '—';
    if (days === 1) return '1 dia';
    return `${days} dias`;
}

function Badge({
    children,
    title,
}: {
    children: React.ReactNode;
    title?: string;
}) {
    return (
        <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs bg-muted/40 border-border-primary text-content-secondary">
            {children}
        </span>
    );
}

function MoneyBRL(v: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `R$ ${n.toFixed(2)}`;
}

function getCategoryText(product: ProductForRow) {
    const names = Array.isArray(product.categoryNames)
        ? product.categoryNames.filter(Boolean)
        : [];

    if (names.length > 0) return names.join(', ');
    return product.category || '—';
}

function ProductBadges({ product }: { product: ProductForRow }) {
    if (!product.isFeatured) return null;

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Badge>⭐ Destaque</Badge>
        </div>
    );
}

function useSafeProductImage(imageUrl: string) {
    const [imgFailed, setImgFailed] = React.useState(false);
    const imgSrc = String(imageUrl ?? '').trim();
    const shouldShowImg = Boolean(imgSrc) && !imgFailed;

    React.useEffect(() => {
        setImgFailed(false);
    }, [imgSrc]);

    return { imgSrc, shouldShowImg, setImgFailed };
}

async function toggleProductActive(productId: string) {
    const res = await fetch(`/api/admin/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggleActive: true }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
        return { ok: false as const, error: 'Erro ao atualizar produto' };
    }

    return { ok: true as const };
}

export function ProductRow({ product, categories = [] }: ProductRowProps) {
    const router = useRouter();
    const [isPending, startTransition] = React.useTransition();

    const displayName = truncate(product.name);
    const deadlineText = formatDeadline(product.pickupDeadlineDays);
    const categoryText = getCategoryText(product);

    const { imgSrc, shouldShowImg, setImgFailed } = useSafeProductImage(
        product.imageUrl
    );

    function handleToggleActive() {
        startTransition(async () => {
            const out = await toggleProductActive(product.id);

            if (!out.ok) {
                toast.error(out.error);
                return;
            }

            toast.success(
                product.isActive ? 'Produto desativado.' : 'Produto ativado.'
            );

            router.refresh();
        });
    }

    return (
        <tr className="border-t border-border-primary">
            <td className="px-4 py-3">
                <div className="flex min-w-0 items-center gap-4">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border-primary">
                        {shouldShowImg ? (
                            <img
                                src={imgSrc}
                                className="h-full w-full object-cover"
                                onError={() => setImgFailed(true)}
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs">
                                Sem foto
                            </div>
                        )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <span className="truncate font-medium">
                            {displayName}
                        </span>

                        <ProductBadges product={product} />
                    </div>
                </div>
            </td>

            <td className="px-4 py-3 whitespace-nowrap">
                {MoneyBRL(product.price)}
            </td>

            <td className="px-4 py-3 truncate" title={categoryText}>
                {categoryText || '—'}
            </td>

            <td className="px-4 py-3 whitespace-nowrap">
                {product.stockQuantity} un.
            </td>

            <td className="px-4 py-3 whitespace-nowrap">
                {deadlineText}
                <span className="block text-xs text-content-secondary">
                    Retirada
                </span>
            </td>

            <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                    <ProductEditDialog
                        product={product}
                        categories={categories}
                    />

                    <Button
                        variant={product.isActive ? 'destructive' : 'default'}
                        size="sm"
                        onClick={handleToggleActive}
                        disabled={isPending}
                    >
                        {product.isActive ? 'Desativar' : 'Ativar'}
                    </Button>
                </div>
            </td>
        </tr>
    );
}

export function ProductRowMobile({
    product,
    categories = [],
}: ProductRowProps) {
    const router = useRouter();
    const [isPending, startTransition] = React.useTransition();

    const displayName = truncate(product.name, 80);
    const deadlineText = formatDeadline(product.pickupDeadlineDays);
    const categoryText = getCategoryText(product);

    const { imgSrc, shouldShowImg, setImgFailed } = useSafeProductImage(
        product.imageUrl
    );

    function handleToggleActive() {
        startTransition(async () => {
            try {
                const out = await toggleProductActive(product.id);

                if (!out.ok) {
                    toast.error(out.error);
                    return;
                }

                toast.success(
                    product.isActive
                        ? 'Produto desativado.'
                        : 'Produto ativado.'
                );

                router.refresh();
            } catch {
                toast.error('Erro de rede ao alterar status do produto.');
            }
        });
    }

    return (
        <div className="overflow-hidden rounded-xl border border-border-primary bg-background-tertiary">
            <div className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border-primary bg-background-secondary">
                        {shouldShowImg ? (
                            <img
                                src={imgSrc}
                                alt={product.name}
                                className="h-full w-full object-cover"
                                onError={() => setImgFailed(true)}
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-content-secondary">
                                Sem foto
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                        <p className="truncate text-paragraph-medium-size font-semibold text-content-primary">
                            {displayName}
                        </p>

                        <ProductBadges product={product} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                    <Info label="Preço" value={MoneyBRL(product.price)} />

                    <Info
                        label="Categorias"
                        value={categoryText}
                        title={categoryText}
                    />

                    <Info
                        label="Estoque"
                        value={`${product.stockQuantity} un.`}
                    />

                    <Info label="Prazo" value={deadlineText} />
                </div>

                <div className="space-y-2 pt-2">
                    <p className="text-xs text-content-tertiary">Ações</p>

                    <div className="flex flex-wrap gap-2">
                        <ProductEditDialog
                            product={product}
                            categories={categories}
                        />

                        <Button
                            variant={
                                product.isActive ? 'destructive' : 'active'
                            }
                            size="sm"
                            type="button"
                            className="border-border-primary hover:bg-muted/40"
                            onClick={handleToggleActive}
                            disabled={isPending}
                        >
                            {isPending
                                ? 'Aguarde...'
                                : product.isActive
                                  ? 'Desativar'
                                  : 'Ativar'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Info({
    label,
    value,
    title,
}: {
    label: string;
    value: string;
    title?: string;
}) {
    return (
        <div className="space-y-1">
            <p className="text-content-tertiary">{label}</p>
            <p className="truncate text-content-secondary" title={title}>
                {value}
            </p>
        </div>
    );
}
