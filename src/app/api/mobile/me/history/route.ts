// src/app/api/mobile/me/history/route.ts
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type MobileTokenPayload = {
    sub: string;
    role?: 'CLIENT' | 'PROFESSIONAL' | 'ADMIN' | 'BARBER';
    email?: string;
    name?: string | null;
    companyId: string;
};

type HistoryItem = {
    id: string;
    title: string;
    description: string;
    date: string;
    icon: string;
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

function getJwtSecretKey() {
    const secret = process.env.APP_JWT_SECRET;
    if (!secret) throw new Error('APP_JWT_SECRET não definido no .env');
    return new TextEncoder().encode(secret);
}

function normalizeCompanyIdFromHeader(req: Request) {
    const h = req.headers.get('x-company-id');
    const v = String(h ?? '').trim();
    return v || '';
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
    const auth = req.headers.get('authorization') || '';
    const token = auth.toLowerCase().startsWith('bearer ')
        ? auth.slice(7).trim()
        : '';

    if (!token) throw new Error('missing_token');

    const { payload } = await jwtVerify(token, getJwtSecretKey());

    const sub = String((payload as any)?.sub || '').trim();
    if (!sub) throw new Error('invalid_token');

    const tokenCompanyId =
        typeof (payload as any)?.companyId === 'string'
            ? String((payload as any).companyId).trim()
            : '';

    const headerCompanyId = normalizeCompanyIdFromHeader(req);
    const companyId = tokenCompanyId || headerCompanyId;

    if (!companyId) throw new Error('companyid_missing');

    const membership = await prisma.companyMember.findFirst({
        where: { userId: sub, companyId, isActive: true },
        select: { id: true, role: true },
    });

    if (!membership) throw new Error('forbidden_company');

    return {
        sub,
        role: (payload as any).role,
        email: (payload as any).email,
        name: (payload as any).name ?? null,
        companyId,
    };
}

async function expirePendingOrdersForMember(args: {
    companyId: string;
    memberId: string;
}) {
    const now = new Date();

    await prisma.order.updateMany({
        where: {
            companyId: args.companyId,
            memberId: args.memberId,
            status: 'PENDING_CHECKIN',
            reservedUntil: { not: null, lte: now },
        },
        data: {
            status: 'CANCELED',
            expiredAt: now,
        },
    });
}

function formatPreviewDate(d: Date) {
    if (isToday(d)) return `Hoje às ${format(d, 'HH:mm', { locale: ptBR })}`;
    if (isYesterday(d)) {
        return `Ontem às ${format(d, 'HH:mm', { locale: ptBR })}`;
    }

    return format(d, 'dd/MM/yyyy • HH:mm', { locale: ptBR });
}

function safeDate(input: unknown) {
    const d = new Date((input as any) ?? Date.now());
    return Number.isFinite(d.getTime()) ? d : new Date();
}

function pickOrderOccurredAt(order: any) {
    const status = String(order?.status ?? '').toUpperCase();
    const isFinal = status === 'COMPLETED' || status === 'CANCELED';

    return safeDate(
        isFinal ? (order?.updatedAt ?? order?.createdAt) : order?.createdAt
    );
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
    try {
        const me = await requireMobileAuth(req);

        if (me.role && me.role !== 'CLIENT') {
            return NextResponse.json(
                { ok: false, error: 'Sem permissão' },
                { status: 403, headers: corsHeaders() }
            );
        }

        const memberId = me.sub;
        const companyId = me.companyId;

        await expirePendingOrdersForMember({ companyId, memberId });

        const orders = await prisma.order.findMany({
            where: { companyId, memberId },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
                id: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                items: {
                    select: {
                        quantity: true,
                        productId: true,
                        product: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        const productOrders = orders
            .filter((order) =>
                Array.isArray(order.items)
                    ? order.items.some(
                          (item) =>
                              item.productId != null || item.product?.id != null
                      )
                    : false
            )
            .filter((order) => {
                const status = String(order.status ?? '').toUpperCase();
                return status !== 'PENDING_CHECKIN';
            });

        const ordersOut: HistoryItem[] = productOrders
            .map((order) => {
                const occurredAt = pickOrderOccurredAt(order);

                const itemsLabel = Array.isArray(order.items)
                    ? order.items
                          .filter(
                              (item) =>
                                  item.productId != null ||
                                  item.product?.id != null
                          )
                          .map(
                              (item) =>
                                  `${Number(item.quantity ?? 1)}x ${
                                      item.product?.name ?? 'Produto'
                                  }`
                          )
                          .filter(Boolean)
                          .join(', ')
                    : '';

                const status = String(order.status ?? '').toUpperCase();
                const statusLabel =
                    status === 'COMPLETED'
                        ? 'Retirado'
                        : status === 'CANCELED'
                          ? 'Cancelado'
                          : 'Pedido';

                return {
                    occurredAt,
                    item: {
                        id: `order:${order.id}`,
                        title: `Pedido #${String(order.id).slice(0, 8)}`,
                        description: itemsLabel
                            ? `${statusLabel} • ${itemsLabel}`
                            : `${statusLabel} • Compra de produto`,
                        date: formatPreviewDate(occurredAt),
                        icon: 'shopping-bag',
                    } satisfies HistoryItem,
                };
            })
            .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
            .map((x) => x.item)
            .slice(0, 20);

        const _debug =
            process.env.NODE_ENV === 'development'
                ? {
                      companyId,
                      ordersTotal: orders.length,
                      productOrdersCount: productOrders.length,
                      out: {
                          done: 0,
                          canceled: 0,
                          orders: ordersOut.length,
                          reviews: 0,
                      },
                  }
                : undefined;

        return NextResponse.json(
            {
                ok: true,
                reviews: [],
                done: [],
                canceled: [],
                orders: ordersOut,
                _debug,
            },
            { status: 200, headers: corsHeaders() }
        );
    } catch (err: any) {
        const message = String(err?.message || 'Erro inesperado').trim();
        const lower = message.toLowerCase();

        const isAuth =
            lower.includes('missing_token') ||
            lower.includes('invalid_token') ||
            lower.includes('jwt') ||
            lower.includes('signature') ||
            lower.includes('companyid_missing') ||
            lower.includes('companyid_missing') ||
            lower.includes('forbidden_company');

        return NextResponse.json(
            {
                ok: false,
                error: isAuth ? 'Não autorizado' : 'Erro ao carregar histórico',
                _debug:
                    process.env.NODE_ENV === 'development'
                        ? { where: 'catch', message }
                        : undefined,
            },
            { status: isAuth ? 401 : 500, headers: corsHeaders() }
        );
    }
}
