// src/app/api/mobile/cart/items/[itemId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type MobileTokenPayload = {
    sub: string;
    role?: 'CLIENT' | 'PROFESSIONAL' | 'ADMIN' | 'BARBER';
    email?: string;
    name?: string | null;
    companyId: string; // ✅ multi-tenant obrigatório
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'DELETE,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

function getJwtSecretKey() {
    const secret = process.env.APP_JWT_SECRET;
    if (!secret) throw new Error('APP_JWT_SECRET não definido no .env');
    return new TextEncoder().encode(secret);
}

// ✅ header case-insensitive (compat com variações de cliente)
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

function normalizeCompanyIdFromHeader(req: Request) {
    return getHeaderCI(req, 'x-company-id') ?? '';
}

function normalizeString(v: unknown) {
    return String(v ?? '').trim();
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
    const auth = String(req.headers.get('authorization') ?? '').trim();
    const token = auth.toLowerCase().startsWith('bearer ')
        ? auth.slice(7).trim()
        : '';
    if (!token) throw new Error('missing_token');

    const { payload } = await jwtVerify(token, getJwtSecretKey());

    const sub = normalizeString((payload as any)?.sub);
    if (!sub) throw new Error('invalid_token');

    // ✅ Prefer token companyId; fallback to header (compat com clientes antigos)
    const tokenCompanyId =
        typeof (payload as any)?.companyId === 'string'
            ? normalizeString((payload as any).companyId)
            : '';

    const headerCompanyId = normalizeCompanyIdFromHeader(req);

    const companyId = tokenCompanyId || headerCompanyId;
    if (!companyId) throw new Error('companyId_missing');

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

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// ✅ Next (validator do projeto): params vem como Promise
type DeleteCtx = {
    params: Promise<{ itemId: string }>;
};

export async function DELETE(req: NextRequest, ctx: DeleteCtx) {
    try {
        const me = await requireMobileAuth(req);

        // ✅ somente CLIENT pode mexer na sacolinha
        // (compat: se role vier vazio em token antigo, deixa passar)
        if (me.role && me.role !== 'CLIENT') {
            return NextResponse.json(
                { ok: false, error: 'Sem permissão' },
                { status: 403, headers: corsHeaders() }
            );
        }

        const { itemId: rawItemId } = await ctx.params;

        const itemId = normalizeString(rawItemId);
        if (!itemId) {
            return NextResponse.json(
                { ok: false, error: 'itemId inválido' },
                { status: 400, headers: corsHeaders() }
            );
        }

        const companyId = me.companyId;
        const clientId = me.sub;

        // 1) localizar o item (por company) + pegar dono do pedido
        const item = await prisma.orderItem.findFirst({
            where: {
                id: itemId,
                companyId,
            },
            select: {
                id: true,
                orderId: true,
                order: {
                    select: {
                        id: true,
                        status: true,
                        clientId: true,
                    },
                },
            },
        });

        // 404 “neutro”
        if (!item?.id || !item?.orderId) {
            return NextResponse.json(
                { ok: false, error: 'Item não encontrado' },
                { status: 404, headers: corsHeaders() }
            );
        }

        // ✅ garante que o item é do pedido do próprio cliente (clientId é opcional no schema)
        const ownerId = normalizeString(item.order?.clientId);
        if (!ownerId || ownerId !== clientId) {
            return NextResponse.json(
                { ok: false, error: 'Item não encontrado' },
                { status: 404, headers: corsHeaders() }
            );
        }

        const status = normalizeString(item.order?.status).toUpperCase();

        // Só permite remover enquanto está pendente de retirada
        if (status !== 'PENDING_CHECKIN') {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Não é possível remover itens deste pedido agora',
                },
                { status: 409, headers: corsHeaders() }
            );
        }

        // 2) remover item + recalcular total / cancelar se ficou vazio (transação)
        const result = await prisma.$transaction(
            async (tx: Prisma.TransactionClient) => {
                await tx.orderItem.delete({ where: { id: item.id } });

                const remaining = await tx.orderItem.findMany({
                    where: { orderId: item.orderId },
                    select: { totalPrice: true },
                });

                if (!remaining.length) {
                    // ✅ se não sobrou nada, cancela o pedido:
                    // - sai da sacolinha
                    // - aparece no histórico como cancelado
                    const canceled = await tx.order.update({
                        where: { id: item.orderId },
                        data: {
                            status: 'CANCELED',
                            totalAmount: 0,
                            expiredAt: new Date(), // mantém seu padrão atual
                        },
                        select: { id: true, status: true, totalAmount: true },
                    });

                    return { mode: 'canceled' as const, order: canceled };
                }

                const newTotal = remaining.reduce((acc, it) => {
                    const v = Number(it.totalPrice ?? 0);
                    return acc + (Number.isFinite(v) ? v : 0);
                }, 0);

                const updated = await tx.order.update({
                    where: { id: item.orderId },
                    data: { totalAmount: newTotal },
                    select: { id: true, status: true, totalAmount: true },
                });

                return { mode: 'updated' as const, order: updated };
            }
        );

        return NextResponse.json(
            { ok: true, ...result },
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
            lower.includes('forbidden_company');

        return NextResponse.json(
            {
                ok: false,
                error: isAuth
                    ? 'Não autorizado'
                    : 'Erro ao remover item do carrinho',
                _debug:
                    process.env.NODE_ENV === 'development'
                        ? { where: 'catch', message }
                        : undefined,
            },
            { status: isAuth ? 401 : 500, headers: corsHeaders() }
        );
    }
}
