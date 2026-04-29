// src/app/api/admin/checkout/accounts/[clientId]/add-product/route.ts
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

type AddProductResponse =
    | {
          ok: true;
          data: {
              clientId: string;
              orderId: string;
              orderStatus: 'PENDING' | 'PENDING_CHECKIN';
              itemId: string;
              productId: string;
              quantity: number;
              unitId: string;
              unitPrice: string; // decimal string
              totalPrice: string; // decimal string
              orderTotalAmount: string; // decimal string
              orderWasCreated: boolean;
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

function toInt(v: unknown): number {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : NaN;
    if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? Math.trunc(n) : NaN;
    }
    return NaN;
}

function jsonErr(
    message: string,
    status = 400
): NextResponse<AddProductResponse> {
    return NextResponse.json({ ok: false, error: message } as const, {
        status,
    });
}

function jsonOk(
    data: Extract<AddProductResponse, { ok: true }>['data'],
    status = 200
): NextResponse<AddProductResponse> {
    return NextResponse.json({ ok: true, data } as const, { status });
}

/**
 * Adiciona um produto à "conta" (checkout) do cliente.
 *
 * Regras:
 * - valida produto ativo (tenant safe)
 * - usa Product.unitId como unidade do pedido
 * - NÃO mistura produto em pedido aberto de serviço
 * - reutiliza apenas pedido aberto que já tenha item de produto
 * - se não existir pedido aberto de produto, cria um novo Order PENDING
 * - baixa estoque de forma atômica
 * - cria OrderItem congelando unitPrice e totalPrice
 * - recalcula totalAmount do Order a partir dos itens
 */
export async function PATCH(
    request: Request,
    ctx: Ctx
): Promise<NextResponse<AddProductResponse>> {
    try {
        const session = await requireAdminForModule('CHECKOUT');

        const companyId = session.companyId;
        if (!companyId) {
            return jsonErr('Empresa não encontrada na sessão.', 401);
        }

        const userId = session.id;
        if (!userId) {
            return jsonErr('Usuário não encontrado na sessão.', 401);
        }

        const canSeeAllUnits = session.canSeeAllUnits;

        const { clientId: clientIdRaw } = await ctx.params;
        const clientId = normalizeString(clientIdRaw);
        if (!clientId) return jsonErr('clientId é obrigatório.', 400);

        const body = await request.json().catch(() => null);
        const productId = normalizeString((body as any)?.productId);
        const quantity = toInt((body as any)?.quantity);

        if (!productId) return jsonErr('productId é obrigatório.', 400);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            return jsonErr('quantity inválida.', 400);
        }

        // 1) Carrega produto (tenant safe) e valida ativo
        const product = await prisma.product.findFirst({
            where: {
                id: productId,
                companyId,
                isActive: true,
            },
            select: {
                id: true,
                unitId: true,
                price: true,
                stockQuantity: true,
                name: true,
            },
        });

        if (!product) {
            return jsonErr('Produto não encontrado ou inativo.', 404);
        }

        // 2) Valida acesso à unidade do produto (quando não vê tudo)
        if (!canSeeAllUnits) {
            const hasAccess = await prisma.adminUnitAccess.findFirst({
                where: {
                    companyId,
                    userId,
                    unitId: product.unitId,
                },
                select: { id: true },
            });

            if (!hasAccess) {
                return jsonErr('Sem acesso a esta unidade.', 403);
            }
        }

        const unitPrice = new Prisma.Decimal(product.price);
        const qtyDec = new Prisma.Decimal(quantity);
        const totalPrice = unitPrice.mul(qtyDec);

        const result = await prisma.$transaction(async (tx) => {
            // 3.1) Baixa estoque de forma atômica
            const dec = await tx.product.updateMany({
                where: {
                    id: product.id,
                    companyId,
                    isActive: true,
                    stockQuantity: { gte: quantity },
                },
                data: {
                    stockQuantity: { decrement: quantity },
                },
            });

            if (dec.count === 0) {
                const fresh = await tx.product.findFirst({
                    where: {
                        id: product.id,
                        companyId,
                    },
                    select: {
                        stockQuantity: true,
                        isActive: true,
                    },
                });

                const available = fresh?.stockQuantity ?? 0;
                const active = Boolean(fresh?.isActive);

                if (!active) {
                    throw new Error('Produto não encontrado ou inativo.');
                }

                throw new Error(
                    `Estoque insuficiente: disponível ${available}, solicitado ${quantity}.`
                );
            }

            /**
             * 3.2) Procura SOMENTE pedido aberto de produto
             *
             * Regra importante:
             * - não reaproveitar pedido de serviço
             * - só reaproveitar um pedido aberto que já tenha item PRODUCT
             */
            const existingProductOrder = await tx.order.findFirst({
                where: {
                    companyId,
                    unitId: product.unitId,
                    clientId,
                    status: { in: ['PENDING', 'PENDING_CHECKIN'] },
                    items: {
                        some: {
                            itemType: 'PRODUCT',
                        },
                    },
                },
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true,
                    status: true,
                },
            });

            let orderId: string;
            let orderStatus: 'PENDING' | 'PENDING_CHECKIN';
            let orderWasCreated = false;

            if (existingProductOrder) {
                orderId = existingProductOrder.id;
                orderStatus = existingProductOrder.status as
                    | 'PENDING'
                    | 'PENDING_CHECKIN';
            } else {
                const created = await tx.order.create({
                    data: {
                        companyId,
                        unitId: product.unitId,
                        clientId,
                        status: 'PENDING',
                        totalAmount: new Prisma.Decimal(0),
                        appointmentId: null,
                        professionalId: null,
                    },
                    select: {
                        id: true,
                        status: true,
                    },
                });

                orderId = created.id;
                orderStatus = created.status as 'PENDING' | 'PENDING_CHECKIN';
                orderWasCreated = true;
            }

            // 3.3) Cria item (congela preço)
            const item = await tx.orderItem.create({
                data: {
                    companyId,
                    orderId,
                    itemType: 'PRODUCT',
                    productId: product.id,
                    quantity,
                    unitPrice,
                    totalPrice,
                    descriptionSnapshot: normalizeString(product.name) || null,
                },
                select: { id: true },
            });

            // 3.4) Recalcula total do pedido a partir dos itens
            const totals = await tx.orderItem.aggregate({
                where: {
                    companyId,
                    orderId,
                },
                _sum: {
                    totalPrice: true,
                },
            });

            const newTotal = totals._sum.totalPrice ?? new Prisma.Decimal(0);

            const upd = await tx.order.updateMany({
                where: {
                    id: orderId,
                    companyId,
                },
                data: {
                    totalAmount: newTotal,
                },
            });

            if (upd.count === 0) {
                throw new Error('Falha ao atualizar pedido (tenant mismatch).');
            }

            const updatedOrder = await tx.order.findFirst({
                where: {
                    id: orderId,
                    companyId,
                },
                select: {
                    id: true,
                    totalAmount: true,
                    status: true,
                },
            });

            if (!updatedOrder) {
                throw new Error('Pedido não encontrado após atualização.');
            }

            return {
                orderId: updatedOrder.id,
                orderStatus: updatedOrder.status as
                    | 'PENDING'
                    | 'PENDING_CHECKIN',
                orderTotalAmount: updatedOrder.totalAmount,
                itemId: item.id,
                orderWasCreated,
            };
        });

        return jsonOk({
            clientId,
            orderId: result.orderId,
            orderStatus: result.orderStatus,
            itemId: result.itemId,
            productId: product.id,
            quantity,
            unitId: product.unitId,
            unitPrice: String(unitPrice),
            totalPrice: String(totalPrice),
            orderTotalAmount: String(result.orderTotalAmount),
            orderWasCreated: result.orderWasCreated,
        });
    } catch (err: any) {
        const msg = err?.message ?? 'Erro interno.';
        const status =
            msg.includes('Estoque insuficiente') ||
            msg.includes('Produto não encontrado') ||
            msg.includes('inativo')
                ? 400
                : msg.includes('Sem acesso')
                  ? 403
                  : 500;

        return jsonErr(msg, status);
    }
}
