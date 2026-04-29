// src/app/api/admin/professionals/route.ts
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function onlyDigits(v: unknown): string {
    return String(v ?? '').replace(/\D/g, '');
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeUnitIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const cleaned = value.map((id) => normalizeString(id)).filter(Boolean);

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const id of cleaned) {
        if (seen.has(id)) continue;
        seen.add(id);
        unique.push(id);
    }
    return unique;
}

async function sanitizeUnitScope(params: {
    companyId: string;
    activeUnitId: string | null;
}) {
    const { companyId, activeUnitId } = params;
    if (!activeUnitId) return null;

    const belongs = await prisma.unit.findFirst({
        where: { id: activeUnitId, companyId },
        select: { id: true },
    });

    return belongs ? activeUnitId : null;
}

async function hashPasswordIfPossible(password: string): Promise<string> {
    try {
        const bcrypt = await import('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(password, salt);
    } catch {
        throw new Error(
            'Dependência de hash não encontrada (bcryptjs). Instale bcryptjs para usar senha.'
        );
    }
}

// ==============================
// URL pública p/ imagens (server-side)
// - Se vier http/https -> mantém
// - Se vier "/uploads/..." ou "uploads/..." -> prefixa origin do request
// ==============================
async function getBaseOrigin(): Promise<string> {
    try {
        const h = await headers();

        const proto =
            h.get('x-forwarded-proto') ||
            (process.env.NODE_ENV === 'development' ? 'http' : 'https');

        const host =
            h.get('x-forwarded-host') ||
            h.get('host') ||
            process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '') ||
            '';

        const cleanHost = String(host).trim();
        const cleanProto = String(proto).trim() || 'https';

        if (!cleanHost) return '';

        return `${cleanProto}://${cleanHost}`;
    } catch {
        return '';
    }
}

async function normalizePublicImageUrl(raw: unknown): Promise<string | null> {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) return s;

    const origin = await getBaseOrigin();
    const path = s.startsWith('/') ? s : `/${s}`;

    if (!origin) return path;
    return `${origin}${path}`;
}

/**
 * GET /api/admin/professionals
 */
export async function GET() {
    try {
        const session = await requireAdminForModule('PROFESSIONALS');

        const companyId = String((session as { companyId?: string }).companyId);
        if (!companyId)
            return jsonErr('Sessão inválida (companyId ausente).', 401);

        const rawActiveUnitId = String(
            (session as { unitId?: string | null }).unitId ?? ''
        ).trim();

        const activeUnitId = await sanitizeUnitScope({
            companyId,
            activeUnitId: rawActiveUnitId || null,
        });

        const professionals = await prisma.professional.findMany({
            where: {
                companyId,
                ...(activeUnitId
                    ? {
                          units: {
                              some: {
                                  companyId,
                                  unitId: activeUnitId,
                                  isActive: true,
                              },
                          },
                      }
                    : {}),
            },
            orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
            include: {
                units: {
                    where: {
                        companyId,
                        ...(activeUnitId ? { unitId: activeUnitId } : {}),
                    },
                    include: { unit: true },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        const rows = await Promise.all(
            professionals.map(async (p) => ({
                id: p.id,
                name: p.name,
                email: p.email,
                phone: p.phone,
                isActive: p.isActive,
                imageUrl: await normalizePublicImageUrl(p.imageUrl),
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
                userId: p.userId,
                units: p.units.map((pu) => ({
                    id: pu.unit.id,
                    name: pu.unit.name,
                    isActive: pu.unit.isActive,
                    linkIsActive: pu.isActive,
                })),
            }))
        );

        return jsonOk(rows);
    } catch {
        return jsonErr('Não autorizado.', 401);
    }
}

/**
 * POST /api/admin/professionals
 */
export async function POST(request: Request) {
    try {
        const session = await requireAdminForModule('PROFESSIONALS');

        const companyId = String((session as { companyId?: string }).companyId);
        if (!companyId)
            return jsonErr('Sessão inválida (companyId ausente).', 401);

        const body = (await request.json().catch(() => null)) as {
            name?: string;
            email?: string;
            phone?: string;
            imageUrl?: string;
            unitIds?: string[];
            password?: string;
        } | null;

        if (!body) return jsonErr('Body inválido (JSON).', 400);

        const name = normalizeString(body.name);
        const email = normalizeString(body.email).toLowerCase();
        const phoneRaw = body.phone ? normalizeString(body.phone) : '';
        const phoneDigits = phoneRaw ? onlyDigits(phoneRaw) : '';
        const phone = phoneRaw ? phoneRaw : null;

        const imageUrl = body.imageUrl ? normalizeString(body.imageUrl) : null;

        const unitIds = normalizeUnitIds(body.unitIds);
        const password = body.password ? normalizeString(body.password) : null;

        if (!name) return jsonErr('Nome é obrigatório.', 400);
        if (!email) return jsonErr('E-mail é obrigatório.', 400);
        if (!isValidEmail(email)) return jsonErr('E-mail inválido.', 400);

        if (
            phone &&
            !(phoneDigits.length === 10 || phoneDigits.length === 11)
        ) {
            return jsonErr('Telefone inválido.', 400);
        }

        if (unitIds.length === 0) {
            return jsonErr('Selecione pelo menos 1 unidade ativa.', 400);
        }

        const validUnits = await prisma.unit.findMany({
            where: {
                companyId,
                id: { in: unitIds },
                isActive: true,
            },
            select: { id: true },
        });

        const validUnitIds = new Set(validUnits.map((u) => u.id));
        const activeUnitIds = unitIds.filter((id) => validUnitIds.has(id));

        if (activeUnitIds.length === 0) {
            return jsonErr('Nenhuma unidade válida/ativa encontrada.', 400);
        }

        const exists = await prisma.professional.findFirst({
            where: { companyId, email },
            select: { id: true },
        });

        if (exists) {
            return jsonErr('Já existe um profissional com este e-mail.', 409);
        }

        let userIdToLink: string | null = null;

        if (password) {
            if (password.length < 6) {
                return jsonErr('Senha deve ter no mínimo 6 caracteres.', 400);
            }

            const passwordHash = await hashPasswordIfPossible(password);

            const existingUser = await prisma.user.findUnique({
                where: { email },
                select: { id: true },
            });

            if (existingUser) {
                userIdToLink = existingUser.id;

                await prisma.user.update({
                    where: { id: existingUser.id },
                    data: {
                        name,
                        phone,
                        role: 'PROFESSIONAL',
                        passwordHash,
                        isActive: true,
                    },
                });
            } else {
                const createdUser = await prisma.user.create({
                    data: {
                        name,
                        email,
                        phone,
                        role: 'PROFESSIONAL',
                        passwordHash,
                        isActive: true,
                    },
                    select: { id: true },
                });

                userIdToLink = createdUser.id;
            }
        }

        const created = await prisma.$transaction(async (tx) => {
            const professional = await tx.professional.create({
                data: {
                    companyId,
                    name,
                    email,
                    phone,
                    imageUrl,
                    isActive: true,
                    userId: userIdToLink,
                },
            });

            await tx.professionalUnit.createMany({
                data: activeUnitIds.map((unitId) => ({
                    companyId,
                    professionalId: professional.id,
                    unitId,
                    isActive: true,
                })),
                skipDuplicates: true,
            });

            return professional;
        });

        return jsonOk(
            {
                id: created.id,
                name: created.name,
                email: created.email,
                phone: created.phone,
                imageUrl: await normalizePublicImageUrl(created.imageUrl),
                isActive: created.isActive,
                createdAt: created.createdAt,
                updatedAt: created.updatedAt,
                userId: created.userId,
            },
            { status: 201 }
        );
    } catch (e: any) {
        const msg = typeof e?.message === 'string' ? e.message : '';

        if (msg.includes('bcryptjs')) return jsonErr(msg, 500);

        if (String(e?.code) === 'P2002') {
            return jsonErr('Já existe um registro com estes dados.', 409);
        }

        return jsonErr('Não autorizado.', 401);
    }
}
