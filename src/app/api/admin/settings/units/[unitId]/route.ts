import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type UnitPayload = {
    name?: string;
    phone?: string | null;

    cep?: string | null;
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;

    slotIntervalMinutes?: number | null;
    reminderLeadHours?: number | null;
    bookingWindowDays?: number | null;

    isActive?: boolean | null;
};

type MinimalAdminSession = {
    companyId: string;
    userId: string;
    isOwner: boolean;
};

type PainelTokenPayload = {
    sub: string;
    role?: string;
    email?: string;
    name?: string;
    tenantSlug?: string;
    companyId?: string;
    unitId?: string | null;
    isOwner?: boolean;
    canSeeAllUnits?: boolean;
};

const SESSION_COOKIE_NAME = 'painel_session';

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400, extra?: any) {
    const payload =
        process.env.NODE_ENV === 'production'
            ? { ok: false, error }
            : { ok: false, error, extra };

    return NextResponse.json(payload, { status });
}

function asTrimmedOrNull(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t : null;
}

function buildAddressLine(input: {
    street?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    cep?: string | null;
    complement?: string | null;
}) {
    const parts: string[] = [];

    const street = asTrimmedOrNull(input.street);
    const number = asTrimmedOrNull(input.number);
    const neighborhood = asTrimmedOrNull(input.neighborhood);
    const city = asTrimmedOrNull(input.city);
    const state = asTrimmedOrNull(input.state);
    const cep = asTrimmedOrNull(input.cep);
    const complement = asTrimmedOrNull(input.complement);

    const streetLine = [street, number ? `, ${number}` : ''].join('').trim();
    if (streetLine) parts.push(streetLine);

    if (complement) parts.push(complement);
    if (neighborhood) parts.push(neighborhood);

    const cityState = [city, state].filter(Boolean).join(' - ');
    if (cityState) parts.push(cityState);

    if (cep) parts.push(`CEP ${cep}`);

    return parts.join(' • ') || null;
}

function normalizeSlotInterval(v: unknown): 15 | 30 | 45 | 60 {
    const n = Number(v);
    if (n === 15 || n === 30 || n === 45 || n === 60) return n;
    return 30;
}

function normalizeReminderLeadHours(v: unknown): number {
    const n = Number(v);

    if (!Number.isFinite(n)) return 24;

    const int = Math.trunc(n);

    if (int < 1) return 24;
    if (int > 168) return 168;

    return int;
}

function normalizeBookingWindowDays(v: unknown): number {
    const n = Number(v);

    if (!Number.isFinite(n)) return 30;

    const int = Math.trunc(n);

    if (int < 1) return 1;
    if (int > 365) return 365;

    return int;
}

function getJwtSecretKey() {
    const secret = process.env.PAINEL_JWT_SECRET;
    if (!secret) throw new Error('PAINEL_JWT_SECRET_NOT_SET');
    return new TextEncoder().encode(secret);
}

async function requireAdminSession(): Promise<MinimalAdminSession> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || '';
    if (!token) throw new Error('UNAUTHORIZED');

    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const p = payload as unknown as PainelTokenPayload;

    if (!p.sub) throw new Error('UNAUTHORIZED');
    if (!p.companyId) throw new Error('COMPANY_ID_MISSING');

    // ✅ Fonte de verdade para role ADMIN e flag isOwner (global)
    const user = await prisma.user.findUnique({
        where: { id: p.sub },
        select: { id: true, role: true, isOwner: true, isActive: true },
    });

    if (!user || !user.isActive) throw new Error('UNAUTHORIZED');
    if (user.role !== 'ADMIN') throw new Error('UNAUTHORIZED');

    // ✅ Vínculo do usuário com a company vem de CompanyMember
    const membership = await prisma.companyMember.findUnique({
        where: {
            companyId_userId: {
                companyId: p.companyId,
                userId: p.sub,
            },
        },
        select: { id: true, role: true, isActive: true },
    });

    if (!membership || !membership.isActive) throw new Error('UNAUTHORIZED');

    const isOwner = Boolean(user.isOwner) || membership.role === 'OWNER';

    return {
        companyId: p.companyId,
        userId: p.sub,
        isOwner,
    };
}

/**
 * ✅ Next 15/14: ctx.params pode ser Promise (sync-dynamic-apis)
 */
type Ctx = { params: Promise<{ unitId: string }> };

// =====================
// GET /api/admin/settings/units/:unitId
// =====================
export async function GET(_req: Request, ctx: Ctx) {
    let session: MinimalAdminSession;
    try {
        session = await requireAdminSession();
    } catch (e: any) {
        const msg =
            e?.message === 'COMPANY_ID_MISSING'
                ? 'company_id_missing'
                : e?.message === 'PAINEL_JWT_SECRET_NOT_SET'
                  ? 'server_misconfigured'
                  : 'unauthorized';
        return jsonErr(msg, 401, { message: e?.message });
    }

    const { unitId } = await ctx.params;
    if (!unitId) return jsonErr('unit_id_required', 400);

    const unit = await prisma.unit.findFirst({
        where: { id: unitId, companyId: session.companyId },
        select: {
            id: true,
            name: true,
            phone: true,

            cep: true,
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
            address: true,

            slotIntervalMinutes: true,
            reminderLeadHours: true,
            bookingWindowDays: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    if (!unit) return jsonErr('unit_not_found', 404);
    return jsonOk(unit);
}

// =====================
// PUT /api/admin/settings/units/:unitId
// =====================
export async function PUT(req: Request, ctx: Ctx) {
    let session: MinimalAdminSession;
    try {
        session = await requireAdminSession();
    } catch (e: any) {
        const msg =
            e?.message === 'COMPANY_ID_MISSING'
                ? 'company_id_missing'
                : e?.message === 'PAINEL_JWT_SECRET_NOT_SET'
                  ? 'server_misconfigured'
                  : 'unauthorized';
        return jsonErr(msg, 401, { message: e?.message });
    }

    if (!session.isOwner) {
        return jsonErr('forbidden_owner_only', 403);
    }

    const { unitId } = await ctx.params;
    if (!unitId) return jsonErr('unit_id_required', 400);

    let body: UnitPayload | null = null;
    try {
        body = (await req.json()) as UnitPayload;
    } catch {
        return jsonErr('invalid_json', 400);
    }

    const current = await prisma.unit.findFirst({
        where: { id: unitId, companyId: session.companyId },
        select: {
            id: true,
            name: true,
            phone: true,

            cep: true,
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,

            slotIntervalMinutes: true,
            reminderLeadHours: true,
            bookingWindowDays: true,
            isActive: true,
        },
    });

    if (!current) return jsonErr('unit_not_found', 404);

    const name =
        body?.name !== undefined ? asTrimmedOrNull(body.name) : current.name;
    if (!name) return jsonErr('unit_name_required', 400);

    const phone =
        body?.phone !== undefined ? asTrimmedOrNull(body.phone) : current.phone;

    const cep =
        body?.cep !== undefined ? asTrimmedOrNull(body.cep) : current.cep;
    const street =
        body?.street !== undefined
            ? asTrimmedOrNull(body.street)
            : current.street;
    const number =
        body?.number !== undefined
            ? asTrimmedOrNull(body.number)
            : current.number;
    const complement =
        body?.complement !== undefined
            ? asTrimmedOrNull(body.complement)
            : current.complement;
    const neighborhood =
        body?.neighborhood !== undefined
            ? asTrimmedOrNull(body.neighborhood)
            : current.neighborhood;
    const city =
        body?.city !== undefined ? asTrimmedOrNull(body.city) : current.city;
    const state =
        body?.state !== undefined ? asTrimmedOrNull(body.state) : current.state;

    const isActive =
        typeof body?.isActive === 'boolean' ? body.isActive : current.isActive;

    const slotIntervalMinutes =
        body?.slotIntervalMinutes !== undefined
            ? normalizeSlotInterval(body.slotIntervalMinutes)
            : normalizeSlotInterval(current.slotIntervalMinutes);

    const reminderLeadHours =
        body?.reminderLeadHours !== undefined
            ? normalizeReminderLeadHours(body.reminderLeadHours)
            : typeof current.reminderLeadHours === 'number'
              ? current.reminderLeadHours
              : 24;

    const bookingWindowDays =
        body?.bookingWindowDays !== undefined
            ? normalizeBookingWindowDays(body.bookingWindowDays)
            : typeof current.bookingWindowDays === 'number'
              ? current.bookingWindowDays
              : 30;

    const address = buildAddressLine({
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        cep,
    });

    try {
        const updated = await prisma.unit.update({
            where: { id: unitId },
            data: {
                name,
                phone,

                cep,
                street,
                number,
                complement,
                neighborhood,
                city,
                state,

                address,
                slotIntervalMinutes,
                reminderLeadHours,
                bookingWindowDays,
                isActive,
            },
            select: {
                id: true,
                name: true,
                phone: true,

                cep: true,
                street: true,
                number: true,
                complement: true,
                neighborhood: true,
                city: true,
                state: true,
                address: true,

                slotIntervalMinutes: true,
                reminderLeadHours: true,
                bookingWindowDays: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return jsonOk(updated);
    } catch (e: any) {
        return jsonErr('update_failed', 500, {
            message: e?.message,
            code: e?.code,
        });
    }
}
