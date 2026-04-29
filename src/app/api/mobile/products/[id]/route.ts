// src/app/api/mobile/products/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';
import { CustomerLevel } from '@prisma/client';

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

function getCompanyIdFromHeader(req: Request): string | null {
    const raw =
        getHeaderCI(req, 'x-company-id') ||
        getHeaderCI(req, 'x-companyid') ||
        getHeaderCI(req, 'X-COMPANY-ID');
    const v = typeof raw === 'string' ? raw.trim() : '';
    return v.length ? v : null;
}

/**
 * ✅ resolve origin correto atrás de proxy (ngrok/vercel/etc)
 * - prioriza x-forwarded-proto + x-forwarded-host
 * - fallback host
 * - fallback final: req.url origin
 */
function getRequestOrigin(req: Request): string {
    const protoRaw = getHeaderCI(req, 'x-forwarded-proto');
    const hostRaw =
        getHeaderCI(req, 'x-forwarded-host') || getHeaderCI(req, 'host');

    const proto = String(protoRaw ?? '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    const host = String(hostRaw ?? '')
        .split(',')[0]
        .trim();

    if (host) {
        const safeProto =
            proto === 'http' || proto === 'https' ? proto : 'https';
        return `${safeProto}://${host}`;
    }

    try {
        return new URL(req.url).origin;
    } catch {
        return '';
    }
}

/**
 * ✅ normaliza imagem:
 * - se vier absoluta (http/https), mantém
 * - se vier "/uploads/...", transforma em "<origin>/uploads/..."
 * - se origin estiver vazio (fallback), retorna o path como está
 * - se vier vazia, null
 */
function normalizeImageUrl(origin: string, raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) return s;

    const path = s.startsWith('/') ? s : `/${s}`;

    const baseRaw = String(origin ?? '').trim();
    if (!baseRaw) return path;

    const base = baseRaw.endsWith('/') ? baseRaw.slice(0, -1) : baseRaw;
    return `${base}${path}`;
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
    const auth = getHeaderCI(req, 'authorization') || '';
    const token = auth.toLowerCase().startsWith('bearer ')
        ? auth.slice(7).trim()
        : '';
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
        const h = getCompanyIdFromHeader(req);
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

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
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

type PricingInputProduct = {
    id: string;
    unitId: string;
    price: unknown;
    birthdayBenefitEnabled: boolean | null;
    birthdayPriceLevel: CustomerLevel | null;
    discounts: Array<{ level: CustomerLevel; discountPct: number }>;
};

async function resolveProductUnitPriceFromData(args: {
    product: PricingInputProduct;
    clientBirthday: Date | null;
    effectiveLevel?: CustomerLevel;
    timeZone?: string;
    now?: Date;
}) {
    const timeZone = args.timeZone ?? 'America/Sao_Paulo';
    const now = args.now ?? new Date();
    const effectiveLevel: CustomerLevel = args.effectiveLevel ?? 'BRONZE';

    const product = args.product;
    const clientBirthday = args.clientBirthday;

    const basePrice = Number(product.price);

    const discountByLevel = new Map<CustomerLevel, number>();

    for (const row of product.discounts ?? []) {
        const lvl = coerceCustomerLevel(row.level);
        const pct = clampPct(Number(row.discountPct));
        if (lvl) discountByLevel.set(lvl, pct);
    }

    function pickDiscount(level: CustomerLevel) {
        for (const l of LEVEL_FALLBACK[level]) {
            if (discountByLevel.has(l)) {
                return { level: l, discountPct: discountByLevel.get(l)! };
            }
        }
        return { level: 'BRONZE' as CustomerLevel, discountPct: 0 };
    }

    let inBirthdayWindow = false;

    if (clientBirthday && product.birthdayBenefitEnabled) {
        const nowParts = getDatePartsInTz(now, timeZone);
        const b = getDatePartsInTz(clientBirthday, timeZone);

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
        const chosen =
            product.birthdayPriceLevel ?? ('DIAMANTE' as CustomerLevel);
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

    const [product, client] = await Promise.all([
        prisma.product.findFirst({
            where: {
                id: args.productId,
                isActive: true,
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
        args.clientId
            ? prisma.user.findFirst({
                  where: { id: args.clientId },
                  select: { id: true, birthday: true },
              })
            : Promise.resolve(null),
    ]);

    if (!product) throw new Error('Produto não encontrado.');

    const discountRows = await prisma.productDiscountByLevel.findMany({
        where: {
            productId: product.id,
            companyId: args.companyId,
        },
        select: { level: true, discountPct: true },
    });

    const discounts: Array<{ level: CustomerLevel; discountPct: number }> =
        discountRows
            .map((r) => {
                const level = coerceCustomerLevel(r.level);
                if (!level) return null;
                return {
                    level,
                    discountPct: Number(r.discountPct),
                };
            })
            .filter(
                (item): item is { level: CustomerLevel; discountPct: number } =>
                    item !== null
            );

    return resolveProductUnitPriceFromData({
        product: {
            id: product.id,
            unitId: product.unitId,
            price: product.price,
            birthdayBenefitEnabled: product.birthdayBenefitEnabled ?? false,
            birthdayPriceLevel: product.birthdayPriceLevel ?? null,
            discounts,
        },
        clientBirthday: client?.birthday ?? null,
        effectiveLevel,
        timeZone,
        now,
    });
}

/**
 * GET /api/mobile/products/:id
 */
export async function GET(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    const headers = corsHeaders();

    try {
        const auth = await requireMobileAuth(req);
        const companyId = auth.companyId;

        const origin = getRequestOrigin(req);

        const headerCompanyId = getCompanyIdFromHeader(req);
        if (headerCompanyId && headerCompanyId !== companyId) {
            return NextResponse.json(
                { error: 'company_id_mismatch' },
                { status: 400, headers }
            );
        }

        const { id } = await ctx.params;
        const productId = String(id ?? '').trim();

        if (!productId) {
            return NextResponse.json(
                { error: 'missing_product_id' },
                { status: 400, headers }
            );
        }

        const p = await prisma.product.findFirst({
            where: {
                id: productId,
                isActive: true,
                unit: { companyId },
            },
            select: {
                id: true,
                unitId: true,
                name: true,
                imageUrl: true,
                description: true,
                legacyCategory: true,
                stockQuantity: true,
                price: true,
                pickupDeadlineDays: true,
                birthdayBenefitEnabled: true,
                birthdayPriceLevel: true,
                unit: { select: { id: true, name: true } },
            },
        });

        if (!p) {
            return NextResponse.json(
                { error: 'not_found' },
                { status: 404, headers }
            );
        }

        const pickupDeadlineDays =
            typeof p.pickupDeadlineDays === 'number' &&
            Number.isFinite(p.pickupDeadlineDays) &&
            p.pickupDeadlineDays > 0
                ? p.pickupDeadlineDays
                : 2;

        const stockQuantity =
            typeof p.stockQuantity === 'number' ? p.stockQuantity : 0;

        const clientId = auth.role === 'CLIENT' ? auth.sub : null;

        let customerLevel: CustomerLevel = 'BRONZE';
        if (clientId) {
            const state = await prisma.customerLevelState.findFirst({
                where: {
                    companyId,
                    userId: clientId,
                    unitId: p.unitId,
                },
                select: { levelCurrent: true },
            });
            const lvl = coerceCustomerLevel(state?.levelCurrent);
            if (lvl) customerLevel = lvl;
        }

        const pricing = await resolveProductUnitPrice({
            productId: p.id,
            clientId,
            effectiveLevel: customerLevel,
            timeZone: 'America/Sao_Paulo',
            now: new Date(),
            companyId,
        });

        if (pricing.unitId && pricing.unitId !== p.unitId) {
            return NextResponse.json(
                { error: 'invalid_product_unit' },
                { status: 400, headers }
            );
        }

        const basePrice = Number(pricing.basePrice);
        const finalPrice = Number(pricing.finalPrice);
        const discountPct = clampPct(Number(pricing.discountPct ?? 0));

        const hasDiscount =
            Number.isFinite(basePrice) &&
            Number.isFinite(finalPrice) &&
            basePrice > 0 &&
            finalPrice < basePrice;

        const savings = hasDiscount
            ? roundMoney(Math.max(0, basePrice - finalPrice))
            : 0;

        const badge =
            pricing.appliedBecause === 'BIRTHDAY'
                ? { type: 'BIRTHDAY' as const, label: '🎂 Aniversário' }
                : hasDiscount
                  ? { type: 'LEVEL' as const, label: `${discountPct}% OFF` }
                  : null;

        const imageUrl = normalizeImageUrl(origin, p.imageUrl);

        const product = {
            id: p.id,
            name: p.name,
            imageUrl,
            description: p.description,
            category: p.legacyCategory ?? null,

            stockQuantity,
            isOutOfStock: stockQuantity <= 0,
            pickupDeadlineDays,

            unitId: p.unitId,
            unitName: p.unit?.name ?? '—',

            basePrice,
            finalPrice,
            hasDiscount,
            savings,
            discountPct,

            price: finalPrice,

            pricing: {
                customerLevel,
                appliedLevel: pricing.appliedLevel,
                appliedBecause: pricing.appliedBecause,
                inBirthdayWindow: pricing.inBirthdayWindow,
                discountPct,
            },

            badge,
        };

        const res = NextResponse.json(
            { ok: true, product, item: product },
            { status: 200, headers }
        );
        res.headers.set('x-company-id', companyId);
        return res;
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
            msg.toLowerCase().includes('token')
        ) {
            return NextResponse.json(
                { error: 'invalid_token' },
                { status: 401, headers }
            );
        }

        if (msg.toLowerCase().includes('produto não encontrado')) {
            return NextResponse.json(
                { error: 'not_found' },
                { status: 404, headers }
            );
        }

        console.error('[mobile product detail] error:', e);
        return NextResponse.json(
            { error: 'server_error' },
            { status: 500, headers }
        );
    }
}
