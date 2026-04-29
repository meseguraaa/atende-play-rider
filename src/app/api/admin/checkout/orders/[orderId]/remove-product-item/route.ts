// src/app/api/admin/checkout/orders/[orderId]/remove-product-item/route.ts
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

type RemoveProductItemResponse =
    | {
          ok: true;
          data: {
              orderId: string;
              orderStatus: 'PENDING' | 'PENDING_CHECKIN' | 'CANCELED';
              removedItemId: string;
              removedProductId: string;
              removedQuantity: number;
              inventoryRevertedAt: string; // ISO
              orderTotalAmount: string; // decimal string
              remainingProductItemsCount: number;
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
): NextResponse<RemoveProductItemResponse> {
    return NextResponse.json({ ok: false, error: message } as const, {
        status,
    });
}

function jsonOk(
    data: Extract<RemoveProductItemResponse, { ok: true }>['data'],
    status = 200
): NextResponse<RemoveProductItemResponse> {
    return NextResponse.json({ ok: true, data } as const, { status });
}

/**
 * Remove UM item de produto (OrderItem) de um pedido em aberto.
 *
 * Regras:
 * - tenant safe (companyId)
 * - respeita adminUnitAccess quando canSeeAllUnits=false
 * - só permite pedido PENDING/PENDING_CHECKIN
 * - devolve estoque APENAS do item removido
 * - remove apenas aquele OrderItem (itemId)
 * - recalcula totalAmount do pedido (fonte da verdade = soma dos itens restantes)
 * - se o pedido ficar vazio (sem itens), marca como CANCELED
 */
export async function PATCH(
    request: Request,
    ctx: Ctx
): Promise<NextResponse<RemoveProductItemResponse>> {
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

        const body = await request.json().catch(() => null);
        const itemId = normalizeString(body?.itemId);
        if (!itemId) return jsonErr('itemId é obrigatório.', 400);

        // 1) Carrega pedido (tenant safe) e valida acesso à unidade
        const order = await prisma.order.findFirst({
            where: { id: orderId, companyId },
            select: {
                id: true,
                unitId: true,
                status: true,
                inventoryRevertedAt: true,
            },
        });

        if (!order) return jsonErr('Pedido não encontrado.', 404);

        if (!canSeeAllUnits) {
            const hasAccess = await prisma.adminUnitAccess.findFirst({
                where: { companyId, userId, unitId: order.unitId },
                select: { id: true },
            });
            if (!hasAccess) return jsonErr('Sem acesso a esta unidade.', 403);
        }

        // 2) Regras de status
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

        const now = new Date();

        // 3) Transação: pega o item, devolve estoque, deleta item, recalcula total, cancela se vazio
        const result = await prisma.$transaction(async (tx) => {
            // 3.1) Busca o item (tem que ser desse pedido, dessa empresa, e ser produto)
            const item = await tx.orderItem.findFirst({
                where: {
                    id: itemId,
                    companyId,
                    orderId: order.id,
                    productId: { not: null },
                },
                select: {
                    id: true,
                    productId: true,
                    quantity: true,
                },
            });

            if (!item) {
                throw new Error('Item de produto não encontrado neste pedido.');
            }

            const productId = normalizeString(item.productId);
            if (!productId) {
                throw new Error('Item inválido (productId ausente).');
            }

            const qty =
                typeof item.quantity === 'number' &&
                Number.isFinite(item.quantity)
                    ? Math.trunc(item.quantity)
                    : 0;

            if (qty <= 0) {
                throw new Error('Item inválido (quantity).');
            }

            // 3.2) Devolve estoque APENAS do item removido (tenant safe)
            await tx.product.updateMany({
                where: { id: productId, companyId },
                data: { stockQuantity: { increment: qty } },
            });

            // 3.3) Remove o item específico
            await tx.orderItem.deleteMany({
                where: { id: item.id, companyId, orderId: order.id },
            });

            // 3.4) Recalcula total do pedido com itens restantes
            const totals = await tx.orderItem.aggregate({
                where: { companyId, orderId: order.id },
                _sum: { totalPrice: true },
            });

            const newTotal = totals._sum.totalPrice ?? new Prisma.Decimal(0);

            // 3.5) Se não tiver mais nenhum item (nem serviço nem produto), cancela
            const remainingCount = await tx.orderItem.count({
                where: { companyId, orderId: order.id },
            });

            if (remainingCount === 0) {
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
                    orderStatus: 'CANCELED' as const,
                    removedItemId: item.id,
                    removedProductId: productId,
                    removedQuantity: qty,
                    inventoryRevertedAt: (
                        order.inventoryRevertedAt ?? now
                    ).toISOString(),
                    orderTotalAmount: '0',
                    remainingProductItemsCount: 0,
                };
            }

            // 3.6) Atualiza total e marca inventoryRevertedAt (se ainda não tinha)
            await tx.order.updateMany({
                where: { id: order.id, companyId },
                data: {
                    totalAmount: newTotal,
                    inventoryRevertedAt: order.inventoryRevertedAt ?? now,
                },
            });

            // 3.7) Conta quantos itens de produto ainda restaram
            const remainingProductItemsCount = await tx.orderItem.count({
                where: {
                    companyId,
                    orderId: order.id,
                    productId: { not: null },
                },
            });

            return {
                orderStatus: order.status as 'PENDING' | 'PENDING_CHECKIN',
                removedItemId: item.id,
                removedProductId: productId,
                removedQuantity: qty,
                inventoryRevertedAt: (
                    order.inventoryRevertedAt ?? now
                ).toISOString(),
                orderTotalAmount: newTotal.toString(),
                remainingProductItemsCount,
            };
        });

        return jsonOk({
            orderId: order.id,
            orderStatus: result.orderStatus,
            removedItemId: result.removedItemId,
            removedProductId: result.removedProductId,
            removedQuantity: result.removedQuantity,
            inventoryRevertedAt: result.inventoryRevertedAt,
            orderTotalAmount: result.orderTotalAmount,
            remainingProductItemsCount: result.remainingProductItemsCount,
        });
    } catch (err: any) {
        const msg = err?.message ?? 'Erro interno.';
        const status =
            msg.includes('não encontrado') || msg.includes('inválido')
                ? 400
                : 500;
        return jsonErr(msg, status);
    }
}
