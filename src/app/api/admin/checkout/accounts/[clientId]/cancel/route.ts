// src/app/api/admin/checkout/accounts/[clientId]/cancel/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

type CancelAccountResponse =
    | {
          ok: true;
          data: {
              clientId: string;
              canceledCount: number;
              canceledOrderIds: string[];
              alreadyCanceledCount: number;
              skippedCount: number; // por falta de acesso à unidade (quando não vê tudo)
              canceledAt: string; // ISO
          };
      }
    | { ok: false; error: string };

type Ctx = {
    params: Promise<{
        clientId: string;
    }>;
};

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

// ✅ Helpers tipados corretamente (mantém ok como literal true/false)
function jsonErr(
    message: string,
    status = 400
): NextResponse<CancelAccountResponse> {
    return NextResponse.json({ ok: false, error: message } as const, {
        status,
    });
}

function jsonOk(
    data: Extract<CancelAccountResponse, { ok: true }>['data'],
    status = 200
): NextResponse<CancelAccountResponse> {
    return NextResponse.json({ ok: true, data } as const, { status });
}

/**
 * Cancela todos os pedidos PENDING/PENDING_CHECKIN do cliente (escopo tenant).
 * + ✅ Reverte estoque de itens de produto (idempotente via inventoryRevertedAt)
 *
 * Regras:
 * - tenant safe (companyId)
 * - respeita adminUnitAccess quando canSeeAllUnits=false
 * - idempotente:
 *   - só reverte estoque quando inventoryRevertedAt === null
 * - NÃO cancela COMPLETED
 */
export async function PATCH(
    request: Request,
    ctx: Ctx
): Promise<NextResponse<CancelAccountResponse>> {
    try {
        const session = await requireAdminForModule('CHECKOUT');

        const companyId = session.companyId;
        if (!companyId)
            return jsonErr('Empresa não encontrada na sessão.', 401);

        const userId = session.id; // AdminSession usa `id`
        if (!userId) return jsonErr('Usuário não encontrado na sessão.', 401);

        const canSeeAllUnits = session.canSeeAllUnits;

        const { clientId: clientIdRaw } = await ctx.params;
        const clientId = normalizeString(clientIdRaw);
        if (!clientId) return jsonErr('clientId é obrigatório.', 400);

        // Opcional: permitir enviar orderIds no body pra cancelar exatamente os pedidos da tela
        const body = await request.json().catch(() => null);
        const orderIdsFromBody: string[] =
            body &&
            typeof body === 'object' &&
            Array.isArray((body as any).orderIds)
                ? (body as any).orderIds
                      .map((x: any) => normalizeString(x))
                      .filter(Boolean)
                : [];

        const now = new Date();

        // 1) Buscar pedidos do cliente (inclui CANCELED pra idempotência e contagem)
        // ⚠️ não inclui COMPLETED (não cancela pago)
        const candidateOrders = await prisma.order.findMany({
            where: {
                companyId,
                clientId,
                id:
                    orderIdsFromBody.length > 0
                        ? { in: orderIdsFromBody }
                        : undefined,
                status: { in: ['PENDING', 'PENDING_CHECKIN', 'CANCELED'] },
            },
            select: {
                id: true,
                unitId: true,
                status: true,
                inventoryRevertedAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        // Idempotência total: não existe nenhum pedido nessa conta/filtro
        if (candidateOrders.length === 0) {
            return jsonOk({
                clientId,
                canceledCount: 0,
                canceledOrderIds: [],
                alreadyCanceledCount: 0,
                skippedCount: 0,
                canceledAt: now.toISOString(),
            });
        }

        // 2) Se não pode ver tudo, filtra pedidos para unidades que o admin tem acesso
        let allowedOrders = candidateOrders;
        let skippedCount = 0;

        if (!canSeeAllUnits) {
            const accesses = await prisma.adminUnitAccess.findMany({
                where: { companyId, userId },
                select: { unitId: true },
            });

            const allowedUnitIds = new Set(accesses.map((a) => a.unitId));
            const filtered = candidateOrders.filter((o) =>
                allowedUnitIds.has(o.unitId)
            );

            allowedOrders = filtered;
            skippedCount = candidateOrders.length - filtered.length;

            if (allowedOrders.length === 0) {
                return jsonErr('Sem acesso às unidades desta conta.', 403);
            }
        }

        // 3) Contagem idempotente (já cancelado e já revertido)
        const alreadyCanceledAndReverted = allowedOrders.filter(
            (o) => o.status === 'CANCELED' && o.inventoryRevertedAt
        );

        // 4) Precisam de tratamento:
        // - PENDING / PENDING_CHECKIN sempre
        // - CANCELED somente se inventoryRevertedAt ainda é null (precisa reverter 1x)
        const toProcess = allowedOrders.filter((o) => {
            if (o.status === 'PENDING' || o.status === 'PENDING_CHECKIN')
                return true;
            if (o.status === 'CANCELED' && !o.inventoryRevertedAt) return true;
            return false;
        });

        if (toProcess.length === 0) {
            return jsonOk({
                clientId,
                canceledCount: 0,
                canceledOrderIds: [],
                alreadyCanceledCount: alreadyCanceledAndReverted.length,
                skippedCount,
                canceledAt: now.toISOString(),
            });
        }

        const orderIdsToProcess = toProcess.map((o) => o.id);

        // ✅ 5) Transação: reverte estoque APENAS dos pedidos que ainda não tinham inventoryRevertedAt
        const result = await prisma.$transaction(async (tx) => {
            // 5.1) Reverter estoque só para pedidos com inventoryRevertedAt=null
            // (para evitar duplicar reversão se esse endpoint for chamado de novo)
            const orderIdsToRevert = toProcess
                .filter((o) => !o.inventoryRevertedAt)
                .map((o) => o.id);

            if (orderIdsToRevert.length > 0) {
                const items = await tx.orderItem.findMany({
                    where: {
                        companyId,
                        orderId: { in: orderIdsToRevert },
                        productId: { not: null },
                    },
                    select: {
                        productId: true,
                        quantity: true,
                    },
                });

                const qtyByProduct = new Map<string, number>();

                for (const it of items) {
                    const pid = normalizeString(it.productId);
                    if (!pid) continue;

                    const q =
                        typeof it.quantity === 'number' ? it.quantity : NaN;

                    if (!Number.isFinite(q) || q <= 0) continue;

                    qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + q);
                }

                for (const [productId, qty] of qtyByProduct.entries()) {
                    await tx.product.updateMany({
                        where: { id: productId, companyId },
                        data: { stockQuantity: { increment: qty } },
                    });
                }
            }

            // 5.2) Cancela pendentes e marca reversão
            const updatedPending = await tx.order.updateMany({
                where: {
                    companyId,
                    clientId,
                    id: { in: orderIdsToProcess },
                    status: { in: ['PENDING', 'PENDING_CHECKIN'] },
                },
                data: {
                    status: 'CANCELED',
                    expiredAt: now,
                    inventoryRevertedAt: now,
                },
            });

            // 5.3) Para pedidos já cancelados, mas sem inventoryRevertedAt, apenas marca como revertido
            const updatedCanceledNoRevert = await tx.order.updateMany({
                where: {
                    companyId,
                    clientId,
                    id: { in: orderIdsToProcess },
                    status: 'CANCELED',
                    inventoryRevertedAt: null,
                },
                data: {
                    inventoryRevertedAt: now,
                    expiredAt: now,
                },
            });

            const treated = await tx.order.findMany({
                where: {
                    companyId,
                    clientId,
                    id: { in: orderIdsToProcess },
                    status: 'CANCELED',
                },
                select: { id: true },
            });

            return {
                canceledCount:
                    (updatedPending.count ?? 0) +
                    (updatedCanceledNoRevert.count ?? 0),
                canceledOrderIds: treated.map((x) => x.id),
                alreadyCanceledCount: alreadyCanceledAndReverted.length,
            };
        });

        return jsonOk({
            clientId,
            canceledCount: result.canceledCount,
            canceledOrderIds: result.canceledOrderIds,
            alreadyCanceledCount: result.alreadyCanceledCount,
            skippedCount,
            canceledAt: now.toISOString(),
        });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro interno.', 500);
    }
}
