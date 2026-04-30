// src/app/api/mobile/orders/route.ts
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';

export const dynamic = 'force-dynamic';

type Role = 'CLIENT' | 'BARBER' | 'ADMIN';

type MobileTokenPayload = {
    sub: string;
    role: Role;
    companyId: string;
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

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

function getPublicBaseUrl(req: Request) {
    const envBase = String(process.env.APP_PUBLIC_BASE_URL ?? '')
        .trim()
        .replace(/\/+$/, '');

    if (envBase) return envBase;

    const xfHost = getHeaderCI(req, 'x-forwarded-host');
    const host = xfHost || getHeaderCI(req, 'host') || '';
    const xfProto = getHeaderCI(req, 'x-forwarded-proto');

    const proto =
        xfProto ||
        (host.includes('localhost') || host.includes('127.0.0.1')
            ? 'http'
            : 'https');

    return `${proto}://${host}`.replace(/\/+$/, '');
}

function toAbsoluteImageUrl(baseUrl: string, raw: unknown): string | null {
    const v0 = String(raw ?? '').trim();
    if (!v0) return null;

    if (/^https?:\/\//i.test(v0)) return v0;

    let v = v0.replace(/\\/g, '/');
    if (v.startsWith('public/')) v = v.slice('public/'.length);
    if (!v.startsWith('/')) v = `/${v}`;

    return `${baseUrl}${v}`.replace(/([^:]\/)\/+/g, '$1');
}

function toNumberDecimal(v: unknown): number {
    if (v == null) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;

    if (typeof v === 'string') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
    }

    if (typeof v === 'object') {
        try {
            const s =
                typeof (v as any).toString === 'function'
                    ? String((v as any).toString())
                    : '';
            const n = Number(s.replace(',', '.'));
            return Number.isFinite(n) ? n : 0;
        } catch {
            return 0;
        }
    }

    return 0;
}

function money(n: number) {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v)) return 0;
    return Math.round(v * 100) / 100;
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
    const auth = getHeaderCI(req, 'authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

    if (!token) throw new Error('missing_token');

    const payload = await verifyAppJwt(token);

    const sub =
        typeof (payload as any)?.sub === 'string'
            ? String((payload as any).sub).trim()
            : '';

    if (!sub) throw new Error('invalid_token');

    let companyId =
        typeof (payload as any)?.companyId === 'string'
            ? String((payload as any).companyId).trim()
            : '';

    if (!companyId) {
        const h = getHeaderCI(req, 'x-company-id');
        if (h) companyId = h;
    }

    if (!companyId) throw new Error('missing_company_id');

    const membership = await prisma.companyMember.findFirst({
        where: { userId: sub, companyId, isActive: true },
        select: { id: true },
    });

    if (!membership) throw new Error('forbidden_company');

    return { ...(payload as any), sub, companyId } as MobileTokenPayload;
}

function parseLimit(raw: string | null): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 20;
    if (n <= 0) return 20;
    return Math.min(50, Math.floor(n));
}

function parseQuantity(v: unknown): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return 1;

    const q = Math.floor(n);
    return q >= 1 ? q : 1;
}

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
        return await tx.orderItem.create({ data });
    }
}

async function updateOrderItemCompat(
    tx: any,
    where: Record<string, any>,
    data: Record<string, any>
) {
    return await tx.orderItem.updateMany({ where, data });
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

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

        const body = await req.json().catch(() => ({}));
        const productId = String(body?.productId ?? '').trim();
        const quantity = parseQuantity(body?.quantity);

        if (!productId) {
            return NextResponse.json(
                { error: 'invalid_productId' },
                { status: 400, headers }
            );
        }

        const result = await prisma.$transaction(async (tx) => {
            const product = await tx.product.findFirst({
                where: { id: productId, companyId, isActive: true },
                select: {
                    id: true,
                    price: true,
                    stockQuantity: true,
                    pickupDeadlineDays: true,
                },
            });

            if (!product) {
                throw new Error('Produto não encontrado ou inativo.');
            }

            const stockQty = Number(product.stockQuantity ?? 0);

            if (!Number.isFinite(stockQty) || stockQty < quantity) {
                throw new Error('Quantidade indisponível no estoque.');
            }

            const deadlineDays =
                typeof product.pickupDeadlineDays === 'number' &&
                Number.isFinite(product.pickupDeadlineDays) &&
                product.pickupDeadlineDays > 0
                    ? product.pickupDeadlineDays
                    : 2;

            const reservedUntil = new Date();
            reservedUntil.setDate(reservedUntil.getDate() + deadlineDays);

            const unitPrice = new Prisma.Decimal(
                toNumberDecimal(product.price)
            );
            const itemTotal = unitPrice.mul(quantity);

            const now = new Date();

            const existingOrder = await tx.order.findFirst({
                where: {
                    companyId,
                    memberId: auth.sub,
                    status: 'PENDING_CHECKIN',
                    OR: [
                        { reservedUntil: null },
                        { reservedUntil: { gt: now } },
                    ],
                },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                select: {
                    id: true,
                    totalAmount: true,
                    reservedUntil: true,
                    items: {
                        where: { productId: product.id },
                        select: { id: true, quantity: true, totalPrice: true },
                        take: 1,
                    },
                },
            });

            const nextReservedUntil = (() => {
                if (!existingOrder?.reservedUntil) return reservedUntil;

                return existingOrder.reservedUntil > reservedUntil
                    ? existingOrder.reservedUntil
                    : reservedUntil;
            })();

            if (!existingOrder) {
                const order = await tx.order.create({
                    data: {
                        companyId,
                        memberId: auth.sub,
                        status: 'PENDING_CHECKIN',
                        reservedUntil,
                        totalAmount: itemTotal,
                    },
                    select: { id: true, reservedUntil: true },
                });

                await createOrderItemCompat(
                    tx,
                    {
                        orderId: order.id,
                        itemType: 'PRODUCT',
                        productId: product.id,
                        quantity,
                        unitPrice,
                        totalPrice: itemTotal,
                    },
                    companyId
                );

                await tx.product.update({
                    where: { id: product.id },
                    data: {
                        stockQuantity: { decrement: quantity },
                    },
                    select: { id: true },
                });

                return {
                    orderId: order.id,
                    reservedUntil: order.reservedUntil,
                };
            }

            const existingItem = existingOrder.items?.[0] ?? null;

            if (existingItem) {
                const currentQty = Number(existingItem.quantity ?? 0);
                const newQty = currentQty + quantity;

                if (stockQty < quantity) {
                    throw new Error('Quantidade indisponível no estoque.');
                }

                const newTotal = unitPrice.mul(newQty);
                const delta = newTotal.sub(existingItem.totalPrice);

                await updateOrderItemCompat(
                    tx,
                    {
                        id: existingItem.id,
                        orderId: existingOrder.id,
                        companyId,
                    },
                    {
                        quantity: newQty,
                        unitPrice,
                        totalPrice: newTotal,
                    }
                );

                await tx.order.updateMany({
                    where: { id: existingOrder.id, companyId },
                    data: {
                        reservedUntil: nextReservedUntil,
                        totalAmount: existingOrder.totalAmount.add(delta),
                    },
                });

                await tx.product.update({
                    where: { id: product.id },
                    data: {
                        stockQuantity: { decrement: quantity },
                    },
                    select: { id: true },
                });

                return {
                    orderId: existingOrder.id,
                    reservedUntil: nextReservedUntil,
                };
            }

            await createOrderItemCompat(
                tx,
                {
                    orderId: existingOrder.id,
                    itemType: 'PRODUCT',
                    productId: product.id,
                    quantity,
                    unitPrice,
                    totalPrice: itemTotal,
                },
                companyId
            );

            await tx.order.updateMany({
                where: { id: existingOrder.id, companyId },
                data: {
                    reservedUntil: nextReservedUntil,
                    totalAmount: existingOrder.totalAmount.add(itemTotal),
                },
            });

            await tx.product.update({
                where: { id: product.id },
                data: {
                    stockQuantity: { decrement: quantity },
                },
                select: { id: true },
            });

            return {
                orderId: existingOrder.id,
                reservedUntil: nextReservedUntil,
            };
        });

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

        if (
            msg.includes('Produto não encontrado') ||
            msg.includes('Quantidade indisponível')
        ) {
            return NextResponse.json({ error: msg }, { status: 400, headers });
        }

        console.error('[mobile orders POST] error:', e);

        return NextResponse.json(
            { error: 'server_error' },
            { status: 500, headers }
        );
    }
}

export async function GET(req: Request) {
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

        const baseUrl = getPublicBaseUrl(req);
        const url = new URL(req.url);

        const view = (url.searchParams.get('view') ?? '').trim();
        const statusRaw = (url.searchParams.get('status') ?? '').trim();
        const cursor = (url.searchParams.get('cursor') ?? '').trim();
        const limit = parseLimit(url.searchParams.get('limit'));

        const status =
            statusRaw ||
            (view === 'bag'
                ? 'PENDING_CHECKIN'
                : view === 'history'
                  ? 'HISTORY'
                  : '');

        const where: any = {
            companyId,
            memberId: auth.sub,
        };

        if (status && status !== 'HISTORY') {
            where.status = status;
        }

        if (status === 'HISTORY') {
            where.status = { in: ['COMPLETED', 'CANCELED'] };
        }

        const dbOrders = await prisma.order.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
                id: true,
                status: true,
                reservedUntil: true,
                totalAmount: true,
                createdAt: true,
                items: {
                    select: {
                        id: true,
                        quantity: true,
                        unitPrice: true,
                        totalPrice: true,
                        productId: true,
                        product: {
                            select: {
                                id: true,
                                name: true,
                                imageUrl: true,
                                legacyCategory: true,
                            },
                        },
                    },
                },
            },
        });

        const hasMore = dbOrders.length > limit;
        const page = hasMore ? dbOrders.slice(0, limit) : dbOrders;

        const orders = page.map((order) => {
            const items = (order.items ?? []).map((item) => {
                const quantity = Math.max(1, Number(item.quantity ?? 1));
                const unitPrice = money(toNumberDecimal(item.unitPrice));
                const totalPrice = money(toNumberDecimal(item.totalPrice));

                return {
                    id: item.id,
                    productId: item.productId,
                    quantity,
                    unitPrice,
                    totalPrice,
                    product: item.product
                        ? {
                              id: item.product.id,
                              name: item.product.name,
                              imageUrl: toAbsoluteImageUrl(
                                  baseUrl,
                                  item.product.imageUrl
                              ),
                              category: item.product.legacyCategory ?? null,
                          }
                        : null,
                };
            });

            const computedTotalAmount = money(
                items.reduce((acc, item) => acc + money(item.totalPrice), 0)
            );

            return {
                id: order.id,
                status: order.status,
                createdAt: order.createdAt,
                reservedUntil: order.reservedUntil,
                totalAmount:
                    items.length > 0
                        ? computedTotalAmount
                        : money(toNumberDecimal(order.totalAmount)),
                items,
            };
        });

        const nextCursor = hasMore
            ? (orders[orders.length - 1]?.id ?? null)
            : null;

        return NextResponse.json(
            {
                ok: true,
                orders,
                items: orders,
                count: orders.length,
                nextCursor,
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

        console.error('[mobile orders GET] error:', {
            message: e?.message,
            stack: e?.stack,
            error: e,
        });

        return NextResponse.json(
            { error: 'server_error' },
            { status: 500, headers }
        );
    }
}
