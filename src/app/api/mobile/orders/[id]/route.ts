// src/app/api/mobile/orders/[id]/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';

type Role = 'CLIENT' | 'BARBER' | 'ADMIN';

type MobileTokenPayload = {
    sub: string;
    role: Role;
    companyId: string;
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
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

function money(n: number) {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v)) return 0;
    return Math.round(v * 100) / 100;
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

async function expireOrderIfNeeded(args: {
    companyId: string;
    memberId: string;
    orderId: string;
}) {
    const now = new Date();

    const order = await prisma.order.findFirst({
        where: {
            id: args.orderId,
            companyId: args.companyId,
            memberId: args.memberId,
        },
        select: {
            id: true,
            status: true,
            reservedUntil: true,
            inventoryRevertedAt: true,
            items: {
                select: {
                    id: true,
                    productId: true,
                    quantity: true,
                },
            },
        },
    });

    if (!order?.id) return null;

    const status = String(order.status ?? '')
        .toUpperCase()
        .trim();
    const reservedUntil =
        order.reservedUntil instanceof Date ? order.reservedUntil : null;

    const shouldExpire =
        status === 'PENDING_CHECKIN' &&
        !!reservedUntil &&
        reservedUntil.getTime() <= now.getTime();

    if (!shouldExpire) return order;

    await prisma.$transaction(async (tx) => {
        if (!order.inventoryRevertedAt) {
            const productItems = (order.items ?? []).filter(
                (item) => item.productId && Number(item.quantity ?? 0) > 0
            );

            for (const item of productItems) {
                await tx.product.update({
                    where: { id: String(item.productId) },
                    data: {
                        stockQuantity: {
                            increment: Math.max(1, Number(item.quantity ?? 1)),
                        },
                    },
                });
            }

            await tx.order.update({
                where: { id: order.id },
                data: {
                    inventoryRevertedAt: now,
                },
                select: { id: true },
            });
        }

        await tx.order.update({
            where: { id: order.id },
            data: {
                status: 'CANCELED',
                expiredAt: now,
            },
            select: { id: true },
        });
    });

    return {
        ...order,
        status: 'CANCELED',
        expiredAt: now,
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
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

        const { id } = await ctx.params;
        const orderId = String(id ?? '').trim();

        if (!orderId) {
            return NextResponse.json(
                { error: 'missing_order_id' },
                { status: 400, headers }
            );
        }

        await expireOrderIfNeeded({
            companyId,
            memberId: auth.sub,
            orderId,
        });

        const baseUrl = getPublicBaseUrl(req);

        const orderFromDb = await prisma.order.findFirst({
            where: {
                id: orderId,
                companyId,
                memberId: auth.sub,
            },
            select: {
                id: true,
                status: true,
                createdAt: true,
                reservedUntil: true,
                totalAmount: true,
                items: {
                    select: {
                        id: true,
                        productId: true,
                        quantity: true,
                        unitPrice: true,
                        totalPrice: true,
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

        if (!orderFromDb?.id) {
            return NextResponse.json(
                { error: 'not_found' },
                { status: 404, headers }
            );
        }

        const items = (orderFromDb.items ?? []).map((item) => {
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

        const order = {
            id: orderFromDb.id,
            status: orderFromDb.status,
            createdAt: orderFromDb.createdAt,
            reservedUntil: orderFromDb.reservedUntil,
            totalAmount:
                items.length > 0
                    ? computedTotalAmount
                    : money(toNumberDecimal(orderFromDb.totalAmount)),
            items,
        };

        return NextResponse.json(
            { ok: true, order, item: order },
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

        console.error('[mobile orders/:id] error:', e);

        return NextResponse.json(
            { error: 'server_error' },
            { status: 500, headers }
        );
    }
}
