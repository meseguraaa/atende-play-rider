// src/app/api/admin/products/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

type CategoryOption = {
    id: string;
    name: string;
    isActive: boolean;
    showInProducts: boolean;
};

type CreateProductPayload = {
    name?: string;
    imageUrl?: string;
    description?: string;

    price?: number | string;

    // legado
    category?: string;

    // novo
    categoryIds?: string[];

    stockQuantity?: number | string;
    pickupDeadlineDays?: number | string;

    isActive?: boolean;
    isFeatured?: boolean;
};

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
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

function normalizeString(raw: unknown) {
    const s = String(raw ?? '').trim();
    return s.length ? s : '';
}

function normalizeNullableString(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    return s.length ? s : null;
}

function uniqStrings(values: unknown): string[] {
    if (!Array.isArray(values)) return [];

    const out: string[] = [];
    const seen = new Set<string>();

    for (const v of values) {
        const s = typeof v === 'string' ? v.trim() : '';
        if (!s) continue;
        if (seen.has(s)) continue;

        seen.add(s);
        out.push(s);
    }

    return out;
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

export async function GET(_request: Request) {
    try {
        const session = await requireAdminForModule('PRODUCTS');

        const companyId = String((session as any)?.companyId ?? '').trim();
        if (!companyId) {
            return jsonErr(
                'Contexto inválido: companyId ausente (multi-tenant).',
                401
            );
        }

        const [categories, productsPrisma] = await Promise.all([
            prisma.category.findMany({
                where: { companyId },
                orderBy: { name: 'asc' },
                select: {
                    id: true,
                    name: true,
                    isActive: true,
                    showInProducts: true,
                },
            }),

            prisma.product.findMany({
                where: {
                    companyId,
                },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                    description: true,
                    price: true,
                    legacyCategory: true,
                    stockQuantity: true,
                    isActive: true,
                    pickupDeadlineDays: true,
                    isFeatured: true,
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
            }),
        ]);

        const categoriesUI: CategoryOption[] = categories.map((c) => ({
            id: c.id,
            name: c.name,
            isActive: c.isActive,
            showInProducts: c.showInProducts,
        }));

        const products = productsPrisma.map((p) => {
            const pickupDeadlineDays =
                typeof p.pickupDeadlineDays === 'number' &&
                Number.isFinite(p.pickupDeadlineDays) &&
                p.pickupDeadlineDays > 0
                    ? p.pickupDeadlineDays
                    : 2;

            const categoryItems = (p.categories ?? [])
                .map((link) => link.category)
                .filter(Boolean)
                .map((c) => ({
                    id: c.id,
                    name: c.name,
                }));

            return {
                id: p.id,
                name: p.name,
                imageUrl: String(p.imageUrl ?? ''),
                description: p.description,
                price: Number(p.price),

                // legado
                category: p.legacyCategory ?? '',

                // novo
                categories: categoryItems,
                categoryIds: categoryItems.map((c) => c.id),
                categoryNames: categoryItems.map((c) => c.name),

                stockQuantity: p.stockQuantity,
                isActive: p.isActive,
                pickupDeadlineDays,
                isFeatured: Boolean(p.isFeatured),

                // compat temporária com UI antiga
                hasLevelPrices: false,
                levelDiscounts: {},
                birthdayBenefitEnabled: false,
                birthdayPriceLevel: null,
                unitId: null,
                unitName: '—',
            };
        });

        return jsonOk({
            products,
            units: [],
            activeUnitId: null,
            categories: categoriesUI,
        });
    } catch {
        return jsonErr('Sem permissão para acessar Produtos.', 403);
    }
}

export async function POST(request: Request) {
    try {
        const session = await requireAdminForModule('PRODUCTS');

        const companyId = String((session as any)?.companyId ?? '').trim();
        if (!companyId) {
            return jsonErr(
                'Contexto inválido: companyId ausente (multi-tenant).',
                401
            );
        }

        const body = (await request
            .json()
            .catch(() => null)) as CreateProductPayload | null;

        if (!body) return jsonErr('Body inválido.');

        const name = normalizeString(body.name);
        const imageUrl = normalizeNullableString(body.imageUrl);
        const description = normalizeString(body.description);

        // legado
        const legacyCategoryInput = normalizeString(body.category);

        // novo
        const categoryIds = uniqStrings(body.categoryIds);

        if (!name) return jsonErr('Nome é obrigatório.');

        if (imageUrl && !isValidImageUrl(imageUrl)) {
            return jsonErr(
                'imageUrl inválida. Envie uma imagem (upload) ou forneça uma URL http(s) válida.',
                400
            );
        }

        if (!description) return jsonErr('Descrição é obrigatória.');

        if (categoryIds.length === 0) {
            return jsonErr('Selecione pelo menos 1 categoria.', 400);
        }

        const price = toMoneyNumber(body.price);
        if (!Number.isFinite(price) || price <= 0) {
            return jsonErr('Preço inválido.');
        }

        const stockQuantity = toInt(body.stockQuantity, 0, {
            min: 0,
            max: 1_000_000,
        });

        const pickupDeadlineDays = toInt(body.pickupDeadlineDays, 2, {
            min: 1,
            max: 30,
        });

        const isActive =
            typeof body.isActive === 'boolean' ? body.isActive : true;

        const isFeatured = Boolean(body.isFeatured);

        const validCategories = await prisma.category.findMany({
            where: {
                companyId,
                id: { in: categoryIds },
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

        const validCategoryIds = validCategories.map((c) => c.id);

        // transição: mantém uma categoria textual principal
        const legacyCategory =
            legacyCategoryInput || validCategories[0]?.name || '';

        const created = await prisma.$transaction(async (tx) => {
            const product = await tx.product.create({
                data: {
                    companyId,
                    name,
                    imageUrl: imageUrl ?? '',
                    description,
                    price,
                    professionalPercentage: 0,
                    legacyCategory,
                    isActive,
                    isFeatured,
                    stockQuantity,
                    pickupDeadlineDays,
                },
                select: { id: true },
            });

            await tx.productCategory.createMany({
                data: validCategoryIds.map((categoryId) => ({
                    companyId,
                    productId: product.id,
                    categoryId,
                })),
                skipDuplicates: true,
            });

            return product;
        });

        return jsonOk({ id: created.id }, { status: 201 });
    } catch {
        return jsonErr('Sem permissão para criar produtos.', 403);
    }
}
