// src/app/api/admin/products/[productId]/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

type UpdateProductPayload = {
    name?: string;
    imageUrl?: string;
    description?: string;

    price?: number | string;

    category?: string;
    categoryIds?: string[];

    stockQuantity?: number | string;
    pickupDeadlineDays?: number | string;

    isFeatured?: boolean;
};

type PatchPayload =
    | {
          toggleActive: true;
      }
    | {
          update: UpdateProductPayload;
      };

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function normalizeString(raw: unknown) {
    const s = String(raw ?? '').trim();
    return s.length ? s : '';
}

function uniqStrings(values: unknown): string[] {
    if (!Array.isArray(values)) return [];

    const out: string[] = [];
    const seen = new Set<string>();

    for (const v of values) {
        const s = typeof v === 'string' ? v.trim() : '';
        if (!s || seen.has(s)) continue;

        seen.add(s);
        out.push(s);
    }

    return out;
}

function toInt(
    raw: unknown,
    fallback: number,
    opts?: { min?: number; max?: number }
) {
    const n =
        typeof raw === 'number'
            ? raw
            : Number(
                  String(raw ?? '')
                      .trim()
                      .replace(',', '.')
              );

    if (!Number.isFinite(n)) return fallback;

    const i = Math.floor(n);
    const min = opts?.min ?? -Infinity;
    const max = opts?.max ?? Infinity;

    return Math.max(min, Math.min(max, i));
}

function toMoneyNumber(raw: unknown): number {
    const s = String(raw ?? '')
        .trim()
        .replace(/\s/g, '')
        .replace(',', '.');

    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}

function isValidImageUrl(imageUrl: string) {
    const s = String(imageUrl ?? '').trim();
    if (!s) return false;

    const lowered = s.toLowerCase();

    if (lowered.startsWith('javascript:')) return false;
    if (lowered.startsWith('data:')) return false;
    if (lowered.startsWith('blob:')) return false;

    if (s.startsWith('/uploads/')) return true;
    if (s.startsWith('/media/')) return true;

    if (lowered.startsWith('http://') || lowered.startsWith('https://')) {
        return true;
    }

    return false;
}

export async function PATCH(
    request: Request,
    ctx: { params: Promise<{ productId: string }> }
) {
    try {
        const session = await requireAdminForModule('PRODUCTS');

        const companyId = normalizeString((session as any)?.companyId);
        if (!companyId) {
            return jsonErr(
                'Contexto inválido: companyId ausente (multi-tenant).',
                401
            );
        }

        const { productId } = await ctx.params;
        const id = normalizeString(productId);

        if (!id) return jsonErr('productId é obrigatório.', 400);

        const body = (await request
            .json()
            .catch(() => null)) as PatchPayload | null;

        if (!body) return jsonErr('Body inválido.', 400);

        const current = await prisma.product.findFirst({
            where: {
                id,
                companyId,
            },
            select: {
                id: true,
                isActive: true,
                isFeatured: true,
                name: true,
                imageUrl: true,
                description: true,
                legacyCategory: true,
                price: true,
                stockQuantity: true,
                pickupDeadlineDays: true,
                categories: {
                    select: {
                        categoryId: true,
                        category: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        if (!current) {
            return jsonErr('Produto não encontrado.', 404);
        }

        if ('toggleActive' in body && body.toggleActive === true) {
            const updated = await prisma.product.update({
                where: { id: current.id },
                data: { isActive: !current.isActive },
                select: { id: true, isActive: true },
            });

            return jsonOk({ id: updated.id, isActive: updated.isActive });
        }

        if (
            !('update' in body) ||
            !body.update ||
            typeof body.update !== 'object'
        ) {
            return jsonErr('Patch inválido.', 400);
        }

        const u = body.update;

        const name =
            u.name !== undefined ? normalizeString(u.name) : current.name;

        let imageUrl = current.imageUrl ?? '';
        if (u.imageUrl !== undefined) {
            const raw = String(u.imageUrl ?? '').trim();
            const lowered = raw.toLowerCase();

            if (!raw) {
                imageUrl = '';
            } else if (lowered.startsWith('blob:')) {
                imageUrl = current.imageUrl ?? '';
            } else {
                if (!isValidImageUrl(raw)) {
                    return jsonErr(
                        'imageUrl inválida. Use /media/... (do nosso upload), /uploads/... (legado) ou uma URL http(s) válida.',
                        400
                    );
                }

                imageUrl = raw;
            }
        }

        const description =
            u.description !== undefined
                ? normalizeString(u.description)
                : current.description;

        const legacyCategoryInput =
            u.category !== undefined
                ? normalizeString(u.category)
                : current.legacyCategory;

        const nextCategoryIdsRaw =
            u.categoryIds !== undefined
                ? uniqStrings(u.categoryIds)
                : undefined;

        if (!name) return jsonErr('Nome é obrigatório.', 400);
        if (!description) return jsonErr('Descrição é obrigatória.', 400);

        if (
            nextCategoryIdsRaw !== undefined &&
            nextCategoryIdsRaw.length === 0
        ) {
            return jsonErr('Selecione pelo menos 1 categoria.', 400);
        }

        const priceRaw =
            u.price !== undefined ? u.price : Number(current.price);

        const price = toMoneyNumber(priceRaw);
        if (!Number.isFinite(price) || price <= 0) {
            return jsonErr('Preço inválido.', 400);
        }

        const stockRaw =
            u.stockQuantity !== undefined
                ? u.stockQuantity
                : current.stockQuantity;

        const stockQuantity = toInt(stockRaw, 0, {
            min: 0,
            max: 1_000_000,
        });

        const deadlineRaw =
            u.pickupDeadlineDays !== undefined
                ? u.pickupDeadlineDays
                : (current.pickupDeadlineDays ?? 2);

        const pickupDeadlineDays = toInt(deadlineRaw, 2, {
            min: 1,
            max: 30,
        });

        const isFeatured =
            typeof u.isFeatured === 'boolean'
                ? u.isFeatured
                : Boolean(current.isFeatured);

        let validCategoryIds: string[] | undefined = undefined;
        let resolvedLegacyCategory = legacyCategoryInput || '';

        if (nextCategoryIdsRaw !== undefined) {
            const validCategories = await prisma.category.findMany({
                where: {
                    companyId,
                    id: { in: nextCategoryIdsRaw },
                    isActive: true,
                    showInProducts: true,
                },
                select: {
                    id: true,
                    name: true,
                },
            });

            if (validCategories.length === 0) {
                return jsonErr('Nenhuma categoria válida selecionada.', 400);
            }

            validCategoryIds = validCategories.map((c) => c.id);
            resolvedLegacyCategory =
                legacyCategoryInput || validCategories[0]?.name || '';
        } else {
            const currentCategoryNames = (current.categories ?? [])
                .map((c) => c.category?.name)
                .filter(Boolean) as string[];

            resolvedLegacyCategory =
                legacyCategoryInput || currentCategoryNames[0] || '';
        }

        if (!resolvedLegacyCategory) {
            return jsonErr('Categoria é obrigatória.', 400);
        }

        const updated = await prisma.$transaction(async (tx) => {
            const prod = await tx.product.update({
                where: { id: current.id },
                data: {
                    name,
                    imageUrl,
                    description,
                    legacyCategory: resolvedLegacyCategory,
                    price,
                    stockQuantity,
                    pickupDeadlineDays,
                    isFeatured,
                },
                select: {
                    id: true,
                    isActive: true,
                    isFeatured: true,
                    name: true,
                    imageUrl: true,
                    description: true,
                    legacyCategory: true,
                    price: true,
                    stockQuantity: true,
                    pickupDeadlineDays: true,
                    categories: {
                        select: {
                            category: {
                                select: {
                                    id: true,
                                    name: true,
                                },
                            },
                        },
                    },
                },
            });

            if (validCategoryIds !== undefined) {
                await tx.productCategory.deleteMany({
                    where: {
                        companyId,
                        productId: current.id,
                    },
                });

                await tx.productCategory.createMany({
                    data: validCategoryIds.map((categoryId) => ({
                        companyId,
                        productId: current.id,
                        categoryId,
                    })),
                    skipDuplicates: true,
                });
            }

            return prod;
        });

        const categoryItems = (updated.categories ?? [])
            .map((link) => link.category)
            .filter(Boolean)
            .map((c) => ({
                id: c.id,
                name: c.name,
            }));

        return jsonOk({
            id: updated.id,
            product: {
                id: updated.id,
                name: updated.name,
                imageUrl: updated.imageUrl,
                description: updated.description,
                price: Number(updated.price),

                category: updated.legacyCategory,

                categories: categoryItems,
                categoryIds: categoryItems.map((c) => c.id),
                categoryNames: categoryItems.map((c) => c.name),

                stockQuantity: updated.stockQuantity,
                isActive: updated.isActive,
                pickupDeadlineDays: updated.pickupDeadlineDays ?? 2,
                isFeatured: Boolean(updated.isFeatured),

                // compat temporária com UI antiga
                unitId: null,
                unitName: '—',
                birthdayBenefitEnabled: false,
                birthdayPriceLevel: null,
                hasLevelPrices: false,
                levelDiscounts: {},
            },
        });
    } catch {
        return jsonErr('Sem permissão para editar produtos.', 403);
    }
}
