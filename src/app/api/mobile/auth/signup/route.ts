// src/app/api/mobile/auth/signup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signAppJwt } from '@/lib/app-jwt';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/* ---------------------------------------------------------
 * CORS (padrão mobile)
 * --------------------------------------------------------- */
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id, X-Company-Id, x-companyid, X-CompanyId',
    };
}

function jsonErr(message: string, status = 400) {
    return NextResponse.json(
        { ok: false, error: message },
        { status, headers: corsHeaders() }
    );
}

function jsonOk(data: unknown, status = 200) {
    return NextResponse.json(
        { ok: true, data },
        { status, headers: corsHeaders() }
    );
}

/* ---------------------------------------------------------
 * Helpers
 * --------------------------------------------------------- */
function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function normalizeEmail(v: unknown): string {
    return String(v ?? '')
        .trim()
        .toLowerCase();
}

function onlyDigits(v: string) {
    return String(v || '').replace(/\D+/g, '');
}

function parseBirthdayBR(v: string): Date | null {
    // espera dd/mm/yyyy
    const [dd, mm, yyyy] = String(v || '').split('/');
    if (!dd || !mm || !yyyy) return null;

    const d = Number(dd);
    const m = Number(mm);
    const y = Number(yyyy);

    if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) {
        return null;
    }

    // sanity checks
    if (y < 1900 || y > 2100) return null;
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;

    // cria e valida se não “estourou” mês/dia (ex: 31/02)
    const date = new Date(Date.UTC(y, m - 1, d));
    if (Number.isNaN(date.getTime())) return null;

    if (
        date.getUTCFullYear() !== y ||
        date.getUTCMonth() !== m - 1 ||
        date.getUTCDate() !== d
    ) {
        return null;
    }

    return date;
}

function computeProfileComplete(u: {
    phone: string | null;
    birthday: Date | null;
}) {
    const phoneOk = typeof u.phone === 'string' && u.phone.trim().length > 0;
    const birthdayOk =
        u.birthday instanceof Date && !Number.isNaN(u.birthday.getTime());
    return phoneOk && birthdayOk;
}

/**
 * ✅ Padrão de senha
 * - mínimo 6
 * - 1 maiúscula
 * - 1 número
 * - 1 especial na whitelist: !@#$%^&*()_+-=[];':",.<>/?\|
 */
const PASSWORD_REGEX =
    /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\];':",.<>\/?\|]).{6,}$/;

function isStrongPassword(pw: string) {
    return PASSWORD_REGEX.test(String(pw || ''));
}

function passwordRuleMessage() {
    return 'A senha deve ter no mínimo 6 caracteres, incluindo 1 letra maiúscula, 1 número e 1 caractere especial.';
}

// ✅ header case-insensitive (compat)
function getHeaderCI(req: NextRequest, key: string): string | null {
    const target = key.toLowerCase();
    for (const [k, v] of req.headers.entries()) {
        if (k.toLowerCase() === target) {
            const s = String(v ?? '').trim();
            return s.length ? s : null;
        }
    }
    return null;
}

function getCompanyKey(req: NextRequest, body?: any): string {
    const fromBody = normalizeString(body?.companyId);
    if (fromBody) return fromBody;

    const fromHeader =
        getHeaderCI(req, 'x-company-id') ||
        getHeaderCI(req, 'x-companyid') ||
        getHeaderCI(req, 'X-Company-Id') ||
        getHeaderCI(req, 'X-CompanyId');

    return normalizeString(fromHeader);
}

/* ---------------------------------------------------------
 * OPTIONS /api/mobile/auth/signup
 * --------------------------------------------------------- */
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/* ---------------------------------------------------------
 * POST /api/mobile/auth/signup
 * --------------------------------------------------------- */
export async function POST(req: NextRequest) {
    let body: any = null;

    try {
        body = await req.json();
    } catch {
        body = null;
    }

    if (!body || typeof body !== 'object') {
        return jsonErr('invalid_body', 400);
    }

    const companyKey = getCompanyKey(req, body);
    if (!companyKey) return jsonErr('missing_company_id', 400);

    const name = normalizeString(body?.name);
    const email = normalizeEmail(body?.email);
    const phoneRaw = normalizeString(body?.phone);
    const birthdayRaw = normalizeString(body?.birthday);
    const password = normalizeString(body?.password);

    if (!name || name.length < 2) return jsonErr('invalid_name', 400);
    if (!email || !email.includes('@')) return jsonErr('invalid_email', 400);

    if (!isStrongPassword(password)) {
        // mantém mensagem humana como você já fazia
        return jsonErr(passwordRuleMessage(), 400);
    }

    const phoneDigits = onlyDigits(phoneRaw);
    if (phoneDigits.length !== 11) return jsonErr('invalid_phone', 400);

    const birthday = parseBirthdayBR(birthdayRaw);
    if (!birthday) return jsonErr('invalid_birthday', 400);

    // ✅ resolve company por id OU slug (ativa) igual ao resto do mobile
    const company = await prisma.company.findFirst({
        where: {
            isActive: true,
            OR: [{ id: companyKey }, { slug: companyKey }],
        },
        select: { id: true },
    });

    if (!company) {
        const exists = await prisma.company.findFirst({
            where: { OR: [{ id: companyKey }, { slug: companyKey }] },
            select: { id: true, isActive: true },
        });

        if (!exists) return jsonErr('company_not_found', 404);
        return jsonErr('company_inactive', 403);
    }

    const companyId = company.id;

    // ✅ email case-insensitive (evita duplicar por case)
    const existingUser = await prisma.user.findFirst({
        where: {
            email: {
                equals: email,
                mode: 'insensitive',
            },
        },
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            birthday: true,
            role: true,
            image: true,
            isActive: true,
        },
    });

    if (existingUser) {
        const existingMembership = await prisma.companyMember.findUnique({
            where: {
                companyId_userId: {
                    companyId,
                    userId: existingUser.id,
                },
            },
            select: {
                role: true,
                companyId: true,
                lastUnitId: true,
                isActive: true,
            },
        });

        if (existingMembership) {
            return jsonErr('email_already_exists', 409);
        }

        const membership = await prisma.companyMember.create({
            data: {
                companyId,
                userId: existingUser.id,
                role: 'CLIENT',
                isActive: true,
                lastUnitId: null,
            } as any,
            select: {
                role: true,
                companyId: true,
                lastUnitId: true,
                isActive: true,
            },
        });

        const profileComplete = computeProfileComplete({
            phone: existingUser.phone ?? null,
            birthday: (existingUser as any).birthday ?? null,
        });

        const token = await signAppJwt({
            sub: existingUser.id,
            role: 'CLIENT',
            companyId,
            email: existingUser.email ?? undefined,
            name: existingUser.name ?? null,
        });

        const payload = {
            token,
            companyId,
            role: 'CLIENT',
            profile_complete: profileComplete ? 1 : 0,
            user: {
                id: existingUser.id,
                name: existingUser.name,
                email: existingUser.email,
                image: (existingUser as any).image ?? null,
                phone: existingUser.phone ?? null,
                birthday: (existingUser as any).birthday ?? null,
                role: 'CLIENT',
                memberRole: membership.role,
                lastUnitId: membership.lastUnitId ?? null,
                companyId,
                profileComplete,
            },
        };

        return jsonOk(payload, 200);
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                phone: phoneDigits,
                birthday,
                passwordHash,
                role: 'CLIENT',
                isActive: true,
                image: null,
            } as any,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                birthday: true,
                role: true,
                image: true,
                isActive: true,
            },
        });

        // ✅ cria membership (ativa) na company
        const membership = await prisma.companyMember.create({
            data: {
                companyId,
                userId: user.id,
                role: 'CLIENT',
                isActive: true,
                lastUnitId: null,
            } as any,
            select: {
                role: true,
                companyId: true,
                lastUnitId: true,
                isActive: true,
            },
        });

        const profileComplete = computeProfileComplete({
            phone: user.phone ?? null,
            birthday: (user as any).birthday ?? null,
        });

        // ✅ token no padrão do mobile (sem inventar campos no helper)
        const token = await signAppJwt({
            sub: user.id,
            role: 'CLIENT',
            companyId,
            email: user.email ?? undefined,
            name: user.name ?? null,
        });

        const payload = {
            token,
            companyId,
            role: 'CLIENT',
            profile_complete: profileComplete ? 1 : 0,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                image: (user as any).image ?? null,
                phone: user.phone ?? null,
                birthday: (user as any).birthday ?? null,
                role: 'CLIENT',
                memberRole: membership.role,
                lastUnitId: membership.lastUnitId ?? null,
                companyId,
                profileComplete,
            },
        };

        return jsonOk(payload, 200);
    } catch (err) {
        console.error('[signup]', err);
        return jsonErr('internal_error', 500);
    }
}
