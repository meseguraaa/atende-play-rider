// src/app/api/admin/plans/[planId]/route.ts
import { NextResponse } from 'next/server';
import { Prisma, type PlanType } from '@prisma/client';

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

function stringArrayPreserveDuplicates(values: unknown): string[] {
    if (!Array.isArray(values)) return [];

    const out: string[] = [];

    for (const v of values) {
        const s = typeof v === 'string' ? v.trim() : '';
        if (!s) continue;
        out.push(s);
    }

    return out;
}

function uniqInts(values: unknown): number[] {
    if (!Array.isArray(values)) return [];
    const out: number[] = [];
    const seen = new Set<number>();

    for (const v of values) {
        const n = Number(v);
        if (!Number.isInteger(n)) continue;
        if (n < 0 || n > 6) continue;
        if (seen.has(n)) continue;
        seen.add(n);
        out.push(n);
    }

    return out.sort((a, b) => a - b);
}

function normalizeTimeOrNull(value: unknown): string | null {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return null;

    const match = raw.match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;

    const hh = Number(match[1]);
    const mm = Number(match[2]);

    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
    if (hh < 0 || hh > 23) return null;
    if (mm < 0 || mm > 59) return null;

    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

type PlanServiceInput = {
    serviceId: string;
    creditsIncluded: number;
    professionalPercentage: number;
    sortOrder: number;
};

const SUBSCRIPTION_CREDITS = 31;
const SUBSCRIPTION_VALIDITY_DAYS = 30;

export async function GET(
    _request: Request,
    context: { params: Promise<{ planId: string }> }
) {
    const session = await requireAdminForModule('PLANS');
    const companyId = (
        session as unknown as { companyId?: string }
    ).companyId?.trim();

    if (!companyId) {
        return jsonErr('Sessão sem companyId.', 401);
    }

    const { planId: rawPlanId } = await context.params;
    const planId = String(rawPlanId ?? '').trim();

    if (!planId) return jsonErr('Plano inválido.', 400);

    try {
        const [plan, services, professionals, clients] = await Promise.all([
            prisma.plan.findFirst({
                where: { id: planId, companyId },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    type: true,
                    customForClientId: true,
                    price: true,
                    validityDays: true,
                    allowedWeekdays: true,
                    allowedStartTime: true,
                    allowedEndTime: true,
                    sortOrder: true,
                    isActive: true,
                    services: {
                        orderBy: [{ sortOrder: 'asc' }],
                        select: {
                            serviceId: true,
                            creditsIncluded: true,
                            professionalPercentage: true,
                            sortOrder: true,
                        },
                    },
                    professionals: {
                        select: { professionalId: true },
                    },
                    creditOrders: {
                        orderBy: [{ position: 'asc' }],
                        select: { serviceId: true },
                    },
                },
            }),
            prisma.service.findMany({
                where: { companyId },
                orderBy: { name: 'asc' },
                select: {
                    id: true,
                    name: true,
                    isActive: true,
                    price: true,
                    durationMinutes: true,
                    professionalPercentage: true,
                },
            }),
            prisma.professional.findMany({
                where: { companyId },
                orderBy: { name: 'asc' },
                select: { id: true, name: true, isActive: true },
            }),
            prisma.companyMember.findMany({
                where: {
                    companyId,
                    isActive: true,
                    role: 'CLIENT',
                },
                orderBy: {
                    user: { name: 'asc' },
                },
                select: {
                    isActive: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            }),
        ]);

        if (!plan) return jsonErr('Plano não encontrado.', 404);

        const clientsUI = clients.map((m) => ({
            id: m.user.id,
            name: m.user.name?.trim() || m.user.email,
            email: m.user.email,
            isActive: m.isActive,
        }));

        return jsonOk({
            plan,
            services,
            professionals,
            clients: clientsUI,
            selectedProfessionalIds: plan.professionals.map(
                (p) => p.professionalId
            ),
            serviceItems: plan.services,
            creditOrderServiceIds: plan.creditOrders.map((c) => c.serviceId),
        });
    } catch {
        return jsonErr('Erro ao carregar plano.', 500);
    }
}

export async function PATCH(
    request: Request,
    context: { params: Promise<{ planId: string }> }
) {
    const session = await requireAdminForModule('PLANS');
    const companyId = (
        session as unknown as { companyId?: string }
    ).companyId?.trim();

    if (!companyId) return jsonErr('Sessão sem companyId.', 401);

    const { planId: rawPlanId } = await context.params;
    const planId = String(rawPlanId ?? '').trim();

    if (!planId) return jsonErr('Plano inválido.', 400);

    const body = (await request.json().catch(() => null)) as {
        name?: unknown;
        description?: unknown;
        type?: unknown;
        customForClientId?: unknown;
        price?: unknown;
        validityDays?: unknown;
        allowedWeekdays?: unknown;
        allowedStartTime?: unknown;
        allowedEndTime?: unknown;
        sortOrder?: unknown;
        isActive?: unknown;
        serviceItems?: unknown;
        professionalIds?: unknown;
        creditOrderServiceIds?: unknown;
    } | null;

    if (!body) return jsonErr('Body inválido.');

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description =
        typeof body.description === 'string'
            ? body.description.trim()
            : undefined;

    const descriptionValue: string | null | undefined =
        description === undefined ? undefined : description || null;

    const typeRaw = typeof body.type === 'string' ? body.type.trim() : '';
    const type: PlanType =
        typeRaw === 'CUSTOM'
            ? 'CUSTOM'
            : typeRaw === 'SUBSCRIPTION'
              ? 'SUBSCRIPTION'
              : 'GENERAL';

    const customForClientIdRaw =
        typeof body.customForClientId === 'string'
            ? body.customForClientId.trim()
            : '';
    const customForClientId =
        type === 'CUSTOM' && customForClientIdRaw ? customForClientIdRaw : null;

    const isSubscription = type === 'SUBSCRIPTION';

    const priceNum = toFiniteNumber(body.price);
    const validityDaysNum = toFiniteNumber(body.validityDays);
    const sortOrderNum = toFiniteNumber(body.sortOrder) ?? 100;
    const isActive = typeof body.isActive === 'boolean' ? body.isActive : true;

    const allowedWeekdays = uniqInts(body.allowedWeekdays);
    const allowedStartTime = normalizeTimeOrNull(body.allowedStartTime);
    const allowedEndTime = normalizeTimeOrNull(body.allowedEndTime);

    const professionalIds = uniqStrings(body.professionalIds);
    const creditOrderServiceIds = stringArrayPreserveDuplicates(
        body.creditOrderServiceIds
    );

    const serviceItemsRaw = Array.isArray(body.serviceItems)
        ? body.serviceItems
        : [];

    const serviceItemsParsed: PlanServiceInput[] = serviceItemsRaw
        .map((item, index) => {
            const obj = item as {
                serviceId?: unknown;
                creditsIncluded?: unknown;
                professionalPercentage?: unknown;
                sortOrder?: unknown;
            };

            const serviceId =
                typeof obj?.serviceId === 'string' ? obj.serviceId.trim() : '';

            const creditsIncluded = toFiniteNumber(obj?.creditsIncluded);
            const professionalPercentage = toFiniteNumber(
                obj?.professionalPercentage
            );
            const sortOrder =
                toFiniteNumber(obj?.sortOrder) ?? Number(index) + 1;

            if (!serviceId) return null;
            if (
                creditsIncluded === null ||
                !Number.isInteger(creditsIncluded) ||
                creditsIncluded <= 0
            ) {
                return null;
            }
            if (
                professionalPercentage === null ||
                professionalPercentage < 0 ||
                professionalPercentage > 100
            ) {
                return null;
            }

            return {
                serviceId,
                creditsIncluded,
                professionalPercentage,
                sortOrder: Math.trunc(sortOrder),
            };
        })
        .filter(Boolean) as PlanServiceInput[];

    if (!name) return jsonErr('Nome do plano é obrigatório.');

    if (priceNum === null || priceNum < 0) {
        return jsonErr('Valor do plano inválido.');
    }

    if (
        validityDaysNum === null ||
        !Number.isInteger(validityDaysNum) ||
        validityDaysNum <= 0
    ) {
        return jsonErr('Validade do plano inválida.');
    }

    if (
        allowedStartTime &&
        allowedEndTime &&
        allowedStartTime >= allowedEndTime
    ) {
        return jsonErr('O horário final deve ser maior que o horário inicial.');
    }

    if (type === 'CUSTOM' && !customForClientId) {
        return jsonErr('Selecione o cliente do plano personalizado.');
    }

    if (serviceItemsParsed.length === 0) {
        return jsonErr('Adicione pelo menos 1 serviço ao plano.');
    }

    const uniqueServiceIds = new Set(
        serviceItemsParsed.map((s) => s.serviceId)
    );
    if (uniqueServiceIds.size !== serviceItemsParsed.length) {
        return jsonErr('Não repita o mesmo serviço na lista do plano.');
    }

    if (isSubscription) {
        if (serviceItemsParsed.length !== 1) {
            return jsonErr('A assinatura deve ter exatamente 1 serviço.');
        }

        if (Math.trunc(validityDaysNum) !== SUBSCRIPTION_VALIDITY_DAYS) {
            return jsonErr('A assinatura deve ter validade de 30 dias.');
        }

        const onlyService = serviceItemsParsed[0];
        if (onlyService.creditsIncluded !== SUBSCRIPTION_CREDITS) {
            return jsonErr('A assinatura deve ter exatamente 31 créditos.');
        }
    }

    const totalCredits = serviceItemsParsed.reduce(
        (sum, item) => sum + item.creditsIncluded,
        0
    );

    if (
        creditOrderServiceIds.length > 0 &&
        creditOrderServiceIds.length !== totalCredits
    ) {
        return jsonErr(
            'A ordem sugerida precisa ter a mesma quantidade total de créditos do plano.'
        );
    }

    try {
        const existingPlan = await prisma.plan.findFirst({
            where: { id: planId, companyId },
            select: { id: true },
        });

        if (!existingPlan) return jsonErr('Plano não encontrado.', 404);

        const [
            allowedServices,
            allowedProfessionals,
            customClientMembership,
            otherActiveCustomPlan,
        ] = await Promise.all([
            prisma.service.findMany({
                where: {
                    companyId,
                    id: { in: serviceItemsParsed.map((s) => s.serviceId) },
                },
                select: {
                    id: true,
                    name: true,
                    price: true,
                    durationMinutes: true,
                    professionalPercentage: true,
                },
            }),
            professionalIds.length > 0
                ? prisma.professional.findMany({
                      where: {
                          companyId,
                          id: { in: professionalIds },
                          isActive: true,
                      },
                      select: { id: true },
                  })
                : Promise.resolve([]),
            customForClientId
                ? prisma.companyMember.findFirst({
                      where: {
                          companyId,
                          userId: customForClientId,
                          isActive: true,
                          role: 'CLIENT',
                      },
                      select: { userId: true },
                  })
                : Promise.resolve(null),
            customForClientId
                ? prisma.plan.findFirst({
                      where: {
                          companyId,
                          id: { not: planId },
                          type: 'CUSTOM',
                          isActive: true,
                          customForClientId,
                      },
                      select: { id: true },
                  })
                : Promise.resolve(null),
        ]);

        const serviceById = new Map(allowedServices.map((s) => [s.id, s]));

        if (serviceById.size !== serviceItemsParsed.length) {
            return jsonErr('Um ou mais serviços do plano são inválidos.');
        }

        const allowedProfessionalIds = new Set(
            allowedProfessionals.map((p) => p.id)
        );

        if (
            professionalIds.length > 0 &&
            allowedProfessionalIds.size !== professionalIds.length
        ) {
            return jsonErr(
                'Um ou mais profissionais permitidos do plano são inválidos.'
            );
        }

        if (type === 'CUSTOM') {
            if (!customClientMembership?.userId) {
                return jsonErr('Cliente inválido.');
            }

            if (otherActiveCustomPlan?.id) {
                return jsonErr('Cliente já possui outro plano ativo.');
            }
        }

        if (creditOrderServiceIds.length > 0) {
            const expectedCreditsByServiceId = new Map<string, number>();

            for (const item of serviceItemsParsed) {
                expectedCreditsByServiceId.set(
                    item.serviceId,
                    item.creditsIncluded
                );
            }

            const receivedCreditsByServiceId = new Map<string, number>();
            for (const serviceId of creditOrderServiceIds) {
                if (!expectedCreditsByServiceId.has(serviceId)) {
                    return jsonErr(
                        'A ordem sugerida contém serviço que não pertence ao plano.'
                    );
                }

                receivedCreditsByServiceId.set(
                    serviceId,
                    (receivedCreditsByServiceId.get(serviceId) ?? 0) + 1
                );
            }

            for (const [
                serviceId,
                expectedCount,
            ] of expectedCreditsByServiceId) {
                const receivedCount =
                    receivedCreditsByServiceId.get(serviceId) ?? 0;
                if (receivedCount !== expectedCount) {
                    return jsonErr(
                        'A ordem sugerida não corresponde à quantidade de créditos dos serviços.'
                    );
                }
            }
        }

        const updated = await prisma.$transaction(async (tx) => {
            const updatedPlan = await tx.plan.update({
                where: { id: planId },
                data: {
                    name,
                    ...(descriptionValue !== undefined
                        ? { description: descriptionValue }
                        : {}),
                    type,
                    customForClientId,
                    price: new Prisma.Decimal(priceNum),
                    validityDays: Math.trunc(validityDaysNum),
                    allowedWeekdays,
                    allowedStartTime,
                    allowedEndTime,
                    sortOrder: Math.trunc(sortOrderNum),
                    isActive,
                },
                select: {
                    id: true,
                },
            });

            await tx.planService.deleteMany({
                where: { companyId, planId },
            });

            await tx.planService.createMany({
                data: serviceItemsParsed.map((item) => {
                    const service = serviceById.get(item.serviceId)!;

                    return {
                        companyId,
                        planId,
                        serviceId: item.serviceId,
                        creditsIncluded: item.creditsIncluded,
                        sortOrder: item.sortOrder,
                        professionalPercentage: new Prisma.Decimal(
                            item.professionalPercentage
                        ),
                        serviceNameSnapshot: service.name,
                        servicePriceSnapshot: new Prisma.Decimal(service.price),
                        durationMinutesSnapshot: service.durationMinutes,
                    };
                }),
            });

            await tx.planProfessional.deleteMany({
                where: { companyId, planId },
            });

            if (professionalIds.length > 0) {
                await tx.planProfessional.createMany({
                    data: professionalIds.map((professionalId) => ({
                        companyId,
                        planId,
                        professionalId,
                    })),
                    skipDuplicates: true,
                });
            }

            await tx.planCreditOrder.deleteMany({
                where: { companyId, planId },
            });

            const sequence =
                creditOrderServiceIds.length > 0
                    ? creditOrderServiceIds
                    : serviceItemsParsed
                          .slice()
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                          .flatMap((item) =>
                              Array.from(
                                  { length: item.creditsIncluded },
                                  () => item.serviceId
                              )
                          );

            if (sequence.length > 0) {
                await tx.planCreditOrder.createMany({
                    data: sequence.map((serviceId, index) => ({
                        companyId,
                        planId,
                        serviceId,
                        position: index + 1,
                    })),
                });
            }

            return updatedPlan;
        });

        return jsonOk(updated);
    } catch {
        return jsonErr('Erro ao atualizar plano.', 500);
    }
}
