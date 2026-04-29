// src/components/admin/products/product-row/product-row.tsx
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
    showInServices: boolean;
    showInProducts: boolean;
};

type ProductRowProps = {
    product: ProductForRow;
    categories?: CategoryOption[];
};

const MAX_TEXT_LENGTH = 50;

function truncate(
    text: string | null | undefined,
    max: number = MAX_TEXT_LENGTH
): string {
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
        <span
            title={title}
            className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs bg-muted/40 border-border-primary text-content-secondary"
        >
            {children}
        </span>
    );
}

function MoneyBRL(v: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `R$ ${n.toFixed(2)}`;
}

function CommissionText(v: number | null | undefined) {
    if (v === null || v === undefined) return '-';
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return `${n}%`;
}

function getCategoryText(product: ProductForRow) {
    const names = Array.isArray(product.categoryNames)
        ? product.categoryNames.filter(Boolean)
        : [];

    if (names.length > 0) return names.join(', ');
    return product.category || '—';
}

function ProductBadges({ product }: { product: ProductForRow }) {
    const birthdayBenefitEnabled = Boolean(product.birthdayBenefitEnabled);
    const hasLevelPrices = Boolean(product.hasLevelPrices);
    const isFeatured = Boolean(product.isFeatured);

    const hasAnyBadge = isFeatured || birthdayBenefitEnabled || hasLevelPrices;
    if (!hasAnyBadge) return null;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {isFeatured && (
                <Badge title="Este produto aparece no carrossel de Destaques do app.">
                    ⭐ Destaque
                </Badge>
            )}

            {hasLevelPrices && (
                <Badge title="Este produto tem descontos por nível.">
                    💎 Níveis
                </Badge>
            )}

            {birthdayBenefitEnabled && (
                <Badge title="Este produto tem benefício de aniversário.">
                    🎂 Aniversário
                </Badge>
            )}
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

    const json = (await res.json().catch(() => null)) as
        | { ok: true; data?: any }
        | { ok: false; error?: string }
        | null;

    if (!res.ok || !json || (json as any).ok !== true) {
        const msg =
            (json as any)?.error ||
            'Não foi possível alterar o status do produto.';
        return { ok: false as const, error: msg };
    }

    return { ok: true as const };
}

/**
 * ✅ DESKTOP: linha de tabela
 */
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
        <tr className="border-t border-border-primary">
            {/* NOME + FOTO */}
            <td className="px-4 py-3">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border-primary bg-background-secondary">
                        {shouldShowImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
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

                    <div className="flex min-w-0 flex-col gap-2">
                        <span className="font-medium text-content-primary leading-tight">
                            {displayName}
                        </span>

                        <ProductBadges product={product} />
                    </div>
                </div>
            </td>

            {/* UNIDADE */}
            <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                    <span className="text-content-primary">
                        {product.unitName || '—'}
                    </span>
                    <span className="text-[11px] text-content-secondary">
                        Estoque da unidade
                    </span>
                </div>
            </td>

            {/* PREÇO */}
            <td className="px-4 py-3 whitespace-nowrap">
                {MoneyBRL(product.price)}
            </td>

            {/* COMISSÃO */}
            <td className="px-4 py-3 whitespace-nowrap">
                {CommissionText(product.barberPercentage)}
            </td>

            {/* CATEGORIAS */}
            <td
                className="px-4 py-3 text-content-secondary"
                title={categoryText}
            >
                {truncate(categoryText, 70) || '—'}
            </td>

            {/* ESTOQUE */}
            <td className="px-4 py-3 whitespace-nowrap">
                {product.stockQuantity} un.
            </td>

            {/* PRAZO */}
            <td className="px-4 py-3">
                <span className="text-content-primary">{deadlineText}</span>
                <span className="block text-[11px] text-content-secondary">
                    Retirada
                </span>
            </td>

            {/* AÇÕES */}
            <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-3">
                    <ProductEditDialog
                        product={product}
                        categories={categories}
                    />

                    <Button
                        variant={product.isActive ? 'destructive' : 'active'}
                        size="sm"
                        type="button"
                        className="border-border-primary hover:bg-muted/40"
                        onClick={handleToggleActive}
                        disabled={isPending}
                        title={isPending ? 'Processando...' : undefined}
                    >
                        {isPending
                            ? 'Aguarde...'
                            : product.isActive
                              ? 'Desativar'
                              : 'Ativar'}
                    </Button>
                </div>
            </td>
        </tr>
    );
}

/**
 * ✅ MOBILE: card
 */
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
        <div className="rounded-xl border border-border-primary bg-background-tertiary overflow-hidden">
            <div className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border-primary bg-background-secondary">
                        {shouldShowImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
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
                        <div className="min-w-0">
                            <p className="text-paragraph-medium-size font-semibold text-content-primary truncate">
                                {displayName}
                            </p>
                            <p className="text-xs text-content-secondary truncate">
                                {product.unitName || '—'}
                            </p>
                        </div>

                        <ProductBadges product={product} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                        <p className="text-content-tertiary">Preço</p>
                        <p className="text-content-primary font-medium">
                            {MoneyBRL(product.price)}
                        </p>
                    </div>

                    <div className="space-y-1">
                        <p className="text-content-tertiary">Comissão</p>
                        <p className="text-content-primary font-medium">
                            {CommissionText(product.barberPercentage)}
                        </p>
                    </div>

                    <div className="space-y-1">
                        <p className="text-content-tertiary">Categorias</p>
                        <p
                            className="text-content-secondary truncate"
                            title={categoryText}
                        >
                            {categoryText}
                        </p>
                    </div>

                    <div className="space-y-1">
                        <p className="text-content-tertiary">Estoque</p>
                        <p className="text-content-secondary">
                            {product.stockQuantity} un.
                        </p>
                    </div>

                    <div className="space-y-1">
                        <p className="text-content-tertiary">Prazo</p>
                        <p className="text-content-secondary">{deadlineText}</p>
                    </div>
                </div>

                <div className="pt-2 space-y-2">
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
                            title={isPending ? 'Processando...' : undefined}
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
