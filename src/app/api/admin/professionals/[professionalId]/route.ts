// src/app/api/admin/professionals/[professionalId]/route.ts
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

function normalizeUnitIds(value: unknown): string[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return [];

    const cleaned = value.map((id) => normalizeString(id)).filter(Boolean);

    // remove duplicados mantendo ordem
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
// ✅ URL pública p/ imagens (server-side)
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

    if (!origin) return path; // fallback: mantém relativo
    return `${origin}${path}`;
}

// Next (algumas versões) entregam ctx.params como Promise. Garantimos compat.
async function getProfessionalId(ctx: unknown): Promise<string> {
    const anyCtx = ctx as {
        params?:
            | { professionalId?: string }
            | Promise<{ professionalId?: string }>;
    };

    const params = anyCtx?.params ? await anyCtx.params : undefined;
    return normalizeString(params?.professionalId);
}

/**
 * PATCH /api/admin/professionals/[professionalId]
 *
 * Body (todos opcionais):
 * {
 *   name?: string,
 *   email?: string,
 *   phone?: string | null,
 *   imageUrl?: string | null,
 *   unitIds?: string[],
 *   password?: string,
 *   isActive?: boolean
 * }
 */
export async function PATCH(request: Request, ctx: unknown) {
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

        const professionalId = await getProfessionalId(ctx);
        if (!professionalId)
            return jsonErr('professionalId é obrigatório.', 400);

        const body = (await request.json().catch(() => null)) as {
            name?: string;
            email?: string;
            phone?: string | null;
            imageUrl?: string | null;
            unitIds?: string[];
            password?: string;
            isActive?: boolean;
        } | null;

        if (!body) return jsonErr('Body inválido (JSON).', 400);

        const professional = await prisma.professional.findFirst({
            where: {
                id: professionalId,
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
            select: {
                id: true,
                companyId: true,
                name: true,
                email: true,
                phone: true,
                imageUrl: true,
                isActive: true,
                userId: true,
            },
        });

        if (!professional) return jsonErr('Profissional não encontrado.', 404);

        // Campos (opcionais)
        const nextName =
            typeof body.name === 'string'
                ? normalizeString(body.name)
                : undefined;

        const nextEmail =
            typeof body.email === 'string'
                ? normalizeString(body.email).toLowerCase()
                : undefined;

        const nextPhone =
            body.phone === null
                ? null
                : typeof body.phone === 'string'
                  ? normalizeString(body.phone)
                  : undefined;

        const nextImageUrl =
            body.imageUrl === null
                ? null
                : typeof body.imageUrl === 'string'
                  ? normalizeString(body.imageUrl)
                  : undefined;

        const nextIsActive =
            typeof body.isActive === 'boolean' ? body.isActive : undefined;

        const unitIds = normalizeUnitIds(body.unitIds);

        const password =
            typeof body.password === 'string' &&
            normalizeString(body.password).length > 0
                ? normalizeString(body.password)
                : undefined;

        // Validações (somente se veio campo)
        if (nextName !== undefined && !nextName) {
            return jsonErr('Nome é obrigatório.', 400);
        }

        if (nextEmail !== undefined) {
            if (!nextEmail) return jsonErr('E-mail é obrigatório.', 400);
            if (!isValidEmail(nextEmail))
                return jsonErr('E-mail inválido.', 400);

            const dup = await prisma.professional.findFirst({
                where: {
                    companyId,
                    email: nextEmail,
                    id: { not: professionalId },
                },
                select: { id: true },
            });

            if (dup) {
                return jsonErr(
                    'Já existe um profissional com este e-mail.',
                    409
                );
            }
        }

        if (nextPhone !== undefined && nextPhone) {
            const digits = onlyDigits(nextPhone);
            if (!(digits.length === 10 || digits.length === 11)) {
                return jsonErr('Telefone inválido.', 400);
            }
        }

        if (password !== undefined && password.length < 6) {
            return jsonErr('Senha deve ter no mínimo 6 caracteres.', 400);
        }

        // Se veio unitIds, exige pelo menos 1 unidade ativa válida
        let activeUnitIds: string[] | undefined;

        if (unitIds !== undefined) {
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
            activeUnitIds = unitIds.filter((id) => validUnitIds.has(id));

            if (activeUnitIds.length === 0) {
                return jsonErr('Nenhuma unidade válida/ativa encontrada.', 400);
            }
        }

        const updated = await prisma.$transaction(async (tx) => {
            // 1) Atualiza Professional
            await tx.professional.update({
                where: { id: professionalId },
                data: {
                    ...(nextName !== undefined ? { name: nextName } : {}),
                    ...(nextEmail !== undefined ? { email: nextEmail } : {}),
                    ...(nextPhone !== undefined ? { phone: nextPhone } : {}),
                    ...(nextImageUrl !== undefined
                        ? { imageUrl: nextImageUrl }
                        : {}),
                    ...(nextIsActive !== undefined
                        ? { isActive: nextIsActive }
                        : {}),
                },
            });

            // 2) Atualiza unidades vinculadas (se vier unitIds)
            if (activeUnitIds) {
                // desativa todos os vínculos atuais
                await tx.professionalUnit.updateMany({
                    where: { companyId, professionalId },
                    data: { isActive: false },
                });

                // ativa/upsert apenas os selecionados
                for (const unitId of activeUnitIds) {
                    await tx.professionalUnit.upsert({
                        where: {
                            professionalId_unitId: {
                                professionalId,
                                unitId,
                            },
                        },
                        update: { isActive: true },
                        create: {
                            companyId,
                            professionalId,
                            unitId,
                            isActive: true,
                        },
                    });
                }
            }

            // 3) Atualiza senha (se vier) e garante vínculo com User
            if (professional.userId || password !== undefined) {
                const passwordHash =
                    password !== undefined
                        ? await hashPasswordIfPossible(password)
                        : undefined;

                const emailToUse = nextEmail ?? professional.email;
                const nameToUse = nextName ?? professional.name;
                const phoneToUse =
                    nextPhone !== undefined
                        ? nextPhone
                        : (professional.phone ?? null);

                let userIdToLink = professional.userId ?? null;

                if (userIdToLink) {
                    await tx.user.update({
                        where: { id: userIdToLink },
                        data: {
                            email: emailToUse,
                            isActive: true,
                            role: 'PROFESSIONAL',
                            name: nameToUse,
                            phone: phoneToUse,
                            ...(passwordHash ? { passwordHash } : {}),
                        },
                    });
                } else {
                    const existingUser = await tx.user.findUnique({
                        where: { email: emailToUse },
                        select: { id: true },
                    });

                    if (existingUser) {
                        userIdToLink = existingUser.id;

                        await tx.user.update({
                            where: { id: userIdToLink },
                            data: {
                                email: emailToUse,
                                passwordHash,
                                isActive: true,
                                role: 'PROFESSIONAL',
                                name: nameToUse,
                                phone: phoneToUse,
                                ...(passwordHash ? { passwordHash } : {}),
                            },
                        });
                    } else {
                        const createdUser = await tx.user.create({
                            data: {
                                name: nameToUse,
                                email: emailToUse,
                                phone: phoneToUse,
                                role: 'PROFESSIONAL',
                                passwordHash,
                                isActive: true,
                            },
                            select: { id: true },
                        });

                        userIdToLink = createdUser.id;
                    }

                    await tx.professional.update({
                        where: { id: professionalId },
                        data: { userId: userIdToLink },
                    });
                }
            }

            // Retorno final (sempre atualizado)
            const p = await tx.professional.findUnique({
                where: { id: professionalId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    imageUrl: true,
                    isActive: true,
                    userId: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

            return p;
        });

        if (!updated) return jsonErr('Profissional não encontrado.', 404);

        // ✅ devolve a imagem já normalizada, como fizemos em produtos/parceiros
        return jsonOk({
            ...updated,
            imageUrl: await normalizePublicImageUrl(updated.imageUrl),
        });
    } catch (e: any) {
        const msg = typeof e?.message === 'string' ? e.message : '';

        if (msg.includes('bcryptjs')) return jsonErr(msg, 500);

        // Prisma unique constraint (ex: email duplicado, fallback)
        if (String(e?.code) === 'P2002') {
            return jsonErr('Já existe um registro com estes dados.', 409);
        }

        return jsonErr('Não autorizado.', 401);
    }
}
