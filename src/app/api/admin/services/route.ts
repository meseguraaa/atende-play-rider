// src/app/api/admin/services/route.ts
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function toFiniteNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;

    const n =
        typeof value === 'string'
            ? Number(value.replace(',', '.').trim())
            : Number(value);

    return Number.isFinite(n) ? n : null;
}

function uniqStrings(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    const out: string[] = [];
    const seen = new Set<string>();

    for (const v of values) {
        const s = typeof v === 'string' ? v.trim() : '';
        if (!s) continue;
        if (seen.has(s)) continue;
        seen.add(s);
        out.push(s);
    }

    return out;
}

type ServiceForRow = {
    id: string;
    unitId: string | null;
    name: string;
    description: string | null;
    priceInCents: number | null;
    durationInMinutes: number | null;
    barberPercentage: number | null;
    cancelLimitHours: number | null;
    cancelFeePercentage: number | null;
    isActive: boolean;
    companyId: string | null;
};

type ProfessionalForPicker = {
    id: string;
    name: string;
    isActive: boolean;
};

type UnitForPicker = {
    id: string;
    name: string;
    isActive: boolean;
};

type CategoryForPicker = {
    id: string;
    name: string;
    isActive: boolean;
    showInServices: boolean;
    showInProducts: boolean;
};

export async function GET() {
    const session = await requireAdminForModule('SERVICES');
    const companyId = (
        session as unknown as { companyId?: string }
    ).companyId?.trim();

    const activeUnitId = String(
        (session as unknown as { unitId?: string | null }).unitId ?? ''
    ).trim();

    if (!companyId) {
        return jsonErr(
            'Sessão sem companyId. Este painel é multi-tenant: vincule o admin a uma empresa.',
            401
        );
    }

    try {
        const [services, professionals, units, categories] = await Promise.all([
            prisma.service.findMany({
                where: {
                    companyId,
                    ...(activeUnitId ? { unitId: activeUnitId } : {}),
                },
                orderBy: { name: 'asc' },
                select: {
                    id: true,
                    companyId: true,
                    unitId: true,
                    name: true,
                    description: true,
                    price: true,
                    durationMinutes: true,
                    isActive: true,
                    professionalPercentage: true,
                    cancelLimitHours: true,
                    cancelFeePercentage: true,
                },
            }),
            prisma.professional.findMany({
                where: { companyId },
                orderBy: { name: 'asc' },
                select: { id: true, name: true, isActive: true },
            }),
            prisma.unit.findMany({
                where: { companyId },
                orderBy: { name: 'asc' },
                select: { id: true, name: true, isActive: true },
            }),
            prisma.category.findMany({
                where: { companyId },
                orderBy: { name: 'asc' },
                select: {
                    id: true,
                    name: true,
                    isActive: true,
                    showInServices: true,
                    showInProducts: true,
                },
            }),
        ]);

        const servicesUI: ServiceForRow[] = services.map((s) => {
            const priceNum = Number(s.price.toString());
            const pctNum = Number(s.professionalPercentage.toString());
            const feePctNum =
                s.cancelFeePercentage === null
                    ? null
                    : Number(s.cancelFeePercentage.toString());

            return {
                id: s.id,
                unitId: s.unitId ?? null,
                name: s.name,
                description: s.description ?? null,
                priceInCents: Number.isFinite(priceNum)
                    ? Math.round(priceNum * 100)
                    : null,
                durationInMinutes:
                    typeof s.durationMinutes === 'number'
                        ? s.durationMinutes
                        : null,
                barberPercentage: Number.isFinite(pctNum) ? pctNum : null,
                cancelLimitHours: s.cancelLimitHours ?? null,
                cancelFeePercentage:
                    feePctNum !== null && Number.isFinite(feePctNum)
                        ? feePctNum
                        : null,
                isActive: s.isActive,
                companyId: s.companyId ?? null,
            };
        });

        const professionalsUI: ProfessionalForPicker[] = professionals.map(
            (p) => ({
                id: p.id,
                name: p.name,
                isActive: p.isActive,
            })
        );

        const unitsUI: UnitForPicker[] = units.map((u) => ({
            id: u.id,
            name: u.name,
            isActive: u.isActive,
        }));

        const categoriesUI: CategoryForPicker[] = categories.map((c) => ({
            id: c.id,
            name: c.name,
            isActive: c.isActive,
            showInServices: c.showInServices,
            showInProducts: c.showInProducts,
        }));

        return jsonOk({
            services: servicesUI,
            professionals: professionalsUI,
            units: unitsUI,
            categories: categoriesUI,
            activeUnitId: activeUnitId || null,
        });
    } catch {
        return jsonErr('Não foi possível carregar os serviços.', 500);
    }
}

export async function POST(request: Request) {
    const session = await requireAdminForModule('SERVICES');
    const companyId = (
        session as unknown as { companyId?: string }
    ).companyId?.trim();

    if (!companyId) {
        return jsonErr(
            'Sessão sem companyId. Este painel é multi-tenant: vincule o admin a uma empresa.',
            401
        );
    }

    const body = (await request.json().catch(() => null)) as {
        name?: unknown;
        description?: unknown;
        unitId?: unknown;
        price?: unknown;
        priceInCents?: unknown;
        durationMinutes?: unknown;
        durationInMinutes?: unknown;
        professionalPercentage?: unknown;
        barberPercentage?: unknown;
        cancelLimitHours?: unknown;
        cancelFeePercentage?: unknown;
        professionalIds?: unknown;
        categoryIds?: unknown;
    } | null;

    if (!body) return jsonErr('Body inválido.');

    const name = typeof body.name === 'string' ? body.name.trim() : '';

    const description =
        typeof body.description === 'string'
            ? body.description.trim()
            : undefined;

    const descriptionValue: string | null | undefined =
        description === undefined ? undefined : description || null;

    const rawUnitId = typeof body.unitId === 'string' ? body.unitId.trim() : '';
    const unitId = rawUnitId ? rawUnitId : null;

    const priceInCentsNum = toFiniteNumber(body.priceInCents);
    const priceNum =
        priceInCentsNum !== null
            ? priceInCentsNum / 100
            : toFiniteNumber(body.price);

    const durationMinutesNum =
        toFiniteNumber(body.durationMinutes) ??
        toFiniteNumber(body.durationInMinutes);

    const professionalPercentageNum =
        toFiniteNumber(body.professionalPercentage) ??
        toFiniteNumber(body.barberPercentage);

    const cancelLimitHoursNum = toFiniteNumber(body.cancelLimitHours);
    const cancelFeePercentageNum = toFiniteNumber(body.cancelFeePercentage);

    const professionalIds = uniqStrings(body.professionalIds);
    const categoryIds = uniqStrings(body.categoryIds);

    if (!name) return jsonErr('Nome do serviço é obrigatório.');
    if (priceNum === null || priceNum < 0) return jsonErr('Preço inválido.');
    if (durationMinutesNum === null || durationMinutesNum <= 0)
        return jsonErr('Duração inválida.');
    if (
        professionalPercentageNum === null ||
        professionalPercentageNum < 0 ||
        professionalPercentageNum > 100
    ) {
        return jsonErr('Porcentagem do profissional inválida (0 a 100).');
    }

    if (cancelLimitHoursNum !== null && cancelLimitHoursNum < 0) {
        return jsonErr('Limite de cancelamento inválido.');
    }

    if (
        cancelFeePercentageNum !== null &&
        (cancelFeePercentageNum < 0 || cancelFeePercentageNum > 100)
    ) {
        return jsonErr('Taxa de cancelamento inválida (0 a 100).');
    }

    if (professionalIds.length === 0) {
        return jsonErr('Selecione pelo menos 1 profissional.');
    }

    if (categoryIds.length === 0) {
        return jsonErr('Selecione pelo menos 1 categoria.');
    }

    try {
        if (unitId) {
            const unitExists = await prisma.unit.findFirst({
                where: { id: unitId, companyId },
                select: { id: true },
            });

            if (!unitExists) {
                return jsonErr('Unidade inválida para esta empresa.');
            }
        }

        const [allowedProfessionals, allowedCategories] = await Promise.all([
            prisma.professional.findMany({
                where: { companyId, id: { in: professionalIds } },
                select: { id: true },
            }),
            prisma.category.findMany({
                where: {
                    companyId,
                    id: { in: categoryIds },
                    isActive: true,
                    showInServices: true,
                },
                select: { id: true },
            }),
        ]);

        const allowedProfessionalIds = new Set(
            allowedProfessionals.map((p) => p.id)
        );
        const filteredProfessionalIds = professionalIds.filter((id) =>
            allowedProfessionalIds.has(id)
        );

        if (filteredProfessionalIds.length === 0) {
            return jsonErr('Nenhum profissional válido selecionado.');
        }

        const allowedCategoryIds = new Set(allowedCategories.map((c) => c.id));
        const filteredCategoryIds = categoryIds.filter((id) =>
            allowedCategoryIds.has(id)
        );

        if (filteredCategoryIds.length === 0) {
            return jsonErr('Nenhuma categoria válida selecionada.');
        }

        const created = await prisma.$transaction(async (tx) => {
            const service = await tx.service.create({
                data: {
                    companyId,
                    ...(unitId ? { unitId } : {}),
                    name,
                    ...(descriptionValue !== undefined
                        ? { description: descriptionValue }
                        : {}),
                    price: new Prisma.Decimal(priceNum),
                    durationMinutes: Math.trunc(durationMinutesNum),
                    isActive: true,
                    professionalPercentage: new Prisma.Decimal(
                        professionalPercentageNum
                    ),
                    cancelLimitHours:
                        cancelLimitHoursNum === null
                            ? null
                            : Math.trunc(cancelLimitHoursNum),
                    cancelFeePercentage:
                        cancelFeePercentageNum === null
                            ? null
                            : new Prisma.Decimal(cancelFeePercentageNum),
                },
                select: { id: true },
            });

            await tx.serviceProfessional.createMany({
                data: filteredProfessionalIds.map((professionalId) => ({
                    companyId,
                    serviceId: service.id,
                    professionalId,
                })),
                skipDuplicates: true,
            });

            await tx.serviceCategory.createMany({
                data: filteredCategoryIds.map((categoryId) => ({
                    companyId,
                    serviceId: service.id,
                    categoryId,
                })),
                skipDuplicates: true,
            });

            return service;
        });

        return jsonOk({ id: created.id }, { status: 201 });
    } catch {
        return jsonErr('Não foi possível criar o serviço.', 500);
    }
}
