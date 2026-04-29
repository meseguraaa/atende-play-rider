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
    companyId: string; // ✅ multi-tenant obrigatório
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

// ✅ pega header case-insensitive (padrão dos outros endpoints)
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

function getJwtSecretKey() {
    const secret = process.env.APP_JWT_SECRET;
    if (!secret) throw new Error('APP_JWT_SECRET não definido no .env');
    return new TextEncoder().encode(secret);
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
    const auth = getHeaderCI(req, 'authorization') || '';
    const token = auth.toLowerCase().startsWith('bearer ')
        ? auth.slice(7).trim()
        : '';
    if (!token) throw new Error('missing_token');

    const { payload } = await jwtVerify(token, getJwtSecretKey());

    const sub = String((payload as any)?.sub || '').trim();
    if (!sub) throw new Error('invalid_token');

    // 1) companyId no JWT
    let companyId =
        typeof (payload as any)?.companyId === 'string'
            ? String((payload as any).companyId).trim()
            : '';

    // 2) fallback: x-company-id (o app manda)
    if (!companyId) {
        const h = getHeaderCI(req, 'x-company-id');
        if (h) companyId = h;
    }

    if (!companyId) throw new Error('missing_company_id');

    // ✅ valida membership (anti-spoof)
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

/* ---------------------------------------------------------
 * ✅ Expiração on-demand (preview também!)
 * - cancela pedidos PENDING_CHECKIN vencidos
 * - some da sacolinha (view=bag)
 * - entra no histórico como CANCELED (view=history)
 * ---------------------------------------------------------*/
async function expirePendingOrdersForClient(args: {
    companyId: string;
    clientId: string;
}) {
    const now = new Date();

    await prisma.order.updateMany({
        where: {
            companyId: args.companyId,
            clientId: args.clientId,
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
    if (isYesterday(d))
        return `Ontem às ${format(d, 'HH:mm', { locale: ptBR })}`;
    return format(d, 'dd/MM/yyyy • HH:mm', { locale: ptBR });
}

function safeDate(input: any) {
    const d = new Date(input ?? Date.now());
    return Number.isFinite(d.getTime()) ? d : new Date();
}

function pickApptOccurredAt(appt: any) {
    const status = String(appt?.status ?? '').toUpperCase();

    // ✅ datas “semânticas” do seu schema
    const d =
        status === 'DONE'
            ? (appt?.doneAt ?? appt?.checkedOutAt ?? appt?.updatedAt)
            : status === 'CANCELED'
              ? (appt?.cancelledAt ?? appt?.updatedAt)
              : (appt?.updatedAt ?? appt?.scheduleAt ?? appt?.createdAt);

    return safeDate(d);
}

function pickOrderOccurredAt(order: any) {
    const status = String(order?.status ?? '').toUpperCase();
    const isFinal = status === 'COMPLETED' || status === 'CANCELED';

    const d = isFinal
        ? (order?.updatedAt ?? order?.createdAt)
        : order?.createdAt;
    return safeDate(d);
}

function safeStars(n: any) {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v) || v <= 0) return '';
    const clamped = Math.max(1, Math.min(5, Math.round(v)));
    return '★'.repeat(clamped);
}

function pickProfessionalName(appt: any) {
    const candidates = [appt?.professional?.name];
    for (const c of candidates) {
        const s = String(c ?? '').trim();
        if (s) return s;
    }
    return 'Profissional';
}

function pickServiceName(appt: any) {
    const candidates = [appt?.service?.name, appt?.description];
    for (const c of candidates) {
        const s = String(c ?? '').trim();
        if (s) return s;
    }
    return 'Serviço';
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

        const clientId = me.sub;
        const companyId = me.companyId;

        // ✅ Passo 0 do preview: expirar pedidos vencidos (on-demand)
        await expirePendingOrdersForClient({ companyId, clientId });

        const [doneAppointments, canceledAppointments, orders, reviewedAppts] =
            await Promise.all([
                prisma.appointment.findMany({
                    where: { companyId, clientId, status: 'DONE' },
                    orderBy: { scheduleAt: 'desc' },
                    take: 10,
                    select: {
                        id: true,
                        status: true,
                        scheduleAt: true,
                        createdAt: true,
                        updatedAt: true,
                        doneAt: true,
                        checkedOutAt: true,
                        description: true,
                        professional: { select: { name: true } },
                        service: { select: { name: true } },
                    },
                }),

                prisma.appointment.findMany({
                    where: { companyId, clientId, status: 'CANCELED' },
                    orderBy: { scheduleAt: 'desc' },
                    take: 10,
                    select: {
                        id: true,
                        status: true,
                        scheduleAt: true,
                        createdAt: true,
                        updatedAt: true,
                        cancelledAt: true,
                        description: true,
                        professional: { select: { name: true } },
                        service: { select: { name: true } },
                    },
                }),

                prisma.order.findMany({
                    // ⚠️ no schema Order.clientId é opcional, mas o filtro funciona
                    where: { companyId, clientId },
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
                                product: { select: { id: true, name: true } },
                            },
                        },
                    },
                }),

                prisma.appointment.findMany({
                    where: {
                        companyId,
                        clientId,
                        status: 'DONE',
                        review: { isNot: null },
                    },
                    orderBy: { updatedAt: 'desc' },
                    take: 10,
                    select: {
                        id: true,
                        status: true,
                        createdAt: true,
                        updatedAt: true,
                        description: true,
                        professional: { select: { name: true } },
                        service: { select: { name: true } },
                        review: {
                            select: {
                                rating: true,
                                createdAt: true,
                                updatedAt: true,
                            },
                        },
                    },
                }),
            ]);

        const productOrders = (orders as any[])
            .filter((order) =>
                (order.items ?? []).some(
                    (item: any) =>
                        item?.productId != null || item?.product?.id != null
                )
            )
            .filter((order) => {
                const st = String(order?.status ?? '').toUpperCase();
                return st !== 'PENDING_CHECKIN';
            });

        const normalized: Array<{ occurredAt: Date; item: HistoryItem }> = [];

        for (const appt of doneAppointments as any[]) {
            const occurredAt = pickApptOccurredAt(appt);
            const prof = pickProfessionalName(appt);
            const svc = pickServiceName(appt);

            normalized.push({
                occurredAt,
                item: {
                    id: `done:${appt.id}`,
                    title: svc,
                    description: `Concluído • ${prof}`,
                    date: formatPreviewDate(occurredAt),
                    icon: 'scissors',
                },
            });
        }

        for (const appt of canceledAppointments as any[]) {
            const occurredAt = pickApptOccurredAt(appt);
            const prof = pickProfessionalName(appt);
            const svc = pickServiceName(appt);

            normalized.push({
                occurredAt,
                item: {
                    id: `cancel:${appt.id}`,
                    title: svc,
                    description: `Cancelado • ${prof}`,
                    date: formatPreviewDate(occurredAt),
                    icon: 'calendar',
                },
            });
        }

        for (const order of productOrders as any[]) {
            const occurredAt = pickOrderOccurredAt(order);

            const itemsLabel = (order.items ?? [])
                .filter(
                    (i: any) => i?.productId != null || i?.product?.id != null
                )
                .map(
                    (i: any) =>
                        `${Number(i.quantity ?? 1)}x ${i.product?.name ?? 'Produto'}`
                )
                .join(', ');

            const status = String(order.status ?? '').toUpperCase();
            const statusLabel =
                status === 'COMPLETED'
                    ? 'Retirado'
                    : status === 'CANCELED'
                      ? 'Cancelado'
                      : 'Pedido';

            normalized.push({
                occurredAt,
                item: {
                    id: `order:${order.id}`,
                    title: `Pedido #${String(order.id).slice(0, 8)}`,
                    description: itemsLabel
                        ? `${statusLabel} • ${itemsLabel}`
                        : `${statusLabel} • Compra de produto`,
                    date: formatPreviewDate(occurredAt),
                    icon: 'shopping-bag',
                },
            });
        }

        for (const appt of reviewedAppts as any[]) {
            const reviewAt = appt?.review?.createdAt ?? appt?.review?.updatedAt;
            const occurredAt = safeDate(
                reviewAt ?? appt.updatedAt ?? appt.createdAt
            );

            const prof = pickProfessionalName(appt);
            const svc = pickServiceName(appt);
            const ratingLabel = appt?.review?.rating
                ? safeStars(appt.review.rating)
                : '';

            normalized.push({
                occurredAt,
                item: {
                    id: `review:${appt.id}`,
                    title: 'Avaliação enviada',
                    description: ratingLabel
                        ? `${prof} • ${svc} • ${ratingLabel}`
                        : `${prof} • ${svc}`,
                    date: formatPreviewDate(occurredAt),
                    icon: 'star',
                },
            });
        }

        normalized.sort(
            (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()
        );
        const items = normalized.slice(0, 5).map((x) => x.item);

        const _debug = {
            companyId,
            doneCount: (doneAppointments as any[]).length,
            canceledCount: (canceledAppointments as any[]).length,
            ordersTotal: (orders as any[]).length,
            productOrdersCount: productOrders.length,
            reviewsDoneCount: (reviewedAppts as any[]).length,
            normalizedCount: normalized.length,
            topTypes: items.map((it) => String(it.id).split(':')[0]),
        };

        return NextResponse.json(
            { ok: true, items, _debug },
            { status: 200, headers: corsHeaders() }
        );
    } catch (err: any) {
        const message = String(err?.message || 'Erro inesperado').trim();
        const lower = message.toLowerCase();

        const isAuth =
            lower.includes('missing_token') ||
            lower.includes('invalid_token') ||
            lower.includes('missing_company_id') ||
            lower.includes('forbidden_company') ||
            lower.includes('jwt') ||
            lower.includes('signature');

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
