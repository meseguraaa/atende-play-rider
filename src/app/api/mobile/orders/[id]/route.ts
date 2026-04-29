// src/app/api/mobile/orders/[id]/route.ts
import { NextResponse } from 'next/server';
import { CustomerLevel } from '@prisma/client';
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

/* ---------------------------------------------------------
 * 🖼️ URL absoluta para imagens (mobile-safe)
 * ---------------------------------------------------------*/
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

/* ---------------------------------------------------------
 * ✅ Expiração on-demand (sem cron)
 * ---------------------------------------------------------*/
async function expireOrderIfNeeded(args: {
    companyId: string;
    clientId: string;
    orderId: string;
}) {
    const now = new Date();

    const o = await prisma.order.findFirst({
        where: {
            id: args.orderId,
            companyId: args.companyId,
            clientId: args.clientId,
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

    if (!o?.id) return null;

    const status = String(o.status ?? '')
        .toUpperCase()
        .trim();
    const reservedUntil =
        o.reservedUntil instanceof Date ? o.reservedUntil : null;

    const shouldExpire =
        status === 'PENDING_CHECKIN' &&
        !!reservedUntil &&
        reservedUntil.getTime() <= now.getTime();

    if (!shouldExpire) return o;

    await prisma.$transaction(async (tx) => {
        if (!o.inventoryRevertedAt) {
            const productItems = (o.items ?? []).filter(
                (it) => it.productId && Number(it.quantity ?? 0) > 0
            );

            for (const it of productItems) {
                const pid = String(it.productId);
                const qty = Math.max(1, Number(it.quantity ?? 1));

                await tx.product.update({
                    where: { id: pid },
                    data: {
                        stockQuantity: { increment: qty },
                    },
                });
            }

            await tx.order.update({
                where: { id: o.id },
                data: {
                    inventoryRevertedAt: now,
                },
                select: { id: true },
            });
        }

        await tx.order.update({
            where: { id: o.id },
            data: {
                status: 'CANCELED',
                expiredAt: now,
            },
            select: { id: true },
        });
    });

    return {
        ...o,
        status: 'CANCELED',
        expiredAt: now,
    };
}

/* ---------------------------------------------------------
 * 🔥 MOTOR DE PREÇO (Mobile) - DESCONTO (%)
 * ---------------------------------------------------------*/

const LEVEL_FALLBACK: Record<CustomerLevel, CustomerLevel[]> = {
    DIAMANTE: ['DIAMANTE', 'OURO', 'PRATA', 'BRONZE'],
    OURO: ['OURO', 'PRATA', 'BRONZE'],
    PRATA: ['PRATA', 'BRONZE'],
    BRONZE: ['BRONZE'],
};

function getDatePartsInTz(date: Date, timeZone: string) {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = fmt.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return {
        year: Number(get('year')),
        month: Number(get('month')),
        day: Number(get('day')),
    };
}

function tzMidnightUtc(year: number, month: number, day: number) {
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(
        2,
        '0'
    )}-${String(day).padStart(2, '0')}T00:00:00Z`;
    return new Date(iso);
}

function addDays(date: Date, days: number) {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

function isWithinInclusive(date: Date, start: Date, end: Date) {
    const t = date.getTime();
    return t >= start.getTime() && t <= end.getTime();
}

function coerceCustomerLevel(value: unknown): CustomerLevel | null {
    return value === 'BRONZE' ||
        value === 'PRATA' ||
        value === 'OURO' ||
        value === 'DIAMANTE'
        ? (value as CustomerLevel)
        : null;
}

function clampPct(n: number) {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.floor(n)));
}

function roundMoney(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calcFinalPrice(basePrice: number, discountPct: number) {
    const pct = clampPct(discountPct);
    const base = Number.isFinite(basePrice) ? basePrice : 0;
    const final = base * (1 - pct / 100);
    return roundMoney(final);
}

function money(n: number) {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v)) return 0;
    return Math.round(v * 100) / 100;
}

async function getCustomerLevelForUnit(args: {
    companyId: string;
    userId: string;
    unitId: string | null;
}): Promise<CustomerLevel> {
    if (!args.unitId) return 'BRONZE';

    const s = await prisma.customerLevelState.findFirst({
        where: {
            companyId: args.companyId,
            userId: args.userId,
            unitId: args.unitId,
        },
        select: { levelCurrent: true },
    });

    const lvl = coerceCustomerLevel(s?.levelCurrent);
    return lvl ?? 'BRONZE';
}

async function resolveProductUnitPrice(args: {
    productId: string;
    clientId: string | null;
    effectiveLevel?: CustomerLevel;
    timeZone?: string;
    now?: Date;
    companyId: string;
}) {
    const timeZone = args.timeZone ?? 'America/Sao_Paulo';
    const now = args.now ?? new Date();
    const effectiveLevel: CustomerLevel = args.effectiveLevel ?? 'BRONZE';

    const clientPromise = args.clientId
        ? prisma.user.findUnique({
              where: { id: args.clientId },
              select: { id: true, birthday: true },
          })
        : Promise.resolve(null);

    const [product, client] = await Promise.all([
        prisma.product.findFirst({
            where: {
                id: args.productId,
                isActive: true,
                companyId: args.companyId,
                unit: { companyId: args.companyId },
            },
            select: {
                id: true,
                price: true,
                unitId: true,
                birthdayBenefitEnabled: true,
                birthdayPriceLevel: true,
            },
        }),
        clientPromise,
    ]);

    if (!product) throw new Error('Produto não encontrado.');

    const discountRows = await prisma.productDiscountByLevel.findMany({
        where: {
            productId: product.id,
            companyId: args.companyId,
        },
        select: { level: true, discountPct: true },
    });

    const discountByLevel = new Map<CustomerLevel, number>();
    for (const row of discountRows) {
        const lvl = coerceCustomerLevel(row.level);
        if (!lvl) continue;
        discountByLevel.set(lvl, clampPct(Number(row.discountPct)));
    }

    function pickDiscount(level: CustomerLevel) {
        for (const l of LEVEL_FALLBACK[level]) {
            if (discountByLevel.has(l)) {
                return { level: l, discountPct: discountByLevel.get(l)! };
            }
        }
        return { level: 'BRONZE' as CustomerLevel, discountPct: 0 };
    }

    const basePrice = Number(product.price);

    let inBirthdayWindow = false;

    if (client?.birthday && product.birthdayBenefitEnabled) {
        const nowParts = getDatePartsInTz(now, timeZone);
        const b = getDatePartsInTz(client.birthday, timeZone);

        const birthdayThisYear = tzMidnightUtc(nowParts.year, b.month, b.day);
        const start = addDays(birthdayThisYear, -3);
        const end = addDays(birthdayThisYear, +3);

        const todayAnchor = tzMidnightUtc(
            nowParts.year,
            nowParts.month,
            nowParts.day
        );
        inBirthdayWindow = isWithinInclusive(todayAnchor, start, end);
    }

    if (inBirthdayWindow && product.birthdayBenefitEnabled) {
        const chosen = (coerceCustomerLevel(product.birthdayPriceLevel) ??
            ('DIAMANTE' as CustomerLevel)) as CustomerLevel;

        const picked = pickDiscount(chosen);
        const finalPrice = calcFinalPrice(basePrice, picked.discountPct);

        return {
            unitId: product.unitId,
            basePrice,
            finalPrice,
            discountPct: picked.discountPct,
            appliedLevel: picked.level,
            appliedBecause: 'BIRTHDAY' as const,
            inBirthdayWindow: true,
        };
    }

    const picked = pickDiscount(effectiveLevel);
    const finalPrice = calcFinalPrice(basePrice, picked.discountPct);

    return {
        unitId: product.unitId,
        basePrice,
        finalPrice,
        discountPct: picked.discountPct,
        appliedLevel: picked.level,
        appliedBecause:
            picked.discountPct > 0 ? ('LEVEL' as const) : ('BASE' as const),
        inBirthdayWindow: false,
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

        const baseUrl = getPublicBaseUrl(req);

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
            clientId: auth.sub,
            orderId,
        });

        const o = await prisma.order.findFirst({
            where: {
                id: orderId,
                companyId,
                clientId: auth.sub,
            },
            select: {
                id: true,
                status: true,
                createdAt: true,
                reservedUntil: true,
                totalAmount: true,
                unitId: true,
                unit: { select: { id: true, name: true } },
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

        if (!o?.id) {
            return NextResponse.json(
                { error: 'not_found' },
                { status: 404, headers }
            );
        }

        const clientId = auth.sub;

        const customerLevel = await getCustomerLevelForUnit({
            companyId,
            userId: clientId,
            unitId: o.unitId ?? null,
        });

        const enrichedItems = await Promise.all(
            (o.items ?? []).map(async (it) => {
                const qty = Math.max(1, Number(it.quantity ?? 1));
                const storedUnit = money(Number(it.unitPrice));
                const storedLine = money(Number(it.totalPrice));

                if (!it.productId) {
                    return {
                        id: it.id,
                        productId: null as string | null,
                        quantity: qty,
                        unitPrice: storedUnit,
                        totalPrice: storedLine,
                        product: null,
                    };
                }

                const pid = String(it.productId);

                let pricing: Awaited<
                    ReturnType<typeof resolveProductUnitPrice>
                > | null = null;

                try {
                    pricing = await resolveProductUnitPrice({
                        productId: pid,
                        clientId,
                        effectiveLevel: customerLevel,
                        timeZone: 'America/Sao_Paulo',
                        companyId,
                    });

                    if (
                        pricing?.unitId &&
                        o.unitId &&
                        String(pricing.unitId) !== String(o.unitId)
                    ) {
                        pricing = null;
                    }
                } catch {
                    pricing = null;
                }

                if (!pricing) {
                    return {
                        id: it.id,
                        productId: pid,
                        quantity: qty,
                        unitPrice: storedUnit,
                        totalPrice: storedLine,
                        product: it.product
                            ? {
                                  id: it.product.id,
                                  name: it.product.name,
                                  imageUrl: toAbsoluteImageUrl(
                                      baseUrl,
                                      it.product.imageUrl
                                  ),
                                  category: it.product.legacyCategory ?? null,
                              }
                            : null,
                    };
                }

                const basePrice = money(Number(pricing.basePrice));
                const finalPrice = money(Number(pricing.finalPrice));
                const discountPct = clampPct(Number(pricing.discountPct ?? 0));

                const computedUnitPrice = Number.isFinite(finalPrice)
                    ? finalPrice
                    : storedUnit;

                const computedTotalPrice = money(computedUnitPrice * qty);

                const hasDiscount =
                    Number.isFinite(basePrice) &&
                    Number.isFinite(computedUnitPrice) &&
                    computedUnitPrice < basePrice;

                const badge =
                    pricing.appliedBecause === 'BIRTHDAY'
                        ? { type: 'BIRTHDAY' as const, label: '🎂 Aniversário' }
                        : hasDiscount
                          ? {
                                type: 'LEVEL' as const,
                                label: `${discountPct}% OFF`,
                            }
                          : null;

                return {
                    id: it.id,
                    productId: pid,
                    quantity: qty,
                    unitPrice: computedUnitPrice,
                    totalPrice: computedTotalPrice,
                    product: it.product
                        ? {
                              id: it.product.id,
                              name: it.product.name,
                              imageUrl: toAbsoluteImageUrl(
                                  baseUrl,
                                  it.product.imageUrl
                              ),
                              category: it.product.legacyCategory ?? null,
                              basePrice,
                              finalPrice: computedUnitPrice,
                              hasDiscount,
                              badge,
                          }
                        : null,
                };
            })
        );

        const computedTotalAmount = money(
            enrichedItems.reduce<number>(
                (acc, it) => acc + money(it.totalPrice),
                0
            )
        );

        const order = {
            id: o.id,
            status: o.status,
            createdAt: o.createdAt,
            reservedUntil: o.reservedUntil,
            totalAmount: computedTotalAmount,
            unitId: o.unitId,
            unitName: o.unit?.name ?? '—',
            items: enrichedItems,
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
