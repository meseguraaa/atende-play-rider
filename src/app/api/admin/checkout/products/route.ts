// src/app/api/admin/checkout/products/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

/* ---------------------------------------------------------
 * ✅ Decimal-safe helpers (evita NaN quando vem Prisma.Decimal)
 * ---------------------------------------------------------*/
function toNumberDecimal(v: unknown): number {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;

    if (typeof v === 'string') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : NaN;
    }

    if (typeof v === 'object') {
        const anyObj = v as any;

        if (typeof anyObj.toNumber === 'function') {
            const n = anyObj.toNumber();
            return Number.isFinite(n) ? n : NaN;
        }

        if (typeof anyObj.toString === 'function') {
            const n = Number(String(anyObj.toString()).replace(',', '.'));
            return Number.isFinite(n) ? n : NaN;
        }
    }

    return NaN;
}

function money(n: unknown): number {
    const v = toNumberDecimal(n);
    if (!Number.isFinite(v)) return 0;
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

function formatBRL(value: unknown) {
    const v = money(value);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    }).format(v);
}

type ProductsListResponse =
    | {
          ok: true;
          data: {
              products: Array<{
                  id: string;
                  unitId: string;
                  name: string;
                  category: string;
                  isFeatured: boolean;
                  stockQuantity: number;
                  price: string;
                  priceLabel: string;
              }>;
              count: number;
              unitScope: 'filtered' | 'all';
          };
      }
    | { ok: false; error: string };

// ✅ Helpers tipados corretamente (mantém ok como literal true/false)
function jsonErr(
    message: string,
    status = 400
): NextResponse<ProductsListResponse> {
    return NextResponse.json({ ok: false, error: message } as const, {
        status,
    });
}

function jsonOk(
    data: Extract<ProductsListResponse, { ok: true }>['data'],
    status = 200
): NextResponse<ProductsListResponse> {
    return NextResponse.json({ ok: true, data } as const, { status });
}

export async function GET(
    request: Request
): Promise<NextResponse<ProductsListResponse>> {
    try {
        const session = await requireAdminForModule('CHECKOUT');

        const companyId = session.companyId;
        if (!companyId)
            return jsonErr('Empresa não encontrada na sessão.', 401);

        const userId = session.id;
        if (!userId) return jsonErr('Usuário não encontrado na sessão.', 401);

        const canSeeAllUnits = session.canSeeAllUnits;

        const url = new URL(request.url);
        const unitParamRaw = url.searchParams.get('unit');
        const unitParam = normalizeString(unitParamRaw);

        // ==========================
        // 1) Resolve escopo de unidade
        // ==========================
        let allowedUnitIds: string[] | null = null;

        if (canSeeAllUnits) {
            if (!unitParam || unitParam === 'all') {
                allowedUnitIds = null;
            } else {
                const unit = await prisma.unit.findFirst({
                    where: { id: unitParam, companyId, isActive: true },
                    select: { id: true },
                });
                if (!unit) return jsonErr('Unidade inválida ou inativa.', 404);
                allowedUnitIds = [unit.id];
            }
        } else {
            const accesses = await prisma.adminUnitAccess.findMany({
                where: { companyId, userId },
                select: { unitId: true },
            });

            const ids = accesses.map((a) => a.unitId);

            if (ids.length === 0) {
                return jsonErr('Sem acesso a unidades.', 403);
            }

            if (unitParam && unitParam !== 'all') {
                if (!ids.includes(unitParam)) {
                    return jsonErr('Sem acesso a esta unidade.', 403);
                }
                allowedUnitIds = [unitParam];
            } else {
                allowedUnitIds = ids;
            }
        }

        const unitWhere =
            allowedUnitIds && allowedUnitIds.length > 0
                ? { unitId: { in: allowedUnitIds } }
                : {};

        // ==========================
        // 2) Lista produtos ativos no escopo
        // ==========================
        const products = await prisma.product.findMany({
            where: {
                companyId,
                ...unitWhere,
                isActive: true,
            },
            orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }],
            select: {
                id: true,
                unitId: true,
                name: true,
                price: true,
                stockQuantity: true,
                legacyCategory: true,
                isFeatured: true,
            },
        });

        const ui = products.map((p) => ({
            id: p.id,
            unitId: p.unitId,
            name: p.name,
            category: p.legacyCategory ?? '',
            isFeatured: p.isFeatured,
            stockQuantity: p.stockQuantity,
            price: String(p.price),
            priceLabel: formatBRL(p.price),
        }));

        return jsonOk({
            products: ui,
            count: ui.length,
            unitScope: allowedUnitIds ? 'filtered' : 'all',
        });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro interno.', 500);
    }
}
