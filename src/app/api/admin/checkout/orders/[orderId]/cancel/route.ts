// src/app/api/admin/checkout/orders/[orderId]/cancel/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

type CancelOrderResponse =
    | {
          ok: true;
          data: {
              orderId: string;
              status: 'CANCELED';
              canceledAt: string; // ISO
              inventoryRevertedAt: string | null; // ISO | null
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
): NextResponse<CancelOrderResponse> {
    return NextResponse.json({ ok: false, error: message } as const, {
        status,
    });
}

function jsonOk(
    data: Extract<CancelOrderResponse, { ok: true }>['data'],
    status = 200
): NextResponse<CancelOrderResponse> {
    return NextResponse.json({ ok: true, data } as const, { status });
}

export async function PATCH(
    _request: Request,
    ctx: Ctx
): Promise<NextResponse<CancelOrderResponse>> {
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

        // 1) Carrega pedido (tenant safe) + itens (para reverter estoque se necessário)
        const order = await prisma.order.findFirst({
            where: { id: orderId, companyId },
            select: {
                id: true,
                unitId: true,
                status: true,
                inventoryRevertedAt: true,
                items: {
                    select: {
                        productId: true,
                        quantity: true,
                    },
                },
            },
        });

        if (!order) return jsonErr('Pedido não encontrado.', 404);

        // 2) Valida acesso à unidade (quando não vê tudo)
        if (!canSeeAllUnits) {
            const hasAccess = await prisma.adminUnitAccess.findFirst({
                where: { companyId, userId, unitId: order.unitId },
                select: { id: true },
            });
            if (!hasAccess) return jsonErr('Sem acesso a esta unidade.', 403);
        }

        // 3) Regras de transição
        // - se já cancelado e já reverteu inventário: idempotente (não duplica estoque)
        if (order.status === 'CANCELED' && order.inventoryRevertedAt) {
            return jsonOk({
                orderId: order.id,
                status: 'CANCELED',
                canceledAt: new Date().toISOString(),
                inventoryRevertedAt: order.inventoryRevertedAt.toISOString(),
            });
        }

        if (order.status === 'COMPLETED') {
            return jsonErr(
                'Não é possível cancelar um pedido já concluído.',
                400
            );
        }

        if (
            order.status !== 'PENDING' &&
            order.status !== 'PENDING_CHECKIN' &&
            order.status !== 'CANCELED'
        ) {
            return jsonErr(
                `Não é possível cancelar pedido com status "${order.status}".`,
                400
            );
        }

        const now = new Date();

        // 4) Cancela + reverte estoque (apenas 1x)
        const updated = await prisma.$transaction(async (tx) => {
            // 4.1) Se ainda não reverteu estoque, incrementa de volta
            // (somente itens com productId)
            if (!order.inventoryRevertedAt) {
                const qtyByProduct = new Map<string, number>();

                for (const it of order.items ?? []) {
                    const pid = normalizeString(it.productId);
                    if (!pid) continue;

                    const q =
                        typeof it.quantity === 'number' ? it.quantity : NaN;

                    if (!Number.isFinite(q) || q <= 0) continue;

                    qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + q);
                }

                for (const [productId, qty] of qtyByProduct.entries()) {
                    // tenant safe
                    await tx.product.updateMany({
                        where: { id: productId, companyId },
                        data: { stockQuantity: { increment: qty } },
                    });
                }
            }

            // 4.2) Atualiza pedido para CANCELED + seta inventoryRevertedAt se foi a primeira vez
            const upd = await tx.order.updateMany({
                where: { id: order.id, companyId },
                data: {
                    status: 'CANCELED',
                    expiredAt: now,
                    inventoryRevertedAt: order.inventoryRevertedAt ?? now,
                },
            });

            if (upd.count === 0) {
                throw new Error('Falha ao atualizar pedido (tenant mismatch).');
            }

            // 4.3) Recarrega para devolver inventoryRevertedAt certinho
            const o = await tx.order.findFirst({
                where: { id: order.id, companyId },
                select: { id: true, inventoryRevertedAt: true },
            });

            if (!o) throw new Error('Pedido não encontrado após atualização.');

            return o;
        });

        return jsonOk({
            orderId: updated.id,
            status: 'CANCELED',
            canceledAt: now.toISOString(),
            inventoryRevertedAt: updated.inventoryRevertedAt
                ? updated.inventoryRevertedAt.toISOString()
                : null,
        });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro interno.', 500);
    }
}
