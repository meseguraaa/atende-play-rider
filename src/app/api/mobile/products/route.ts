// src/app/api/mobile/products/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';
import { CustomerLevel } from '@prisma/client';

export const dynamic = 'force-dynamic';

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

// ✅ header case-insensitive (padrão que você já usa em /orders)
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
        select: { id: true, role: true },
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

/* ---------------------------------------------------------
 * 🔥 MOTOR DE PREÇO (Mobile) - DESCONTO (%)
 * - sem N+1: descontos vêm em lote
 * ---------------------------------------------------------*/

const LEVEL_FALLBACK: Record<CustomerLevel, CustomerLevel[]> = {
    DIAMANTE: ['DIAMANTE', 'OURO', 'PRATA', 'BRONZE'],
    OURO: ['OURO', 'PRATA', 'BRONZE'],
    PRATA: ['PRATA', 'BRONZE'],
    BRONZE: ['BRONZE'],
};

function toNumberDecimal(v: any): number {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;

    if (typeof v === 'string') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : NaN;
    }

    // Prisma.Decimal geralmente tem toString()
    if (typeof v === 'object') {
        try {
            const s =
                typeof v.toString === 'function' ? String(v.toString()) : '';
            const n = Number(s.replace(',', '.'));
            return Number.isFinite(n) ? n : NaN;
        } catch {
            return NaN;
        }
    }

    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
}

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

// âncora diária (UTC) pra comparar por dia dentro do TZ
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

type DiscountRow = {
    productId: string;
    level: CustomerLevel;
    discountPct: any;
};

async function resolveProductUnitPrice(args: {
    product: {
        id: string;
        price: any;
        unitId: string | null;
        birthdayBenefitEnabled: boolean;
        birthdayPriceLevel: CustomerLevel | null;
    };
    clientBirthday?: Date | null;
    effectiveLevel?: CustomerLevel;
    timeZone?: string;
    now?: Date;
    discountRows: DiscountRow[];
}) {
    const timeZone = args.timeZone ?? 'America/Sao_Paulo';
    const now = args.now ?? new Date();
    const effectiveLevel: CustomerLevel = args.effectiveLevel ?? 'BRONZE';

    const product = args.product;

    const discountByLevel = new Map<CustomerLevel, number>();
    for (const row of args.discountRows) {
        discountByLevel.set(row.level, clampPct(Number(row.discountPct)));
    }

    function pickDiscount(level: CustomerLevel) {
        for (const l of LEVEL_FALLBACK[level]) {
            if (discountByLevel.has(l)) {
                return { level: l, discountPct: discountByLevel.get(l)! };
            }
        }
        return { level: 'BRONZE' as CustomerLevel, discountPct: 0 };
    }

    const basePrice = toNumberDecimal(product.price);

    // janela de aniversário: 3 dias antes + dia + 3 dias depois (por dia no TZ)
    let inBirthdayWindow = false;

    if (args.clientBirthday && product.birthdayBenefitEnabled) {
        const nowParts = getDatePartsInTz(now, timeZone);
        const b = getDatePartsInTz(args.clientBirthday, timeZone);

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

    // ✅ aniversário ganha prioridade quando habilitado
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

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
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

    // ✅ fallback seguro: se não conseguimos origin, devolve path (não quebra local)
    const baseRaw = String(origin ?? '').trim();
    if (!baseRaw) return path;

    const base = baseRaw.endsWith('/') ? baseRaw.slice(0, -1) : baseRaw;
    return `${base}${path}`;
}

/**
 * GET /api/mobile/products
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
                { status: 400, headers }
            );
        }

        const url = new URL(req.url);

        const unitParam = (url.searchParams.get('unit') ?? 'all').trim();
        const q = (url.searchParams.get('q') ?? '').trim();
        const category = (url.searchParams.get('category') ?? '').trim();
        const inStockRaw = (url.searchParams.get('inStock') ?? '').trim();
        const cursor = (url.searchParams.get('cursor') ?? '').trim();
        const limit = parseLimit(url.searchParams.get('limit'));

        const unitIsAll = unitParam === 'all' || unitParam === '';
        let activeUnitId: string | null = null;

        if (!unitIsAll) {
            // ✅ unit validada dentro do tenant
            const unit = await prisma.unit.findFirst({
                where: { id: unitParam, isActive: true, companyId },
                select: { id: true },
            });

            if (!unit) {
                return NextResponse.json(
                    { error: 'invalid_unit' },
                    { status: 400, headers }
                );
            }

            activeUnitId = unit.id;
        }

        const inStock =
            inStockRaw === '1' ||
            inStockRaw.toLowerCase() === 'true' ||
            inStockRaw.toLowerCase() === 'yes';

        // ✅ multi-tenant: SEMPRE trava por companyId
        const where = {
            isActive: true,
            companyId,
            unit: { companyId },
            ...(activeUnitId ? { unitId: activeUnitId } : {}),
            ...(inStock ? { stockQuantity: { gt: 0 } } : {}),
            ...(category ? { category } : {}),
            ...(q
                ? {
                      OR: [
                          {
                              name: {
                                  contains: q,
                                  mode: 'insensitive' as const,
                              },
                          },
                          {
                              description: {
                                  contains: q,
                                  mode: 'insensitive' as const,
                              },
                          },
                      ],
                  }
                : {}),
        } as const;

        const dbProducts = await prisma.product.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            include: { unit: { select: { id: true, name: true } } },
        });

        const hasMore = dbProducts.length > limit;
        const page = hasMore ? dbProducts.slice(0, limit) : dbProducts;

        const clientId = auth.role === 'CLIENT' ? auth.sub : null;

        // ✅ (removido N+1) pega birthday uma vez
        const client = clientId
            ? await prisma.user.findFirst({
                  where: { id: clientId },
                  select: { id: true, birthday: true },
              })
            : null;

        // ✅ nível do cliente por unidade (em lote)
        const unitIds = Array.from(new Set(page.map((p) => p.unitId))).filter(
            Boolean
        ) as string[];

        const levelByUnit = new Map<string, CustomerLevel>();

        if (clientId && unitIds.length > 0) {
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
                if (lvl) levelByUnit.set(s.unitId, lvl);
            }
        }

        // ✅ descontos por produto em lote (evita N+1)
        const productIds = page.map((p) => p.id);
        const discountRowsAll = productIds.length
            ? await prisma.productDiscountByLevel.findMany({
                  where: {
                      companyId,
                      productId: { in: productIds },
                  },
                  select: { productId: true, level: true, discountPct: true },
              })
            : [];

        const productCategoryRows = productIds.length
            ? await prisma.productCategory.findMany({
                  where: {
                      productId: { in: productIds },
                      category: {
                          companyId,
                          isActive: true,
                          showInProducts: true,
                      } as any,
                  },
                  select: {
                      productId: true,
                      category: {
                          select: {
                              id: true,
                              name: true,
                          },
                      },
                  },
              })
            : [];

        const categoriesByProduct = new Map<
            string,
            Array<{ id: string; name: string }>
        >();

        for (const row of productCategoryRows as any[]) {
            const productId = String(row?.productId ?? '').trim();
            const categoryId = String(row?.category?.id ?? '').trim();
            const categoryName = String(row?.category?.name ?? '').trim();

            if (!productId || !categoryId || !categoryName) continue;

            const current = categoriesByProduct.get(productId) ?? [];

            if (!current.some((c) => c.id === categoryId)) {
                current.push({
                    id: categoryId,
                    name: categoryName,
                });
            }

            categoriesByProduct.set(productId, current);
        }

        for (const arr of categoriesByProduct.values()) {
            arr.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        }

        const discountRowsByProduct = new Map<string, DiscountRow[]>();
        for (const row of discountRowsAll as any[]) {
            const pid = String(row.productId);
            const arr = discountRowsByProduct.get(pid) ?? [];
            arr.push({
                productId: pid,
                level: row.level as CustomerLevel,
                discountPct: row.discountPct,
            });
            discountRowsByProduct.set(pid, arr);
        }

        const now = new Date();

        const items = await Promise.all(
            page.map(async (p) => {
                const pickupDeadlineDays =
                    typeof p.pickupDeadlineDays === 'number' &&
                    Number.isFinite(p.pickupDeadlineDays) &&
                    p.pickupDeadlineDays > 0
                        ? p.pickupDeadlineDays
                        : 2;

                const stockQuantity =
                    typeof p.stockQuantity === 'number' ? p.stockQuantity : 0;

                const customerLevel: CustomerLevel =
                    levelByUnit.get(p.unitId) ?? ('BRONZE' as CustomerLevel);

                const pricing = await resolveProductUnitPrice({
                    product: {
                        id: p.id,
                        price: p.price,
                        unitId: p.unitId,
                        birthdayBenefitEnabled: !!p.birthdayBenefitEnabled,
                        birthdayPriceLevel: (p.birthdayPriceLevel ??
                            null) as CustomerLevel | null,
                    },
                    clientBirthday: client?.birthday ?? null,
                    effectiveLevel: customerLevel,
                    timeZone: 'America/Sao_Paulo',
                    now,
                    discountRows: discountRowsByProduct.get(p.id) ?? [],
                });

                const basePrice = Number(pricing.basePrice);
                const finalPrice = Number(pricing.finalPrice);
                const discountPct = clampPct(Number(pricing.discountPct));

                const hasDiscount =
                    Number.isFinite(basePrice) &&
                    Number.isFinite(finalPrice) &&
                    basePrice > 0 &&
                    finalPrice < basePrice;

                const savings = hasDiscount
                    ? roundMoney(Math.max(0, basePrice - finalPrice))
                    : 0;

                // ✅ padroniza com /orders + cart.tsx
                const badge =
                    pricing.appliedBecause === 'BIRTHDAY'
                        ? { type: 'BIRTHDAY' as const, label: '🎂 Aniversário' }
                        : null;

                const imageUrl = normalizeImageUrl(origin, (p as any).imageUrl);

                const categories = categoriesByProduct.get(p.id) ?? [];

                const categoryNames = categories.map((c) => c.name);

                return {
                    id: p.id,
                    name: p.name,
                    imageUrl,
                    description: p.description,

                    // compat legado
                    category: (p as any).category ?? null,

                    // ✅ novo modelo
                    categories,
                    categoryNames,

                    stockQuantity,
                    isOutOfStock: stockQuantity <= 0,
                    pickupDeadlineDays,

                    unitId: p.unitId,
                    unitName: p.unit?.name ?? '—',

                    basePrice,
                    finalPrice,
                    discountPct,
                    savings,
                    hasDiscount,

                    // compat: "price" = preço final
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
            })
        );

        const nextCursor = hasMore
            ? (items[items.length - 1]?.id ?? null)
            : null;

        const res = NextResponse.json(
            {
                ok: true,
                items,
                products: items,
                count: items.length,
                nextCursor,
            },
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
            msg.toLowerCase().includes('token') ||
            msg.includes('invalid_token')
        ) {
            return NextResponse.json(
                { error: 'invalid_token' },
                { status: 401, headers }
            );
        }

        console.error('[mobile products] error:', e);
        return NextResponse.json(
            { error: 'server_error' },
            { status: 500, headers }
        );
    }
}
