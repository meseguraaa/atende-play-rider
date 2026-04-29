// src/app/api/admin/checkout/orders/[orderId]/complete/route.ts
import { NextResponse } from 'next/server';
import {
    AppointmentPlanUsageType,
    Prisma,
    PaymentMethod,
    CheckoutDiscountType,
    OrderItemType,
} from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

type CompleteCheckoutResponse =
    | {
          ok: true;
          data: {
              orderId: string;
              status: 'COMPLETED';
              totalAmount: string; // decimal como string
              checkedOutAt: string; // ISO
              appointmentUpdated: boolean;
          };
      }
    | { ok: false; error: string };

type SubscriptionAction = 'NONE' | 'USE_ACTIVE' | 'RENEW' | 'JOIN';

type CompleteCheckoutBody = {
    paymentMethod?: unknown;
    cardMachineId?: unknown;
    cardInstallments?: unknown;
    itemDiscounts?: unknown;
    subscriptionAction?: unknown;
};

type CheckoutItemDiscountInput = {
    orderItemId: string;
    discountType: CheckoutDiscountType | null;
    discountValue: number;
    discountReason: string | null;
};

type Ctx = {
    params: Promise<{
        orderId: string;
    }>;
};

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function toDecimal(value: number) {
    return new Prisma.Decimal(value.toFixed(2));
}

function parsePaymentMethod(v: unknown): PaymentMethod | null {
    const s = normalizeString(v).toUpperCase();

    if (s === 'CREDIT') return 'CREDIT';
    if (s === 'DEBIT') return 'DEBIT';
    if (s === 'PIX') return 'PIX';
    if (s === 'CASH') return 'CASH';

    return null;
}

function parseInstallments(v: unknown): number {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.floor(n);
}

function parseDiscountType(v: unknown): CheckoutDiscountType | null {
    const s = normalizeString(v).toUpperCase();

    if (s === 'PERCENT') return 'PERCENT';
    if (s === 'AMOUNT') return 'AMOUNT';

    return null;
}

function parseSubscriptionAction(v: unknown): SubscriptionAction {
    const s = normalizeString(v).toUpperCase();

    if (s === 'USE_ACTIVE') return 'USE_ACTIVE';
    if (s === 'RENEW') return 'RENEW';
    if (s === 'JOIN') return 'JOIN';

    return 'NONE';
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function decimalToNumber(
    v: Prisma.Decimal | string | number | null | undefined
) {
    if (v == null) return 0;

    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;

    if (typeof v === 'string') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
    }

    const n = Number(v.toString().replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}

function roundMoney(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function jsonErr(
    message: string,
    status = 400
): NextResponse<CompleteCheckoutResponse> {
    return NextResponse.json({ ok: false, error: message } as const, {
        status,
    });
}

function jsonOk(
    data: Extract<CompleteCheckoutResponse, { ok: true }>['data'],
    status = 200
): NextResponse<CompleteCheckoutResponse> {
    return NextResponse.json({ ok: true, data } as const, { status });
}

function parseItemDiscounts(raw: unknown): CheckoutItemDiscountInput[] {
    if (raw == null) return [];

    if (!Array.isArray(raw)) {
        throw new Error(
            'itemDiscounts deve ser uma lista de descontos por item.'
        );
    }

    const seen = new Set<string>();

    return raw.map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            throw new Error(
                `itemDiscounts[${index}] é inválido. Esperado um objeto.`
            );
        }

        const obj = entry as Record<string, unknown>;
        const orderItemId = normalizeString(obj.orderItemId);

        if (!orderItemId) {
            throw new Error(
                `itemDiscounts[${index}].orderItemId é obrigatório.`
            );
        }

        if (seen.has(orderItemId)) {
            throw new Error(
                `itemDiscounts possui orderItemId duplicado: ${orderItemId}.`
            );
        }
        seen.add(orderItemId);

        const discountType = parseDiscountType(obj.discountType);
        const rawValue = obj.discountValue;
        const discountReason = normalizeString(obj.discountReason) || null;

        let discountValue = 0;

        if (rawValue != null && rawValue !== '') {
            if (
                typeof rawValue !== 'number' &&
                typeof rawValue !== 'string' &&
                !(rawValue instanceof Prisma.Decimal)
            ) {
                throw new Error(
                    `itemDiscounts[${index}].discountValue é inválido.`
                );
            }

            discountValue = decimalToNumber(rawValue);

            if (!Number.isFinite(discountValue) || discountValue < 0) {
                throw new Error(
                    `itemDiscounts[${index}].discountValue é inválido.`
                );
            }
        }

        if (discountValue > 0 && !discountType) {
            throw new Error(
                `itemDiscounts[${index}] precisa informar discountType quando houver discountValue maior que zero.`
            );
        }

        if (discountType === 'PERCENT' && discountValue > 100) {
            throw new Error(
                `itemDiscounts[${index}].discountValue não pode ser maior que 100 para desconto percentual.`
            );
        }

        return {
            orderItemId,
            discountType,
            discountValue,
            discountReason,
        };
    });
}

export async function PATCH(
    request: Request,
    ctx: Ctx
): Promise<NextResponse<CompleteCheckoutResponse>> {
    try {
        const session = await requireAdminForModule('CHECKOUT');

        const companyId = session.companyId;
        if (!companyId)
            return jsonErr('Empresa não encontrada na sessão.', 401);

        const userId = session.id;
        if (!userId) return jsonErr('Usuário não encontrado na sessão.', 401);

        const canSeeAllUnits = session.canSeeAllUnits;

        const { orderId: orderIdRaw } = await ctx.params;
        const orderId = normalizeString(orderIdRaw);
        if (!orderId) return jsonErr('orderId é obrigatório.', 400);

        let body: CompleteCheckoutBody = {};
        try {
            body = ((await request.json()) ?? {}) as CompleteCheckoutBody;
        } catch {
            body = {};
        }

        const paymentMethod = parsePaymentMethod(body.paymentMethod);
        const cardMachineId = normalizeString(body.cardMachineId);
        const cardInstallments = parseInstallments(body.cardInstallments);
        const itemDiscounts = parseItemDiscounts(body.itemDiscounts);
        const subscriptionAction = parseSubscriptionAction(
            body.subscriptionAction
        );

        let requiresCardMachine = false;

        const order = await prisma.order.findFirst({
            where: { id: orderId, companyId },
            select: {
                id: true,
                unitId: true,
                status: true,
                appointmentId: true,
                clientId: true,
                professionalId: true,
                totalAmount: true,
                createdAt: true,
                updatedAt: true,
                appointment: {
                    select: {
                        id: true,
                        planUsageType: true,
                        clientPlanId: true,
                        clientPlanServiceBalanceId: true,
                        checkedOutAt: true,
                        planCreditDebitedAt: true,
                        clientPlanServiceBalance: {
                            select: {
                                id: true,
                                professionalPercentageSnapshot: true,
                            },
                        },
                    },
                },
                items: {
                    select: {
                        id: true,
                        itemType: true,
                        productId: true,
                        serviceId: true,
                        planId: true,
                        professionalId: true,
                        descriptionSnapshot: true,
                        quantity: true,
                        unitPrice: true,
                        totalPrice: true,
                        originalUnitPrice: true,
                        originalTotalPrice: true,
                        feePercentageSnapshot: true,
                        professionalPercentageAtTime: true,
                        professionalCommissionAmount: true,
                        commissionBasePrice: true,
                    },
                },
            },
        });

        if (!order) return jsonErr('Pedido não encontrado.', 404);

        if (!canSeeAllUnits) {
            const hasAccess = await prisma.adminUnitAccess.findFirst({
                where: { companyId, userId, unitId: order.unitId },
                select: { id: true },
            });
            if (!hasAccess) return jsonErr('Sem acesso a esta unidade.', 403);
        }

        const orderItemMap = new Map(
            order.items.map((item) => [item.id, item])
        );

        for (const discountInput of itemDiscounts) {
            const item = orderItemMap.get(discountInput.orderItemId);

            if (!item) {
                return jsonErr(
                    `O item ${discountInput.orderItemId} não pertence a este pedido.`,
                    400
                );
            }

            if (
                item.itemType !== OrderItemType.SERVICE &&
                item.itemType !== OrderItemType.PRODUCT
            ) {
                return jsonErr(
                    `Desconto manual não é permitido para o item ${discountInput.orderItemId} do tipo ${item.itemType}.`,
                    400
                );
            }
        }

        let cardMachine: {
            id: string;
            name: string;
            debitFeePercent: Prisma.Decimal;
            creditFees: {
                installments: number;
                feePercent: Prisma.Decimal;
            }[];
        } | null = null;

        if (order.status === 'COMPLETED') {
            let checkedOutAtISO = order.updatedAt.toISOString();

            if (order.appointmentId) {
                const appt = await prisma.appointment.findFirst({
                    where: { id: order.appointmentId, companyId },
                    select: { checkedOutAt: true },
                });

                if (appt?.checkedOutAt) {
                    checkedOutAtISO = appt.checkedOutAt.toISOString();
                }
            }

            return jsonOk({
                orderId: order.id,
                status: 'COMPLETED',
                totalAmount: order.totalAmount
                    ? order.totalAmount.toString()
                    : '0',
                checkedOutAt: checkedOutAtISO,
                appointmentUpdated: false,
            });
        }

        if (order.status !== 'PENDING' && order.status !== 'PENDING_CHECKIN') {
            return jsonErr(
                `Não é possível concluir checkout com status "${order.status}".`,
                400
            );
        }

        const now = new Date();

        const serviceItemsOnly = order.items.filter(
            (item) => item.itemType === OrderItemType.SERVICE
        );

        const uniqueServiceIdsInOrder = Array.from(
            new Set(
                serviceItemsOnly
                    .map((item) => normalizeString(item.serviceId))
                    .filter(Boolean)
            )
        );

        const subscriptionServiceId =
            uniqueServiceIdsInOrder.length === 1
                ? uniqueServiceIdsInOrder[0]
                : null;

        let subscriptionContext: {
            action: Exclude<SubscriptionAction, 'NONE'>;
            availablePlan: {
                id: string;
                name: string;
                price: Prisma.Decimal;
                validityDays: number;
                planService: {
                    serviceId: string;
                    creditsIncluded: number;
                    professionalPercentage: Prisma.Decimal;
                    sortOrder: number;
                    serviceNameSnapshot: string;
                    servicePriceSnapshot: Prisma.Decimal;
                    durationMinutesSnapshot: number;
                } | null;
            };
            activeClientPlan: {
                id: string;
                expiresAt: Date;
                status: string;
                balance: {
                    id: string;
                    creditsTotal: number;
                    creditsUsed: number;
                    creditsRemaining: number;
                    professionalPercentageSnapshot: Prisma.Decimal;
                } | null;
            } | null;
        } | null = null;

        if (subscriptionAction !== 'NONE') {
            if (!order.clientId) {
                return jsonErr(
                    'A assinatura só pode ser usada em pedido com cliente vinculado.',
                    400
                );
            }

            if (!order.appointmentId) {
                return jsonErr(
                    'A assinatura só pode ser usada em pedidos vinculados a atendimento.',
                    400
                );
            }

            if (!subscriptionServiceId || serviceItemsOnly.length === 0) {
                return jsonErr(
                    'A assinatura exige exatamente 1 serviço vinculado ao pedido.',
                    400
                );
            }

            const availablePlan = await prisma.plan.findFirst({
                where: {
                    companyId,
                    isActive: true,
                    type: 'SUBSCRIPTION',
                    services: {
                        some: {
                            serviceId: subscriptionServiceId,
                        },
                    },
                },
                select: {
                    id: true,
                    name: true,
                    price: true,
                    validityDays: true,
                    services: {
                        where: {
                            serviceId: subscriptionServiceId,
                        },
                        orderBy: [{ sortOrder: 'asc' }],
                        select: {
                            serviceId: true,
                            creditsIncluded: true,
                            professionalPercentage: true,
                            sortOrder: true,
                            serviceNameSnapshot: true,
                            servicePriceSnapshot: true,
                            durationMinutesSnapshot: true,
                        },
                    },
                },
            });

            if (!availablePlan || !availablePlan.services?.[0]) {
                return jsonErr(
                    'Não existe assinatura ativa cadastrada para este serviço.',
                    400
                );
            }

            const subscriptionPlansForClient = await prisma.clientPlan.findMany(
                {
                    where: {
                        companyId,
                        clientId: order.clientId,
                        planTypeSnapshot: 'SUBSCRIPTION',
                        balances: {
                            some: {
                                serviceId: subscriptionServiceId,
                            },
                        },
                    },
                    orderBy: [{ createdAt: 'desc' }],
                    select: {
                        id: true,
                        status: true,
                        expiresAt: true,
                        balances: {
                            where: {
                                serviceId: subscriptionServiceId,
                            },
                            orderBy: [{ createdAt: 'asc' }],
                            select: {
                                id: true,
                                creditsTotal: true,
                                creditsUsed: true,
                                creditsRemaining: true,
                                professionalPercentageSnapshot: true,
                            },
                        },
                    },
                }
            );

            const activeClientPlan =
                subscriptionPlansForClient.find((clientPlan) => {
                    const balance = clientPlan.balances?.[0];
                    if (!balance) return false;
                    if (clientPlan.status !== 'ACTIVE') return false;
                    if (clientPlan.expiresAt.getTime() < now.getTime())
                        return false;
                    if (balance.creditsRemaining <= 0) return false;

                    return true;
                }) ?? null;

            subscriptionContext = {
                action: subscriptionAction,
                availablePlan: {
                    id: availablePlan.id,
                    name: availablePlan.name,
                    price: availablePlan.price,
                    validityDays: availablePlan.validityDays,
                    planService: availablePlan.services[0] ?? null,
                },
                activeClientPlan: activeClientPlan
                    ? {
                          id: activeClientPlan.id,
                          expiresAt: activeClientPlan.expiresAt,
                          status: activeClientPlan.status,
                          balance: activeClientPlan.balances?.[0]
                              ? {
                                    id: activeClientPlan.balances[0].id,
                                    creditsTotal:
                                        activeClientPlan.balances[0]
                                            .creditsTotal,
                                    creditsUsed:
                                        activeClientPlan.balances[0]
                                            .creditsUsed,
                                    creditsRemaining:
                                        activeClientPlan.balances[0]
                                            .creditsRemaining,
                                    professionalPercentageSnapshot:
                                        activeClientPlan.balances[0]
                                            .professionalPercentageSnapshot,
                                }
                              : null,
                      }
                    : null,
            };

            if (
                subscriptionAction === 'USE_ACTIVE' &&
                (!subscriptionContext.activeClientPlan ||
                    !subscriptionContext.activeClientPlan.balance)
            ) {
                return jsonErr(
                    'O cliente não possui assinatura ativa disponível para este serviço.',
                    400
                );
            }

            if (
                (subscriptionAction === 'RENEW' ||
                    subscriptionAction === 'JOIN') &&
                subscriptionContext.activeClientPlan
            ) {
                return jsonErr(
                    'O cliente já possui uma assinatura ativa para este serviço.',
                    400
                );
            }
        }

        const discountInputMap = new Map(
            itemDiscounts.map((item) => [item.orderItemId, item])
        );

        const isExistingPlanCreditCheckout =
            order.appointment?.planUsageType ===
            AppointmentPlanUsageType.PLAN_CREDIT;

        const existingPlanProfessionalPercentageSnapshot =
            isExistingPlanCreditCheckout
                ? decimalToNumber(
                      order.appointment?.clientPlanServiceBalance
                          ?.professionalPercentageSnapshot
                  )
                : null;

        const subscriptionProfessionalPercentageSnapshot =
            subscriptionContext?.action === 'USE_ACTIVE'
                ? decimalToNumber(
                      subscriptionContext.activeClientPlan?.balance
                          ?.professionalPercentageSnapshot
                  )
                : subscriptionContext?.action === 'RENEW' ||
                    subscriptionContext?.action === 'JOIN'
                  ? decimalToNumber(
                        subscriptionContext.availablePlan.planService
                            ?.professionalPercentage
                    )
                  : null;

        const recalculatedItems = order.items.map((item) => {
            const baseUnitPrice = decimalToNumber(
                item.originalUnitPrice ?? item.unitPrice
            );
            const baseTotalPrice = decimalToNumber(
                item.originalTotalPrice ?? item.totalPrice
            );
            const quantity = Math.max(1, Number(item.quantity || 1));

            const discountInput = discountInputMap.get(item.id);

            const isServiceCoveredByPlan =
                item.itemType === OrderItemType.SERVICE &&
                (isExistingPlanCreditCheckout ||
                    subscriptionContext?.action === 'USE_ACTIVE' ||
                    subscriptionContext?.action === 'RENEW' ||
                    subscriptionContext?.action === 'JOIN');

            let hasManualDiscount = false;
            let discountType: CheckoutDiscountType | null = null;
            let discountPercent: number | null = null;
            let discountAmount = 0;
            let discountReason: string | null = null;

            if (
                !isServiceCoveredByPlan &&
                discountInput &&
                (item.itemType === OrderItemType.SERVICE ||
                    item.itemType === OrderItemType.PRODUCT) &&
                discountInput.discountType &&
                discountInput.discountValue > 0
            ) {
                discountType = discountInput.discountType;
                discountReason = discountInput.discountReason;

                if (discountType === 'PERCENT') {
                    discountPercent = roundMoney(discountInput.discountValue);
                    discountAmount = roundMoney(
                        baseTotalPrice * (discountPercent / 100)
                    );
                } else {
                    discountAmount = roundMoney(discountInput.discountValue);
                }

                if (discountAmount > baseTotalPrice) {
                    discountAmount = baseTotalPrice;
                }

                hasManualDiscount = discountAmount > 0;
            }

            const finalTotalPrice = isServiceCoveredByPlan
                ? 0
                : roundMoney(baseTotalPrice - discountAmount);

            const finalUnitPrice = isServiceCoveredByPlan
                ? 0
                : roundMoney(finalTotalPrice / quantity);

            const commissionPct = isServiceCoveredByPlan
                ? Number.isFinite(subscriptionProfessionalPercentageSnapshot)
                    ? Number(subscriptionProfessionalPercentageSnapshot)
                    : Number.isFinite(
                            existingPlanProfessionalPercentageSnapshot
                        )
                      ? Number(existingPlanProfessionalPercentageSnapshot)
                      : 0
                : decimalToNumber(
                      item.professionalPercentageAtTime ??
                          item.feePercentageSnapshot
                  );

            const commissionBasePrice = isServiceCoveredByPlan
                ? roundMoney(baseTotalPrice)
                : roundMoney(finalTotalPrice);

            const professionalCommissionAmount =
                commissionPct > 0
                    ? roundMoney(commissionBasePrice * (commissionPct / 100))
                    : 0;

            if (isServiceCoveredByPlan) {
                hasManualDiscount = false;
                discountType = null;
                discountPercent = null;
                discountAmount = 0;
                discountReason = null;
            }

            return {
                id: item.id,
                itemType: item.itemType,
                productId: item.productId,
                serviceId: item.serviceId,
                planId: item.planId,
                professionalId: item.professionalId,
                descriptionSnapshot: item.descriptionSnapshot,
                quantity,
                originalUnitPrice: roundMoney(baseUnitPrice),
                originalTotalPrice: roundMoney(baseTotalPrice),
                hasManualDiscount,
                discountType,
                discountPercent,
                discountAmount,
                finalUnitPrice,
                finalTotalPrice,
                discountReason,
                commissionBasePrice,
                professionalCommissionAmount,
            };
        });

        const orderItemsTotalNumber = roundMoney(
            recalculatedItems.reduce(
                (sum, item) => sum + item.finalTotalPrice,
                0
            )
        );

        const nonServiceItemsTotalNumber = roundMoney(
            recalculatedItems
                .filter((item) => item.itemType !== OrderItemType.SERVICE)
                .reduce((sum, item) => sum + item.finalTotalPrice, 0)
        );

        let totalAmount: Prisma.Decimal = new Prisma.Decimal(0);

        let planSnapshot:
            | {
                  planName: string | null;
                  planCreditsUsed: number | null;
                  planCreditsTotal: number | null;
                  planCreditStatusLabel: string | null;
              }
            | undefined;

        if (subscriptionContext?.action === 'USE_ACTIVE') {
            totalAmount = toDecimal(nonServiceItemsTotalNumber);

            if (subscriptionContext.activeClientPlan?.balance) {
                planSnapshot = {
                    planName:
                        normalizeString(
                            subscriptionContext.availablePlan.name
                        ) || null,
                    planCreditsUsed:
                        subscriptionContext.activeClientPlan.balance
                            .creditsUsed,
                    planCreditsTotal:
                        subscriptionContext.activeClientPlan.balance
                            .creditsTotal,
                    planCreditStatusLabel:
                        subscriptionContext.activeClientPlan.balance
                            .creditsTotal > 0
                            ? `${subscriptionContext.activeClientPlan.balance.creditsUsed}/${subscriptionContext.activeClientPlan.balance.creditsTotal}`
                            : null,
                };
            }
        } else if (
            subscriptionContext?.action === 'RENEW' ||
            subscriptionContext?.action === 'JOIN'
        ) {
            const subscriptionPriceNumber = decimalToNumber(
                subscriptionContext.availablePlan.price
            );

            totalAmount = toDecimal(
                roundMoney(nonServiceItemsTotalNumber + subscriptionPriceNumber)
            );

            const subscriptionCreditsTotal = Math.max(
                0,
                Number(
                    subscriptionContext.availablePlan.planService
                        ?.creditsIncluded ?? 0
                )
            );

            planSnapshot = {
                planName:
                    normalizeString(subscriptionContext.availablePlan.name) ||
                    null,
                planCreditsUsed: 0,
                planCreditsTotal: subscriptionCreditsTotal,
                planCreditStatusLabel:
                    subscriptionCreditsTotal > 0
                        ? `0/${subscriptionCreditsTotal}`
                        : null,
            };
        } else if (isExistingPlanCreditCheckout) {
            const clientPlanId = normalizeString(
                order.appointment?.clientPlanId
            );
            const balanceId = normalizeString(
                order.appointment?.clientPlanServiceBalanceId
            );

            let totalNumber = nonServiceItemsTotalNumber;

            if (clientPlanId) {
                const clientPlan = await prisma.clientPlan.findFirst({
                    where: {
                        id: clientPlanId,
                        companyId,
                    },
                    select: {
                        id: true,
                        planNameSnapshot: true,
                        planPriceSnapshot: true,
                    },
                });

                const balance = balanceId
                    ? await prisma.clientPlanServiceBalance.findFirst({
                          where: {
                              id: balanceId,
                              companyId,
                              clientPlanId,
                          },
                          select: {
                              id: true,
                              creditsTotal: true,
                              creditsUsed: true,
                          },
                      })
                    : null;

                if (clientPlan) {
                    const alreadyCharged = await prisma.appointment.count({
                        where: {
                            companyId,
                            clientPlanId: clientPlan.id,
                            paymentMethod: { not: null },
                            checkedOutAt: { not: null },
                            planUsageType: AppointmentPlanUsageType.PLAN_CREDIT,
                            id: {
                                not: order.appointment?.id,
                            },
                        },
                    });

                    if (alreadyCharged === 0) {
                        totalNumber = roundMoney(
                            totalNumber +
                                decimalToNumber(clientPlan.planPriceSnapshot)
                        );
                    }

                    const creditsUsed = Math.max(
                        0,
                        Number(balance?.creditsUsed ?? 0)
                    );
                    const creditsTotal = Math.max(
                        0,
                        Number(balance?.creditsTotal ?? 0)
                    );

                    planSnapshot = {
                        planName:
                            normalizeString(clientPlan.planNameSnapshot) ||
                            null,
                        planCreditsUsed: creditsUsed,
                        planCreditsTotal: creditsTotal,
                        planCreditStatusLabel:
                            creditsTotal > 0
                                ? `${creditsUsed}/${creditsTotal}`
                                : null,
                    };
                }

                totalAmount = toDecimal(totalNumber);
            } else {
                totalAmount = toDecimal(nonServiceItemsTotalNumber);
            }
        } else {
            totalAmount = toDecimal(orderItemsTotalNumber);
        }

        const totalAmountNumber = decimalToNumber(totalAmount);

        const totalDiscountAmountNumber = roundMoney(
            recalculatedItems.reduce(
                (sum, item) => sum + item.discountAmount,
                0
            )
        );

        const checkoutIsFree = totalAmountNumber === 0;

        if (!checkoutIsFree && !paymentMethod) {
            return jsonErr(
                'Forma de pagamento é obrigatória. Use: CREDIT, DEBIT, PIX ou CASH.',
                400
            );
        }

        const effectivePaymentMethod: PaymentMethod = checkoutIsFree
            ? 'CASH'
            : paymentMethod!;

        requiresCardMachine =
            effectivePaymentMethod === 'CREDIT' ||
            effectivePaymentMethod === 'DEBIT';

        if (!checkoutIsFree && requiresCardMachine && !cardMachineId) {
            return jsonErr(
                'Máquina de cartão é obrigatória para pagamentos em crédito ou débito.',
                400
            );
        }

        if (
            !checkoutIsFree &&
            effectivePaymentMethod === 'CREDIT' &&
            (!cardInstallments || cardInstallments < 1)
        ) {
            return jsonErr('Número de parcelas inválido.', 400);
        }

        if (!requiresCardMachine && cardMachineId) {
            return jsonErr(
                'Máquina de cartão só deve ser informada para pagamentos em crédito ou débito.',
                400
            );
        }

        if (requiresCardMachine) {
            cardMachine = await prisma.cardMachine.findFirst({
                where: {
                    id: cardMachineId,
                    companyId,
                    unitId: order.unitId,
                    isActive: true,
                },
                select: {
                    id: true,
                    name: true,
                    debitFeePercent: true,
                    creditFees: {
                        select: {
                            installments: true,
                            feePercent: true,
                        },
                    },
                },
            });

            if (!cardMachine) {
                return jsonErr(
                    'Máquina de cartão inválida, inativa ou não pertence a esta unidade.',
                    404
                );
            }
        }

        const discountedItemsCount = recalculatedItems.filter(
            (item) => item.hasManualDiscount
        ).length;

        const serviceDiscountTotalAmountNumber = roundMoney(
            recalculatedItems
                .filter((item) => item.itemType === OrderItemType.SERVICE)
                .reduce((sum, item) => sum + item.discountAmount, 0)
        );

        const productDiscountTotalAmountNumber = roundMoney(
            recalculatedItems
                .filter((item) => item.itemType === OrderItemType.PRODUCT)
                .reduce((sum, item) => sum + item.discountAmount, 0)
        );

        let cardFeePercentNumber = 0;
        let cardMachineNameSnapshot: string | null = null;

        if (effectivePaymentMethod === 'CREDIT' && cardMachine) {
            const fee = (cardMachine.creditFees || []).find(
                (f) => f.installments === cardInstallments
            );

            if (!fee) {
                return jsonErr(
                    `Não existe taxa configurada para ${cardInstallments}x nesta máquina.`,
                    400
                );
            }

            cardFeePercentNumber = decimalToNumber(fee.feePercent);
            cardMachineNameSnapshot = cardMachine.name;
        } else if (effectivePaymentMethod === 'DEBIT' && cardMachine) {
            cardFeePercentNumber = decimalToNumber(cardMachine.debitFeePercent);
            cardMachineNameSnapshot = cardMachine.name;
        }

        const cardFeeAmountNumber = requiresCardMachine
            ? roundMoney(totalAmountNumber * (cardFeePercentNumber / 100))
            : 0;

        const netReceivedAmountNumber = roundMoney(
            totalAmountNumber - cardFeeAmountNumber
        );

        const cardFeePercent =
            requiresCardMachine && cardFeePercentNumber > 0
                ? toDecimal(cardFeePercentNumber)
                : requiresCardMachine
                  ? toDecimal(0)
                  : null;

        const cardFeeAmount = requiresCardMachine
            ? toDecimal(cardFeeAmountNumber)
            : new Prisma.Decimal(0);

        const netReceivedAmount = toDecimal(netReceivedAmountNumber);

        const result = await prisma.$transaction(async (tx) => {
            let subscriptionPlanLink: {
                clientPlanId: string;
                balanceId: string;
            } | null = null;

            for (const item of recalculatedItems) {
                await tx.orderItem.update({
                    where: { id: item.id },
                    data: {
                        originalUnitPrice: toDecimal(item.originalUnitPrice),
                        originalTotalPrice: toDecimal(item.originalTotalPrice),
                        hasManualDiscount: item.hasManualDiscount,
                        discountType: item.discountType,
                        discountPercent:
                            item.discountType === 'PERCENT' &&
                            item.discountPercent != null
                                ? toDecimal(item.discountPercent)
                                : null,
                        discountAmount: toDecimal(item.discountAmount),
                        finalUnitPrice: toDecimal(item.finalUnitPrice),
                        finalTotalPrice: toDecimal(item.finalTotalPrice),
                        discountReason: item.discountReason,
                        unitPrice: toDecimal(item.finalUnitPrice),
                        totalPrice: toDecimal(item.finalTotalPrice),
                        commissionBasePrice: toDecimal(
                            item.commissionBasePrice
                        ),
                        professionalCommissionAmount: toDecimal(
                            item.professionalCommissionAmount
                        ),
                    },
                });
            }

            if (
                subscriptionContext?.action === 'RENEW' ||
                subscriptionContext?.action === 'JOIN'
            ) {
                if (!order.clientId) {
                    throw new Error(
                        'Cliente obrigatório para aderir ou renovar assinatura.'
                    );
                }

                if (!subscriptionContext.availablePlan.planService) {
                    throw new Error(
                        'Serviço da assinatura não encontrado para este plano.'
                    );
                }

                const startsAt = now;
                const expiresAt = addDays(
                    startsAt,
                    Math.trunc(subscriptionContext.availablePlan.validityDays)
                );

                const createdClientPlan = await tx.clientPlan.create({
                    data: {
                        companyId,
                        clientId: order.clientId,
                        planId: subscriptionContext.availablePlan.id,
                        planNameSnapshot:
                            subscriptionContext.availablePlan.name,
                        planTypeSnapshot: 'SUBSCRIPTION' as any,
                        planPriceSnapshot:
                            subscriptionContext.availablePlan.price,
                        validityDaysSnapshot:
                            subscriptionContext.availablePlan.validityDays,
                        startsAt,
                        expiresAt,
                        isPaid: true,
                        status: 'ACTIVE',
                    },
                    select: {
                        id: true,
                    },
                });

                const createdBalance = await tx.clientPlanServiceBalance.create(
                    {
                        data: {
                            companyId,
                            clientPlanId: createdClientPlan.id,
                            serviceId:
                                subscriptionContext.availablePlan.planService
                                    .serviceId,
                            serviceNameSnapshot:
                                subscriptionContext.availablePlan.planService
                                    .serviceNameSnapshot,
                            servicePriceSnapshot:
                                subscriptionContext.availablePlan.planService
                                    .servicePriceSnapshot,
                            durationMinutesSnapshot:
                                subscriptionContext.availablePlan.planService
                                    .durationMinutesSnapshot,
                            professionalPercentageSnapshot:
                                subscriptionContext.availablePlan.planService
                                    .professionalPercentage,
                            sortOrder:
                                subscriptionContext.availablePlan.planService
                                    .sortOrder,
                            creditsTotal:
                                subscriptionContext.availablePlan.planService
                                    .creditsIncluded,
                            creditsUsed: 0,
                            creditsRemaining:
                                subscriptionContext.availablePlan.planService
                                    .creditsIncluded,
                        },
                        select: {
                            id: true,
                        },
                    }
                );

                subscriptionPlanLink = {
                    clientPlanId: createdClientPlan.id,
                    balanceId: createdBalance.id,
                };
            } else if (subscriptionContext?.action === 'USE_ACTIVE') {
                if (
                    !subscriptionContext.activeClientPlan?.id ||
                    !subscriptionContext.activeClientPlan.balance?.id
                ) {
                    throw new Error(
                        'Assinatura ativa não encontrada para este serviço.'
                    );
                }

                subscriptionPlanLink = {
                    clientPlanId: subscriptionContext.activeClientPlan.id,
                    balanceId: subscriptionContext.activeClientPlan.balance.id,
                };
            }

            const updatedOrder = await tx.order.update({
                where: { id: order.id },
                data: {
                    status: 'COMPLETED',
                    totalAmount,
                },
                select: {
                    id: true,
                    status: true,
                    totalAmount: true,
                },
            });

            const cancellationItems = await tx.orderItem.findMany({
                where: {
                    orderId: order.id,
                    companyId,
                    itemType: 'CANCELLATION_FEE',
                },
                select: {
                    cancellationCharge: {
                        select: {
                            id: true,
                        },
                    },
                },
            });

            const cancellationChargeIds = cancellationItems
                .map((item) => item.cancellationCharge?.id ?? null)
                .filter((id): id is string => Boolean(id));

            if (cancellationChargeIds.length > 0) {
                await tx.cancellationCharge.updateMany({
                    where: {
                        id: { in: cancellationChargeIds },
                        companyId,
                    },
                    data: {
                        status: 'PAID',
                        paidAt: now,
                    },
                });
            }

            let appointmentUpdated = false;

            if (order.appointmentId) {
                const appt = await tx.appointment.findFirst({
                    where: { id: order.appointmentId, companyId },
                    select: {
                        id: true,
                        status: true,
                        checkedOutAt: true,
                        planUsageType: true,
                        clientPlanId: true,
                        clientPlanServiceBalanceId: true,
                        planCreditDebitedAt: true,
                    },
                });

                if (appt) {
                    const shouldUseSubscriptionPlanCredit =
                        Boolean(subscriptionPlanLink?.clientPlanId) &&
                        Boolean(subscriptionPlanLink?.balanceId);

                    let nextPlanCreditDebitedAt: Date | null =
                        shouldUseSubscriptionPlanCredit
                            ? null
                            : (appt.planCreditDebitedAt ?? null);

                    const effectiveBalanceId = shouldUseSubscriptionPlanCredit
                        ? subscriptionPlanLink!.balanceId
                        : appt.clientPlanServiceBalanceId;

                    const effectivePlanUsageType =
                        shouldUseSubscriptionPlanCredit
                            ? AppointmentPlanUsageType.PLAN_CREDIT
                            : appt.planUsageType;

                    if (
                        effectivePlanUsageType ===
                            AppointmentPlanUsageType.PLAN_CREDIT &&
                        effectiveBalanceId
                    ) {
                        const balance =
                            await tx.clientPlanServiceBalance.findFirst({
                                where: {
                                    id: effectiveBalanceId,
                                    companyId,
                                },
                                select: {
                                    id: true,
                                    creditsUsed: true,
                                    creditsRemaining: true,
                                    creditsTotal: true,
                                },
                            });

                        if (!balance) {
                            throw new Error(
                                'Saldo de crédito do plano não encontrado para este agendamento.'
                            );
                        }

                        let nextCreditsUsed = balance.creditsUsed;
                        let nextCreditsRemaining = balance.creditsRemaining;

                        if (
                            shouldUseSubscriptionPlanCredit ||
                            !appt.planCreditDebitedAt
                        ) {
                            if (balance.creditsRemaining <= 0) {
                                throw new Error(
                                    'Este crédito do plano já foi totalmente utilizado.'
                                );
                            }

                            nextCreditsUsed = balance.creditsUsed + 1;
                            nextCreditsRemaining = balance.creditsRemaining - 1;

                            await tx.clientPlanServiceBalance.update({
                                where: {
                                    id: balance.id,
                                },
                                data: {
                                    creditsUsed: nextCreditsUsed,
                                    creditsRemaining: nextCreditsRemaining,
                                },
                            });

                            nextPlanCreditDebitedAt = now;
                        }

                        if (planSnapshot) {
                            planSnapshot = {
                                ...planSnapshot,
                                planCreditsUsed: nextCreditsUsed,
                                planCreditsTotal: balance.creditsTotal,
                                planCreditStatusLabel:
                                    balance.creditsTotal > 0
                                        ? `${nextCreditsUsed}/${balance.creditsTotal}`
                                        : null,
                            };
                        } else {
                            planSnapshot = {
                                planName:
                                    subscriptionContext?.availablePlan?.name ??
                                    null,
                                planCreditsUsed: nextCreditsUsed,
                                planCreditsTotal: balance.creditsTotal,
                                planCreditStatusLabel:
                                    balance.creditsTotal > 0
                                        ? `${nextCreditsUsed}/${balance.creditsTotal}`
                                        : null,
                            };
                        }
                    }

                    await tx.appointment.update({
                        where: { id: appt.id },
                        data: {
                            checkedOutAt: now,
                            checkedOutByUserId: userId,
                            planUsageType: subscriptionPlanLink?.clientPlanId
                                ? AppointmentPlanUsageType.PLAN_CREDIT
                                : appt.planUsageType,
                            clientPlanId:
                                subscriptionPlanLink?.clientPlanId ??
                                appt.clientPlanId,
                            clientPlanServiceBalanceId:
                                subscriptionPlanLink?.balanceId ??
                                appt.clientPlanServiceBalanceId,
                            planCreditDebitedAt: nextPlanCreditDebitedAt,
                            paymentMethod: effectivePaymentMethod,
                            cardMachineId: requiresCardMachine
                                ? cardMachine!.id
                                : null,
                            cardInstallments:
                                effectivePaymentMethod === 'CREDIT'
                                    ? cardInstallments
                                    : null,
                            cardMachineNameSnapshot: requiresCardMachine
                                ? cardMachineNameSnapshot
                                : null,
                            cardFeePercentSnapshot: requiresCardMachine
                                ? cardFeePercent
                                : null,
                            cardFeeAmount,
                            netReceivedAmount,
                            hasDiscount: totalDiscountAmountNumber > 0,
                            discountTotalAmount: toDecimal(
                                totalDiscountAmountNumber
                            ),
                            discountedItemsCount,
                            serviceDiscountTotalAmount: toDecimal(
                                serviceDiscountTotalAmountNumber
                            ),
                            productDiscountTotalAmount: toDecimal(
                                productDiscountTotalAmountNumber
                            ),
                            checkoutFinancialSnapshot: {
                                orderId: order.id,
                                unitId: order.unitId,
                                clientId: order.clientId,
                                professionalId: order.professionalId,
                                totalAmount: totalAmount.toString(),
                                paymentMethod: effectivePaymentMethod,
                                cardInstallments:
                                    effectivePaymentMethod === 'CREDIT'
                                        ? cardInstallments
                                        : null,
                                cardMachineId: requiresCardMachine
                                    ? cardMachine!.id
                                    : null,
                                cardMachineNameSnapshot: requiresCardMachine
                                    ? cardMachineNameSnapshot
                                    : null,
                                cardFeePercentSnapshot: requiresCardMachine
                                    ? (cardFeePercent?.toString() ?? '0')
                                    : null,
                                cardFeeAmount: cardFeeAmount.toString(),
                                netReceivedAmount: netReceivedAmount.toString(),
                                createdAt: order.createdAt.toISOString(),
                                checkedOutAt: now.toISOString(),
                                source: 'admin_checkout_complete',
                                subscriptionAction:
                                    subscriptionContext?.action ?? 'NONE',
                                subscriptionPlanId:
                                    subscriptionContext?.availablePlan?.id ??
                                    null,
                                discounts: {
                                    hasDiscount: totalDiscountAmountNumber > 0,
                                    discountTotalAmount:
                                        totalDiscountAmountNumber.toFixed(2),
                                    discountedItemsCount,
                                    serviceDiscountTotalAmount:
                                        serviceDiscountTotalAmountNumber.toFixed(
                                            2
                                        ),
                                    productDiscountTotalAmount:
                                        productDiscountTotalAmountNumber.toFixed(
                                            2
                                        ),
                                },
                                items: recalculatedItems.map((item) => ({
                                    orderItemId: item.id,
                                    itemType: item.itemType,
                                    productId: item.productId,
                                    serviceId: item.serviceId,
                                    planId: item.planId,
                                    professionalId: item.professionalId,
                                    descriptionSnapshot:
                                        item.descriptionSnapshot ?? null,
                                    quantity: item.quantity,
                                    originalUnitPrice:
                                        item.originalUnitPrice.toFixed(2),
                                    originalTotalPrice:
                                        item.originalTotalPrice.toFixed(2),
                                    hasManualDiscount: item.hasManualDiscount,
                                    discountType: item.discountType,
                                    discountPercent:
                                        item.discountPercent != null
                                            ? item.discountPercent.toFixed(2)
                                            : null,
                                    discountAmount:
                                        item.discountAmount.toFixed(2),
                                    finalUnitPrice:
                                        item.finalUnitPrice.toFixed(2),
                                    finalTotalPrice:
                                        item.finalTotalPrice.toFixed(2),
                                    discountReason: item.discountReason,
                                    commissionBasePrice:
                                        item.commissionBasePrice.toFixed(2),
                                    professionalCommissionAmount:
                                        item.professionalCommissionAmount.toFixed(
                                            2
                                        ),
                                })),
                                ...(planSnapshot
                                    ? {
                                          planName: planSnapshot.planName,
                                          planCreditsUsed:
                                              planSnapshot.planCreditsUsed,
                                          planCreditsTotal:
                                              planSnapshot.planCreditsTotal,
                                          planCreditStatusLabel:
                                              planSnapshot.planCreditStatusLabel,
                                      }
                                    : {}),
                            },
                        },
                        select: { id: true },
                    });

                    appointmentUpdated = true;
                }
            }

            return { updatedOrder, appointmentUpdated };
        });

        return jsonOk({
            orderId: result.updatedOrder.id,
            status: 'COMPLETED',
            totalAmount: result.updatedOrder.totalAmount.toString(),
            checkedOutAt: now.toISOString(),
            appointmentUpdated: result.appointmentUpdated,
        });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro interno.', 500);
    }
}
