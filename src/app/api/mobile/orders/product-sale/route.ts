// src/app/api/mobile/orders/product-sale/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';
import { z } from 'zod';

type Role = 'CLIENT' | 'BARBER' | 'ADMIN';

type MobileTokenPayload = {
    sub: string;
    role: Role;
    companyId: string; // ✅ multi-tenant obrigatório
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        // ✅ inclui x-company-id (preflight / web safe)
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

// ✅ header case-insensitive
function getHeaderCI(req: Request, key: string): string | null {
    const target = key.toLowerCase();
    for (const [k, v] of req.headers.entries()) {
        if (k.toLowerCase() === target) {
            const s = String(v ?? '').trim();
            return s.length ? s : null;
        }
    }
    return null;
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) throw new Error('missing_token');

    const payload = await verifyAppJwt(token);

    const sub =
        typeof (payload as any)?.sub === 'string'
            ? String((payload as any).sub).trim()
            : '';

    if (!sub) throw new Error('invalid_token');

    // 1) companyId do JWT
    let companyId =
        typeof (payload as any)?.companyId === 'string'
            ? String((payload as any).companyId).trim()
            : '';

    // 2) fallback: x-company-id
    if (!companyId) {
        const h = getHeaderCI(req, 'x-company-id');
        if (h) companyId = h;
    }

    if (!companyId) throw new Error('missing_company_id');

    // ✅ valida membership (anti-spoof)
    const membership = await prisma.companyMember.findFirst({
        where: { userId: sub, companyId, isActive: true },
        select: { id: true },
    });

    if (!membership) throw new Error('forbidden_company');

    return { ...(payload as any), sub, companyId } as MobileTokenPayload;
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// ✅ Compat helper: OrderItem pode ou não ter companyId no schema
async function createOrderItemCompat(
    tx: any,
    data: Record<string, any>,
    companyId: string
) {
    try {
        return await tx.orderItem.create({
            data: { ...data, companyId },
        });
    } catch {
        return await tx.orderItem.create({
            data,
        });
    }
}

const bodySchema = z.object({
    productId: z.string().min(1, 'productId obrigatório'),
    // ✅ aceita number ou "1"
    quantity: z.coerce.number().int().min(1, 'quantity deve ser >= 1'),
});

/**
 * POST /api/mobile/orders/product-sale
 *
 * Regras:
 * - exige auth (CLIENT)
 * - valida produto ativo e estoque suficiente
 * - NÃO baixa estoque
 * - cria Order PENDING_CHECKIN com reservedUntil (pickupDeadlineDays)
 * - ✅ multi-tenant: scopa tudo por companyId
 */
export async function POST(req: Request) {
    const headers = corsHeaders();

    try {
        const auth = await requireMobileAuth(req);
        const companyId = auth.companyId;

        if (auth.role !== 'CLIENT') {
            return NextResponse.json(
                { error: 'forbidden' },
                { status: 403, headers }
            );
        }

        let json: unknown = null;
        try {
            json = await req.json();
        } catch {
            return NextResponse.json(
                { error: 'invalid_json' },
                { status: 400, headers }
            );
        }

        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'invalid_body' },
                { status: 400, headers }
            );
        }

        const { productId, quantity } = parsed.data;
        const clientId = auth.sub;

        const result = await prisma.$transaction(async (tx) => {
            const product = await tx.product.findFirst({
                where: { id: productId, companyId, isActive: true }, // ✅ tenant scope
                select: {
                    id: true,
                    stockQuantity: true,
                    price: true, // Decimal
                    pickupDeadlineDays: true,
                    unitId: true,
                },
            });

            if (!product) {
                return {
                    ok: false as const,
                    status: 404,
                    error: 'product_not_found',
                };
            }

            if (!product.unitId) {
                return {
                    ok: false as const,
                    status: 400,
                    error: 'product_missing_unit',
                };
            }

            // ✅ defesa extra: unidade tem que ser do tenant
            const unitOk = await tx.unit.findFirst({
                where: { id: product.unitId, companyId }, // ✅ tenant scope
                select: { id: true },
            });

            if (!unitOk) {
                return {
                    ok: false as const,
                    status: 400,
                    error: 'invalid_unit',
                };
            }

            if (product.stockQuantity < quantity) {
                return {
                    ok: false as const,
                    status: 400,
                    error: 'out_of_stock',
                };
            }

            const deadlineDays =
                typeof product.pickupDeadlineDays === 'number' &&
                Number.isFinite(product.pickupDeadlineDays) &&
                product.pickupDeadlineDays > 0
                    ? product.pickupDeadlineDays
                    : 2;

            const reservedUntil = new Date();
            reservedUntil.setDate(reservedUntil.getDate() + deadlineDays);

            const unitPrice = product.price; // Decimal
            const totalPrice = unitPrice.mul(quantity); // Decimal

            // ✅ cria order primeiro
            const order = await tx.order.create({
                data: {
                    companyId, // ✅ tenant scope
                    clientId,
                    appointmentId: null,
                    // ✅ barberId removido: não existe mais no schema
                    status: 'PENDING_CHECKIN',
                    reservedUntil,
                    totalAmount: totalPrice,
                    unitId: product.unitId,
                },
                select: { id: true, reservedUntil: true },
            });

            // ✅ cria item com compat (tenta com companyId e faz fallback sem)
            await createOrderItemCompat(
                tx,
                {
                    orderId: order.id,
                    itemType: 'PRODUCT',
                    productId: product.id,
                    quantity,
                    unitPrice,
                    totalPrice,
                },
                companyId
            );

            return {
                ok: true as const,
                orderId: order.id,
                reservedUntil: order.reservedUntil,
            };
        });

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error },
                { status: result.status, headers }
            );
        }

        return NextResponse.json(
            {
                ok: true,
                orderId: result.orderId,
                reservedUntil: result.reservedUntil,
            },
            { status: 200, headers }
        );
    } catch (e: any) {
        const msg = String(e?.message ?? '');

        if (msg.includes('missing_token')) {
            return NextResponse.json(
                { error: 'missing_token' },
                { status: 401, headers }
            );
        }

        if (msg.includes('missing_company_id')) {
            return NextResponse.json(
                { error: 'missing_company_id' },
                { status: 401, headers }
            );
        }

        if (msg.includes('forbidden_company')) {
            return NextResponse.json(
                { error: 'forbidden_company' },
                { status: 403, headers }
            );
        }

        if (
            msg.includes('Invalid token') ||
            msg.includes('JWT') ||
            msg.includes('token') ||
            msg.includes('invalid_token')
        ) {
            return NextResponse.json(
                { error: 'invalid_token' },
                { status: 401, headers }
            );
        }

        console.error('[mobile product-sale] error:', e);
        return NextResponse.json(
            { error: 'server_error' },
            { status: 500, headers }
        );
    }
}
