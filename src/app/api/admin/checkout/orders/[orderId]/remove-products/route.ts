// src/app/api/admin/checkout/orders/[orderId]/remove-products/route.ts
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

type RemoveProductsResponse =
    | {
          ok: true;
          data: {
              orderId: string;
              status: 'PENDING' | 'PENDING_CHECKIN' | 'CANCELED';
              removedItemsCount: number;
              removedQuantityTotal: number;
              inventoryRevertedAt: string | null; // ISO | null
              orderTotalAmount: string; // decimal string
          };
      }
    | { ok: false; error: string };

type Ctx = {
    params: Promise<{
        orderId: string;
    }>;
};

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

// ✅ Helpers tipados corretamente (mantém ok como literal true/false)
function jsonErr(
    message: string,
    status = 400
): NextResponse<RemoveProductsResponse> {
    return NextResponse.json({ ok: false, error: message } as const, {
        status,
    });
}

function jsonOk(
    data: Extract<RemoveProductsResponse, { ok: true }>['data'],
    status = 200
): NextResponse<RemoveProductsResponse> {
    return NextResponse.json({ ok: true, data } as const, { status });
}

/**
 * Remove SOMENTE itens de produto de um pedido em aberto.
 * - tenant safe (companyId)
 * - respeita adminUnitAccess quando canSeeAllUnits=false
 * - devolve estoque (increment)
 * - recalcula totalAmount do pedido (fonte da verdade = soma dos itens restantes)
 * - se o pedido ficar sem itens, marca como CANCELED
 */
export async function PATCH(
    _request: Request,
    ctx: Ctx
): Promise<NextResponse<RemoveProductsResponse>> {
    try {
        const session = await requireAdminForModule('CHECKOUT');

        const companyId = session.companyId;
        if (!companyId)
            return jsonErr('Empresa não encontrada na sessão.', 401);

        const userId = session.id; // AdminSession usa `id`
        if (!userId) return jsonErr('Usuário não encontrado na sessão.', 401);

        const canSeeAllUnits = session.canSeeAllUnits;

        const { orderId: orderIdRaw } = await ctx.params;
        const orderId = normalizeString(orderIdRaw);
        if (!orderId) return jsonErr('orderId é obrigatório.', 400);

        // 1) Carrega pedido + itens de produto (tenant safe)
        const order = await prisma.order.findFirst({
            where: { id: orderId, companyId },
            select: {
                id: true,
                unitId: true,
                status: true,
                inventoryRevertedAt: true,
                items: {
                    select: {
                        id: true,
                        productId: true,
                        serviceId: true,
                        quantity: true,
                        totalPrice: true,
                    },
                },
            },
        });

        if (!order) return jsonErr('Pedido não encontrado.', 404);

        // 2) Acesso à unidade (quando não vê tudo)
        if (!canSeeAllUnits) {
            const hasAccess = await prisma.adminUnitAccess.findFirst({
                where: { companyId, userId, unitId: order.unitId },
                select: { id: true },
            });
            if (!hasAccess) return jsonErr('Sem acesso a esta unidade.', 403);
        }

        // 3) Regras de transição
        if (order.status === 'COMPLETED') {
            return jsonErr(
                'Não é possível remover produtos de um pedido pago.',
                400
            );
        }

        if (order.status !== 'PENDING' && order.status !== 'PENDING_CHECKIN') {
            return jsonErr(
                `Não é possível remover produtos de pedido com status "${order.status}".`,
                400
            );
        }

        const productItems = (order.items ?? []).filter((it) => !!it.productId);

        // Idempotência: não há produtos no pedido
        if (productItems.length === 0) {
            // Recalcula o total com o que houver (serviços)
            const totals = await prisma.orderItem.aggregate({
                where: { companyId, orderId: order.id },
                _sum: { totalPrice: true },
            });

            const newTotal = totals._sum.totalPrice ?? new Prisma.Decimal(0);

            // garante que totalAmount não ficou “sujo”
            await prisma.order.updateMany({
                where: { id: order.id, companyId },
                data: { totalAmount: newTotal },
            });

            return jsonOk({
                orderId: order.id,
                status: order.status as any,
                removedItemsCount: 0,
                removedQuantityTotal: 0,
                inventoryRevertedAt: order.inventoryRevertedAt
                    ? order.inventoryRevertedAt.toISOString()
                    : null,
                orderTotalAmount: newTotal.toString(),
            });
        }

        const now = new Date();

        // 4) Transação: devolve estoque + remove itens produto + recalcula total + opcionalmente cancela pedido vazio
        const result = await prisma.$transaction(async (tx) => {
            // 4.1) Soma quantidade por produto
            const qtyByProduct = new Map<string, number>();
            let removedQuantityTotal = 0;

            for (const it of productItems) {
                const pid = normalizeString(it.productId);
                if (!pid) continue;

                const q = typeof it.quantity === 'number' ? it.quantity : 0;
                if (!Number.isFinite(q) || q <= 0) continue;

                removedQuantityTotal += q;
                qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + q);
            }

            // 4.2) Devolve estoque (tenant safe)
            for (const [productId, qty] of qtyByProduct.entries()) {
                await tx.product.updateMany({
                    where: { id: productId, companyId },
                    data: { stockQuantity: { increment: qty } },
                });
            }

            // 4.3) Remove SOMENTE itens de produto
            const del = await tx.orderItem.deleteMany({
                where: {
                    companyId,
                    orderId: order.id,
                    productId: { not: null },
                },
            });

            // 4.4) Recalcula total do pedido com itens restantes
            const totals = await tx.orderItem.aggregate({
                where: { companyId, orderId: order.id },
                _sum: { totalPrice: true },
            });

            const newTotal = totals._sum.totalPrice ?? new Prisma.Decimal(0);

            // 4.5) Verifica se ainda tem itens (serviços) no pedido
            const remainingCount = await tx.orderItem.count({
                where: { companyId, orderId: order.id },
            });

            if (remainingCount === 0) {
                // Pedido ficou vazio => cancela
                await tx.order.updateMany({
                    where: { id: order.id, companyId },
                    data: {
                        status: 'CANCELED',
                        totalAmount: new Prisma.Decimal(0),
                        expiredAt: now,
                        inventoryRevertedAt: order.inventoryRevertedAt ?? now,
                    },
                });

                return {
                    status: 'CANCELED' as const,
                    removedItemsCount: del.count ?? 0,
                    removedQuantityTotal,
                    inventoryRevertedAt: (
                        order.inventoryRevertedAt ?? now
                    ).toISOString(),
                    orderTotalAmount: '0',
                };
            }

            // Mantém em aberto, só atualiza total e marca que inventário foi revertido (se ainda não tinha)
            await tx.order.updateMany({
                where: { id: order.id, companyId },
                data: {
                    totalAmount: newTotal,
                    inventoryRevertedAt: order.inventoryRevertedAt ?? now,
                },
            });

            return {
                status: order.status as 'PENDING' | 'PENDING_CHECKIN',
                removedItemsCount: del.count ?? 0,
                removedQuantityTotal,
                inventoryRevertedAt: (
                    order.inventoryRevertedAt ?? now
                ).toISOString(),
                orderTotalAmount: newTotal.toString(),
            };
        });

        return jsonOk({
            orderId: order.id,
            status: result.status,
            removedItemsCount: result.removedItemsCount,
            removedQuantityTotal: result.removedQuantityTotal,
            inventoryRevertedAt: result.inventoryRevertedAt,
            orderTotalAmount: result.orderTotalAmount,
        });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro interno.', 500);
    }
}
