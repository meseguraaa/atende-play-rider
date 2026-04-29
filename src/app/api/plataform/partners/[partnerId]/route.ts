// src/app/api/plataform/partners/[partnerId]/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requirePlatformForModuleApi } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PartnerVisibilityMode = 'ALL' | 'SELECTED';

type UpdatePartnerPayload = {
    name?: string;

    logoUrl?: string | null;
    logoKey?: string | null;

    discountPct?: number | string;

    description?: string | null;
    rules?: string | null;

    ctaUrl?: string;
    ctaLabel?: string | null;

    isActive?: boolean;
    visibilityMode?: PartnerVisibilityMode;
    sortOrder?: number | string;

    companyIds?: string[];
};

type PatchPayload =
    | {
          toggleActive: true;
      }
    | {
          update: UpdatePartnerPayload;
      };

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function normalizeString(raw: unknown) {
    const s = String(raw ?? '').trim();
    return s.length ? s : '';
}

function normalizeNullableString(raw: unknown) {
    const s = String(raw ?? '').trim();
    return s.length ? s : null;
}

function toInt(
    raw: unknown,
    fallback: number,
    opts?: { min?: number; max?: number }
) {
    const n =
        typeof raw === 'number'
            ? raw
            : Number(
                  String(raw ?? '')
                      .trim()
                      .replace(',', '.')
              );

    if (!Number.isFinite(n)) return fallback;
    const i = Math.floor(n);
    const min = opts?.min ?? -Infinity;
    const max = opts?.max ?? Infinity;
    return Math.max(min, Math.min(max, i));
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

function normalizeImageUrl(origin: string, raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) return s;

    const path = s.startsWith('/') ? s : `/${s}`;
    const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    return base ? `${base}${path}` : path;
}

function isValidLogoUrl(logoUrl: string) {
    const s = String(logoUrl ?? '').trim();
    if (!s) return false;

    const lowered = s.toLowerCase();
    if (lowered.startsWith('javascript:')) return false;
    if (lowered.startsWith('data:')) return false;
    if (lowered.startsWith('blob:')) return false;

    // ✅ novos uploads
    if (s.startsWith('/media/')) return true;
    if (s.startsWith('media/')) return true;

    // ✅ legado
    if (s.startsWith('/uploads/')) return true;
    if (s.startsWith('uploads/')) return true;

    // ✅ URL absoluta
    if (lowered.startsWith('http://') || lowered.startsWith('https://'))
        return true;

    return false;
}

function normalizeCtaUrl(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();

    if (lower.startsWith('javascript:')) return null;
    if (lower.startsWith('data:')) return null;

    if (lower.startsWith('http://') || lower.startsWith('https://')) return s;
    if (lower.startsWith('www.')) return `https://${s}`;

    return null;
}

function normalizeVisibilityMode(raw: unknown): PartnerVisibilityMode {
    const s = String(raw ?? '')
        .trim()
        .toUpperCase();

    return s === 'SELECTED' ? 'SELECTED' : 'ALL';
}

function normalizeCompanyIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const ids = raw.map((v) => String(v ?? '').trim()).filter(Boolean);

    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

export async function GET(
    request: Request,
    ctx: { params: Promise<{ partnerId: string }> }
) {
    const auth = await requirePlatformForModuleApi('PARTNERS');
    if (auth instanceof NextResponse) return auth;

    try {
        const origin = getRequestOrigin(request);

        const { partnerId } = await ctx.params;
        const id = normalizeString(partnerId);
        if (!id) return jsonErr('partnerId é obrigatório.', 400);

        const partner = await prisma.partner.findFirst({
            where: { id },
            select: {
                id: true,
                name: true,
                logoUrl: true,
                logoKey: true,
                discountPct: true,
                description: true,
                rules: true,
                ctaUrl: true,
                ctaLabel: true,
                isActive: true,
                visibilityMode: true,
                sortOrder: true,
                createdAt: true,
                updatedAt: true,
                companies: {
                    where: { isEnabled: true },
                    select: { companyId: true },
                    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                },
            },
        });

        if (!partner) return jsonErr('Parceiro não encontrado.', 404);

        const visibilityMode = normalizeVisibilityMode(partner.visibilityMode);
        const ctaUrl = normalizeCtaUrl(partner.ctaUrl);
        const logoUrl = normalizeImageUrl(origin, partner.logoUrl);

        return jsonOk({
            partner: {
                id: partner.id,
                name: partner.name,
                logoUrl,
                logoKey: partner.logoKey ?? null,
                discountPct: toInt(partner.discountPct, 0, {
                    min: 0,
                    max: 100,
                }),
                description: partner.description ?? null,
                rules: partner.rules ?? null,
                ctaUrl: ctaUrl ?? null,
                ctaLabel: partner.ctaLabel ?? null,
                isActive: Boolean(partner.isActive),
                visibilityMode,
                sortOrder: toInt(partner.sortOrder, 100, {
                    min: 0,
                    max: 100000,
                }),
                createdAt: partner.createdAt,
                updatedAt: partner.updatedAt,
            },
            companyIds:
                visibilityMode === 'SELECTED'
                    ? partner.companies.map((v) => v.companyId)
                    : [],
        });
    } catch (e) {
        console.error('[platform partners get] error:', e);
        return jsonErr('Erro ao acessar parceiro.', 500);
    }
}

export async function PATCH(
    request: Request,
    ctx: { params: Promise<{ partnerId: string }> }
) {
    const auth = await requirePlatformForModuleApi('PARTNERS');
    if (auth instanceof NextResponse) return auth;

    try {
        const origin = getRequestOrigin(request);

        const { partnerId } = await ctx.params;
        const id = normalizeString(partnerId);
        if (!id) return jsonErr('partnerId é obrigatório.', 400);

        const body = (await request
            .json()
            .catch(() => null)) as PatchPayload | null;
        if (!body) return jsonErr('Body inválido.', 400);

        const current = await prisma.partner.findFirst({
            where: { id },
            select: {
                id: true,
                isActive: true,
                name: true,
                logoUrl: true,
                logoKey: true,
                discountPct: true,
                description: true,
                rules: true,
                ctaUrl: true,
                ctaLabel: true,
                visibilityMode: true,
                sortOrder: true,
            },
        });

        if (!current) return jsonErr('Parceiro não encontrado.', 404);

        if ('toggleActive' in body && body.toggleActive === true) {
            const updated = await prisma.partner.update({
                where: { id: current.id },
                data: { isActive: !current.isActive },
                select: { id: true, isActive: true },
            });

            return jsonOk({ id: updated.id, isActive: updated.isActive });
        }

        if (
            !('update' in body) ||
            !body.update ||
            typeof body.update !== 'object'
        ) {
            return jsonErr('Patch inválido.', 400);
        }

        const u = body.update;

        const name =
            u.name !== undefined ? normalizeString(u.name) : current.name;

        const logoUrlRaw =
            u.logoUrl !== undefined
                ? normalizeNullableString(u.logoUrl)
                : (current.logoUrl ?? null);

        const logoKey =
            u.logoKey !== undefined
                ? normalizeNullableString(u.logoKey)
                : (current.logoKey ?? null);

        const discountPct = toInt(
            u.discountPct !== undefined ? u.discountPct : current.discountPct,
            0,
            { min: 0, max: 100 }
        );

        const description =
            u.description !== undefined
                ? normalizeNullableString(u.description)
                : (current.description ?? null);

        const rules =
            u.rules !== undefined
                ? normalizeNullableString(u.rules)
                : (current.rules ?? null);

        const ctaUrl =
            u.ctaUrl !== undefined
                ? normalizeCtaUrl(u.ctaUrl)
                : normalizeCtaUrl(current.ctaUrl);

        const ctaLabel =
            u.ctaLabel !== undefined
                ? normalizeNullableString(u.ctaLabel)
                : (current.ctaLabel ?? null);

        const currentVisibility = normalizeVisibilityMode(
            current.visibilityMode ?? 'ALL'
        );

        const visibilityMode =
            u.visibilityMode !== undefined
                ? normalizeVisibilityMode(u.visibilityMode)
                : currentVisibility;

        const sortOrder = toInt(
            u.sortOrder !== undefined ? u.sortOrder : current.sortOrder,
            100,
            { min: 0, max: 100000 }
        );

        const hasCompanyIds = u.companyIds !== undefined;
        const companyIds = hasCompanyIds
            ? normalizeCompanyIds(u.companyIds)
            : [];

        if (!name) return jsonErr('Nome é obrigatório.', 400);

        if (!logoUrlRaw) return jsonErr('logoUrl é obrigatório.', 400);
        if (!isValidLogoUrl(logoUrlRaw)) {
            return jsonErr(
                'logoUrl inválida. Envie uma imagem (/media ou /uploads) ou forneça uma URL http(s) válida.',
                400
            );
        }

        if (!ctaUrl) {
            return jsonErr(
                'ctaUrl inválida. Informe uma URL http(s) (ou começando com www.).',
                400
            );
        }

        const isChangingVisibility =
            u.visibilityMode !== undefined &&
            visibilityMode !== currentVisibility;

        if (visibilityMode === 'SELECTED') {
            if (
                (isChangingVisibility || hasCompanyIds) &&
                companyIds.length === 0
            ) {
                return jsonErr(
                    'Em SELECTED, você precisa selecionar pelo menos 1 empresa.',
                    400
                );
            }
            if (isChangingVisibility && !hasCompanyIds) {
                return jsonErr(
                    'Ao mudar para SELECTED, envie companyIds com pelo menos 1 empresa.',
                    400
                );
            }
        }

        const shouldSyncVisibility = hasCompanyIds || isChangingVisibility;

        const result = await prisma.$transaction(async (tx) => {
            const partnerUpdated = await tx.partner.update({
                where: { id: current.id },
                data: {
                    name,
                    logoUrl: logoUrlRaw,
                    logoKey,
                    discountPct,
                    description,
                    rules,
                    ctaUrl,
                    ctaLabel: ctaLabel || 'Ativar cashback e ir pra loja',
                    visibilityMode: visibilityMode as any,
                    sortOrder,
                },
                select: {
                    id: true,
                    isActive: true,
                    name: true,
                    logoUrl: true,
                    logoKey: true,
                    discountPct: true,
                    description: true,
                    rules: true,
                    ctaUrl: true,
                    ctaLabel: true,
                    visibilityMode: true,
                    sortOrder: true,
                    updatedAt: true,
                },
            });

            if (shouldSyncVisibility) {
                if (visibilityMode === 'ALL') {
                    await tx.partnerVisibility.deleteMany({
                        where: { partnerId: partnerUpdated.id },
                    });
                    return { partnerUpdated, companyIds: [] as string[] };
                }

                await tx.partnerVisibility.deleteMany({
                    where: { partnerId: partnerUpdated.id },
                });

                if (companyIds.length) {
                    await tx.partnerVisibility.createMany({
                        data: companyIds.map((companyId) => ({
                            partnerId: partnerUpdated.id,
                            companyId,
                            isEnabled: true,
                        })),
                        skipDuplicates: true,
                    });
                }

                return { partnerUpdated, companyIds };
            }

            return { partnerUpdated, companyIds: null as string[] | null };
        });

        let effectiveCompanyIds: string[] = [];
        const effectiveVisibilityMode = normalizeVisibilityMode(
            result.partnerUpdated.visibilityMode ?? 'ALL'
        );

        if (Array.isArray(result.companyIds)) {
            effectiveCompanyIds = result.companyIds;
        } else if (effectiveVisibilityMode === 'SELECTED') {
            const vis = await prisma.partnerVisibility.findMany({
                where: { partnerId: result.partnerUpdated.id, isEnabled: true },
                select: { companyId: true },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            });
            effectiveCompanyIds = vis.map((v) => v.companyId);
        }

        const logoUrl = normalizeImageUrl(
            origin,
            result.partnerUpdated.logoUrl
        );

        return jsonOk({
            id: result.partnerUpdated.id,
            partner: {
                id: result.partnerUpdated.id,
                name: result.partnerUpdated.name,
                logoUrl,
                logoKey: result.partnerUpdated.logoKey ?? null,
                discountPct: toInt(result.partnerUpdated.discountPct, 0, {
                    min: 0,
                    max: 100,
                }),
                description: result.partnerUpdated.description ?? null,
                rules: result.partnerUpdated.rules ?? null,
                ctaUrl: normalizeCtaUrl(result.partnerUpdated.ctaUrl) ?? null,
                ctaLabel: result.partnerUpdated.ctaLabel ?? null,
                isActive: Boolean(result.partnerUpdated.isActive),
                visibilityMode: effectiveVisibilityMode,
                sortOrder: toInt(result.partnerUpdated.sortOrder, 100, {
                    min: 0,
                    max: 100000,
                }),
                updatedAt: result.partnerUpdated.updatedAt,
            },
            companyIds:
                effectiveVisibilityMode === 'SELECTED'
                    ? effectiveCompanyIds
                    : [],
        });
    } catch (e) {
        console.error('[platform partners patch] error:', e);
        return jsonErr('Erro ao editar parceiro.', 500);
    }
}
