// src/app/api/admin/checkout/orders/[orderId]/assign-product-item-professional/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

type AssignProductItemProfessionalResponse =
    | {
          ok: true;
          data: {
              orderId: string;
              orderStatus: 'PENDING' | 'PENDING_CHECKIN';
              itemId: string;
              professionalId: string;
          };
      }
    | { ok: false; error: string };

/**
 * ✅ IMPORTANTE:
 * O validator do Next (especialmente nas versões mais novas) pode inferir
 * `context.params` como `Promise<{}>` dependendo de como ele resolve a rota.
 *
 * Então aqui tipamos como `any` para ficar compatível com `Promise<{}>` e
 * também com `Promise<{ orderId: string }>` quando ele detectar corretamente.
 */
type Ctx = {
    params: Promise<any>;
};

type AssignBody = {
    itemId?: string;
    professionalId?: string | null;
};

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function jsonErr(
    message: string,
    status = 400
): NextResponse<AssignProductItemProfessionalResponse> {
    return NextResponse.json({ ok: false, error: message } as const, {
        status,
    });
}

function jsonOk(
    data: Extract<AssignProductItemProfessionalResponse, { ok: true }>['data'],
    status = 200
): NextResponse<AssignProductItemProfessionalResponse> {
    return NextResponse.json({ ok: true, data } as const, { status });
}

/**
 * PATCH /api/admin/checkout/orders/:orderId/assign-product-item-professional
 * Body: { itemId: string, professionalId: string }
 *
 * ✅ Associa um item de PRODUTO (OrderItem com productId) a um profissional.
 *
 * Regras:
 * - tenant safe (companyId)
 * - respeita adminUnitAccess quando canSeeAllUnits=false
 * - só permite pedido PENDING/PENDING_CHECKIN
 * - item precisa pertencer ao pedido e ser de produto
 * - profissional precisa existir e estar ativo
 * - profissional precisa estar ativo na unidade do pedido (via ProfessionalUnit)
 */
export async function PATCH(
    request: NextRequest,
    ctx: Ctx
): Promise<NextResponse<AssignProductItemProfessionalResponse>> {
    try {
        const session = await requireAdminForModule('CHECKOUT');

        const companyId = session.companyId;
        if (!companyId)
            return jsonErr('Empresa não encontrada na sessão.', 401);

        const userId = session.id; // AdminSession usa `id`
        if (!userId) return jsonErr('Usuário não encontrado na sessão.', 401);

        const canSeeAllUnits = session.canSeeAllUnits;

        const params = await ctx.params;
        const orderId = normalizeString(params?.orderId);
        if (!orderId) return jsonErr('orderId é obrigatório.', 400);

        const body = (await request
            .json()
            .catch(() => null)) as AssignBody | null;

        const itemId = normalizeString(body?.itemId);
        const professionalId =
            body?.professionalId === null
                ? ''
                : normalizeString(body?.professionalId);

        if (!itemId) return jsonErr('itemId é obrigatório.', 400);
        if (!professionalId)
            return jsonErr('professionalId é obrigatório.', 400);

        // 1) Carrega pedido (tenant safe) e valida acesso à unidade
        const order = await prisma.order.findFirst({
            where: { id: orderId, companyId },
            select: {
                id: true,
                unitId: true,
                status: true,
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

        if (order.status === 'COMPLETED') {
            return jsonErr(
                'Não é possível alterar profissional de um pedido pago.',
                400
            );
        }

        if (order.status !== 'PENDING' && order.status !== 'PENDING_CHECKIN') {
            return jsonErr(
                `Não é possível alterar profissional em pedido com status "${order.status}".`,
                400
            );
        }

        // 2) Valida profissional (tenant safe) + ativo
        const professional = await prisma.professional.findFirst({
            where: { id: professionalId, companyId },
            select: { id: true, isActive: true },
        });

        if (!professional) return jsonErr('Profissional não encontrado.', 404);
        if (!professional.isActive)
            return jsonErr('Profissional inativo.', 400);

        // 2.1) Profissional precisa estar ativo na unidade do pedido (via ProfessionalUnit)
        const professionalInUnit = await prisma.professionalUnit.findFirst({
            where: {
                companyId,
                professionalId: professional.id,
                unitId: order.unitId,
                isActive: true,
            },
            select: { id: true },
        });

        if (!professionalInUnit) {
            return jsonErr(
                'Profissional não pertence (ou está inativo) nesta unidade.',
                400
            );
        }

        // 3) Atualiza o item (precisa ser item de produto do pedido)
        const updatedItemId = await prisma.$transaction(async (tx) => {
            const item = await tx.orderItem.findFirst({
                where: {
                    id: itemId,
                    companyId,
                    orderId: order.id,
                    productId: { not: null },
                },
                select: { id: true },
            });

            if (!item) throw new Error('ITEM_NOT_FOUND');

            const upd = await tx.orderItem.updateMany({
                where: { id: item.id, companyId, orderId: order.id },
                data: { professionalId: professional.id },
            });

            if (upd.count === 0) throw new Error('ITEM_NOT_FOUND');

            return item.id;
        });

        revalidatePath('/admin/checkout');

        return jsonOk({
            orderId: order.id,
            orderStatus: order.status as 'PENDING' | 'PENDING_CHECKIN',
            itemId: updatedItemId,
            professionalId: professional.id,
        });
    } catch (err: any) {
        const msg = err?.message ?? 'Erro interno.';

        if (msg === 'ITEM_NOT_FOUND') {
            return jsonErr('Item de produto não encontrado neste pedido.', 404);
        }

        return jsonErr(msg, 400);
    }
}
