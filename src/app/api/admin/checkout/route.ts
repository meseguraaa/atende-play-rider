// src/app/api/admin/checkout/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

function jsonErr(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function jsonOk(data: unknown, status = 200) {
    return NextResponse.json({ ok: true, data }, { status });
}

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
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

/* ---------------------------------------------------------
 * ✅ Decimal-safe helpers (evita NaN quando vem Prisma.Decimal)
 * ---------------------------------------------------------*/
function toNumberDecimal(v: unknown): number {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;

    if (typeof v === 'string') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : NaN;
    }

    if (typeof v === 'object') {
        const anyObj = v as any;

        if (typeof anyObj.toNumber === 'function') {
            const n = anyObj.toNumber();
            return Number.isFinite(n) ? n : NaN;
        }

        if (typeof anyObj.toString === 'function') {
            const n = Number(String(anyObj.toString()).replace(',', '.'));
            return Number.isFinite(n) ? n : NaN;
        }
    }

    return NaN;
}

function money(n: unknown): number {
    const v = toNumberDecimal(n);
    if (!Number.isFinite(v)) return 0;
    return Math.round((v + Number.EPSILON) * 100) / 100;
}

function formatBRL(value: unknown) {
    const v = money(value);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    }).format(v);
}

function formatPercent(value: unknown) {
    const v = money(value);
    return `${v.toFixed(2).replace('.', ',')}%`;
}

function formatDateTimeLabel(d: Date) {
    const date = d.toLocaleDateString('pt-BR');
    const time = d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
    });
    return `${date} às ${time}`;
}

function formatMonthLabel(dateInMonth: Date) {
    const monthName = dateInMonth.toLocaleDateString('pt-BR', {
        month: 'long',
    });
    const year = dateInMonth.getFullYear();
    const niceMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return `${niceMonth} de ${year}`;
}

function parseMonthQuery(monthRaw: string | null): {
    monthQuery: string;
    monthStart: Date;
    monthEnd: Date;
    monthLabel: string;
} {
    const now = new Date();

    const safe = normalizeString(monthRaw);
    const m = /^(\d{4})-(\d{2})$/.exec(safe);

    let year = now.getFullYear();
    let monthIndex = now.getMonth(); // 0-based

    if (m) {
        year = Number(m[1]);
        monthIndex = Number(m[2]) - 1;
        if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
            year = now.getFullYear();
            monthIndex = now.getMonth();
        }
    }

    const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);

    const monthQuery = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const monthLabel = formatMonthLabel(monthStart);

    return { monthQuery, monthStart, monthEnd, monthLabel };
}

type CheckoutOpenProductItemUI = {
    itemId: string;
    productId: string;
    name: string;
    qty: number;
    totalLabel: string;
    professionalId: string | null;
    professionalName: string | null;
};

type CheckoutOpenServiceItemUI = {
    itemId: string;
    serviceId: string;
    name: string;
    qty: number;
    totalLabel: string;
    professionalId: string | null;
    professionalName: string | null;
};

type CheckoutOpenServiceSubscriptionUI = {
    hasAvailableSubscription: boolean;
    availableSubscriptionPlanId: string | null;
    availableSubscriptionPlanName: string | null;
    availableSubscriptionPlanPrice: number | null;
    availableSubscriptionPlanPriceLabel: string | null;

    clientSubscriptionStatus: 'ACTIVE' | 'EXPIRED' | 'NEVER' | null;

    canUseActiveSubscription: boolean;
    canRenewSubscription: boolean;
    canJoinSubscription: boolean;

    activeClientPlanId: string | null;
    activeClientPlanServiceBalanceId: string | null;
    activeCreditsUsed: number | null;
    activeCreditsRemaining: number | null;
    activeCreditsTotal: number | null;

    expiredClientPlanId: string | null;
};

type CheckoutOpenCancellationFeeItemUI = {
    itemId: string;
    cancellationChargeId: string | null;
    sourceAppointmentId: string | null;
    description: string;
    feePercentageLabel: string | null;
    totalLabel: string;
};

type CheckoutOpenAccountUI = {
    clientId: string;
    clientLabel: string;
    unitId: string;
    unitName: string;
    latestLabel: string;
    totalLabel: string;
    totalServicesLabel: string;
    totalProductsLabel: string;
    totalCancellationFeesLabel: string;
    hasProducts: boolean;
    hasCancellationFees: boolean;
    serviceOrders: Array<{
        id: string;
        createdAtLabel: string;
        appointmentAtLabel?: string | null;
        professionalName: string;
        itemsLabel: string;

        // 🔥 NOVO
        items: CheckoutOpenServiceItemUI[];

        totalLabel: string;
        status: 'PENDING' | 'PENDING_CHECKIN' | 'COMPLETED' | 'CANCELED';

        usesPlanCredit: boolean;
        planName: string | null;
        planCreditStatusLabel: string | null;
        planCreditsUsed: number | null;
        planCreditsTotal: number | null;

        subscription: CheckoutOpenServiceSubscriptionUI;
    }>;
    productOrders: Array<{
        id: string;
        createdAtLabel: string;
        itemsLabel: string;
        items: CheckoutOpenProductItemUI[];
        totalLabel: string;
        status: 'PENDING' | 'PENDING_CHECKIN' | 'COMPLETED' | 'CANCELED';
    }>;
    cancellationFeeOrders: Array<{
        id: string;
        createdAtLabel: string;
        itemsLabel: string;
        items: CheckoutOpenCancellationFeeItemUI[];
        totalLabel: string;
        status: 'PENDING' | 'PENDING_CHECKIN' | 'COMPLETED' | 'CANCELED';
    }>;
};

type CheckoutMonthOrderItemUI = {
    id: string;
    name: string;
    qty: number;
    unitLabel: string;
    totalLabel: string;
    kind: 'service' | 'product' | 'cancellation_fee';

    hasDiscount?: boolean;
    discountType?: 'PERCENT' | 'AMOUNT' | null;
    discountPercentLabel?: string | null;
    discountAmountLabel?: string | null;
};

type CheckoutMonthOrderUI = {
    id: string;
    createdAtLabel: string;
    appointmentAtLabel?: string | null;
    professionalName: string;
    paymentMethod: string | null;
    cardMachineName: string | null;
    status: 'COMPLETED';
    totalLabel: string;
    servicesSubtotalLabel: string;
    productsSubtotalLabel: string;
    cancellationFeesSubtotalLabel: string;
    items: CheckoutMonthOrderItemUI[];

    // ✅ plano
    usesPlanCredit: boolean;
    planName: string | null;
    planCreditStatusLabel: string | null;
    planCreditsUsed: number | null;
    planCreditsTotal: number | null;
};

type CheckoutMonthGroupUI = {
    clientKey: string;
    clientLabel: string;
    latestLabel: string;
    totalLabel: string;
    servicesLabel: string;
    productsLabel: string;
    cancellationFeesLabel: string;
    orders: CheckoutMonthOrderUI[];
};

type CheckoutCardMachineUI = {
    id: string;
    unitId: string;
    unitName: string;
    name: string;
    debitFeePercent: number;
    debitFeePercentLabel: string;
    creditFees: Array<{
        installments: number;
        feePercent: number;
    }>;
};

type CheckoutPendingCancellationChargeItemUI = {
    id: string;
    appointmentId: string;
    appointmentLabel: string;
    serviceName: string;
    originalServicePriceLabel: string;
    cancelFeePercentageLabel: string;
    cancelFeeValueLabel: string;
    professionalName: string | null;
    professionalCommissionValueLabel: string;
    createdAtLabel: string;
};

type CheckoutPendingCancellationChargeGroupUI = {
    clientId: string;
    clientLabel: string;
    unitId: string;
    unitName: string;
    latestLabel: string;
    totalLabel: string;
    totalValue: number;
    charges: CheckoutPendingCancellationChargeItemUI[];
};

function buildClientServiceKey(clientId: string, serviceId: string) {
    return `${clientId}::${serviceId}`;
}

function getClientSubscriptionRuntimeStatus(args: {
    status: string;
    expiresAt: Date;
    creditsRemaining: number;
    now?: Date;
}) {
    const now = args.now ?? new Date();

    if (args.status !== 'ACTIVE') return 'INACTIVE' as const;
    if (args.expiresAt.getTime() < now.getTime()) return 'INACTIVE' as const;
    if (args.creditsRemaining <= 0) return 'INACTIVE' as const;

    return 'ACTIVE' as const;
}

function getPlanCreditMeta(
    appointment?: {
        planUsageType?: string | null;
        clientPlan?: { planNameSnapshot?: string | null } | null;
        clientPlanServiceBalance?: {
            creditsTotal?: number | null;
            creditsUsed?: number | null;
        } | null;
        checkoutFinancialSnapshot?: unknown;
    } | null
) {
    const usesPlanCredit = appointment?.planUsageType === 'PLAN_CREDIT';

    if (!usesPlanCredit) {
        return {
            usesPlanCredit: false,
            planName: null,
            planCreditStatusLabel: null,
            planCreditsUsed: null,
            planCreditsTotal: null,
        };
    }

    const snapshotMeta = getPlanCreditMetaFromSnapshot(
        appointment?.checkoutFinancialSnapshot
    );

    const livePlanName =
        normalizeString(appointment?.clientPlan?.planNameSnapshot) || null;

    const liveCreditsUsed = Number(
        appointment?.clientPlanServiceBalance?.creditsUsed ?? 0
    );
    const liveCreditsTotal = Number(
        appointment?.clientPlanServiceBalance?.creditsTotal ?? 0
    );

    const safeUsed =
        snapshotMeta.planCreditsUsed != null
            ? snapshotMeta.planCreditsUsed
            : Number.isFinite(liveCreditsUsed)
              ? liveCreditsUsed
              : 0;

    const safeTotal =
        snapshotMeta.planCreditsTotal != null
            ? snapshotMeta.planCreditsTotal
            : Number.isFinite(liveCreditsTotal)
              ? liveCreditsTotal
              : 0;

    return {
        usesPlanCredit: true,
        planName: snapshotMeta.planName || livePlanName,
        planCreditStatusLabel:
            snapshotMeta.planCreditStatusLabel ||
            (safeTotal > 0 ? `${safeUsed}/${safeTotal}` : null),
        planCreditsUsed: safeUsed,
        planCreditsTotal: safeTotal,
    };
}

function getPlanCreditMetaFromSnapshot(snapshot: unknown): {
    planName: string | null;
    planCreditsUsed: number | null;
    planCreditsTotal: number | null;
    planCreditStatusLabel: string | null;
} {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        return {
            planName: null,
            planCreditsUsed: null,
            planCreditsTotal: null,
            planCreditStatusLabel: null,
        };
    }

    const obj = snapshot as Record<string, unknown>;

    const planName = normalizeString(obj.planName) || null;

    const rawUsed =
        typeof obj.planCreditsUsed === 'number'
            ? obj.planCreditsUsed
            : Number(obj.planCreditsUsed);

    const rawTotal =
        typeof obj.planCreditsTotal === 'number'
            ? obj.planCreditsTotal
            : Number(obj.planCreditsTotal);

    const planCreditsUsed = Number.isFinite(rawUsed) ? rawUsed : null;
    const planCreditsTotal = Number.isFinite(rawTotal) ? rawTotal : null;

    const planCreditStatusLabel =
        normalizeString(obj.planCreditStatusLabel) || null;

    return {
        planName,
        planCreditsUsed,
        planCreditsTotal,
        planCreditStatusLabel,
    };
}

export async function GET(request: Request) {
    try {
        const session = await requireAdminForModule('CHECKOUT');

        const companyId = session.companyId;
        if (!companyId)
            return jsonErr('Empresa não encontrada na sessão.', 401);

        const url = new URL(request.url);

        const monthParamRaw = url.searchParams.get('month');
        const { monthQuery, monthStart, monthEnd, monthLabel } =
            parseMonthQuery(monthParamRaw);

        const rawActiveUnitId = normalizeString(session.unitId);
        const activeUnitId = await sanitizeUnitScope({
            companyId,
            activeUnitId: rawActiveUnitId || null,
        });

        const unitWhere = activeUnitId ? { unitId: activeUnitId } : {};

        // ==========================
        // 1.1) Máquinas de cartão disponíveis no escopo
        // ==========================
        const cardMachinesRaw = await prisma.cardMachine.findMany({
            where: {
                companyId,
                isActive: true,
                ...(activeUnitId ? { unitId: activeUnitId } : {}),
            },
            orderBy: [{ unitId: 'asc' }, { name: 'asc' }],
            select: {
                id: true,
                unitId: true,
                name: true,
                debitFeePercent: true,
                creditFees: {
                    select: {
                        installments: true,
                        feePercent: true,
                    },
                    orderBy: {
                        installments: 'asc',
                    },
                },
                unit: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        const cardMachines: CheckoutCardMachineUI[] = cardMachinesRaw.map(
            (m) => {
                const debitFeePercent = money(m.debitFeePercent);

                return {
                    id: m.id,
                    unitId: m.unitId,
                    unitName: normalizeString(m.unit?.name) || 'Unidade',
                    name: normalizeString(m.name) || 'Máquina',
                    debitFeePercent,
                    debitFeePercentLabel: formatPercent(debitFeePercent),
                    creditFees: (m.creditFees ?? []).map((item) => ({
                        installments: Number(item.installments),
                        feePercent: money(item.feePercent),
                    })),
                };
            }
        );

        // ==========================
        // 2) Busca OPEN ACCOUNTS (PENDING / PENDING_CHECKIN)
        // ==========================
        const openOrders = await prisma.order.findMany({
            where: {
                companyId,
                ...unitWhere,
                status: { in: ['PENDING', 'PENDING_CHECKIN'] },
            },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                unitId: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                totalAmount: true,

                unit: {
                    select: {
                        id: true,
                        name: true,
                    },
                },

                clientId: true,
                client: { select: { id: true, name: true } },

                professional: { select: { id: true, name: true } },

                appointment: {
                    select: {
                        id: true,
                        scheduleAt: true,
                        paymentMethod: true,
                        cardMachineNameSnapshot: true,
                        checkoutFinancialSnapshot: true,
                        planUsageType: true,
                        clientPlanId: true,
                        clientPlan: {
                            select: {
                                id: true,
                                planNameSnapshot: true,
                                planPriceSnapshot: true,
                            },
                        },
                        clientPlanServiceBalance: {
                            select: {
                                creditsTotal: true,
                                creditsUsed: true,
                            },
                        },
                    },
                },

                items: {
                    select: {
                        id: true,
                        itemType: true,
                        quantity: true,
                        unitPrice: true,
                        totalPrice: true,
                        serviceId: true,
                        productId: true,
                        descriptionSnapshot: true,
                        sourceAppointmentId: true,
                        feePercentageSnapshot: true,

                        professionalId: true,
                        professional: { select: { id: true, name: true } },

                        service: { select: { id: true, name: true } },
                        product: { select: { id: true, name: true } },
                        cancellationCharge: {
                            select: {
                                id: true,
                            },
                        },
                    },
                },
            },
        });

        const openServiceIds = Array.from(
            new Set(
                openOrders.flatMap((order) =>
                    (order.items ?? [])
                        .filter(
                            (item) =>
                                item.itemType === 'SERVICE' && item.serviceId
                        )
                        .map((item) => String(item.serviceId))
                )
            )
        );

        const openClientIds = Array.from(
            new Set(
                openOrders
                    .map((order) => normalizeString(order.clientId))
                    .filter(Boolean)
            )
        );

        const availableSubscriptionPlansRaw =
            openServiceIds.length > 0
                ? await prisma.plan.findMany({
                      where: {
                          companyId,
                          isActive: true,
                          type: 'SUBSCRIPTION',
                          services: {
                              some: {
                                  serviceId: { in: openServiceIds },
                              },
                          },
                      },
                      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                      select: {
                          id: true,
                          name: true,
                          price: true,
                          services: {
                              orderBy: [{ sortOrder: 'asc' }],
                              select: {
                                  serviceId: true,
                              },
                          },
                      },
                  })
                : [];

        const availableSubscriptionPlanByServiceId = new Map<
            string,
            {
                id: string;
                name: string;
                price: number;
            }
        >();

        for (const plan of availableSubscriptionPlansRaw) {
            const serviceId = normalizeString(plan.services?.[0]?.serviceId);
            if (!serviceId) continue;
            if (availableSubscriptionPlanByServiceId.has(serviceId)) continue;

            availableSubscriptionPlanByServiceId.set(serviceId, {
                id: plan.id,
                name: normalizeString(plan.name) || 'Assinatura',
                price: money(plan.price),
            });
        }

        const clientSubscriptionPlansRaw =
            openClientIds.length > 0 && openServiceIds.length > 0
                ? await prisma.clientPlan.findMany({
                      where: {
                          companyId,
                          clientId: { in: openClientIds },
                          planTypeSnapshot: 'SUBSCRIPTION',
                          balances: {
                              some: {
                                  serviceId: { in: openServiceIds },
                              },
                          },
                      },
                      orderBy: [{ createdAt: 'desc' }],
                      select: {
                          id: true,
                          clientId: true,
                          status: true,
                          expiresAt: true,
                          balances: {
                              select: {
                                  id: true,
                                  serviceId: true,
                                  creditsTotal: true,
                                  creditsUsed: true,
                                  creditsRemaining: true,
                              },
                          },
                      },
                  })
                : [];

        const clientSubscriptionPlansByClientService = new Map<
            string,
            Array<{
                clientPlanId: string;
                status: string;
                expiresAt: Date;
                balanceId: string;
                serviceId: string;
                creditsTotal: number;
                creditsUsed: number;
                creditsRemaining: number;
            }>
        >();

        for (const clientPlan of clientSubscriptionPlansRaw) {
            for (const balance of clientPlan.balances ?? []) {
                const serviceId = normalizeString(balance.serviceId);
                const clientId = normalizeString(clientPlan.clientId);
                const balanceId = normalizeString(balance.id);

                if (!clientId || !serviceId || !balanceId) continue;

                const key = buildClientServiceKey(clientId, serviceId);

                if (!clientSubscriptionPlansByClientService.has(key)) {
                    clientSubscriptionPlansByClientService.set(key, []);
                }

                clientSubscriptionPlansByClientService.get(key)!.push({
                    clientPlanId: clientPlan.id,
                    status: normalizeString(clientPlan.status),
                    expiresAt: clientPlan.expiresAt,
                    balanceId,
                    serviceId,
                    creditsTotal: Number(balance.creditsTotal ?? 0),
                    creditsUsed: Number(balance.creditsUsed ?? 0),
                    creditsRemaining: Number(balance.creditsRemaining ?? 0),
                });
            }
        }

        const openByClient = new Map<string, CheckoutOpenAccountUI>();

        for (const o of openOrders) {
            const clientKey = o.clientId ?? `unknown:${o.id}`;
            const clientLabel =
                normalizeString(o.client?.name) || 'Cliente não identificado';

            const latestDate = o.updatedAt ?? o.createdAt;
            const latestLabel = formatDateTimeLabel(latestDate);

            const serviceItems = (o.items ?? []).filter(
                (it) => it.itemType === 'SERVICE'
            );
            const productItems = (o.items ?? []).filter(
                (it) => it.itemType === 'PRODUCT'
            );
            const cancellationFeeItems = (o.items ?? []).filter(
                (it) => it.itemType === 'CANCELLATION_FEE'
            );

            const hasService = serviceItems.length > 0;
            const hasProduct = productItems.length > 0;
            const hasCancellationFees = cancellationFeeItems.length > 0;

            let servicesTotal = money(
                serviceItems.reduce((s, it) => s + money(it.totalPrice), 0)
            );

            if (
                hasService &&
                o.appointment?.planUsageType === 'PLAN_CREDIT' &&
                o.appointment?.clientPlanId
            ) {
                const alreadyCharged = await prisma.appointment.count({
                    where: {
                        companyId,
                        clientPlanId: o.appointment.clientPlanId,
                        paymentMethod: { not: null },
                        checkedOutAt: { not: null },
                        planUsageType: 'PLAN_CREDIT',
                        id: {
                            not: o.appointment.id,
                        },
                    },
                });

                if (alreadyCharged === 0) {
                    servicesTotal = money(
                        o.appointment.clientPlan?.planPriceSnapshot
                    );
                } else {
                    servicesTotal = 0;
                }
            }

            const productsTotal = money(
                productItems.reduce((s, it) => s + money(it.totalPrice), 0)
            );

            const cancellationFeesTotal = money(
                cancellationFeeItems.reduce(
                    (s, it) => s + money(it.totalPrice),
                    0
                )
            );

            const appointmentAtLabel = o.appointment?.scheduleAt
                ? formatDateTimeLabel(o.appointment.scheduleAt)
                : null;

            const professionalName =
                normalizeString(o.professional?.name) || '—';

            const serviceItemsLabel =
                serviceItems
                    .map((it) => {
                        const qty = it.quantity ?? 1;
                        const name = it.service?.name || 'Serviço';
                        return `${qty}x ${name}`;
                    })
                    .join(', ') || '—';

            const serviceItemsUI: CheckoutOpenServiceItemUI[] =
                serviceItems.map((it) => ({
                    itemId: it.id,
                    serviceId: String(it.serviceId ?? ''),
                    name: normalizeString(it.service?.name) || 'Serviço',
                    qty: typeof it.quantity === 'number' ? it.quantity : 1,
                    totalLabel: formatBRL(it.totalPrice),
                    professionalId: it.professionalId
                        ? String(it.professionalId)
                        : null,
                    professionalName: it.professional?.name
                        ? normalizeString(it.professional.name) || null
                        : null,
                }));

            const productItemsLabel =
                productItems
                    .map((it) => {
                        const qty = it.quantity ?? 1;
                        const name = it.product?.name || 'Produto';
                        return `${qty}x ${name}`;
                    })
                    .join(', ') || '—';

            const cancellationFeeItemsLabel =
                cancellationFeeItems
                    .map((it) => {
                        const desc =
                            normalizeString(it.descriptionSnapshot) ||
                            'Taxa de cancelamento';
                        return desc;
                    })
                    .join(', ') || '—';

            const productItemsUI: CheckoutOpenProductItemUI[] =
                productItems.map((it) => ({
                    itemId: it.id,
                    productId: String(it.productId ?? ''),
                    name: normalizeString(it.product?.name) || 'Produto',
                    qty: typeof it.quantity === 'number' ? it.quantity : 1,
                    totalLabel: formatBRL(it.totalPrice),
                    professionalId: it.professionalId
                        ? String(it.professionalId)
                        : null,
                    professionalName: it.professional?.name
                        ? normalizeString(it.professional.name) || null
                        : null,
                }));

            const cancellationFeeItemsUI: CheckoutOpenCancellationFeeItemUI[] =
                cancellationFeeItems.map((it) => ({
                    itemId: it.id,
                    cancellationChargeId: it.cancellationCharge?.id ?? null,
                    sourceAppointmentId: it.sourceAppointmentId ?? null,
                    description:
                        normalizeString(it.descriptionSnapshot) ||
                        'Taxa de cancelamento',
                    feePercentageLabel:
                        it.feePercentageSnapshot != null
                            ? formatPercent(it.feePercentageSnapshot)
                            : null,
                    totalLabel: formatBRL(it.totalPrice),
                }));

            const uniqueServiceIdsInOrder = Array.from(
                new Set(
                    serviceItems
                        .map((it) => normalizeString(it.serviceId))
                        .filter(Boolean)
                )
            );

            const subscriptionServiceId =
                uniqueServiceIdsInOrder.length === 1
                    ? uniqueServiceIdsInOrder[0]
                    : null;

            const availableSubscriptionPlan = subscriptionServiceId
                ? (availableSubscriptionPlanByServiceId.get(
                      subscriptionServiceId
                  ) ?? null)
                : null;

            const clientSubscriptionCandidates =
                subscriptionServiceId && o.clientId
                    ? (clientSubscriptionPlansByClientService.get(
                          buildClientServiceKey(
                              normalizeString(o.clientId),
                              subscriptionServiceId
                          )
                      ) ?? [])
                    : [];

            const activeSubscriptionCandidate =
                clientSubscriptionCandidates.find(
                    (item) =>
                        getClientSubscriptionRuntimeStatus({
                            status: item.status,
                            expiresAt: item.expiresAt,
                            creditsRemaining: item.creditsRemaining,
                            now: latestDate,
                        }) === 'ACTIVE'
                ) ?? null;

            const renewableSubscriptionCandidate =
                clientSubscriptionCandidates.find((item) => {
                    if (item.status !== 'ACTIVE') return false;

                    const isExpiredByDate =
                        item.expiresAt.getTime() < latestDate.getTime();

                    const isExhaustedByCredits = item.creditsRemaining <= 0;

                    return isExpiredByDate || isExhaustedByCredits;
                }) ?? null;

            const subscriptionMeta: CheckoutOpenServiceSubscriptionUI = {
                hasAvailableSubscription: Boolean(availableSubscriptionPlan),
                availableSubscriptionPlanId:
                    availableSubscriptionPlan?.id ?? null,
                availableSubscriptionPlanName:
                    availableSubscriptionPlan?.name ?? null,
                availableSubscriptionPlanPrice:
                    availableSubscriptionPlan?.price ?? null,
                availableSubscriptionPlanPriceLabel: availableSubscriptionPlan
                    ? formatBRL(availableSubscriptionPlan.price)
                    : null,

                clientSubscriptionStatus: activeSubscriptionCandidate
                    ? 'ACTIVE'
                    : renewableSubscriptionCandidate
                      ? 'EXPIRED'
                      : availableSubscriptionPlan
                        ? 'NEVER'
                        : null,

                canUseActiveSubscription: Boolean(activeSubscriptionCandidate),
                canRenewSubscription: Boolean(
                    !activeSubscriptionCandidate &&
                    renewableSubscriptionCandidate &&
                    availableSubscriptionPlan
                ),
                canJoinSubscription: Boolean(
                    !activeSubscriptionCandidate &&
                    !renewableSubscriptionCandidate &&
                    availableSubscriptionPlan
                ),

                activeClientPlanId:
                    activeSubscriptionCandidate?.clientPlanId ?? null,
                activeClientPlanServiceBalanceId:
                    activeSubscriptionCandidate?.balanceId ?? null,
                activeCreditsUsed:
                    activeSubscriptionCandidate?.creditsUsed ?? null,
                activeCreditsRemaining:
                    activeSubscriptionCandidate?.creditsRemaining ?? null,
                activeCreditsTotal:
                    activeSubscriptionCandidate?.creditsTotal ?? null,

                expiredClientPlanId:
                    renewableSubscriptionCandidate?.clientPlanId ?? null,
            };

            const snapshotPlanMeta = getPlanCreditMetaFromSnapshot(
                o.appointment?.checkoutFinancialSnapshot
            );

            const livePlanMeta = getPlanCreditMeta(o.appointment);

            const planMeta: {
                usesPlanCredit: boolean;
                planName: string | null;
                planCreditStatusLabel: string | null;
                planCreditsUsed: number | null;
                planCreditsTotal: number | null;
            } = snapshotPlanMeta.planCreditStatusLabel
                ? {
                      usesPlanCredit: true,
                      planName: snapshotPlanMeta.planName,
                      planCreditStatusLabel:
                          snapshotPlanMeta.planCreditStatusLabel,
                      planCreditsUsed: snapshotPlanMeta.planCreditsUsed,
                      planCreditsTotal: snapshotPlanMeta.planCreditsTotal,
                  }
                : livePlanMeta;

            const existing = openByClient.get(clientKey);

            if (!existing) {
                openByClient.set(clientKey, {
                    clientId: o.clientId ?? clientKey,
                    clientLabel,
                    unitId: o.unitId,
                    unitName: normalizeString(o.unit?.name) || 'Unidade',
                    latestLabel,
                    totalLabel: formatBRL(0),
                    totalServicesLabel: formatBRL(0),
                    totalProductsLabel: formatBRL(0),
                    totalCancellationFeesLabel: formatBRL(0),
                    hasProducts: false,
                    hasCancellationFees: false,
                    serviceOrders: [],
                    productOrders: [],
                    cancellationFeeOrders: [],
                });
            }

            const bucket = openByClient.get(clientKey)!;

            const prevTotal = money(
                Number(
                    String(bucket.totalLabel)
                        .replace(/[^\d,.-]/g, '')
                        .replace('.', '')
                        .replace(',', '.')
                )
            );
            const prevServices = money(
                Number(
                    String(bucket.totalServicesLabel)
                        .replace(/[^\d,.-]/g, '')
                        .replace('.', '')
                        .replace(',', '.')
                )
            );
            const prevProducts = money(
                Number(
                    String(bucket.totalProductsLabel)
                        .replace(/[^\d,.-]/g, '')
                        .replace('.', '')
                        .replace(',', '.')
                )
            );
            const prevCancellationFees = money(
                Number(
                    String(bucket.totalCancellationFeesLabel)
                        .replace(/[^\d,.-]/g, '')
                        .replace('.', '')
                        .replace(',', '.')
                )
            );

            bucket.totalLabel = formatBRL(
                prevTotal +
                    servicesTotal +
                    productsTotal +
                    cancellationFeesTotal
            );
            bucket.totalServicesLabel = formatBRL(prevServices + servicesTotal);
            bucket.totalProductsLabel = formatBRL(prevProducts + productsTotal);
            bucket.totalCancellationFeesLabel = formatBRL(
                prevCancellationFees + cancellationFeesTotal
            );
            bucket.hasProducts = bucket.hasProducts || hasProduct;
            bucket.hasCancellationFees =
                bucket.hasCancellationFees || hasCancellationFees;
            bucket.unitId = o.unitId;
            bucket.unitName = normalizeString(o.unit?.name) || bucket.unitName;

            if (!existing) bucket.latestLabel = latestLabel;

            if (hasService) {
                bucket.serviceOrders.push({
                    id: o.id,
                    createdAtLabel: formatDateTimeLabel(o.createdAt),
                    appointmentAtLabel,
                    professionalName,
                    itemsLabel: serviceItemsLabel,

                    // 🔥 NOVO
                    items: serviceItemsUI,

                    totalLabel: formatBRL(servicesTotal),
                    status: o.status as any,
                    usesPlanCredit: planMeta.usesPlanCredit,
                    planName: planMeta.planName,
                    planCreditStatusLabel: planMeta.planCreditStatusLabel,
                    planCreditsUsed: planMeta.planCreditsUsed,
                    planCreditsTotal: planMeta.planCreditsTotal,
                    subscription: subscriptionMeta,
                });
            }

            if (hasProduct) {
                bucket.productOrders.push({
                    id: o.id,
                    createdAtLabel: formatDateTimeLabel(o.createdAt),
                    itemsLabel: productItemsLabel,
                    items: productItemsUI,
                    totalLabel: formatBRL(productsTotal),
                    status: o.status as any,
                });
            }

            if (hasCancellationFees) {
                bucket.cancellationFeeOrders.push({
                    id: o.id,
                    createdAtLabel: formatDateTimeLabel(o.createdAt),
                    itemsLabel: cancellationFeeItemsLabel,
                    items: cancellationFeeItemsUI,
                    totalLabel: formatBRL(cancellationFeesTotal),
                    status: o.status as any,
                });
            }
        }

        const openAccounts = Array.from(openByClient.values());

        // ==========================
        // 2.1) Taxas de cancelamento pendentes
        //     ✅ aqui mostramos só as que ainda NÃO foram anexadas em pedido
        // ==========================
        const pendingCancellationChargesRaw =
            await prisma.cancellationCharge.findMany({
                where: {
                    companyId,
                    status: 'PENDING',
                    ...(activeUnitId ? { unitId: activeUnitId } : {}),
                    orderItem: {
                        is: null,
                    },
                },
                orderBy: [{ createdAt: 'desc' }],
                select: {
                    id: true,
                    unitId: true,
                    appointmentId: true,
                    createdAt: true,
                    cancelFeeValue: true,
                    cancelFeePercentageSnapshot: true,
                    originalServicePrice: true,
                    professionalCommissionValue: true,

                    client: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },

                    unit: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },

                    professional: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },

                    service: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },

                    appointment: {
                        select: {
                            id: true,
                            description: true,
                            scheduleAt: true,
                        },
                    },
                },
            });

        const pendingCancellationByClient = new Map<
            string,
            CheckoutPendingCancellationChargeGroupUI
        >();

        for (const charge of pendingCancellationChargesRaw) {
            const clientId =
                normalizeString(charge.client?.id) || `unknown:${charge.id}`;
            const clientLabel =
                normalizeString(charge.client?.name) ||
                'Cliente não identificado';

            const unitId = charge.unitId;
            const unitName = normalizeString(charge.unit?.name) || 'Unidade';

            const appointmentLabel = charge.appointment?.scheduleAt
                ? formatDateTimeLabel(charge.appointment.scheduleAt)
                : 'Agendamento';

            const serviceName =
                normalizeString(charge.service?.name) ||
                normalizeString(charge.appointment?.description) ||
                'Atendimento';

            const item: CheckoutPendingCancellationChargeItemUI = {
                id: charge.id,
                appointmentId: charge.appointmentId,
                appointmentLabel,
                serviceName,
                originalServicePriceLabel: formatBRL(
                    charge.originalServicePrice
                ),
                cancelFeePercentageLabel: formatPercent(
                    charge.cancelFeePercentageSnapshot
                ),
                cancelFeeValueLabel: formatBRL(charge.cancelFeeValue),
                professionalName:
                    normalizeString(charge.professional?.name) || null,
                professionalCommissionValueLabel: formatBRL(
                    charge.professionalCommissionValue
                ),
                createdAtLabel: formatDateTimeLabel(charge.createdAt),
            };

            const existing = pendingCancellationByClient.get(clientId);

            if (!existing) {
                pendingCancellationByClient.set(clientId, {
                    clientId,
                    clientLabel,
                    unitId,
                    unitName,
                    latestLabel: formatDateTimeLabel(charge.createdAt),
                    totalLabel: formatBRL(charge.cancelFeeValue),
                    totalValue: money(charge.cancelFeeValue),
                    charges: [item],
                });
                continue;
            }

            existing.totalValue = money(
                existing.totalValue + money(charge.cancelFeeValue)
            );
            existing.totalLabel = formatBRL(existing.totalValue);
            existing.charges.push(item);
        }

        const cancellationChargeIdsAlreadyInOpenOrders = new Set(
            openOrders.flatMap((order) =>
                (order.items ?? [])
                    .filter(
                        (item) =>
                            item.itemType === 'CANCELLATION_FEE' &&
                            item.cancellationCharge?.id
                    )
                    .map((item) => String(item.cancellationCharge!.id))
            )
        );

        const pendingCancellationCharges = Array.from(
            pendingCancellationByClient.values()
        )
            .map((group) => {
                const filteredCharges = group.charges.filter(
                    (charge) =>
                        !cancellationChargeIdsAlreadyInOpenOrders.has(charge.id)
                );

                const filteredTotalValue = money(
                    filteredCharges.reduce(
                        (sum, charge) =>
                            sum +
                            money(
                                String(charge.cancelFeeValueLabel)
                                    .replace(/[^\d,.-]/g, '')
                                    .replace('.', '')
                                    .replace(',', '.')
                            ),
                        0
                    )
                );

                return {
                    ...group,
                    charges: filteredCharges,
                    totalValue: filteredTotalValue,
                    totalLabel: formatBRL(filteredTotalValue),
                };
            })
            .filter((group) => group.charges.length > 0);

        // ==========================
        // 3) Busca pedidos do mês (COMPLETED)
        // ==========================
        const completedOrders = await prisma.order.findMany({
            where: {
                companyId,
                ...unitWhere,
                status: 'COMPLETED',
                createdAt: {
                    gte: monthStart,
                    lt: monthEnd,
                },
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                totalAmount: true,

                clientId: true,
                client: { select: { id: true, name: true } },

                professional: { select: { id: true, name: true } },

                appointment: {
                    select: {
                        id: true,
                        scheduleAt: true,
                        paymentMethod: true,
                        cardMachineNameSnapshot: true,
                        checkoutFinancialSnapshot: true,
                        planUsageType: true,
                        clientPlanId: true,
                        clientPlan: {
                            select: {
                                id: true,
                                planNameSnapshot: true,
                                planPriceSnapshot: true,
                            },
                        },
                        clientPlanServiceBalance: {
                            select: {
                                creditsTotal: true,
                                creditsUsed: true,
                            },
                        },
                    },
                },

                items: {
                    select: {
                        id: true,
                        itemType: true,
                        quantity: true,
                        unitPrice: true,
                        totalPrice: true,
                        serviceId: true,
                        productId: true,
                        descriptionSnapshot: true,

                        hasManualDiscount: true,
                        discountType: true,
                        discountPercent: true,
                        discountAmount: true,

                        service: { select: { id: true, name: true } },
                        product: { select: { id: true, name: true } },
                    },
                },
            },
        });

        const monthByClient = new Map<string, CheckoutMonthGroupUI>();

        for (const o of completedOrders) {
            const clientKey = o.clientId ?? `unknown:${o.id}`;
            const clientLabel =
                normalizeString(o.client?.name) || 'Cliente não identificado';

            const serviceItems = (o.items ?? []).filter(
                (it) => it.itemType === 'SERVICE'
            );
            const productItems = (o.items ?? []).filter(
                (it) => it.itemType === 'PRODUCT'
            );
            const cancellationFeeItems = (o.items ?? []).filter(
                (it) => it.itemType === 'CANCELLATION_FEE'
            );

            let servicesSubtotal = money(
                serviceItems.reduce((s, it) => s + money(it.totalPrice), 0)
            );

            if (o.appointment?.planUsageType === 'PLAN_CREDIT') {
                servicesSubtotal = money(
                    serviceItems.length > 0 ? o.totalAmount : 0
                );
            }

            const productsSubtotal = money(
                productItems.reduce((s, it) => s + money(it.totalPrice), 0)
            );

            const cancellationFeesSubtotal = money(
                cancellationFeeItems.reduce(
                    (s, it) => s + money(it.totalPrice),
                    0
                )
            );

            const items: CheckoutMonthOrderItemUI[] = (o.items ?? []).map(
                (it) => {
                    const qty = it.quantity ?? 1;

                    let kind: 'service' | 'product' | 'cancellation_fee' =
                        'product';
                    let name = 'Item';

                    if (it.itemType === 'SERVICE') {
                        kind = 'service';
                        name = it.service?.name || 'Serviço';
                    } else if (it.itemType === 'PRODUCT') {
                        kind = 'product';
                        name = it.product?.name || 'Produto';
                    } else if (it.itemType === 'CANCELLATION_FEE') {
                        kind = 'cancellation_fee';
                        name =
                            normalizeString(it.descriptionSnapshot) ||
                            'Taxa de cancelamento';
                    }

                    const hasDiscount =
                        Boolean(it.hasManualDiscount) ||
                        money(it.discountAmount) > 0 ||
                        money(it.discountPercent) > 0;

                    return {
                        id: it.id,
                        name,
                        qty,
                        unitLabel: formatBRL(it.unitPrice),
                        totalLabel: formatBRL(it.totalPrice),
                        kind,

                        hasDiscount,
                        discountType: it.discountType ?? null,
                        discountPercentLabel:
                            it.discountType === 'PERCENT' &&
                            money(it.discountPercent) > 0
                                ? formatPercent(it.discountPercent)
                                : null,
                        discountAmountLabel:
                            hasDiscount && money(it.discountAmount) > 0
                                ? formatBRL(it.discountAmount)
                                : null,
                    };
                }
            );

            const snapshotPlanMeta = getPlanCreditMetaFromSnapshot(
                o.appointment?.checkoutFinancialSnapshot
            );

            const livePlanMeta = getPlanCreditMeta(o.appointment);

            const planMeta: {
                usesPlanCredit: boolean;
                planName: string | null;
                planCreditStatusLabel: string | null;
                planCreditsUsed: number | null;
                planCreditsTotal: number | null;
            } = snapshotPlanMeta.planCreditStatusLabel
                ? {
                      usesPlanCredit: true,
                      planName: snapshotPlanMeta.planName,
                      planCreditStatusLabel:
                          snapshotPlanMeta.planCreditStatusLabel,
                      planCreditsUsed: snapshotPlanMeta.planCreditsUsed,
                      planCreditsTotal: snapshotPlanMeta.planCreditsTotal,
                  }
                : livePlanMeta;

            const orderUI: CheckoutMonthOrderUI = {
                id: o.id,
                createdAtLabel: formatDateTimeLabel(o.createdAt),
                appointmentAtLabel: o.appointment?.scheduleAt
                    ? formatDateTimeLabel(o.appointment.scheduleAt)
                    : null,
                professionalName: normalizeString(o.professional?.name) || '—',

                paymentMethod: o.appointment?.paymentMethod ?? null,
                cardMachineName: o.appointment?.cardMachineNameSnapshot ?? null,

                status: 'COMPLETED',
                totalLabel: formatBRL(o.totalAmount),
                servicesSubtotalLabel: formatBRL(servicesSubtotal),
                productsSubtotalLabel: formatBRL(productsSubtotal),
                cancellationFeesSubtotalLabel: formatBRL(
                    cancellationFeesSubtotal
                ),
                items,

                usesPlanCredit: planMeta.usesPlanCredit,
                planName: planMeta.planName,
                planCreditStatusLabel: planMeta.planCreditStatusLabel,
                planCreditsUsed: planMeta.planCreditsUsed,
                planCreditsTotal: planMeta.planCreditsTotal,
            };

            const existing = monthByClient.get(clientKey);

            if (!existing) {
                monthByClient.set(clientKey, {
                    clientKey,
                    clientLabel,
                    latestLabel: formatDateTimeLabel(o.createdAt),
                    totalLabel: formatBRL(o.totalAmount),
                    servicesLabel: formatBRL(servicesSubtotal),
                    productsLabel: formatBRL(productsSubtotal),
                    cancellationFeesLabel: formatBRL(cancellationFeesSubtotal),
                    orders: [orderUI],
                });
                continue;
            }

            const prevTotal = money(
                Number(
                    String(existing.totalLabel)
                        .replace(/[^\d,.-]/g, '')
                        .replace('.', '')
                        .replace(',', '.')
                )
            );
            const prevServices = money(
                Number(
                    String(existing.servicesLabel)
                        .replace(/[^\d,.-]/g, '')
                        .replace('.', '')
                        .replace(',', '.')
                )
            );
            const prevProducts = money(
                Number(
                    String(existing.productsLabel)
                        .replace(/[^\d,.-]/g, '')
                        .replace('.', '')
                        .replace(',', '.')
                )
            );
            const prevCancellationFees = money(
                Number(
                    String(existing.cancellationFeesLabel)
                        .replace(/[^\d,.-]/g, '')
                        .replace('.', '')
                        .replace(',', '.')
                )
            );

            existing.totalLabel = formatBRL(prevTotal + money(o.totalAmount));
            existing.servicesLabel = formatBRL(prevServices + servicesSubtotal);
            existing.productsLabel = formatBRL(prevProducts + productsSubtotal);
            existing.cancellationFeesLabel = formatBRL(
                prevCancellationFees + cancellationFeesSubtotal
            );

            existing.orders.push(orderUI);
        }

        const monthGroups = Array.from(monthByClient.values());

        return jsonOk({
            monthQuery,
            monthLabel,
            activeUnitId,

            cardMachines,
            cardMachinesCount: cardMachines.length,

            openAccounts,
            openAccountsCount: openAccounts.length,

            pendingCancellationCharges,
            pendingCancellationChargesCount: pendingCancellationCharges.length,

            monthGroups,
            monthOrdersCount: completedOrders.length,
        });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro interno.', 500);
    }
}
