// src/app/api/mobile/products/featured/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Role = 'CLIENT' | 'BARBER' | 'ADMIN';

type MobileTokenPayload = {
    sub: string;
    role: Role;
    companyId: string; // ✅ multi-tenant obrigatório
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

// ✅ header case-insensitive (padrão da rota /products)
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

    // último fallback
    try {
        return new URL(req.url).origin;
    } catch {
        return '';
    }
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

/* ---------------------------------------------------------
 * 🔥 MOTOR DE PREÇO (Mobile) - DESCONTO (%)
 * ---------------------------------------------------------*/
type CustomerLevel = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';

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
    if (
        value === 'BRONZE' ||
        value === 'PRATA' ||
        value === 'OURO' ||
        value === 'DIAMANTE'
    ) {
        return value;
    }
    return null;
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
    const final = basePrice * (1 - pct / 100);
    return roundMoney(final);
}

type PricingInputProduct = {
    id: string;
    unitId: string;
    price: any; // Decimal
    birthdayBenefitEnabled: boolean | null;
    birthdayPriceLevel: any; // CustomerLevel | null
    discounts: Array<{ level: any; discountPct: any }>;
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
    const rows = (product.discounts ?? []) as Array<{
        level: unknown;
        discountPct: unknown;
    }>;

    for (const row of rows) {
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
            coerceCustomerLevel(product.birthdayPriceLevel) ??
            ('DIAMANTE' as CustomerLevel);

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

/**
 * ✅ normaliza imagem (mesmo padrão do /products, com PLUS):
 * - se vier absoluta (http/https), mantém
 * - MAS se for localhost/127.0.0.1, reescreve pro origin calculado (se existir)
 * - se vier "/uploads/...", transforma em "<origin>/uploads/..."
 * - se origin estiver vazio, devolve só o path (não quebra local)
 * - se vier vazia, null
 */
function normalizeImageUrl(origin: string, raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    const originTrim = String(origin ?? '').trim();
    const hasOrigin = Boolean(originTrim);

    // absoluta
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
        // se não temos origin, não tenta reescrever (mantém)
        if (!hasOrigin) return s;

        try {
            const u = new URL(s);
            const h = u.hostname?.toLowerCase?.() ?? '';
            if (h === 'localhost' || h === '127.0.0.1') {
                const base = originTrim.endsWith('/')
                    ? originTrim.slice(0, -1)
                    : originTrim;
                return `${base}${u.pathname}${u.search}`;
            }
        } catch {
            // se der ruim no parse, mantém como está
        }
        return s;
    }

    // relativa
    const path = s.startsWith('/') ? s : `/${s}`;

    // ✅ fallback seguro: sem origin, devolve path
    if (!hasOrigin) return path;

    const base = originTrim.endsWith('/')
        ? originTrim.slice(0, -1)
        : originTrim;
    return `${base}${path}`;
}

/**
 * GET /api/mobile/products/featured
 */
export async function GET(req: Request) {
    const headers = corsHeaders();

    try {
        const auth = await requireMobileAuth(req);
        const companyId = auth.companyId;

        // ✅ origem correta atrás do ngrok/proxy
        const origin = getRequestOrigin(req);

        // defesa opcional: se vier header, precisa bater com o token
        const headerCompanyId = getHeaderCI(req, 'x-company-id');
        if (headerCompanyId && headerCompanyId !== companyId) {
            return NextResponse.json(
                { error: 'company_id_mismatch' },
                {
                    status: 400,
                    headers: { ...headers, 'Cache-Control': 'no-store' },
                }
            );
        }

        const clientId = auth.role === 'CLIENT' ? auth.sub : null;

        // ✅ aniversário (tenant-safe via membership)
        const client = clientId
            ? await prisma.user.findFirst({
                  where: {
                      id: clientId,
                      companyMemberships: {
                          some: { companyId, isActive: true },
                      },
                  },
                  select: { id: true, birthday: true },
              })
            : null;

        // ✅ produtos em destaque (tenant + unidade ativa)
        const dbProducts = await prisma.product.findMany({
            where: {
                isActive: true,
                isFeatured: true,
                unit: { companyId, isActive: true },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 30,
            include: {
                unit: { select: { id: true, name: true } },
            },
        });

        const productById = new Map(dbProducts.map((p) => [p.id, p]));
        const productIds = dbProducts.map((p) => p.id);

        // ✅ descontos em lote (tenant-safe)
        const discountRows =
            productIds.length > 0
                ? await prisma.productDiscountByLevel.findMany({
                      where: { companyId, productId: { in: productIds } },
                      select: {
                          productId: true,
                          level: true,
                          discountPct: true,
                      },
                  })
                : [];

        const discountsByProduct = new Map<
            string,
            Array<{ level: CustomerLevel; discountPct: number }>
        >();

        for (const r of discountRows) {
            const lvl = coerceCustomerLevel(r.level);
            if (!lvl) continue;
            const pct = clampPct(Number(r.discountPct));

            const arr = discountsByProduct.get(r.productId) ?? [];
            arr.push({ level: lvl, discountPct: pct });
            discountsByProduct.set(r.productId, arr);
        }

        // ✅ nível do cliente por unidade
        // ✅ FIX TS: permite undefined explicitamente, então `?? 'BRONZE'` é válido
        const customerLevelByUnit = new Map<
            string,
            CustomerLevel | undefined
        >();

        if (clientId) {
            const unitIds = Array.from(
                new Set(dbProducts.map((p) => p.unitId))
            ).filter(Boolean) as string[];

            if (unitIds.length > 0) {
                const states = await prisma.customerLevelState.findMany({
                    where: {
                        companyId,
                        userId: clientId,
                        unitId: { in: unitIds },
                    },
                    select: { unitId: true, levelCurrent: true },
                });

                for (const s of states) {
                    const lvl = coerceCustomerLevel(s.levelCurrent);
                    if (lvl) customerLevelByUnit.set(s.unitId, lvl);
                }
            }
        }

        const jobs = dbProducts.map((p) => {
            const effectiveLevel: CustomerLevel =
                customerLevelByUnit.get(p.unitId) ?? 'BRONZE';

            return {
                product: {
                    id: p.id,
                    unitId: p.unitId,
                    price: p.price,
                    birthdayBenefitEnabled:
                        (p as any).birthdayBenefitEnabled ?? false,
                    birthdayPriceLevel: (p as any).birthdayPriceLevel ?? null,
                    discounts: discountsByProduct.get(p.id) ?? [],
                },
                clientBirthday: client?.birthday ?? null,
                effectiveLevel, // ✅ SEMPRE definido
                timeZone: 'America/Sao_Paulo',
                now: new Date(),
            };
        });

        const resolved = await Promise.all(
            jobs.map(async (x) => {
                const pricing = await resolveProductUnitPriceFromData(x);

                const basePrice = Number(pricing.basePrice);
                const finalPrice = Number(pricing.finalPrice);

                const hasDiscount =
                    Number.isFinite(basePrice) &&
                    Number.isFinite(finalPrice) &&
                    finalPrice < basePrice;

                const savings = hasDiscount
                    ? roundMoney(Math.max(0, basePrice - finalPrice))
                    : 0;

                const discountPct = clampPct(
                    Number((pricing as any).discountPct ?? 0)
                );

                const badge =
                    pricing.appliedBecause === 'BIRTHDAY'
                        ? { type: 'BIRTHDAY' as const, label: '🎂 Aniversário' }
                        : hasDiscount
                          ? {
                                type: 'DISCOUNT' as const,
                                label: `${discountPct}% OFF`,
                            }
                          : null;

                const p = productById.get((x.product as any).id);
                if (!p) throw new Error('product_not_found_in_memory');

                const stockQuantity =
                    typeof p.stockQuantity === 'number' ? p.stockQuantity : 0;

                const pickupDeadlineDays =
                    typeof (p as any).pickupDeadlineDays === 'number' &&
                    Number.isFinite((p as any).pickupDeadlineDays) &&
                    (p as any).pickupDeadlineDays > 0
                        ? (p as any).pickupDeadlineDays
                        : 2;

                // ✅ usa origin correto + corrige localhost se aparecer
                const imageUrl = normalizeImageUrl(origin, (p as any).imageUrl);

                return {
                    id: p.id,
                    name: p.name,
                    imageUrl,
                    description: p.description,
                    category: (p as any).category ?? null,

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
                        customerLevel: x.effectiveLevel,
                        appliedLevel: pricing.appliedLevel,
                        appliedBecause: pricing.appliedBecause,
                        inBirthdayWindow: pricing.inBirthdayWindow,
                        discountPct,
                    },

                    badge,
                };
            })
        );

        const res = NextResponse.json(
            {
                ok: true,
                items: resolved,
                products: resolved,
                count: resolved.length,
            },
            {
                status: 200,
                headers: { ...headers, 'Cache-Control': 'no-store' },
            }
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
            msg.toLowerCase().includes('token') ||
            msg.includes('invalid_token')
        ) {
            return NextResponse.json(
                { error: 'invalid_token' },
                { status: 401, headers }
            );
        }

        console.error('[mobile featured products] error:', e);
        return NextResponse.json(
            { error: 'server_error' },
            { status: 500, headers }
        );
    }
}
