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

    // ✅ Prefer token companyId; fallback to header (compat com clientes antigos)
    const tokenCompanyId =
        typeof (payload as any)?.companyId === 'string'
            ? String((payload as any).companyId).trim()
            : '';

    const headerCompanyId = normalizeCompanyIdFromHeader(req);

    const companyId = tokenCompanyId || headerCompanyId;
    if (!companyId) throw new Error('companyid_missing');

    // ✅ anti-spoof: user precisa ter membership nesse companyId
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
 * ✅ Expiração on-demand (sem cron)
 * - cancela pedidos PENDING_CHECKIN vencidos
 * - faz sumir da sacolinha (view=bag)
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

    // ✅ datas semânticas no seu schema
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
    const s = String(appt?.professional?.name ?? '').trim();
    return s || 'Profissional';
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

        // ✅ Passo 1 do histórico: expirar pedidos vencidos (on-demand)
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
                        updatedAt: true,
                        createdAt: true,
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
                        updatedAt: true,
                        createdAt: true,
                        cancelledAt: true,
                        description: true,
                        professional: { select: { name: true } },
                        service: { select: { name: true } },
                    },
                }),

                prisma.order.findMany({
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
                                service: { select: { name: true } },
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
                        updatedAt: true,
                        createdAt: true,
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

        // ✅ só pedidos que tem produto (não serviço) e não estão pendentes-checkin
        const productOrders = (orders as any[])
            .filter((order) =>
                Array.isArray(order?.items)
                    ? order.items.some(
                          (item: any) =>
                              item?.productId != null ||
                              item?.product?.id != null
                      )
                    : false
            )
            .filter((order) => {
                const st = String(order?.status ?? '').toUpperCase();
                return st !== 'PENDING_CHECKIN';
            });

        // ----------------------------
        // ✅ Monta seções separadas (contrato do app)
        // ----------------------------

        const done: HistoryItem[] = (doneAppointments as any[])
            .map((appt) => {
                const occurredAt = pickApptOccurredAt(appt);
                const prof = pickProfessionalName(appt);
                const svc = pickServiceName(appt);

                return {
                    occurredAt,
                    item: {
                        id: `done:${appt.id}`,
                        title: svc,
                        description: `Concluído • ${prof}`,
                        date: formatPreviewDate(occurredAt),
                        icon: 'scissors',
                    } satisfies HistoryItem,
                };
            })
            .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
            .map((x) => x.item)
            .slice(0, 10);

        const canceled: HistoryItem[] = (canceledAppointments as any[])
            .map((appt) => {
                const occurredAt = pickApptOccurredAt(appt);
                const prof = pickProfessionalName(appt);
                const svc = pickServiceName(appt);

                return {
                    occurredAt,
                    item: {
                        id: `cancel:${appt.id}`,
                        title: svc,
                        description: `Cancelado • ${prof}`,
                        date: formatPreviewDate(occurredAt),
                        icon: 'calendar',
                    } satisfies HistoryItem,
                };
            })
            .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
            .map((x) => x.item)
            .slice(0, 10);

        const ordersOut: HistoryItem[] = (productOrders as any[])
            .map((order) => {
                const occurredAt = pickOrderOccurredAt(order);

                const itemsLabel = Array.isArray(order?.items)
                    ? order.items
                          .filter(
                              (i: any) =>
                                  i?.productId != null || i?.product?.id != null
                          )
                          .map(
                              (i: any) =>
                                  `${Number(i?.quantity ?? 1)}x ${
                                      i?.product?.name ?? 'Produto'
                                  }`
                          )
                          .filter(Boolean)
                          .join(', ')
                    : '';

                const status = String(order?.status ?? '').toUpperCase();
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

        const reviews: HistoryItem[] = (reviewedAppts as any[])
            .map((appt) => {
                const reviewAt =
                    appt?.review?.createdAt ?? appt?.review?.updatedAt;

                const occurredAt = safeDate(
                    reviewAt ?? appt?.updatedAt ?? appt?.createdAt
                );

                const prof = pickProfessionalName(appt);
                const svc = pickServiceName(appt);
                const ratingLabel = appt?.review?.rating
                    ? safeStars(appt.review.rating)
                    : '';

                return {
                    occurredAt,
                    item: {
                        id: `review:${appt.id}`,
                        title: 'Avaliação enviada',
                        description: ratingLabel
                            ? `${prof} • ${svc} • ${ratingLabel}`
                            : `${prof} • ${svc}`,
                        date: formatPreviewDate(occurredAt),
                        icon: 'star',
                    } satisfies HistoryItem,
                };
            })
            .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
            .map((x) => x.item)
            .slice(0, 10);

        const _debug =
            process.env.NODE_ENV === 'development'
                ? {
                      companyId,
                      doneCount: (doneAppointments as any[]).length,
                      canceledCount: (canceledAppointments as any[]).length,
                      ordersTotal: (orders as any[]).length,
                      productOrdersCount: productOrders.length,
                      reviewsDoneCount: (reviewedAppts as any[]).length,
                      out: {
                          done: done.length,
                          canceled: canceled.length,
                          orders: ordersOut.length,
                          reviews: reviews.length,
                      },
                  }
                : undefined;

        return NextResponse.json(
            {
                ok: true,
                reviews,
                done,
                canceled,
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
            lower.includes('companyId_missing') ||
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
