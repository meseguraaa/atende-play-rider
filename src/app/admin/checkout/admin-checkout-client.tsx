// src/app/admin/checkout/admin-checkout-client.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { MonthPicker } from '@/components/month-picker';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PaymentMethod } from '@prisma/client';

type OrderStatus = 'PENDING' | 'PENDING_CHECKIN' | 'COMPLETED' | 'CANCELED';
type CheckoutTab = 'OPEN_ORDERS' | 'CANCELLATION_FEES';

export type CardMachineUI = {
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

export type ServiceOrderItemUI = {
    itemId: string;
    serviceId: string;
    name: string;
    qty: number;
    totalLabel: string;
    professionalId?: string | null;
    professionalName?: string | null;
};

export type ServiceOrderSubscriptionUI = {
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

export type ServiceOrderUI = {
    id: string;
    createdAtLabel: string;
    appointmentAtLabel?: string | null;
    professionalName: string;
    itemsLabel: string;
    items?: ServiceOrderItemUI[];
    totalLabel: string;
    status: OrderStatus;

    usesPlanCredit?: boolean;
    planName?: string | null;
    planCreditStatusLabel?: string | null;
    planCreditsUsed?: number | null;
    planCreditsTotal?: number | null;

    subscription?: ServiceOrderSubscriptionUI;
};

export type ProductOrderItemUI = {
    itemId: string;
    productId: string;
    name: string;
    qty: number;
    totalLabel: string;

    // ✅ novo (best-effort, pode vir ou não do backend)
    professionalId?: string | null;
    professionalName?: string | null;
};

export type CancellationFeeOrderItemUI = {
    itemId: string;
    cancellationChargeId: string | null;
    sourceAppointmentId: string | null;
    description: string;
    feePercentageLabel: string | null;
    totalLabel: string;
};

export type ProductOrderUI = {
    id: string;
    createdAtLabel: string;

    // compat (ainda pode vir)
    itemsLabel: string;

    // ✅ novo: itens de produto com itemId (para cancelar 1 por 1)
    items?: ProductOrderItemUI[];

    // subtotal apenas de produtos deste pedido
    totalLabel: string;

    status: OrderStatus;
};

export type CancellationFeeOrderUI = {
    id: string;
    createdAtLabel: string;
    itemsLabel: string;
    items?: CancellationFeeOrderItemUI[];
    totalLabel: string;
    status: OrderStatus;
};

export type OpenAccountUI = {
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
    serviceOrders: ServiceOrderUI[];
    productOrders: ProductOrderUI[];
    cancellationFeeOrders: CancellationFeeOrderUI[];
};

export type PendingCancellationChargeItemUI = {
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

export type PendingCancellationChargeGroupUI = {
    clientId: string;
    clientLabel: string;
    unitId: string;
    unitName: string;
    latestLabel: string;
    totalLabel: string;
    totalValue: number;
    charges: PendingCancellationChargeItemUI[];
};

export type MonthOrderItemUI = {
    id: string;
    name: string;
    qty: number;
    unitLabel: string;
    totalLabel: string;
    kind: 'service' | 'product' | 'cancellation_fee';

    // 🔥 NOVO — desconto
    hasDiscount?: boolean;

    discountType?: 'PERCENT' | 'AMOUNT' | null;

    // labels prontas (mais fácil pro front)
    discountPercentLabel?: string | null;
    discountAmountLabel?: string | null;
};

export type MonthGroupUI = {
    clientKey: string;
    clientLabel: string;
    latestLabel: string;
    totalLabel: string;
    servicesLabel: string;
    productsLabel: string;
    cancellationFeesLabel: string;
    orders: MonthOrderUI[];
};

export type MonthOrderUI = {
    id: string;
    createdAtLabel: string;
    appointmentAtLabel?: string | null;
    professionalName: string;

    paymentMethod?: PaymentMethod | null;
    cardMachineName?: string | null;

    status: 'COMPLETED';
    totalLabel: string;
    servicesSubtotalLabel: string;
    productsSubtotalLabel: string;
    cancellationFeesSubtotalLabel: string;
    items: MonthOrderItemUI[];

    usesPlanCredit?: boolean;
    planName?: string | null;
    planCreditStatusLabel?: string | null;
    planCreditsUsed?: number | null;
    planCreditsTotal?: number | null;
};

type CompleteCheckoutResponse =
    | {
          ok: true;
          data: {
              orderId: string;
              status: 'COMPLETED';
              totalAmount: string;
              checkedOutAt: string;
              appointmentUpdated: boolean;
          };
      }
    | { ok: false; error: string };

type CancelOrderResponse =
    | {
          ok: true;
          data: {
              orderId: string;
              status: 'CANCELED';
              canceledAt: string;
              inventoryRevertedAt: string | null;
          };
      }
    | { ok: false; error: string };

type CancelAccountResponse =
    | {
          ok: true;
          data: {
              clientId: string;
              canceledCount: number;
              canceledOrderIds: string[];
              alreadyCanceledCount: number;
              skippedCount: number;
              canceledAt: string;
          };
      }
    | { ok: false; error: string };

type ProductsListResponse =
    | {
          ok: true;
          data: {
              products: Array<{
                  id: string;
                  name: string;
                  priceLabel: string;
                  stockQuantity: number;
                  unitId: string;
              }>;
          };
      }
    | { ok: false; error: string };

type ProfessionalsListResponse =
    | {
          ok: true;
          data: {
              professionals: Array<{
                  id: string;
                  name: string;
                  isActive: boolean;
                  unitId: string | null;
              }>;
              count: number;
              unitScope: 'filtered' | 'all';
          };
      }
    | { ok: false; error: string };

type AddProductResponse =
    | {
          ok: true;
          data: {
              clientId: string;
              orderId: string;
              orderStatus: 'PENDING' | 'PENDING_CHECKIN';
              itemId: string;
              productId: string;
              quantity: number;
              unitId: string;
              unitPrice: string;
              totalPrice: string;
              orderTotalAmount: string;
              orderWasCreated: boolean;
          };
      }
    | { ok: false; error: string };

type RemoveProductItemResponse =
    | {
          ok: true;
          data: {
              orderId: string;
              orderStatus: 'PENDING' | 'PENDING_CHECKIN' | 'CANCELED';
              removedItemId: string;
              removedQuantity: number;
              inventoryRevertedAt: string | null;
              orderTotalAmount: string; // decimal string
              remainingProductItemsCount: number;
              orderWasCanceled: boolean;
          };
      }
    | { ok: false; error: string };

type AssignProductItemProfessionalResponse =
    | {
          ok: true;
          data: {
              orderId: string;
              orderStatus: 'PENDING' | 'PENDING_CHECKIN';
              itemId: string;
              professionalId: string;
          };
      }
    | { ok: false; error: string };

type AdminCheckoutClientProps = {
    canSeeAllUnits: boolean;

    // top labels
    monthLabel: string;

    // data
    openAccounts: OpenAccountUI[];
    pendingCancellationCharges: Array<{
        clientId: string;
        clientLabel: string;
        unitId: string;
        unitName: string;
        latestLabel: string;
        totalLabel: string;
        totalValue: number;
        charges: Array<{
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
        }>;
    }>;
    monthGroups: MonthGroupUI[];
    cardMachines: CardMachineUI[];
};

/**
 * ✅ Badge padronizado (mesmo padrão do Finance):
 * - rounded-md
 * - border px-2 py-0.5 text-xs
 * - tonalidade via classes
 */
function StatusBadge({ status }: { status: OrderStatus }) {
    const map: Record<OrderStatus, { label: string; toneClass: string }> = {
        PENDING: {
            label: 'Pendente',
            toneClass: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
        },
        PENDING_CHECKIN: {
            label: 'Aguard. check-in',
            toneClass: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
        },
        COMPLETED: {
            label: 'Pago',
            toneClass: 'bg-green-500/15 text-green-600 border-green-500/30',
        },
        CANCELED: {
            label: 'Cancelado',
            toneClass: 'bg-red-500/15 text-red-600 border-red-500/30',
        },
    };

    const cfg = map[status];

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-xs',
                cfg.toneClass
            )}
        >
            {cfg.label}
        </span>
    );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
    return (
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
            <p className="text-paragraph-small text-content-secondary text-center">
                {title}
            </p>
            {hint ? (
                <p className="mt-2 text-paragraph-small text-content-tertiary text-center">
                    {hint}
                </p>
            ) : null}
        </div>
    );
}

function OrdersSection({
    monthLabel,
    totalCountLabel,
    groups,
}: {
    monthLabel: string;
    totalCountLabel: string;
    groups: MonthGroupUI[];
}) {
    return (
        <section className="space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-subtitle text-content-primary">
                        Pedidos do mês
                    </h2>
                    <p className="text-paragraph-small text-content-secondary">
                        Lista de todos os pedidos de serviços e produtos
                        registrados neste mês.
                        <br />
                        Mês selecionado:{' '}
                        <span className="font-medium">{monthLabel}</span>
                    </p>

                    <p className="text-paragraph-small text-content-secondary mt-1">
                        Total:{' '}
                        <span className="font-medium">{totalCountLabel}</span>
                    </p>
                </div>
            </div>

            {groups.length === 0 ? (
                <EmptyState title="Nenhum pedido registrado neste mês ainda." />
            ) : (
                <>
                    <div className="space-y-3">
                        {groups.map((g) => (
                            <div
                                key={g.clientKey}
                                className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-paragraph-small text-content-primary truncate">
                                            Cliente:{' '}
                                            <span className="font-medium">
                                                {g.clientLabel}
                                            </span>
                                        </p>
                                        <p className="text-paragraph-small text-content-secondary">
                                            Última movimentação em{' '}
                                            {g.latestLabel}
                                        </p>

                                        <p className="text-paragraph-small text-content-secondary mt-1">
                                            <span>
                                                Serviços:{' '}
                                                <span className="font-medium">
                                                    {g.servicesLabel}
                                                </span>
                                            </span>

                                            <span className="mx-2">•</span>

                                            <span>
                                                Produtos:{' '}
                                                <span className="font-medium">
                                                    {g.productsLabel}
                                                </span>
                                            </span>

                                            <span className="mx-2">•</span>

                                            <span>
                                                Taxas cancelamento:{' '}
                                                <span className="font-medium">
                                                    {g.cancellationFeesLabel ??
                                                        'R$ 0,00'}
                                                </span>
                                            </span>
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between gap-2 md:justify-end md:gap-3">
                                        <span className="text-paragraph-small font-semibold text-content-primary">
                                            Total no mês: {g.totalLabel}
                                        </span>

                                        <StatusBadge status="COMPLETED" />
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-border-primary space-y-2">
                                    <p className="text-label-small text-content-secondary">
                                        Pedidos ({g.orders.length})
                                    </p>

                                    <div className="space-y-2">
                                        {g.orders.map((order) => {
                                            const serviceItems =
                                                order.items.filter(
                                                    (i) => i.kind === 'service'
                                                );

                                            const productItems =
                                                order.items.filter(
                                                    (i) => i.kind === 'product'
                                                );

                                            const cancellationFeeItems =
                                                order.items.filter(
                                                    (i) =>
                                                        i.kind ===
                                                        'cancellation_fee'
                                                );

                                            return (
                                                <details
                                                    key={order.id}
                                                    className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2"
                                                >
                                                    <summary className="cursor-pointer list-none">
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="text-paragraph-small text-content-primary truncate">
                                                                    Pedido #
                                                                    {order.id.slice(
                                                                        0,
                                                                        8
                                                                    )}
                                                                </p>
                                                                <p className="text-paragraph-small text-content-secondary">
                                                                    Criado em{' '}
                                                                    {
                                                                        order.createdAtLabel
                                                                    }
                                                                </p>
                                                                {order.appointmentAtLabel ? (
                                                                    <p className="text-paragraph-small text-content-secondary">
                                                                        Atendimento
                                                                        em{' '}
                                                                        {
                                                                            order.appointmentAtLabel
                                                                        }
                                                                    </p>
                                                                ) : null}
                                                                <p className="text-paragraph-small text-content-secondary">
                                                                    Profissional:{' '}
                                                                    {
                                                                        order.professionalName
                                                                    }
                                                                </p>

                                                                {order.usesPlanCredit ? (
                                                                    <div className="mt-1 space-y-1">
                                                                        <p className="text-paragraph-small text-content-secondary">
                                                                            Plano:{' '}
                                                                            <span className="font-medium text-content-primary">
                                                                                {order.planName ??
                                                                                    'Plano'}
                                                                            </span>
                                                                        </p>
                                                                        <p className="text-paragraph-small text-content-secondary">
                                                                            Créditos:{' '}
                                                                            <span className="font-medium text-content-primary">
                                                                                {order.planCreditStatusLabel ??
                                                                                    '—'}
                                                                            </span>
                                                                        </p>
                                                                    </div>
                                                                ) : null}

                                                                {order.paymentMethod ? (
                                                                    <p className="text-paragraph-small text-content-secondary">
                                                                        Pago
                                                                        com:{' '}
                                                                        <span className="font-medium text-content-primary">
                                                                            {order.paymentMethod ===
                                                                            'PIX'
                                                                                ? 'Pix'
                                                                                : order.paymentMethod ===
                                                                                    'CASH'
                                                                                  ? 'Dinheiro'
                                                                                  : order.paymentMethod ===
                                                                                      'CREDIT'
                                                                                    ? 'Crédito'
                                                                                    : 'Débito'}
                                                                        </span>
                                                                        {order.cardMachineName ? (
                                                                            <>
                                                                                {
                                                                                    ' • '
                                                                                }
                                                                                <span className="text-content-secondary">
                                                                                    {
                                                                                        order.cardMachineName
                                                                                    }
                                                                                </span>
                                                                            </>
                                                                        ) : null}
                                                                    </p>
                                                                ) : null}
                                                            </div>

                                                            <div className="flex flex-col gap-1 md:items-end">
                                                                <div className="flex items-center justify-between gap-2 md:block">
                                                                    <span className="text-paragraph-small font-semibold text-content-primary">
                                                                        {
                                                                            order.totalLabel
                                                                        }{' '}
                                                                    </span>

                                                                    {/* ✅ badge à direita só no mobile */}
                                                                    <span className="md:hidden">
                                                                        <StatusBadge status="COMPLETED" />
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </summary>

                                                    <div className="mt-3 space-y-3">
                                                        {serviceItems.length >
                                                        0 ? (
                                                            <div className="space-y-2">
                                                                <p className="text-label-small text-content-secondary">
                                                                    Serviços
                                                                </p>

                                                                <div className="overflow-x-auto rounded-lg border border-border-primary">
                                                                    <table className="min-w-full text-sm">
                                                                        <thead>
                                                                            <tr className="border-b border-border-primary bg-muted/40 text-left text-label-small text-content-secondary">
                                                                                <th className="px-3 py-2">
                                                                                    Item
                                                                                </th>
                                                                                <th className="px-3 py-2 text-center">
                                                                                    Qtd
                                                                                </th>
                                                                                <th className="px-3 py-2 text-right">
                                                                                    Unit.
                                                                                </th>
                                                                                <th className="px-3 py-2 text-right">
                                                                                    Total
                                                                                </th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {serviceItems.map(
                                                                                (
                                                                                    it
                                                                                ) => (
                                                                                    <React.Fragment
                                                                                        key={
                                                                                            it.id
                                                                                        }
                                                                                    >
                                                                                        <tr className="border-t border-border-primary text-paragraph-small text-content-primary">
                                                                                            <td className="px-3 py-2">
                                                                                                {
                                                                                                    it.name
                                                                                                }
                                                                                            </td>
                                                                                            <td className="px-3 py-2 text-center">
                                                                                                {
                                                                                                    it.qty
                                                                                                }
                                                                                            </td>
                                                                                            <td className="px-3 py-2 text-right">
                                                                                                {
                                                                                                    it.unitLabel
                                                                                                }
                                                                                            </td>
                                                                                            <td className="px-3 py-2 text-right">
                                                                                                {
                                                                                                    it.totalLabel
                                                                                                }
                                                                                            </td>
                                                                                        </tr>

                                                                                        {it.hasDiscount ? (
                                                                                            <tr className="border-t border-border-primary/60 text-xs text-amber-700">
                                                                                                <td
                                                                                                    className="px-3 py-2"
                                                                                                    colSpan={
                                                                                                        4
                                                                                                    }
                                                                                                >
                                                                                                    Desconto
                                                                                                    aplicado:{' '}
                                                                                                    <span className="font-medium">
                                                                                                        {it.discountType ===
                                                                                                            'PERCENT' &&
                                                                                                        it.discountPercentLabel
                                                                                                            ? `${it.discountPercentLabel}${
                                                                                                                  it.discountAmountLabel
                                                                                                                      ? ` • ${it.discountAmountLabel}`
                                                                                                                      : ''
                                                                                                              }`
                                                                                                            : (it.discountAmountLabel ??
                                                                                                              '—')}
                                                                                                    </span>
                                                                                                </td>
                                                                                            </tr>
                                                                                        ) : null}
                                                                                    </React.Fragment>
                                                                                )
                                                                            )}
                                                                            <tr className="border-t border-border-primary">
                                                                                <td
                                                                                    className="px-3 py-2 text-right text-content-secondary"
                                                                                    colSpan={
                                                                                        3
                                                                                    }
                                                                                >
                                                                                    Subtotal
                                                                                    serviços
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right font-semibold text-content-primary">
                                                                                    {
                                                                                        order.servicesSubtotalLabel
                                                                                    }
                                                                                </td>
                                                                            </tr>
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        ) : null}

                                                        {productItems.length >
                                                        0 ? (
                                                            <div className="space-y-2">
                                                                <p className="text-label-small text-content-secondary">
                                                                    Produtos
                                                                </p>

                                                                <div className="overflow-x-auto rounded-lg border border-border-primary">
                                                                    <table className="min-w-full text-sm">
                                                                        <thead>
                                                                            <tr className="border-b border-border-primary bg-muted/40 text-left text-label-small text-content-secondary">
                                                                                <th className="px-3 py-2">
                                                                                    Item
                                                                                </th>
                                                                                <th className="px-3 py-2 text-center">
                                                                                    Qtd
                                                                                </th>
                                                                                <th className="px-3 py-2 text-right">
                                                                                    Unit.
                                                                                </th>
                                                                                <th className="px-3 py-2 text-right">
                                                                                    Total
                                                                                </th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {productItems.map(
                                                                                (
                                                                                    it
                                                                                ) => (
                                                                                    <React.Fragment
                                                                                        key={
                                                                                            it.id
                                                                                        }
                                                                                    >
                                                                                        <tr className="border-t border-border-primary text-paragraph-small text-content-primary">
                                                                                            <td className="px-3 py-2">
                                                                                                {
                                                                                                    it.name
                                                                                                }
                                                                                            </td>
                                                                                            <td className="px-3 py-2 text-center">
                                                                                                {
                                                                                                    it.qty
                                                                                                }
                                                                                            </td>
                                                                                            <td className="px-3 py-2 text-right">
                                                                                                {
                                                                                                    it.unitLabel
                                                                                                }
                                                                                            </td>
                                                                                            <td className="px-3 py-2 text-right">
                                                                                                {
                                                                                                    it.totalLabel
                                                                                                }
                                                                                            </td>
                                                                                        </tr>

                                                                                        {it.hasDiscount ? (
                                                                                            <tr className="border-t border-border-primary/60 text-xs text-amber-700">
                                                                                                <td
                                                                                                    className="px-3 py-2"
                                                                                                    colSpan={
                                                                                                        4
                                                                                                    }
                                                                                                >
                                                                                                    Desconto
                                                                                                    aplicado:{' '}
                                                                                                    <span className="font-medium">
                                                                                                        {it.discountType ===
                                                                                                            'PERCENT' &&
                                                                                                        it.discountPercentLabel
                                                                                                            ? `${it.discountPercentLabel}${
                                                                                                                  it.discountAmountLabel
                                                                                                                      ? ` • ${it.discountAmountLabel}`
                                                                                                                      : ''
                                                                                                              }`
                                                                                                            : (it.discountAmountLabel ??
                                                                                                              '—')}
                                                                                                    </span>
                                                                                                </td>
                                                                                            </tr>
                                                                                        ) : null}
                                                                                    </React.Fragment>
                                                                                )
                                                                            )}
                                                                            <tr className="border-t border-border-primary">
                                                                                <td
                                                                                    className="px-3 py-2 text-right text-content-secondary"
                                                                                    colSpan={
                                                                                        3
                                                                                    }
                                                                                >
                                                                                    Subtotal
                                                                                    produtos
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right font-semibold text-content-primary">
                                                                                    {
                                                                                        order.productsSubtotalLabel
                                                                                    }
                                                                                </td>
                                                                            </tr>
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        ) : null}

                                                        {cancellationFeeItems.length >
                                                        0 ? (
                                                            <div className="space-y-2">
                                                                <p className="text-label-small text-content-secondary">
                                                                    Taxas de
                                                                    cancelamento
                                                                </p>

                                                                <div className="overflow-x-auto rounded-lg border border-border-primary">
                                                                    <table className="min-w-full text-sm">
                                                                        <thead>
                                                                            <tr className="border-b border-border-primary bg-muted/40 text-left text-label-small text-content-secondary">
                                                                                <th className="px-3 py-2">
                                                                                    Descrição
                                                                                </th>
                                                                                <th className="px-3 py-2 text-center">
                                                                                    Qtd
                                                                                </th>
                                                                                <th className="px-3 py-2 text-right">
                                                                                    Unit.
                                                                                </th>
                                                                                <th className="px-3 py-2 text-right">
                                                                                    Total
                                                                                </th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {cancellationFeeItems.map(
                                                                                (
                                                                                    it
                                                                                ) => (
                                                                                    <tr
                                                                                        key={
                                                                                            it.id
                                                                                        }
                                                                                        className="border-t border-border-primary text-paragraph-small text-content-primary"
                                                                                    >
                                                                                        <td className="px-3 py-2">
                                                                                            {
                                                                                                it.name
                                                                                            }
                                                                                        </td>
                                                                                        <td className="px-3 py-2 text-center">
                                                                                            {
                                                                                                it.qty
                                                                                            }
                                                                                        </td>
                                                                                        <td className="px-3 py-2 text-right">
                                                                                            {
                                                                                                it.unitLabel
                                                                                            }
                                                                                        </td>
                                                                                        <td className="px-3 py-2 text-right">
                                                                                            {
                                                                                                it.totalLabel
                                                                                            }
                                                                                        </td>
                                                                                    </tr>
                                                                                )
                                                                            )}
                                                                            <tr className="border-t border-border-primary">
                                                                                <td
                                                                                    className="px-3 py-2 text-right text-content-secondary"
                                                                                    colSpan={
                                                                                        3
                                                                                    }
                                                                                >
                                                                                    Subtotal
                                                                                    taxas
                                                                                    de
                                                                                    cancelamento
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right font-semibold text-content-primary">
                                                                                    {
                                                                                        order.cancellationFeesSubtotalLabel
                                                                                    }
                                                                                </td>
                                                                            </tr>
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </details>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}

function shortId(id: string) {
    return String(id ?? '').slice(0, 8);
}

function toIntSafe(v: unknown, fallback: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.trunc(n));
}

// compat: quebra "1x A, 1x B" em linhas separadas (caso o backend ainda não mande items[])
function splitItemsLabel(label?: string | null): string[] {
    const raw = String(label ?? '').trim();
    if (!raw || raw === '—') return [];
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function parseBRLLabelToNumber(value: string): number {
    const normalized = String(value ?? '')
        .replace(/\s/g, '')
        .replace('R$', '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim();

    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
}

function formatPercentLabel(value: number): string {
    return `${value.toFixed(2).replace('.', ',')}%`;
}

type SubscriptionCheckoutAction = 'NONE' | 'USE_ACTIVE' | 'RENEW' | 'JOIN';

function getSubscriptionActionLabel(action: SubscriptionCheckoutAction) {
    switch (action) {
        case 'USE_ACTIVE':
            return 'Usar assinatura ativa';
        case 'RENEW':
            return 'Renovar assinatura';
        case 'JOIN':
            return 'Aderir à assinatura';
        default:
            return 'Cobrar avulso';
    }
}

function getDefaultSubscriptionAction(
    order: ServiceOrderUI
): SubscriptionCheckoutAction {
    const subscription = order.subscription;

    // 🔥 sempre começa como avulso
    return 'NONE';
}

function getServiceOrderPreviewTotal(
    order: ServiceOrderUI,
    action: SubscriptionCheckoutAction
): number {
    const originalTotal = parseBRLLabelToNumber(order.totalLabel);
    const subscription = order.subscription;

    if (!subscription?.hasAvailableSubscription) {
        return originalTotal;
    }

    const planPrice = Number(subscription.availableSubscriptionPlanPrice ?? 0);

    switch (action) {
        case 'USE_ACTIVE':
            return 0;

        case 'JOIN':
        case 'RENEW':
            return Math.max(0, planPrice);

        default:
            return originalTotal;
    }
}

export default function AdminCheckoutClient({
    canSeeAllUnits,
    monthLabel,
    openAccounts,
    pendingCancellationCharges,
    monthGroups,
    cardMachines,
}: AdminCheckoutClientProps) {
    const router = useRouter();

    const [activeTab, setActiveTab] =
        React.useState<CheckoutTab>('OPEN_ORDERS');

    const [payingClientId, setPayingClientId] = React.useState<string | null>(
        null
    );

    const [payingOrderIds, setPayingOrderIds] = React.useState<Set<string>>(
        () => new Set()
    );

    // trava de cancelamento por cliente
    const [cancelingClientId, setCancelingClientId] = React.useState<
        string | null
    >(null);

    // ====== Produtos (para adicionar no checkout) ======
    const [products, setProducts] = React.useState<
        Array<{
            id: string;
            name: string;
            priceLabel: string;
            stockQuantity: number;
            unitId: string;
        }>
    >([]);

    const [productsLoading, setProductsLoading] = React.useState(false);

    // ====== Profissionais (para vincular venda) ======
    const [professionals, setProfessionals] = React.useState<
        Array<{
            id: string;
            name: string;
            isActive: boolean;
            unitId: string | null;
        }>
    >([]);
    const [professionalsLoading, setProfessionalsLoading] =
        React.useState(false);

    // state por cliente (seleção + qty)
    const [selectedProductByClient, setSelectedProductByClient] =
        React.useState<Record<string, string>>({});

    const [qtyByClient, setQtyByClient] = React.useState<
        Record<string, number>
    >({});

    const [addingProductForClientId, setAddingProductForClientId] =
        React.useState<string | null>(null);

    // ✅ trava por item (cancelar produto por produto)
    const [removingItemIds, setRemovingItemIds] = React.useState<Set<string>>(
        () => new Set()
    );

    // ✅ trava por item (atribuir profissional)
    const [assigningItemIds, setAssigningItemIds] = React.useState<Set<string>>(
        () => new Set()
    );

    // seleção por item (UI controlled)
    const [selectedProfessionalByItem, setSelectedProfessionalByItem] =
        React.useState<Record<string, string>>({});

    const [discountByItem, setDiscountByItem] = React.useState<
        Record<
            string,
            {
                type: 'PERCENT' | 'AMOUNT' | null;
                value: number;
                reason?: string | null;
            }
        >
    >({});

    const [subscriptionActionByOrder, setSubscriptionActionByOrder] =
        React.useState<Record<string, SubscriptionCheckoutAction>>({});

    // seleção "rápida" por cliente (aplicar em vários itens)
    const [bulkProfessionalByClient, setBulkProfessionalByClient] =
        React.useState<Record<string, string>>({});

    const [paymentMethodByClient, setPaymentMethodByClient] = React.useState<
        Record<string, PaymentMethod | ''>
    >({});

    const [cardMachineIdByClient, setCardMachineIdByClient] = React.useState<
        Record<string, string>
    >({});

    const [cardInstallmentsByClient, setCardInstallmentsByClient] =
        React.useState<Record<string, number>>({});

    const paymentMethodOptions: Array<{
        value: PaymentMethod;
        label: string;
    }> = [
        { value: 'CREDIT', label: 'Crédito' },
        { value: 'DEBIT', label: 'Débito' },
        { value: 'PIX', label: 'Pix' },
        { value: 'CASH', label: 'Dinheiro' },
    ];

    const getCardMachineFeeLabel = React.useCallback(
        (
            machineId: string,
            paymentMethod: PaymentMethod | '',
            installments?: number
        ) => {
            if (!machineId || !paymentMethod) return '';

            const machine = cardMachines.find((m) => m.id === machineId);
            if (!machine) return '';

            if (paymentMethod === 'CREDIT') {
                const selectedInstallments = Math.max(
                    1,
                    Number(installments || 1)
                );

                const creditFee = (machine.creditFees || []).find(
                    (item) => item.installments === selectedInstallments
                );

                if (!creditFee) return '';

                return `${selectedInstallments}x • ${formatPercentLabel(
                    Number(creditFee.feePercent ?? 0)
                )}`;
            }

            if (paymentMethod === 'DEBIT') {
                return machine.debitFeePercentLabel;
            }

            return '';
        },
        [cardMachines]
    );

    const openAccountsCount = openAccounts.length;
    const pendingCancellationChargesCount = pendingCancellationCharges.length;

    const orphanServiceOrders: ServiceOrderUI[] = [];
    const orphanProductOrders: ProductOrderUI[] = [];

    const completeOrder = React.useCallback(
        async (
            orderId: string,
            payload: {
                paymentMethod: PaymentMethod;
                cardMachineId?: string;
                cardInstallments?: number;
                itemDiscounts?: any[];
            }
        ) => {
            const res = await fetch(
                `/api/admin/checkout/orders/${encodeURIComponent(orderId)}/complete`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                }
            );

            const rawText = await res.text().catch(() => '');
            let json: CompleteCheckoutResponse | null = null;

            try {
                json = rawText
                    ? (JSON.parse(rawText) as CompleteCheckoutResponse)
                    : null;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const msg =
                    json && !json.ok
                        ? json.error
                        : rawText ||
                          `Falha ao concluir checkout. HTTP ${res.status}`;
                throw new Error(msg);
            }

            return json.data;
        },
        []
    );

    const cancelOrder = React.useCallback(async (orderId: string) => {
        const res = await fetch(
            `/api/admin/checkout/orders/${encodeURIComponent(orderId)}/cancel`,
            { method: 'PATCH' }
        );

        const json = (await res
            .json()
            .catch(() => null)) as CancelOrderResponse | null;

        if (!res.ok || !json || !json.ok) {
            const msg =
                json && !json.ok ? json.error : 'Falha ao cancelar pedido.';
            throw new Error(msg);
        }

        return json.data;
    }, []);

    const cancelAccount = React.useCallback(
        async (clientId: string, orderIds: string[]) => {
            const res = await fetch(
                `/api/admin/checkout/accounts/${encodeURIComponent(clientId)}/cancel`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderIds }),
                }
            );

            const json = (await res
                .json()
                .catch(() => null)) as CancelAccountResponse | null;

            if (!res.ok || !json || !json.ok) {
                const msg =
                    json && !json.ok ? json.error : 'Falha ao cancelar conta.';
                throw new Error(msg);
            }

            return json.data;
        },
        []
    );

    const addProduct = React.useCallback(
        async (clientId: string, productId: string, quantity: number) => {
            const res = await fetch(
                `/api/admin/checkout/accounts/${encodeURIComponent(clientId)}/add-product`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productId, quantity }),
                }
            );

            const json = (await res
                .json()
                .catch(() => null)) as AddProductResponse | null;

            if (!res.ok || !json || !json.ok) {
                const msg =
                    json && !json.ok
                        ? json.error
                        : 'Falha ao adicionar produto.';
                throw new Error(msg);
            }

            return json.data;
        },
        []
    );

    // ✅ remove UM item de produto (e atualiza totais no backend)
    const removeProductItem = React.useCallback(
        async (orderId: string, itemId: string) => {
            const res = await fetch(
                `/api/admin/checkout/orders/${encodeURIComponent(orderId)}/remove-product-item`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itemId }),
                }
            );

            const json = (await res
                .json()
                .catch(() => null)) as RemoveProductItemResponse | null;

            if (!res.ok || !json || !json.ok) {
                const msg =
                    json && !json.ok ? json.error : 'Falha ao remover produto.';
                throw new Error(msg);
            }

            return json.data;
        },
        []
    );

    // ✅ atribui profissional para UM item
    const assignProductItemProfessional = React.useCallback(
        async (orderId: string, itemId: string, professionalId: string) => {
            const res = await fetch(
                `/api/admin/checkout/orders/${encodeURIComponent(orderId)}/assign-product-item-professional`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itemId, professionalId }),
                }
            );

            const json = (await res
                .json()
                .catch(
                    () => null
                )) as AssignProductItemProfessionalResponse | null;

            if (!res.ok || !json || !json.ok) {
                const msg =
                    json && !json.ok
                        ? json.error
                        : 'Falha ao atribuir profissional.';
                throw new Error(msg);
            }

            return json.data;
        },
        []
    );

    const withPayingOrder = React.useCallback((orderId: string) => {
        setPayingOrderIds((prev) => {
            const next = new Set(prev);
            next.add(orderId);
            return next;
        });

        return () => {
            setPayingOrderIds((prev) => {
                const next = new Set(prev);
                next.delete(orderId);
                return next;
            });
        };
    }, []);

    const withRemovingItem = React.useCallback((itemId: string) => {
        setRemovingItemIds((prev) => {
            const next = new Set(prev);
            next.add(itemId);
            return next;
        });

        return () => {
            setRemovingItemIds((prev) => {
                const next = new Set(prev);
                next.delete(itemId);
                return next;
            });
        };
    }, []);

    const withAssigningItem = React.useCallback((itemId: string) => {
        setAssigningItemIds((prev) => {
            const next = new Set(prev);
            next.add(itemId);
            return next;
        });

        return () => {
            setAssigningItemIds((prev) => {
                const next = new Set(prev);
                next.delete(itemId);
                return next;
            });
        };
    }, []);

    // compat (ainda existe no código, mas agora não é o fluxo principal)
    const handleCancelProductOrder = React.useCallback(
        async (orderId: string) => {
            if (!orderId) return;
            if (payingClientId) return;
            if (cancelingClientId) return;
            if (addingProductForClientId) return;

            const ok = window.confirm(
                `Cancelar o pedido #${shortId(orderId)}?\n\nIsso cancelará o pedido inteiro.`
            );
            if (!ok) return;

            const release = withPayingOrder(orderId);

            try {
                toast.message(`Cancelando pedido #${shortId(orderId)}…`);
                await cancelOrder(orderId);
                toast.success('Pedido cancelado.');
                router.refresh();
            } catch (e: any) {
                toast.error(e?.message ?? 'Erro ao cancelar pedido.');
            } finally {
                release();
            }
        },
        [
            addingProductForClientId,
            cancelOrder,
            cancelingClientId,
            payingClientId,
            router,
            withPayingOrder,
        ]
    );

    const handleRemoveProductItem = React.useCallback(
        async (orderId: string, item: ProductOrderItemUI) => {
            if (!orderId || !item?.itemId) return;

            if (payingClientId) return;
            if (cancelingClientId) return;
            if (addingProductForClientId) return;

            if (removingItemIds.has(item.itemId)) return;

            const ok = window.confirm(
                `Remover este produto do pedido #${shortId(orderId)}?\n\n• ${item.qty}x ${item.name}\n• Total do item: ${item.totalLabel}`
            );
            if (!ok) return;

            const releaseItem = withRemovingItem(item.itemId);
            const releaseOrder = withPayingOrder(orderId);

            try {
                toast.message(`Removendo produto de #${shortId(orderId)}…`);
                await removeProductItem(orderId, item.itemId);
                toast.success('Produto removido.');
                router.refresh();
            } catch (e: any) {
                toast.error(e?.message ?? 'Erro ao remover produto.');
            } finally {
                releaseOrder();
                releaseItem();
            }
        },
        [
            addingProductForClientId,
            cancelingClientId,
            payingClientId,
            removeProductItem,
            removingItemIds,
            router,
            withPayingOrder,
            withRemovingItem,
        ]
    );

    const handleAssignProfessionalForItem = React.useCallback(
        async (
            orderId: string,
            item: ProductOrderItemUI,
            professionalId: string
        ) => {
            if (!orderId || !item?.itemId) return;
            if (!professionalId) return;

            if (payingClientId) return;
            if (cancelingClientId) return;
            if (addingProductForClientId) return;

            if (assigningItemIds.has(item.itemId)) return;

            const releaseItem = withAssigningItem(item.itemId);
            const releaseOrder = withPayingOrder(orderId);

            try {
                toast.message(`Salvando profissional do item…`);
                await assignProductItemProfessional(
                    orderId,
                    item.itemId,
                    professionalId
                );
                toast.success('Profissional atribuído.');
                router.refresh();
            } catch (e: any) {
                toast.error(e?.message ?? 'Erro ao atribuir profissional.');
            } finally {
                releaseOrder();
                releaseItem();
            }
        },
        [
            addingProductForClientId,
            assignProductItemProfessional,
            assigningItemIds,
            cancelingClientId,
            payingClientId,
            router,
            withAssigningItem,
            withPayingOrder,
        ]
    );

    const handleBulkAssignForAccount = React.useCallback(
        async (account: OpenAccountUI) => {
            const clientId = account?.clientId;
            if (!clientId) return;

            const professionalId = String(
                bulkProfessionalByClient[clientId] ?? ''
            ).trim();
            if (!professionalId) {
                toast.message('Selecione um profissional para aplicar.');
                return;
            }

            if (payingClientId) return;
            if (cancelingClientId) return;
            if (addingProductForClientId) return;

            const itemsToAssign: Array<{
                orderId: string;
                item: ProductOrderItemUI;
            }> = [];

            for (const order of account.productOrders ?? []) {
                const items = Array.isArray(order.items) ? order.items : [];
                for (const it of items) {
                    if (!it?.itemId) continue;
                    if (it.professionalId) continue; // só aplica nos que estão vazios
                    itemsToAssign.push({ orderId: order.id, item: it });
                }
            }

            if (itemsToAssign.length === 0) {
                toast.message('Todos os itens já têm profissional.');
                return;
            }

            const ok = window.confirm(
                `Aplicar o profissional selecionado em ${itemsToAssign.length} item(ns) sem profissional?`
            );
            if (!ok) return;

            try {
                for (let i = 0; i < itemsToAssign.length; i++) {
                    const { orderId, item } = itemsToAssign[i];
                    const releaseItem = withAssigningItem(item.itemId);
                    const releaseOrder = withPayingOrder(orderId);

                    try {
                        toast.message(
                            `Aplicando ${i + 1}/${itemsToAssign.length}…`
                        );
                        await assignProductItemProfessional(
                            orderId,
                            item.itemId,
                            professionalId
                        );
                    } finally {
                        releaseOrder();
                        releaseItem();
                    }
                }

                toast.success('Profissional aplicado nos itens pendentes.');
                router.refresh();
            } catch (e: any) {
                toast.error(e?.message ?? 'Erro ao aplicar profissional.');
            }
        },
        [
            addingProductForClientId,
            assignProductItemProfessional,
            bulkProfessionalByClient,
            cancelingClientId,
            payingClientId,
            router,
            withAssigningItem,
            withPayingOrder,
        ]
    );

    const handleCancelAccount = React.useCallback(
        async (account: OpenAccountUI) => {
            if (!account?.clientId) return;
            if (payingClientId) return;
            if (cancelingClientId) return;
            if (addingProductForClientId) return;

            const orderIds = [
                ...account.serviceOrders.map((o) => o.id),
                ...account.productOrders.map((o) => o.id),
                ...account.cancellationFeeOrders.map((o) => o.id),
            ].filter(Boolean);

            if (orderIds.length === 0) {
                toast.message('Nada para cancelar nesta conta.');
                return;
            }

            const ok = window.confirm(
                `Cancelar a conta do cliente "${account.clientLabel}"?\n\nIsso cancelará ${orderIds.length} pedido(s) pendente(s).`
            );
            if (!ok) return;

            setCancelingClientId(account.clientId);

            try {
                toast.message(`Cancelando conta…`);
                const data = await cancelAccount(account.clientId, orderIds);

                if (data.canceledCount === 0) {
                    toast.message('Nenhum pedido foi cancelado.');
                } else {
                    toast.success(
                        `Conta cancelada: ${data.canceledCount} pedido(s).`
                    );
                }

                router.refresh();
            } catch (e: any) {
                toast.error(e?.message ?? 'Erro ao cancelar conta.');
            } finally {
                setCancelingClientId(null);
            }
        },
        [
            addingProductForClientId,
            cancelAccount,
            cancelingClientId,
            payingClientId,
            router,
        ]
    );

    const fetchProducts = React.useCallback(async () => {
        setProductsLoading(true);

        try {
            const res = await fetch('/api/admin/checkout/products', {
                method: 'GET',
            });

            const json = (await res
                .json()
                .catch(() => null)) as ProductsListResponse | null;

            if (!res.ok || !json || !json.ok) {
                const msg =
                    json && !json.ok
                        ? json.error
                        : 'Falha ao carregar produtos.';
                throw new Error(msg);
            }

            setProducts(json.data.products ?? []);
        } catch (e: any) {
            toast.error(e?.message ?? 'Erro ao carregar produtos.');
            setProducts([]);
        } finally {
            setProductsLoading(false);
        }
    }, []);

    const fetchProfessionals = React.useCallback(async () => {
        setProfessionalsLoading(true);

        try {
            const res = await fetch('/api/admin/checkout/professionals', {
                method: 'GET',
            });

            const json = (await res
                .json()
                .catch(() => null)) as ProfessionalsListResponse | null;

            if (!res.ok || !json || !json.ok) {
                const msg =
                    json && !json.ok
                        ? json.error
                        : 'Falha ao carregar profissionais.';
                throw new Error(msg);
            }

            setProfessionals(json.data.professionals ?? []);
        } catch (e: any) {
            toast.error(e?.message ?? 'Erro ao carregar profissionais.');
            setProfessionals([]);
        } finally {
            setProfessionalsLoading(false);
        }
    }, []);

    React.useEffect(() => {
        // carrega no mount; o escopo real vem do backend pela sessão
        fetchProducts();
        fetchProfessionals();
    }, [fetchProducts, fetchProfessionals]);

    const handleAddProduct = React.useCallback(
        async (account: OpenAccountUI) => {
            const clientId = account?.clientId;
            if (!clientId) return;

            if (payingClientId) return;
            if (cancelingClientId) return;
            if (addingProductForClientId) return;

            const productId = selectedProductByClient[clientId] ?? '';
            const quantity = qtyByClient[clientId] ?? 1;

            if (!productId) {
                toast.message('Selecione um produto.');
                return;
            }

            const qty = toIntSafe(quantity, 1);

            // best-effort no front (a garantia real é a transação no backend)
            const product = products.find((p) => p.id === productId);
            if (product && product.stockQuantity < qty) {
                toast.error(
                    `Estoque insuficiente: disponível ${product.stockQuantity}, solicitado ${qty}.`
                );
                return;
            }

            setAddingProductForClientId(clientId);

            try {
                toast.message('Adicionando produto…');
                const data = await addProduct(clientId, productId, qty);

                toast.success(
                    `Produto adicionado${
                        data.orderWasCreated ? ' (novo pedido criado)' : ''
                    }.`
                );

                // reseta inputs do cliente
                setSelectedProductByClient((prev) => {
                    const next = { ...prev };
                    next[clientId] = '';
                    return next;
                });
                setQtyByClient((prev) => {
                    const next = { ...prev };
                    next[clientId] = 1;
                    return next;
                });

                // recarrega lista de produtos para refletir estoque atualizado (nice-to-have)
                fetchProducts();

                router.refresh();
            } catch (e: any) {
                toast.error(e?.message ?? 'Erro ao adicionar produto.');
            } finally {
                setAddingProductForClientId(null);
            }
        },
        [
            addProduct,
            addingProductForClientId,
            cancelingClientId,
            fetchProducts,
            payingClientId,
            products,
            qtyByClient,
            router,
            selectedProductByClient,
        ]
    );

    const handleMarkAllAsPaid = React.useCallback(
        async (account: OpenAccountUI) => {
            if (payingClientId) return;
            if (cancelingClientId) return;
            if (addingProductForClientId) return;

            const accountOriginalTotal = parseBRLLabelToNumber(
                account.totalLabel
            );

            const discountEntriesForAccount = Object.entries(
                discountByItem
            ).filter(([orderItemId, discount]) => {
                if (!discount || !discount.type || discount.value <= 0) {
                    return false;
                }

                const belongsToService = (account.serviceOrders ?? []).some(
                    (order) =>
                        (order.items ?? []).some(
                            (item) => item.itemId === orderItemId
                        )
                );

                const belongsToProduct = (account.productOrders ?? []).some(
                    (order) =>
                        (order.items ?? []).some(
                            (item) => item.itemId === orderItemId
                        )
                );

                return belongsToService || belongsToProduct;
            });

            const totalDiscountPreview = discountEntriesForAccount.reduce(
                (sum, [orderItemId, discount]) => {
                    const serviceItem = (account.serviceOrders ?? [])
                        .flatMap((order) => order.items ?? [])
                        .find((item) => item.itemId === orderItemId);

                    const productItem = (account.productOrders ?? [])
                        .flatMap((order) => order.items ?? [])
                        .find((item) => item.itemId === orderItemId);

                    const item = serviceItem ?? productItem;
                    if (!item) return sum;

                    const originalTotal = parseBRLLabelToNumber(
                        item.totalLabel
                    );

                    let discountAmount = 0;

                    if (discount.type === 'PERCENT') {
                        discountAmount = originalTotal * (discount.value / 100);
                    } else if (discount.type === 'AMOUNT') {
                        discountAmount = discount.value;
                    }

                    if (discountAmount > originalTotal) {
                        discountAmount = originalTotal;
                    }

                    return sum + discountAmount;
                },
                0
            );

            const baseTotal = parseBRLLabelToNumber(account.totalLabel);

            const subscriptionAdjustment = (account.serviceOrders ?? []).reduce(
                (sum, order) => {
                    const action =
                        subscriptionActionByOrder[order.id] ??
                        getDefaultSubscriptionAction(order);

                    const originalOrderTotal = parseBRLLabelToNumber(
                        order.totalLabel
                    );

                    const previewOrderTotal = getServiceOrderPreviewTotal(
                        order,
                        action
                    );

                    return sum + (previewOrderTotal - originalOrderTotal);
                },
                0
            );

            const totalWithDiscountPreview = Math.max(
                0,
                baseTotal + subscriptionAdjustment - totalDiscountPreview
            );

            const hasPreviewChange =
                Math.abs(subscriptionAdjustment) > 0.009 ||
                totalDiscountPreview > 0.009;

            const accountTotalIsZero =
                Math.abs(totalWithDiscountPreview) < 0.01 &&
                accountOriginalTotal >= 0;

            // ✅ Regra UI: se tem itens de produto (items[]) e algum não tem professionalId, bloqueia
            if (!accountTotalIsZero && account.hasProducts) {
                const productItems = (account.productOrders ?? [])
                    .flatMap((o) => (Array.isArray(o.items) ? o.items : []))
                    .filter(Boolean);

                if (productItems.length > 0) {
                    const missing = productItems.filter((it) => {
                        const saved = String(it.professionalId ?? '').trim();
                        const staged = String(
                            selectedProfessionalByItem[it.itemId] ?? ''
                        ).trim();
                        return !saved && !staged;
                    });

                    if (missing.length > 0) {
                        toast.error(
                            `Faltou profissional em ${missing.length} item(ns) de produto. Selecione o profissional em cada item antes de concluir.`
                        );
                        return;
                    }
                }
            }

            const paymentMethod = paymentMethodByClient[account.clientId] ?? '';
            const cardMachineId = String(
                cardMachineIdByClient[account.clientId] ?? ''
            ).trim();

            const hasPlanOrders = account.serviceOrders.some(
                (o) => o.usesPlanCredit
            );

            const hasSubscriptionOrders = account.serviceOrders.some((o) => {
                const subscription = o.subscription;
                return Boolean(
                    subscription?.hasAvailableSubscription &&
                    (subscription.canUseActiveSubscription ||
                        subscription.canRenewSubscription ||
                        subscription.canJoinSubscription)
                );
            });

            if (hasPlanOrders) {
                // fluxo atual de plano continua como está
            }

            if (hasSubscriptionOrders) {
                // por enquanto, só preparamos a camada visual/estado.
                // a execução real virá quando o backend do complete receber essa decisão.
            }

            if (!accountTotalIsZero && !paymentMethod) {
                toast.error(
                    'Selecione a forma de pagamento antes de concluir.'
                );
                return;
            }

            const requiresCardMachine =
                paymentMethod === 'CREDIT' || paymentMethod === 'DEBIT';

            if (!accountTotalIsZero && requiresCardMachine && !cardMachineId) {
                toast.error(
                    'Selecione a máquina de cartão para pagamentos em crédito ou débito.'
                );
                return;
            }

            const orderIds = [
                ...account.serviceOrders.map((o) => o.id),
                ...account.productOrders.map((o) => o.id),
                ...account.cancellationFeeOrders.map((o) => o.id),
            ].filter(Boolean);

            if (orderIds.length === 0) {
                toast.message('Nada para pagar nesta conta.');
                return;
            }

            setPayingClientId(account.clientId);

            let okCount = 0;
            const failed: Array<{ id: string; error: string }> = [];

            try {
                for (let i = 0; i < orderIds.length; i++) {
                    const id = orderIds[i];
                    const release = withPayingOrder(id);

                    try {
                        toast.message(
                            `Concluindo ${i + 1}/${orderIds.length}: #${shortId(id)}…`
                        );

                        const currentServiceOrder = (
                            account.serviceOrders ?? []
                        ).find((order) => order.id === id);

                        const currentProductOrder = (
                            account.productOrders ?? []
                        ).find((order) => order.id === id);

                        const allowedItemIds = new Set<string>([
                            ...(currentServiceOrder?.items ?? []).map(
                                (item) => item.itemId
                            ),
                            ...(currentProductOrder?.items ?? []).map(
                                (item) => item.itemId
                            ),
                        ]);

                        const itemDiscounts = Object.entries(discountByItem)
                            .filter(
                                ([orderItemId, d]) =>
                                    allowedItemIds.has(orderItemId) &&
                                    d &&
                                    d.value > 0 &&
                                    d.type
                            )
                            .map(([orderItemId, d]) => ({
                                orderItemId,
                                discountType: d.type,
                                discountValue: d.value,
                                discountReason: d.reason ?? null,
                            }));

                        const safeCardInstallments =
                            paymentMethod === 'CREDIT'
                                ? Math.max(
                                      1,
                                      Number(
                                          cardInstallmentsByClient[
                                              account.clientId
                                          ] ?? 1
                                      )
                                  )
                                : 1;

                        const subscriptionAction =
                            currentServiceOrder &&
                            !currentServiceOrder.usesPlanCredit
                                ? (subscriptionActionByOrder[
                                      currentServiceOrder.id
                                  ] ??
                                  getDefaultSubscriptionAction(
                                      currentServiceOrder
                                  ))
                                : 'NONE';

                        await completeOrder(id, {
                            paymentMethod: accountTotalIsZero
                                ? 'CASH'
                                : (paymentMethod as PaymentMethod),
                            ...(accountTotalIsZero
                                ? {}
                                : requiresCardMachine
                                  ? {
                                        cardMachineId,
                                        ...(paymentMethod === 'CREDIT'
                                            ? {
                                                  cardInstallments:
                                                      safeCardInstallments,
                                              }
                                            : {}),
                                    }
                                  : {}),
                            itemDiscounts,

                            // ainda não executado no backend, mas já preparado
                            subscriptionAction,
                        } as any);

                        okCount++;
                    } catch (e: any) {
                        failed.push({
                            id,
                            error: e?.message ?? 'Erro ao concluir.',
                        });
                    } finally {
                        release();
                    }
                }

                if (failed.length === 0) {
                    toast.success('Conta marcada como paga.');
                } else if (okCount === 0) {
                    toast.error(
                        `Nenhum pedido foi concluído. Primeiro erro: #${shortId(
                            failed[0].id
                        )} (${failed[0].error})`
                    );
                } else {
                    toast.message(
                        `Finalizado: ${okCount} pago(s), ${failed.length} com erro.`
                    );
                    toast.error(
                        `Erro em #${shortId(failed[0].id)}: ${failed[0].error}`
                    );
                }

                router.refresh();
            } catch (e: any) {
                toast.error(e?.message ?? 'Erro ao concluir checkout.');
            } finally {
                setPayingClientId(null);
            }
        },
        [
            addingProductForClientId,
            cancelingClientId,
            cardMachineIdByClient,
            completeOrder,
            payingClientId,
            paymentMethodByClient,
            router,
            selectedProfessionalByItem,
            subscriptionActionByOrder,
            withPayingOrder,
        ]
    );

    return (
        <div className="space-y-5 max-w-7xl">
            <header className="flex flex-col gap-3">
                <div className="min-w-0">
                    <h1 className="text-title text-content-primary">
                        Checkout
                    </h1>

                    <p className="text-paragraph-medium text-content-secondary">
                        Finalize os pagamentos de atendimentos e pedidos de
                        produtos.
                    </p>

                    <p className="text-paragraph-small text-content-tertiary mt-1">
                        Escopo de unidades:{' '}
                        {canSeeAllUnits ? 'todas as unidades' : 'unidade atual'}
                    </p>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex gap-2 border-b border-border-primary overflow-x-auto">
                        <button
                            type="button"
                            onClick={() => setActiveTab('OPEN_ORDERS')}
                            className={cn(
                                'px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap',
                                activeTab === 'OPEN_ORDERS'
                                    ? 'border-primary text-content-primary'
                                    : 'border-transparent text-content-secondary hover:text-content-primary'
                            )}
                        >
                            Contas em aberto
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('CANCELLATION_FEES')}
                            className={cn(
                                'px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap',
                                activeTab === 'CANCELLATION_FEES'
                                    ? 'border-primary text-content-primary'
                                    : 'border-transparent text-content-secondary hover:text-content-primary'
                            )}
                        >
                            Taxas de cancelamento (
                            {pendingCancellationChargesCount})
                        </button>
                    </div>

                    <div className="w-full md:w-auto md:flex md:justify-end">
                        <div className="w-full md:w-auto flex justify-center md:justify-end">
                            <div className="w-full max-w-[320px] origin-top scale-[0.92] md:scale-100 md:max-w-none">
                                <MonthPicker />
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {activeTab === 'OPEN_ORDERS' && (
                <section className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-subtitle text-content-primary">
                            Contas em aberto{' '}
                            <span className="text-content-secondary font-normal">
                                ({openAccountsCount})
                            </span>
                        </h2>
                    </div>

                    {openAccounts.length === 0 ? (
                        <EmptyState title="Não há contas aguardando pagamento no momento." />
                    ) : (
                        <div className="space-y-3">
                            {openAccounts.map((account) => {
                                const isPaying =
                                    payingClientId === account.clientId;

                                const isCanceling =
                                    cancelingClientId === account.clientId;

                                const isAdding =
                                    addingProductForClientId ===
                                    account.clientId;

                                const accountOrderIds = [
                                    ...account.serviceOrders.map((o) => o.id),
                                    ...account.productOrders.map((o) => o.id),
                                    ...account.cancellationFeeOrders.map(
                                        (o) => o.id
                                    ),
                                ].filter(Boolean);

                                const anyOrderBusy = accountOrderIds.some(
                                    (id) => payingOrderIds.has(id)
                                );

                                const selectedProductId =
                                    selectedProductByClient[account.clientId] ??
                                    '';

                                const qtyValue =
                                    qtyByClient[account.clientId] ?? 1;

                                const isBusyGlobal =
                                    Boolean(payingClientId) ||
                                    Boolean(cancelingClientId) ||
                                    Boolean(addingProductForClientId);

                                const accountProductItems = (
                                    account.productOrders ?? []
                                )
                                    .flatMap((o) =>
                                        Array.isArray(o.items) ? o.items : []
                                    )
                                    .filter(Boolean);

                                const missingProfessionalCount =
                                    account.hasProducts &&
                                    accountProductItems.length > 0
                                        ? accountProductItems.filter((it) => {
                                              const saved = String(
                                                  it.professionalId ?? ''
                                              ).trim();
                                              const staged = String(
                                                  selectedProfessionalByItem[
                                                      it.itemId
                                                  ] ?? ''
                                              ).trim();
                                              return !saved && !staged;
                                          }).length
                                        : 0;

                                const _bulkProfessionalId =
                                    bulkProfessionalByClient[
                                        account.clientId
                                    ] ?? '';

                                const selectedPaymentMethod =
                                    paymentMethodByClient[account.clientId] ??
                                    '';

                                const accountOriginalTotal =
                                    parseBRLLabelToNumber(account.totalLabel);

                                const availableCardMachines =
                                    cardMachines.filter(
                                        (machine) =>
                                            machine.unitId === account.unitId
                                    );

                                const selectedCardMachineId =
                                    cardMachineIdByClient[account.clientId] ??
                                    (availableCardMachines.length === 1
                                        ? availableCardMachines[0].id
                                        : '');

                                const requiresCardMachine =
                                    selectedPaymentMethod === 'CREDIT' ||
                                    selectedPaymentMethod === 'DEBIT';

                                const selectedCardInstallments =
                                    cardInstallmentsByClient[
                                        account.clientId
                                    ] ?? 1;

                                const selectedCardFeeLabel =
                                    requiresCardMachine && selectedCardMachineId
                                        ? getCardMachineFeeLabel(
                                              selectedCardMachineId,
                                              selectedPaymentMethod,
                                              selectedCardInstallments
                                          )
                                        : '';

                                const serviceOrderIds = new Set(
                                    (account.serviceOrders ?? []).map(
                                        (order) => order.id
                                    )
                                );

                                const productOrderIds = new Set(
                                    (account.productOrders ?? []).map(
                                        (order) => order.id
                                    )
                                );

                                const discountEntriesForAccount =
                                    Object.entries(discountByItem).filter(
                                        ([orderItemId, discount]) => {
                                            if (
                                                !discount ||
                                                !discount.type ||
                                                discount.value <= 0
                                            ) {
                                                return false;
                                            }

                                            const belongsToService = (
                                                account.serviceOrders ?? []
                                            ).some((order) =>
                                                (order.items ?? []).some(
                                                    (item) =>
                                                        item.itemId ===
                                                        orderItemId
                                                )
                                            );

                                            const belongsToProduct = (
                                                account.productOrders ?? []
                                            ).some((order) =>
                                                (order.items ?? []).some(
                                                    (item) =>
                                                        item.itemId ===
                                                        orderItemId
                                                )
                                            );

                                            return (
                                                belongsToService ||
                                                belongsToProduct
                                            );
                                        }
                                    );

                                const totalDiscountPreview =
                                    discountEntriesForAccount.reduce(
                                        (sum, [orderItemId, discount]) => {
                                            const serviceItem = (
                                                account.serviceOrders ?? []
                                            )
                                                .flatMap(
                                                    (order) => order.items ?? []
                                                )
                                                .find(
                                                    (item) =>
                                                        item.itemId ===
                                                        orderItemId
                                                );

                                            const productItem = (
                                                account.productOrders ?? []
                                            )
                                                .flatMap(
                                                    (order) => order.items ?? []
                                                )
                                                .find(
                                                    (item) =>
                                                        item.itemId ===
                                                        orderItemId
                                                );

                                            const item =
                                                serviceItem ?? productItem;
                                            if (!item) return sum;

                                            const originalTotal =
                                                parseBRLLabelToNumber(
                                                    item.totalLabel
                                                );

                                            let discountAmount = 0;

                                            if (discount.type === 'PERCENT') {
                                                discountAmount =
                                                    originalTotal *
                                                    (discount.value / 100);
                                            } else if (
                                                discount.type === 'AMOUNT'
                                            ) {
                                                discountAmount = discount.value;
                                            }

                                            if (
                                                discountAmount > originalTotal
                                            ) {
                                                discountAmount = originalTotal;
                                            }

                                            return sum + discountAmount;
                                        },
                                        0
                                    );

                                const baseTotal = parseBRLLabelToNumber(
                                    account.totalLabel
                                );

                                // 🔥 calcula impacto das assinaturas
                                const subscriptionAdjustment = (
                                    account.serviceOrders ?? []
                                ).reduce((sum, order) => {
                                    const action =
                                        subscriptionActionByOrder[order.id] ??
                                        getDefaultSubscriptionAction(order);

                                    const subscription = order.subscription;

                                    if (!subscription?.hasAvailableSubscription)
                                        return sum;

                                    const orderTotal = parseBRLLabelToNumber(
                                        order.totalLabel
                                    );
                                    const planPrice = Number(
                                        subscription.availableSubscriptionPlanPrice ??
                                            0
                                    );

                                    switch (action) {
                                        case 'USE_ACTIVE':
                                            // serviço vira 0 (usa crédito)
                                            return sum - orderTotal;

                                        case 'JOIN':
                                        case 'RENEW':
                                            // troca valor do serviço pelo valor do plano
                                            return sum - orderTotal + planPrice;

                                        default:
                                            return sum;
                                    }
                                }, 0);

                                const totalWithDiscountPreview = Math.max(
                                    0,
                                    baseTotal +
                                        subscriptionAdjustment -
                                        totalDiscountPreview
                                );

                                const accountTotalIsZero =
                                    Math.abs(totalWithDiscountPreview) < 0.01 &&
                                    accountOriginalTotal >= 0;

                                const formatPreviewBRL = (value: number) =>
                                    new Intl.NumberFormat('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                        minimumFractionDigits: 2,
                                    }).format(value);

                                const checkoutBlockedByPayment =
                                    accountTotalIsZero
                                        ? false
                                        : !selectedPaymentMethod ||
                                          (requiresCardMachine &&
                                              !selectedCardMachineId) ||
                                          (selectedPaymentMethod === 'CREDIT' &&
                                              !selectedCardInstallments);

                                const availableProductsForAccount =
                                    products.filter(
                                        (p) => p.unitId === account.unitId
                                    );

                                return (
                                    <div
                                        key={account.clientId}
                                        className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-paragraph-small text-content-primary truncate">
                                                    Cliente:{' '}
                                                    <span className="font-medium">
                                                        {account.clientLabel}
                                                    </span>
                                                </p>
                                                <p className="text-paragraph-small text-content-secondary">
                                                    Última movimentação em{' '}
                                                    {account.latestLabel}
                                                </p>

                                                <p className="text-paragraph-small text-content-secondary">
                                                    Unidade:{' '}
                                                    <span className="font-medium">
                                                        {account.unitName}
                                                    </span>
                                                </p>

                                                <p className="text-paragraph-small text-content-secondary mt-1">
                                                    <span>
                                                        Serviços:{' '}
                                                        <span className="font-medium">
                                                            {
                                                                account.totalServicesLabel
                                                            }
                                                        </span>
                                                    </span>

                                                    <span className="mx-2">
                                                        •
                                                    </span>

                                                    <span>
                                                        Produtos:{' '}
                                                        <span className="font-medium">
                                                            {
                                                                account.totalProductsLabel
                                                            }
                                                        </span>
                                                    </span>

                                                    <span className="mx-2">
                                                        •
                                                    </span>

                                                    <span>
                                                        Taxas cancelamento:{' '}
                                                        <span className="font-medium">
                                                            {
                                                                account.totalCancellationFeesLabel
                                                            }
                                                        </span>
                                                    </span>
                                                </p>

                                                {account.hasProducts &&
                                                accountProductItems.length >
                                                    0 ? (
                                                    <p className="text-paragraph-small text-content-tertiary mt-1">
                                                        Itens de produto sem
                                                        profissional:{' '}
                                                        <span className="font-medium">
                                                            {
                                                                missingProfessionalCount
                                                            }
                                                        </span>
                                                    </p>
                                                ) : null}
                                            </div>

                                            <div className="flex flex-col gap-1 md:items-end">
                                                {/* mobile: texto + badge na mesma linha (badge à direita) */}
                                                {/* desktop: texto em cima, badge embaixo alinhado à direita */}
                                                <div className="flex items-center justify-between gap-2 md:flex md:flex-col md:items-end md:justify-start">
                                                    <div className="flex flex-col items-start md:items-end">
                                                        <span className="text-paragraph-small font-semibold text-content-primary">
                                                            Total original:{' '}
                                                            {account.totalLabel}
                                                        </span>

                                                        {totalDiscountPreview >
                                                        0 ? (
                                                            <span className="text-xs text-amber-700">
                                                                Desconto:{' '}
                                                                {formatPreviewBRL(
                                                                    totalDiscountPreview
                                                                )}
                                                            </span>
                                                        ) : null}

                                                        {Math.abs(
                                                            totalWithDiscountPreview -
                                                                accountOriginalTotal
                                                        ) > 0.009 ? (
                                                            <span className="text-paragraph-small font-semibold text-green-600">
                                                                Total final:{' '}
                                                                {formatPreviewBRL(
                                                                    totalWithDiscountPreview
                                                                )}
                                                            </span>
                                                        ) : null}
                                                    </div>

                                                    <StatusBadge status="PENDING" />
                                                </div>
                                            </div>
                                        </div>

                                        {account.serviceOrders.length > 0 ? (
                                            <div className="space-y-2 pt-2 border-t border-border-primary">
                                                <p className="text-label-small text-content-secondary">
                                                    Serviços pendentes
                                                </p>

                                                <div className="space-y-2">
                                                    {account.serviceOrders.map(
                                                        (order) => {
                                                            const isOrderBusy =
                                                                payingOrderIds.has(
                                                                    order.id
                                                                );

                                                            const selectedSubscriptionAction =
                                                                subscriptionActionByOrder[
                                                                    order.id
                                                                ] ??
                                                                getDefaultSubscriptionAction(
                                                                    order
                                                                );

                                                            const previewOrderTotal =
                                                                getServiceOrderPreviewTotal(
                                                                    order,
                                                                    selectedSubscriptionAction
                                                                );

                                                            const originalOrderTotal =
                                                                parseBRLLabelToNumber(
                                                                    order.totalLabel
                                                                );

                                                            const orderPreviewChanged =
                                                                Math.abs(
                                                                    previewOrderTotal -
                                                                        originalOrderTotal
                                                                ) > 0.009;

                                                            return (
                                                                <div
                                                                    key={
                                                                        order.id
                                                                    }
                                                                    className={cn(
                                                                        'rounded-lg border border-border-primary bg-background-secondary px-3 py-2',
                                                                        isOrderBusy &&
                                                                            'opacity-70'
                                                                    )}
                                                                >
                                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            <p className="text-paragraph-small text-content-primary truncate">
                                                                                Atendimento
                                                                                #
                                                                                {shortId(
                                                                                    order.id
                                                                                )}
                                                                            </p>

                                                                            {order.appointmentAtLabel ? (
                                                                                <p className="text-paragraph-small text-content-secondary">
                                                                                    Atendimento
                                                                                    em{' '}
                                                                                    {
                                                                                        order.appointmentAtLabel
                                                                                    }
                                                                                </p>
                                                                            ) : null}

                                                                            <p className="text-paragraph-small text-content-secondary">
                                                                                Profissional:{' '}
                                                                                {
                                                                                    order.professionalName
                                                                                }
                                                                            </p>
                                                                        </div>

                                                                        <div className="flex flex-col gap-1 md:items-end">
                                                                            <div className="flex items-center justify-between gap-2 md:flex md:flex-col md:items-end md:justify-start">
                                                                                <span className="text-paragraph-small font-semibold text-content-primary">
                                                                                    {orderPreviewChanged
                                                                                        ? `Original: ${order.totalLabel}`
                                                                                        : order.totalLabel}
                                                                                </span>

                                                                                {orderPreviewChanged ? (
                                                                                    <span className="text-paragraph-small font-semibold text-green-600">
                                                                                        Final:{' '}
                                                                                        {formatPreviewBRL(
                                                                                            previewOrderTotal
                                                                                        )}
                                                                                    </span>
                                                                                ) : null}

                                                                                <StatusBadge
                                                                                    status={
                                                                                        order.status
                                                                                    }
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {Array.isArray(
                                                                        order.items
                                                                    ) &&
                                                                    order.items
                                                                        .length >
                                                                        0 ? (
                                                                        <div className="mt-2 space-y-2 w-full">
                                                                            {order.items.map(
                                                                                (
                                                                                    it
                                                                                ) => (
                                                                                    <div
                                                                                        key={
                                                                                            it.itemId
                                                                                        }
                                                                                        className="w-full rounded-lg border border-border-primary bg-background-tertiary px-3 py-2"
                                                                                    >
                                                                                        <p className="text-paragraph-small text-content-primary truncate">
                                                                                            {
                                                                                                it.qty
                                                                                            }

                                                                                            x{' '}
                                                                                            {
                                                                                                it.name
                                                                                            }
                                                                                        </p>

                                                                                        {(() => {
                                                                                            const originalTotal =
                                                                                                parseBRLLabelToNumber(
                                                                                                    it.totalLabel
                                                                                                );
                                                                                            const discountType =
                                                                                                discountByItem[
                                                                                                    it
                                                                                                        .itemId
                                                                                                ]
                                                                                                    ?.type ??
                                                                                                null;
                                                                                            const discountValue =
                                                                                                Number(
                                                                                                    discountByItem[
                                                                                                        it
                                                                                                            .itemId
                                                                                                    ]
                                                                                                        ?.value ??
                                                                                                        0
                                                                                                );

                                                                                            let discountAmount = 0;

                                                                                            if (
                                                                                                discountType ===
                                                                                                    'PERCENT' &&
                                                                                                discountValue >
                                                                                                    0
                                                                                            ) {
                                                                                                discountAmount =
                                                                                                    originalTotal *
                                                                                                    (discountValue /
                                                                                                        100);
                                                                                            } else if (
                                                                                                discountType ===
                                                                                                    'AMOUNT' &&
                                                                                                discountValue >
                                                                                                    0
                                                                                            ) {
                                                                                                discountAmount =
                                                                                                    discountValue;
                                                                                            }

                                                                                            if (
                                                                                                discountAmount >
                                                                                                originalTotal
                                                                                            ) {
                                                                                                discountAmount =
                                                                                                    originalTotal;
                                                                                            }

                                                                                            const finalTotal =
                                                                                                Math.max(
                                                                                                    0,
                                                                                                    originalTotal -
                                                                                                        discountAmount
                                                                                                );

                                                                                            const formatPreviewBRL =
                                                                                                (
                                                                                                    value: number
                                                                                                ) =>
                                                                                                    new Intl.NumberFormat(
                                                                                                        'pt-BR',
                                                                                                        {
                                                                                                            style: 'currency',
                                                                                                            currency:
                                                                                                                'BRL',
                                                                                                            minimumFractionDigits: 2,
                                                                                                        }
                                                                                                    ).format(
                                                                                                        value
                                                                                                    );

                                                                                            return (
                                                                                                <>
                                                                                                    <p className="text-paragraph-small text-content-secondary">
                                                                                                        Total
                                                                                                        original:{' '}
                                                                                                        <span className="font-medium text-content-primary">
                                                                                                            {formatPreviewBRL(
                                                                                                                originalTotal
                                                                                                            )}
                                                                                                        </span>
                                                                                                    </p>

                                                                                                    {discountAmount >
                                                                                                    0 ? (
                                                                                                        <>
                                                                                                            <p className="text-xs text-amber-700">
                                                                                                                Desconto
                                                                                                                aplicado:{' '}
                                                                                                                <span className="font-medium">
                                                                                                                    {formatPreviewBRL(
                                                                                                                        discountAmount
                                                                                                                    )}
                                                                                                                </span>
                                                                                                            </p>

                                                                                                            <p className="text-paragraph-small text-content-secondary">
                                                                                                                Total
                                                                                                                final:{' '}
                                                                                                                <span className="font-semibold text-green-600">
                                                                                                                    {formatPreviewBRL(
                                                                                                                        finalTotal
                                                                                                                    )}
                                                                                                                </span>
                                                                                                            </p>
                                                                                                        </>
                                                                                                    ) : null}
                                                                                                </>
                                                                                            );
                                                                                        })()}

                                                                                        {it.professionalName ? (
                                                                                            <p className="text-xs text-content-tertiary mt-1">
                                                                                                Profissional:{' '}
                                                                                                <span className="font-medium text-content-secondary">
                                                                                                    {
                                                                                                        it.professionalName
                                                                                                    }
                                                                                                </span>
                                                                                            </p>
                                                                                        ) : null}

                                                                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                                                                            <select
                                                                                                value={
                                                                                                    discountByItem[
                                                                                                        it
                                                                                                            .itemId
                                                                                                    ]
                                                                                                        ?.type ??
                                                                                                    ''
                                                                                                }
                                                                                                onChange={(
                                                                                                    e
                                                                                                ) => {
                                                                                                    const type =
                                                                                                        e
                                                                                                            .target
                                                                                                            .value as
                                                                                                            | 'PERCENT'
                                                                                                            | 'AMOUNT'
                                                                                                            | '';

                                                                                                    setDiscountByItem(
                                                                                                        (
                                                                                                            prev
                                                                                                        ) => ({
                                                                                                            ...prev,
                                                                                                            [it.itemId]:
                                                                                                                {
                                                                                                                    ...(prev[
                                                                                                                        it
                                                                                                                            .itemId
                                                                                                                    ] ??
                                                                                                                        {}),
                                                                                                                    type:
                                                                                                                        type ||
                                                                                                                        null,
                                                                                                                    value:
                                                                                                                        prev[
                                                                                                                            it
                                                                                                                                .itemId
                                                                                                                        ]
                                                                                                                            ?.value ??
                                                                                                                        0,
                                                                                                                    reason:
                                                                                                                        prev[
                                                                                                                            it
                                                                                                                                .itemId
                                                                                                                        ]
                                                                                                                            ?.reason ??
                                                                                                                        null,
                                                                                                                },
                                                                                                        })
                                                                                                    );
                                                                                                }}
                                                                                                className="h-8 rounded-md border border-border-primary bg-background-secondary px-2 text-xs text-content-primary"
                                                                                            >
                                                                                                <option value="">
                                                                                                    Sem
                                                                                                    desconto
                                                                                                </option>
                                                                                                <option value="PERCENT">
                                                                                                    %
                                                                                                </option>
                                                                                                <option value="AMOUNT">
                                                                                                    R$
                                                                                                </option>
                                                                                            </select>

                                                                                            <input
                                                                                                type="number"
                                                                                                min={
                                                                                                    0
                                                                                                }
                                                                                                step="0.01"
                                                                                                value={
                                                                                                    discountByItem[
                                                                                                        it
                                                                                                            .itemId
                                                                                                    ]
                                                                                                        ?.value ??
                                                                                                    ''
                                                                                                }
                                                                                                onChange={(
                                                                                                    e
                                                                                                ) => {
                                                                                                    const value =
                                                                                                        Number(
                                                                                                            e
                                                                                                                .target
                                                                                                                .value
                                                                                                        );

                                                                                                    setDiscountByItem(
                                                                                                        (
                                                                                                            prev
                                                                                                        ) => ({
                                                                                                            ...prev,
                                                                                                            [it.itemId]:
                                                                                                                {
                                                                                                                    ...(prev[
                                                                                                                        it
                                                                                                                            .itemId
                                                                                                                    ] ??
                                                                                                                        {}),
                                                                                                                    type:
                                                                                                                        prev[
                                                                                                                            it
                                                                                                                                .itemId
                                                                                                                        ]
                                                                                                                            ?.type ??
                                                                                                                        null,
                                                                                                                    value: Number.isFinite(
                                                                                                                        value
                                                                                                                    )
                                                                                                                        ? value
                                                                                                                        : 0,
                                                                                                                    reason:
                                                                                                                        prev[
                                                                                                                            it
                                                                                                                                .itemId
                                                                                                                        ]
                                                                                                                            ?.reason ??
                                                                                                                        null,
                                                                                                                },
                                                                                                        })
                                                                                                    );
                                                                                                }}
                                                                                                placeholder="Valor"
                                                                                                className="h-8 w-24 rounded-md border border-border-primary bg-background-secondary px-2 text-xs text-content-primary"
                                                                                            />

                                                                                            <input
                                                                                                type="text"
                                                                                                value={
                                                                                                    discountByItem[
                                                                                                        it
                                                                                                            .itemId
                                                                                                    ]
                                                                                                        ?.reason ??
                                                                                                    ''
                                                                                                }
                                                                                                onChange={(
                                                                                                    e
                                                                                                ) => {
                                                                                                    const reason =
                                                                                                        e
                                                                                                            .target
                                                                                                            .value;

                                                                                                    setDiscountByItem(
                                                                                                        (
                                                                                                            prev
                                                                                                        ) => ({
                                                                                                            ...prev,
                                                                                                            [it.itemId]:
                                                                                                                {
                                                                                                                    ...(prev[
                                                                                                                        it
                                                                                                                            .itemId
                                                                                                                    ] ??
                                                                                                                        {}),
                                                                                                                    type:
                                                                                                                        prev[
                                                                                                                            it
                                                                                                                                .itemId
                                                                                                                        ]
                                                                                                                            ?.type ??
                                                                                                                        null,
                                                                                                                    value:
                                                                                                                        prev[
                                                                                                                            it
                                                                                                                                .itemId
                                                                                                                        ]
                                                                                                                            ?.value ??
                                                                                                                        0,
                                                                                                                    reason:
                                                                                                                        reason ||
                                                                                                                        null,
                                                                                                                },
                                                                                                        })
                                                                                                    );
                                                                                                }}
                                                                                                placeholder="Motivo"
                                                                                                className="h-8 w-36 rounded-md border border-border-primary bg-background-secondary px-2 text-xs text-content-primary"
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                )
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <p className="mt-2 text-paragraph-small text-content-secondary">
                                                                            Serviços:{' '}
                                                                            {
                                                                                order.itemsLabel
                                                                            }
                                                                        </p>
                                                                    )}

                                                                    {order.usesPlanCredit ? (
                                                                        <div className="mt-1 space-y-1">
                                                                            <p className="text-xs text-content-tertiary">
                                                                                Plano:{' '}
                                                                                <span className="font-medium text-content-secondary">
                                                                                    {order.planName ??
                                                                                        'Plano'}
                                                                                </span>
                                                                            </p>
                                                                            <p className="text-xs text-content-tertiary">
                                                                                Créditos:{' '}
                                                                                <span className="font-medium text-content-secondary">
                                                                                    {order.planCreditStatusLabel ??
                                                                                        '—'}
                                                                                </span>
                                                                            </p>
                                                                        </div>
                                                                    ) : null}

                                                                    {order
                                                                        .subscription
                                                                        ?.hasAvailableSubscription ? (
                                                                        <div className="mt-2 rounded-lg border border-border-primary bg-background-tertiary px-3 py-2 space-y-2">
                                                                            <div className="space-y-1">
                                                                                <p className="text-xs text-content-secondary">
                                                                                    Assinatura
                                                                                    disponível:{' '}
                                                                                    <span className="font-medium text-content-primary">
                                                                                        {order
                                                                                            .subscription
                                                                                            .availableSubscriptionPlanName ??
                                                                                            'Assinatura'}
                                                                                    </span>
                                                                                </p>

                                                                                {order
                                                                                    .subscription
                                                                                    .availableSubscriptionPlanPriceLabel ? (
                                                                                    <p className="text-xs text-content-secondary">
                                                                                        Valor:{' '}
                                                                                        <span className="font-medium text-content-primary">
                                                                                            {
                                                                                                order
                                                                                                    .subscription
                                                                                                    .availableSubscriptionPlanPriceLabel
                                                                                            }
                                                                                        </span>
                                                                                    </p>
                                                                                ) : null}

                                                                                <p className="text-xs text-content-secondary">
                                                                                    Status
                                                                                    do
                                                                                    cliente:{' '}
                                                                                    <span className="font-medium text-content-primary">
                                                                                        {order
                                                                                            .subscription
                                                                                            .clientSubscriptionStatus ===
                                                                                        'ACTIVE'
                                                                                            ? 'Assinatura ativa'
                                                                                            : order
                                                                                                    .subscription
                                                                                                    .clientSubscriptionStatus ===
                                                                                                'EXPIRED'
                                                                                              ? 'Assinatura expirada'
                                                                                              : 'Nunca aderiu'}
                                                                                    </span>
                                                                                </p>

                                                                                {order
                                                                                    .subscription
                                                                                    .clientSubscriptionStatus ===
                                                                                    'ACTIVE' &&
                                                                                order
                                                                                    .subscription
                                                                                    .activeCreditsTotal !=
                                                                                    null ? (
                                                                                    <p className="text-xs text-content-secondary">
                                                                                        Créditos
                                                                                        ativos:{' '}
                                                                                        <span className="font-medium text-content-primary">
                                                                                            {order
                                                                                                .subscription
                                                                                                .activeCreditsUsed ??
                                                                                                0}

                                                                                            /
                                                                                            {order
                                                                                                .subscription
                                                                                                .activeCreditsTotal ??
                                                                                                0}
                                                                                            {
                                                                                                ' • '
                                                                                            }
                                                                                            restantes:{' '}
                                                                                            {order
                                                                                                .subscription
                                                                                                .activeCreditsRemaining ??
                                                                                                0}
                                                                                        </span>
                                                                                    </p>
                                                                                ) : null}
                                                                            </div>

                                                                            {(order
                                                                                .subscription
                                                                                .canUseActiveSubscription ||
                                                                                order
                                                                                    .subscription
                                                                                    .canRenewSubscription ||
                                                                                order
                                                                                    .subscription
                                                                                    .canJoinSubscription) &&
                                                                            !order.usesPlanCredit ? (
                                                                                <div className="space-y-1">
                                                                                    <label className="text-xs text-content-secondary">
                                                                                        Como
                                                                                        deseja
                                                                                        fechar
                                                                                        este
                                                                                        atendimento?
                                                                                    </label>

                                                                                    <select
                                                                                        value={
                                                                                            selectedSubscriptionAction
                                                                                        }
                                                                                        onChange={(
                                                                                            e
                                                                                        ) =>
                                                                                            setSubscriptionActionByOrder(
                                                                                                (
                                                                                                    prev
                                                                                                ) => ({
                                                                                                    ...prev,
                                                                                                    [order.id]:
                                                                                                        e
                                                                                                            .target
                                                                                                            .value as SubscriptionCheckoutAction,
                                                                                                })
                                                                                            )
                                                                                        }
                                                                                        className="h-9 rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary"
                                                                                        disabled={
                                                                                            isBusyGlobal ||
                                                                                            isPaying ||
                                                                                            anyOrderBusy
                                                                                        }
                                                                                    >
                                                                                        <option value="NONE">
                                                                                            Cobrar
                                                                                            avulso
                                                                                        </option>

                                                                                        {order
                                                                                            .subscription
                                                                                            .canUseActiveSubscription ? (
                                                                                            <option value="USE_ACTIVE">
                                                                                                Usar
                                                                                                assinatura
                                                                                                ativa
                                                                                            </option>
                                                                                        ) : null}

                                                                                        {order
                                                                                            .subscription
                                                                                            .canRenewSubscription ? (
                                                                                            <option value="RENEW">
                                                                                                Renovar
                                                                                                assinatura
                                                                                            </option>
                                                                                        ) : null}

                                                                                        {order
                                                                                            .subscription
                                                                                            .canJoinSubscription ? (
                                                                                            <option value="JOIN">
                                                                                                Aderir
                                                                                                à
                                                                                                assinatura
                                                                                            </option>
                                                                                        ) : null}
                                                                                    </select>

                                                                                    <p className="text-[11px] text-content-tertiary">
                                                                                        Seleção
                                                                                        atual:{' '}
                                                                                        {getSubscriptionActionLabel(
                                                                                            selectedSubscriptionAction
                                                                                        )}
                                                                                    </p>
                                                                                </div>
                                                                            ) : null}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            );
                                                        }
                                                    )}
                                                </div>
                                            </div>
                                        ) : null}

                                        {account.productOrders.length > 0 ? (
                                            <div className="space-y-2 pt-2 border-t border-border-primary">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-label-small text-content-secondary">
                                                            Produtos na conta
                                                        </p>
                                                        <p className="text-xs text-content-tertiary">
                                                            Remova item por item
                                                            e atribua o
                                                            profissional da
                                                            venda.
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    {account.productOrders.map(
                                                        (order) => {
                                                            const isOrderBusy =
                                                                payingOrderIds.has(
                                                                    order.id
                                                                );

                                                            const items =
                                                                order.items &&
                                                                Array.isArray(
                                                                    order.items
                                                                )
                                                                    ? order.items
                                                                    : [];

                                                            const fallbackLines =
                                                                items.length ===
                                                                0
                                                                    ? splitItemsLabel(
                                                                          order.itemsLabel
                                                                      )
                                                                    : [];

                                                            return (
                                                                <div
                                                                    key={
                                                                        order.id
                                                                    }
                                                                    className={cn(
                                                                        'rounded-lg border border-border-primary bg-background-secondary px-3 py-2',
                                                                        isOrderBusy &&
                                                                            'opacity-70'
                                                                    )}
                                                                >
                                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            <p className="text-paragraph-small text-content-primary truncate">
                                                                                Pedido
                                                                                #
                                                                                {shortId(
                                                                                    order.id
                                                                                )}
                                                                            </p>
                                                                            <p className="text-paragraph-small text-content-secondary">
                                                                                Criado
                                                                                em{' '}
                                                                                {
                                                                                    order.createdAtLabel
                                                                                }
                                                                            </p>
                                                                        </div>

                                                                        <div className="flex flex-col items-end gap-1">
                                                                            <span className="text-paragraph-small font-semibold text-content-primary">
                                                                                {
                                                                                    order.totalLabel
                                                                                }
                                                                            </span>
                                                                            <StatusBadge
                                                                                status={
                                                                                    order.status
                                                                                }
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    {/* ✅ blocos por produto (com botão individual + profissional) */}
                                                                    {items.length >
                                                                    0 ? (
                                                                        <div className="mt-3 space-y-2">
                                                                            {items.map(
                                                                                (
                                                                                    it
                                                                                ) => {
                                                                                    const isRemoving =
                                                                                        removingItemIds.has(
                                                                                            it.itemId
                                                                                        );
                                                                                    const isAssigning =
                                                                                        assigningItemIds.has(
                                                                                            it.itemId
                                                                                        );

                                                                                    const disabled =
                                                                                        isOrderBusy ||
                                                                                        isRemoving ||
                                                                                        isAssigning ||
                                                                                        Boolean(
                                                                                            payingClientId
                                                                                        ) ||
                                                                                        Boolean(
                                                                                            cancelingClientId
                                                                                        ) ||
                                                                                        Boolean(
                                                                                            addingProductForClientId
                                                                                        );

                                                                                    const currentSelection =
                                                                                        selectedProfessionalByItem[
                                                                                            it
                                                                                                .itemId
                                                                                        ] ??
                                                                                        String(
                                                                                            it.professionalId ??
                                                                                                ''
                                                                                        );

                                                                                    const selectIsDisabled =
                                                                                        disabled ||
                                                                                        professionalsLoading;

                                                                                    const hasAssigned =
                                                                                        Boolean(
                                                                                            String(
                                                                                                it.professionalId ??
                                                                                                    ''
                                                                                            ).trim()
                                                                                        );

                                                                                    return (
                                                                                        <div
                                                                                            key={
                                                                                                it.itemId
                                                                                            }
                                                                                            className={cn(
                                                                                                'rounded-lg border border-border-primary bg-background-tertiary px-3 py-2',
                                                                                                (isRemoving ||
                                                                                                    isAssigning) &&
                                                                                                    'opacity-70'
                                                                                            )}
                                                                                        >
                                                                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                                                                <div className="min-w-0">
                                                                                                    <p className="text-paragraph-small text-content-primary truncate">
                                                                                                        {
                                                                                                            it.qty
                                                                                                        }

                                                                                                        x{' '}
                                                                                                        {
                                                                                                            it.name
                                                                                                        }
                                                                                                    </p>
                                                                                                    {(() => {
                                                                                                        const originalTotal =
                                                                                                            parseBRLLabelToNumber(
                                                                                                                it.totalLabel
                                                                                                            );
                                                                                                        const discountType =
                                                                                                            discountByItem[
                                                                                                                it
                                                                                                                    .itemId
                                                                                                            ]
                                                                                                                ?.type ??
                                                                                                            null;
                                                                                                        const discountValue =
                                                                                                            Number(
                                                                                                                discountByItem[
                                                                                                                    it
                                                                                                                        .itemId
                                                                                                                ]
                                                                                                                    ?.value ??
                                                                                                                    0
                                                                                                            );

                                                                                                        let discountAmount = 0;

                                                                                                        if (
                                                                                                            discountType ===
                                                                                                                'PERCENT' &&
                                                                                                            discountValue >
                                                                                                                0
                                                                                                        ) {
                                                                                                            discountAmount =
                                                                                                                originalTotal *
                                                                                                                (discountValue /
                                                                                                                    100);
                                                                                                        } else if (
                                                                                                            discountType ===
                                                                                                                'AMOUNT' &&
                                                                                                            discountValue >
                                                                                                                0
                                                                                                        ) {
                                                                                                            discountAmount =
                                                                                                                discountValue;
                                                                                                        }

                                                                                                        if (
                                                                                                            discountAmount >
                                                                                                            originalTotal
                                                                                                        ) {
                                                                                                            discountAmount =
                                                                                                                originalTotal;
                                                                                                        }

                                                                                                        const finalTotal =
                                                                                                            Math.max(
                                                                                                                0,
                                                                                                                originalTotal -
                                                                                                                    discountAmount
                                                                                                            );

                                                                                                        const formatPreviewBRL =
                                                                                                            (
                                                                                                                value: number
                                                                                                            ) =>
                                                                                                                new Intl.NumberFormat(
                                                                                                                    'pt-BR',
                                                                                                                    {
                                                                                                                        style: 'currency',
                                                                                                                        currency:
                                                                                                                            'BRL',
                                                                                                                        minimumFractionDigits: 2,
                                                                                                                    }
                                                                                                                ).format(
                                                                                                                    value
                                                                                                                );

                                                                                                        return (
                                                                                                            <>
                                                                                                                <p className="text-paragraph-small text-content-secondary">
                                                                                                                    Total
                                                                                                                    original:{' '}
                                                                                                                    <span className="font-medium text-content-primary">
                                                                                                                        {formatPreviewBRL(
                                                                                                                            originalTotal
                                                                                                                        )}
                                                                                                                    </span>
                                                                                                                </p>

                                                                                                                {discountAmount >
                                                                                                                0 ? (
                                                                                                                    <>
                                                                                                                        <p className="text-xs text-amber-700">
                                                                                                                            Desconto
                                                                                                                            aplicado:{' '}
                                                                                                                            <span className="font-medium">
                                                                                                                                {formatPreviewBRL(
                                                                                                                                    discountAmount
                                                                                                                                )}
                                                                                                                            </span>
                                                                                                                        </p>

                                                                                                                        <p className="text-paragraph-small text-content-secondary">
                                                                                                                            Total
                                                                                                                            final:{' '}
                                                                                                                            <span className="font-semibold text-green-600">
                                                                                                                                {formatPreviewBRL(
                                                                                                                                    finalTotal
                                                                                                                                )}
                                                                                                                            </span>
                                                                                                                        </p>
                                                                                                                    </>
                                                                                                                ) : null}
                                                                                                            </>
                                                                                                        );
                                                                                                    })()}

                                                                                                    {it.professionalName ? (
                                                                                                        <p className="text-xs text-content-tertiary mt-1">
                                                                                                            Profissional
                                                                                                            atual:{' '}
                                                                                                            <span className="font-medium text-content-secondary">
                                                                                                                {
                                                                                                                    it.professionalName
                                                                                                                }
                                                                                                            </span>
                                                                                                        </p>
                                                                                                    ) : null}

                                                                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                                                                        <select
                                                                                                            value={
                                                                                                                discountByItem[
                                                                                                                    it
                                                                                                                        .itemId
                                                                                                                ]
                                                                                                                    ?.type ??
                                                                                                                ''
                                                                                                            }
                                                                                                            onChange={(
                                                                                                                e
                                                                                                            ) => {
                                                                                                                const type =
                                                                                                                    e
                                                                                                                        .target
                                                                                                                        .value as
                                                                                                                        | 'PERCENT'
                                                                                                                        | 'AMOUNT'
                                                                                                                        | '';
                                                                                                                setDiscountByItem(
                                                                                                                    (
                                                                                                                        prev
                                                                                                                    ) => ({
                                                                                                                        ...prev,
                                                                                                                        [it.itemId]:
                                                                                                                            {
                                                                                                                                ...(prev[
                                                                                                                                    it
                                                                                                                                        .itemId
                                                                                                                                ] ??
                                                                                                                                    {}),
                                                                                                                                type:
                                                                                                                                    type ||
                                                                                                                                    null,
                                                                                                                                value:
                                                                                                                                    prev[
                                                                                                                                        it
                                                                                                                                            .itemId
                                                                                                                                    ]
                                                                                                                                        ?.value ??
                                                                                                                                    0,
                                                                                                                                reason:
                                                                                                                                    prev[
                                                                                                                                        it
                                                                                                                                            .itemId
                                                                                                                                    ]
                                                                                                                                        ?.reason ??
                                                                                                                                    null,
                                                                                                                            },
                                                                                                                    })
                                                                                                                );
                                                                                                            }}
                                                                                                            className="h-8 rounded-md border border-border-primary bg-background-secondary px-2 text-xs text-content-primary"
                                                                                                        >
                                                                                                            <option value="">
                                                                                                                Sem
                                                                                                                desconto
                                                                                                            </option>
                                                                                                            <option value="PERCENT">
                                                                                                                %
                                                                                                            </option>
                                                                                                            <option value="AMOUNT">
                                                                                                                R$
                                                                                                            </option>
                                                                                                        </select>

                                                                                                        <input
                                                                                                            type="number"
                                                                                                            min={
                                                                                                                0
                                                                                                            }
                                                                                                            step="0.01"
                                                                                                            value={
                                                                                                                discountByItem[
                                                                                                                    it
                                                                                                                        .itemId
                                                                                                                ]
                                                                                                                    ?.value ??
                                                                                                                ''
                                                                                                            }
                                                                                                            onChange={(
                                                                                                                e
                                                                                                            ) => {
                                                                                                                const value =
                                                                                                                    Number(
                                                                                                                        e
                                                                                                                            .target
                                                                                                                            .value
                                                                                                                    );
                                                                                                                setDiscountByItem(
                                                                                                                    (
                                                                                                                        prev
                                                                                                                    ) => ({
                                                                                                                        ...prev,
                                                                                                                        [it.itemId]:
                                                                                                                            {
                                                                                                                                ...(prev[
                                                                                                                                    it
                                                                                                                                        .itemId
                                                                                                                                ] ??
                                                                                                                                    {}),
                                                                                                                                type:
                                                                                                                                    prev[
                                                                                                                                        it
                                                                                                                                            .itemId
                                                                                                                                    ]
                                                                                                                                        ?.type ??
                                                                                                                                    null,
                                                                                                                                value: Number.isFinite(
                                                                                                                                    value
                                                                                                                                )
                                                                                                                                    ? value
                                                                                                                                    : 0,
                                                                                                                                reason:
                                                                                                                                    prev[
                                                                                                                                        it
                                                                                                                                            .itemId
                                                                                                                                    ]
                                                                                                                                        ?.reason ??
                                                                                                                                    null,
                                                                                                                            },
                                                                                                                    })
                                                                                                                );
                                                                                                            }}
                                                                                                            placeholder="Valor"
                                                                                                            className="h-8 w-24 rounded-md border border-border-primary bg-background-secondary px-2 text-xs text-content-primary"
                                                                                                        />

                                                                                                        <input
                                                                                                            type="text"
                                                                                                            value={
                                                                                                                discountByItem[
                                                                                                                    it
                                                                                                                        .itemId
                                                                                                                ]
                                                                                                                    ?.reason ??
                                                                                                                ''
                                                                                                            }
                                                                                                            onChange={(
                                                                                                                e
                                                                                                            ) => {
                                                                                                                const reason =
                                                                                                                    e
                                                                                                                        .target
                                                                                                                        .value;
                                                                                                                setDiscountByItem(
                                                                                                                    (
                                                                                                                        prev
                                                                                                                    ) => ({
                                                                                                                        ...prev,
                                                                                                                        [it.itemId]:
                                                                                                                            {
                                                                                                                                ...(prev[
                                                                                                                                    it
                                                                                                                                        .itemId
                                                                                                                                ] ??
                                                                                                                                    {}),
                                                                                                                                type:
                                                                                                                                    prev[
                                                                                                                                        it
                                                                                                                                            .itemId
                                                                                                                                    ]
                                                                                                                                        ?.type ??
                                                                                                                                    null,
                                                                                                                                value:
                                                                                                                                    prev[
                                                                                                                                        it
                                                                                                                                            .itemId
                                                                                                                                    ]
                                                                                                                                        ?.value ??
                                                                                                                                    0,
                                                                                                                                reason:
                                                                                                                                    reason ||
                                                                                                                                    null,
                                                                                                                            },
                                                                                                                    })
                                                                                                                );
                                                                                                            }}
                                                                                                            placeholder="Motivo"
                                                                                                            className="h-8 w-36 rounded-md border border-border-primary bg-background-secondary px-2 text-xs text-content-primary"
                                                                                                        />
                                                                                                    </div>
                                                                                                </div>

                                                                                                <div className="flex flex-wrap items-center gap-2 justify-end">
                                                                                                    {account.hasProducts ? (
                                                                                                        <>
                                                                                                            <select
                                                                                                                value={
                                                                                                                    currentSelection
                                                                                                                }
                                                                                                                onChange={(
                                                                                                                    e
                                                                                                                ) => {
                                                                                                                    const nextProfessionalId =
                                                                                                                        e
                                                                                                                            .target
                                                                                                                            .value;

                                                                                                                    // mantém o select controlado
                                                                                                                    setSelectedProfessionalByItem(
                                                                                                                        (
                                                                                                                            prev
                                                                                                                        ) => ({
                                                                                                                            ...prev,
                                                                                                                            [it.itemId]:
                                                                                                                                nextProfessionalId,
                                                                                                                        })
                                                                                                                    );

                                                                                                                    // salva automático quando selecionar
                                                                                                                    const pid =
                                                                                                                        String(
                                                                                                                            nextProfessionalId ??
                                                                                                                                ''
                                                                                                                        ).trim();
                                                                                                                    if (
                                                                                                                        !pid
                                                                                                                    )
                                                                                                                        return;

                                                                                                                    handleAssignProfessionalForItem(
                                                                                                                        order.id,
                                                                                                                        it,
                                                                                                                        pid
                                                                                                                    );
                                                                                                                }}
                                                                                                                className={cn(
                                                                                                                    'h-9 rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary',
                                                                                                                    !hasAssigned &&
                                                                                                                        'border-amber-500/40'
                                                                                                                )}
                                                                                                                disabled={
                                                                                                                    selectIsDisabled
                                                                                                                }
                                                                                                                title={
                                                                                                                    professionals.length ===
                                                                                                                    0
                                                                                                                        ? 'Sem profissionais disponíveis'
                                                                                                                        : undefined
                                                                                                                }
                                                                                                            >
                                                                                                                <option value="">
                                                                                                                    {professionalsLoading
                                                                                                                        ? 'Carregando...'
                                                                                                                        : professionals.length ===
                                                                                                                            0
                                                                                                                          ? 'Sem profissionais'
                                                                                                                          : 'Selecione o profissional'}
                                                                                                                </option>
                                                                                                                {professionals.map(
                                                                                                                    (
                                                                                                                        p
                                                                                                                    ) => (
                                                                                                                        <option
                                                                                                                            key={
                                                                                                                                p.id
                                                                                                                            }
                                                                                                                            value={
                                                                                                                                p.id
                                                                                                                            }
                                                                                                                            disabled={
                                                                                                                                !p.isActive
                                                                                                                            }
                                                                                                                        >
                                                                                                                            {
                                                                                                                                p.name
                                                                                                                            }
                                                                                                                            {!p.isActive
                                                                                                                                ? ' (inativo)'
                                                                                                                                : ''}
                                                                                                                        </option>
                                                                                                                    )
                                                                                                                )}
                                                                                                            </select>
                                                                                                        </>
                                                                                                    ) : null}

                                                                                                    <Button
                                                                                                        type="button"
                                                                                                        variant="outline"
                                                                                                        size="sm"
                                                                                                        className="text-red-500 border-red-500/40 hover:bg-red-500/5"
                                                                                                        onClick={() =>
                                                                                                            handleRemoveProductItem(
                                                                                                                order.id,
                                                                                                                it
                                                                                                            )
                                                                                                        }
                                                                                                        disabled={
                                                                                                            disabled
                                                                                                        }
                                                                                                        title={
                                                                                                            disabled
                                                                                                                ? 'Processando...'
                                                                                                                : 'Remover este produto'
                                                                                                        }
                                                                                                    >
                                                                                                        {isRemoving
                                                                                                            ? 'Removendo...'
                                                                                                            : 'Remover'}
                                                                                                    </Button>
                                                                                                </div>
                                                                                            </div>

                                                                                            {account.hasProducts &&
                                                                                            !hasAssigned ? (
                                                                                                <p className="mt-2 text-xs text-amber-700">
                                                                                                    Selecione
                                                                                                    o
                                                                                                    profissional
                                                                                                    para
                                                                                                    liberar
                                                                                                    o
                                                                                                    checkout
                                                                                                    desta
                                                                                                    conta.
                                                                                                </p>
                                                                                            ) : null}
                                                                                        </div>
                                                                                    );
                                                                                }
                                                                            )}
                                                                        </div>
                                                                    ) : fallbackLines.length >
                                                                      0 ? (
                                                                        // compat visual (sem botão individual, porque não tem itemId)
                                                                        <div className="mt-2">
                                                                            <p className="text-paragraph-small text-content-secondary">
                                                                                Itens:
                                                                            </p>
                                                                            <ul className="pl-4 list-disc space-y-0.5">
                                                                                {fallbackLines.map(
                                                                                    (
                                                                                        line,
                                                                                        idx
                                                                                    ) => (
                                                                                        <li
                                                                                            key={`${order.id}:${idx}`}
                                                                                            className="text-paragraph-small text-content-secondary"
                                                                                        >
                                                                                            {
                                                                                                line
                                                                                            }
                                                                                        </li>
                                                                                    )
                                                                                )}
                                                                            </ul>

                                                                            <div className="mt-2">
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="outline"
                                                                                    size="sm"
                                                                                    className="text-red-500 border-red-500/40 hover:bg-red-500/5"
                                                                                    onClick={() =>
                                                                                        handleCancelProductOrder(
                                                                                            order.id
                                                                                        )
                                                                                    }
                                                                                    disabled={
                                                                                        isOrderBusy ||
                                                                                        Boolean(
                                                                                            payingClientId
                                                                                        ) ||
                                                                                        Boolean(
                                                                                            cancelingClientId
                                                                                        ) ||
                                                                                        Boolean(
                                                                                            addingProductForClientId
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    {isOrderBusy
                                                                                        ? 'Processando...'
                                                                                        : 'Cancelar pedido'}
                                                                                </Button>
                                                                            </div>

                                                                            {account.hasProducts ? (
                                                                                <p className="mt-2 text-xs text-content-tertiary">
                                                                                    Para
                                                                                    atribuir
                                                                                    profissional
                                                                                    por
                                                                                    produto,
                                                                                    o
                                                                                    backend
                                                                                    precisa
                                                                                    enviar{' '}
                                                                                    <span className="font-medium">
                                                                                        items[]
                                                                                    </span>{' '}
                                                                                    com{' '}
                                                                                    <span className="font-medium">
                                                                                        itemId
                                                                                    </span>

                                                                                    .
                                                                                </p>
                                                                            ) : null}
                                                                        </div>
                                                                    ) : (
                                                                        <p className="mt-2 text-paragraph-small text-content-secondary">
                                                                            Itens:{' '}
                                                                            {
                                                                                '—'
                                                                            }
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            );
                                                        }
                                                    )}
                                                </div>
                                            </div>
                                        ) : null}

                                        {account.cancellationFeeOrders.length >
                                        0 ? (
                                            <div className="space-y-2 pt-2 border-t border-border-primary">
                                                <div>
                                                    <p className="text-label-small text-content-secondary">
                                                        Taxas de cancelamento na
                                                        conta
                                                    </p>
                                                    <p className="text-xs text-content-tertiary">
                                                        Estes valores foram
                                                        adicionados ao total da
                                                        conta.
                                                    </p>
                                                </div>

                                                <div className="space-y-2">
                                                    {account.cancellationFeeOrders.map(
                                                        (order) => {
                                                            const isOrderBusy =
                                                                payingOrderIds.has(
                                                                    order.id
                                                                );
                                                            const items =
                                                                order.items &&
                                                                Array.isArray(
                                                                    order.items
                                                                )
                                                                    ? order.items
                                                                    : [];

                                                            const fallbackLines =
                                                                items.length ===
                                                                0
                                                                    ? splitItemsLabel(
                                                                          order.itemsLabel
                                                                      )
                                                                    : [];

                                                            return (
                                                                <div
                                                                    key={
                                                                        order.id
                                                                    }
                                                                    className={cn(
                                                                        'rounded-lg border border-border-primary bg-background-secondary px-3 py-2',
                                                                        isOrderBusy &&
                                                                            'opacity-70'
                                                                    )}
                                                                >
                                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            <p className="text-paragraph-small text-content-primary truncate">
                                                                                Taxa
                                                                                de
                                                                                cancelamento
                                                                                •
                                                                                pedido
                                                                                #
                                                                                {shortId(
                                                                                    order.id
                                                                                )}
                                                                            </p>
                                                                            <p className="text-paragraph-small text-content-secondary">
                                                                                Criado
                                                                                em{' '}
                                                                                {
                                                                                    order.createdAtLabel
                                                                                }
                                                                            </p>
                                                                        </div>

                                                                        <div className="flex flex-col items-end gap-1">
                                                                            <span className="text-paragraph-small font-semibold text-content-primary">
                                                                                {
                                                                                    order.totalLabel
                                                                                }
                                                                            </span>
                                                                            <StatusBadge
                                                                                status={
                                                                                    order.status
                                                                                }
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    {items.length >
                                                                    0 ? (
                                                                        <div className="mt-3 space-y-2">
                                                                            {items.map(
                                                                                (
                                                                                    it
                                                                                ) => (
                                                                                    <div
                                                                                        key={
                                                                                            it.itemId
                                                                                        }
                                                                                        className="rounded-lg border border-border-primary bg-background-tertiary px-3 py-2"
                                                                                    >
                                                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                                                            <div className="min-w-0">
                                                                                                <p className="text-paragraph-small text-content-primary">
                                                                                                    {
                                                                                                        it.description
                                                                                                    }
                                                                                                </p>

                                                                                                {it.feePercentageLabel ? (
                                                                                                    <p className="text-paragraph-small text-content-secondary">
                                                                                                        Percentual
                                                                                                        da
                                                                                                        taxa:{' '}
                                                                                                        {
                                                                                                            it.feePercentageLabel
                                                                                                        }
                                                                                                    </p>
                                                                                                ) : null}

                                                                                                {it.sourceAppointmentId ? (
                                                                                                    <p className="text-xs text-content-tertiary mt-1">
                                                                                                        Agendamento
                                                                                                        relacionado:
                                                                                                        #
                                                                                                        {shortId(
                                                                                                            it.sourceAppointmentId
                                                                                                        )}
                                                                                                    </p>
                                                                                                ) : null}
                                                                                            </div>

                                                                                            <div className="flex flex-col items-end gap-1">
                                                                                                <span className="text-paragraph-small font-semibold text-content-primary">
                                                                                                    {
                                                                                                        it.totalLabel
                                                                                                    }
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                )
                                                                            )}
                                                                        </div>
                                                                    ) : fallbackLines.length >
                                                                      0 ? (
                                                                        <div className="mt-2">
                                                                            <p className="text-paragraph-small text-content-secondary">
                                                                                Itens:
                                                                            </p>
                                                                            <ul className="pl-4 list-disc space-y-0.5">
                                                                                {fallbackLines.map(
                                                                                    (
                                                                                        line,
                                                                                        idx
                                                                                    ) => (
                                                                                        <li
                                                                                            key={`${order.id}:${idx}`}
                                                                                            className="text-paragraph-small text-content-secondary"
                                                                                        >
                                                                                            {
                                                                                                line
                                                                                            }
                                                                                        </li>
                                                                                    )
                                                                                )}
                                                                            </ul>
                                                                        </div>
                                                                    ) : (
                                                                        <p className="mt-2 text-paragraph-small text-content-secondary">
                                                                            Itens:
                                                                            —
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            );
                                                        }
                                                    )}
                                                </div>
                                            </div>
                                        ) : null}

                                        <div className="pt-2 border-t border-border-primary space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-label-small text-content-secondary">
                                                    Adicionar produto na conta
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-end gap-2">
                                                <div className="flex flex-col gap-1 w-full">
                                                    <label className="text-xs text-content-secondary">
                                                        Produto
                                                    </label>

                                                    <select
                                                        value={
                                                            selectedProductId
                                                        }
                                                        onChange={(e) =>
                                                            setSelectedProductByClient(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [account.clientId]:
                                                                        e.target
                                                                            .value,
                                                                })
                                                            )
                                                        }
                                                        className="h-9 w-full rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary"
                                                        disabled={
                                                            isBusyGlobal ||
                                                            productsLoading ||
                                                            availableProductsForAccount.length ===
                                                                0
                                                        }
                                                    >
                                                        <option
                                                            value=""
                                                            disabled
                                                        >
                                                            {productsLoading
                                                                ? 'Carregando...'
                                                                : availableProductsForAccount.length ===
                                                                    0
                                                                  ? 'Sem produtos disponíveis'
                                                                  : 'Selecione o produto'}
                                                        </option>

                                                        {availableProductsForAccount.map(
                                                            (p) => (
                                                                <option
                                                                    key={p.id}
                                                                    value={p.id}
                                                                >
                                                                    {p.name} •{' '}
                                                                    {
                                                                        p.priceLabel
                                                                    }{' '}
                                                                    • estoque:{' '}
                                                                    {
                                                                        p.stockQuantity
                                                                    }
                                                                </option>
                                                            )
                                                        )}
                                                    </select>
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <label className="text-xs text-content-secondary">
                                                        Qtd
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={qtyValue}
                                                        onChange={(e) =>
                                                            setQtyByClient(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [account.clientId]:
                                                                        toIntSafe(
                                                                            e
                                                                                .target
                                                                                .value,
                                                                            1
                                                                        ),
                                                                })
                                                            )
                                                        }
                                                        className="h-9 w-24 rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary"
                                                        disabled={isBusyGlobal}
                                                    />
                                                </div>

                                                <Button
                                                    type="button"
                                                    variant="edit2"
                                                    size="sm"
                                                    onClick={() =>
                                                        handleAddProduct(
                                                            account
                                                        )
                                                    }
                                                    disabled={
                                                        isBusyGlobal ||
                                                        productsLoading ||
                                                        !selectedProductId ||
                                                        availableProductsForAccount.length ===
                                                            0
                                                    }
                                                    title={
                                                        isAdding
                                                            ? 'Adicionando...'
                                                            : undefined
                                                    }
                                                >
                                                    {isAdding
                                                        ? 'Adicionando...'
                                                        : 'Adicionar produto'}
                                                </Button>

                                                {availableProductsForAccount.length ===
                                                    0 && !productsLoading ? (
                                                    <p className="text-xs text-content-tertiary w-full">
                                                        Nenhum produto
                                                        disponível para esta
                                                        unidade/filtro.
                                                    </p>
                                                ) : (
                                                    <p className="text-xs text-content-secondary w-full">
                                                        O preço é calculado no
                                                        checkout e fica
                                                        congelado no item.
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-start justify-between gap-3 pt-2 border-t border-border-primary">
                                            <div className="flex-1 min-w-0 space-y-3">
                                                <div>
                                                    {account.hasProducts ? (
                                                        <>
                                                            <p className="text-label-small text-content-secondary mb-1">
                                                                Profissional
                                                                responsável pela
                                                                venda dos
                                                                produtos
                                                            </p>
                                                            <p className="text-paragraph-small text-content-secondary">
                                                                Atribua o
                                                                profissional em
                                                                cada item de
                                                                produto para
                                                                calcular
                                                                faturamento e
                                                                comissão.
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <p className="text-paragraph-small text-content-secondary">
                                                            Esta conta não
                                                            possui produtos
                                                            pendentes de
                                                            vinculação. Você
                                                            pode finalizar
                                                            direto.
                                                        </p>
                                                    )}
                                                </div>

                                                {!accountTotalIsZero ? (
                                                    <div className="space-y-2">
                                                        <p className="text-label-small text-content-secondary">
                                                            Pago com
                                                        </p>

                                                        <div className="flex flex-wrap items-end gap-2">
                                                            <div className="flex flex-col gap-1 min-w-45">
                                                                <label className="text-xs text-content-secondary">
                                                                    Forma de
                                                                    pagamento
                                                                </label>

                                                                <select
                                                                    value={
                                                                        selectedPaymentMethod
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) => {
                                                                        const nextPaymentMethod =
                                                                            e
                                                                                .target
                                                                                .value as
                                                                                | PaymentMethod
                                                                                | '';

                                                                        setPaymentMethodByClient(
                                                                            (
                                                                                prev
                                                                            ) => ({
                                                                                ...prev,
                                                                                [account.clientId]:
                                                                                    nextPaymentMethod,
                                                                            })
                                                                        );

                                                                        if (
                                                                            nextPaymentMethod ===
                                                                                'PIX' ||
                                                                            nextPaymentMethod ===
                                                                                'CASH'
                                                                        ) {
                                                                            setCardMachineIdByClient(
                                                                                (
                                                                                    prev
                                                                                ) => ({
                                                                                    ...prev,
                                                                                    [account.clientId]:
                                                                                        '',
                                                                                })
                                                                            );

                                                                            setCardInstallmentsByClient(
                                                                                (
                                                                                    prev
                                                                                ) => ({
                                                                                    ...prev,
                                                                                    [account.clientId]: 1,
                                                                                })
                                                                            );

                                                                            return;
                                                                        }

                                                                        if (
                                                                            nextPaymentMethod ===
                                                                            'DEBIT'
                                                                        ) {
                                                                            setCardInstallmentsByClient(
                                                                                (
                                                                                    prev
                                                                                ) => ({
                                                                                    ...prev,
                                                                                    [account.clientId]: 1,
                                                                                })
                                                                            );
                                                                        }

                                                                        if (
                                                                            nextPaymentMethod ===
                                                                            'CREDIT'
                                                                        ) {
                                                                            setCardInstallmentsByClient(
                                                                                (
                                                                                    prev
                                                                                ) => ({
                                                                                    ...prev,
                                                                                    [account.clientId]:
                                                                                        prev[
                                                                                            account
                                                                                                .clientId
                                                                                        ] ??
                                                                                        1,
                                                                                })
                                                                            );
                                                                        }

                                                                        if (
                                                                            availableCardMachines.length ===
                                                                            1
                                                                        ) {
                                                                            setCardMachineIdByClient(
                                                                                (
                                                                                    prev
                                                                                ) => ({
                                                                                    ...prev,
                                                                                    [account.clientId]:
                                                                                        availableCardMachines[0]
                                                                                            .id,
                                                                                })
                                                                            );
                                                                        }
                                                                    }}
                                                                    className="h-9 rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary"
                                                                    disabled={
                                                                        isBusyGlobal ||
                                                                        isPaying ||
                                                                        anyOrderBusy
                                                                    }
                                                                >
                                                                    <option value="">
                                                                        Selecione
                                                                    </option>
                                                                    {paymentMethodOptions.map(
                                                                        (
                                                                            opt
                                                                        ) => (
                                                                            <option
                                                                                key={
                                                                                    opt.value
                                                                                }
                                                                                value={
                                                                                    opt.value
                                                                                }
                                                                            >
                                                                                {
                                                                                    opt.label
                                                                                }
                                                                            </option>
                                                                        )
                                                                    )}
                                                                </select>
                                                            </div>

                                                            {selectedPaymentMethod ===
                                                                'CREDIT' ||
                                                            selectedPaymentMethod ===
                                                                'DEBIT' ? (
                                                                <>
                                                                    <div className="flex flex-col gap-1 min-w-60">
                                                                        <label className="text-xs text-content-secondary">
                                                                            Máquina
                                                                            de
                                                                            cartão
                                                                        </label>

                                                                        <select
                                                                            value={
                                                                                selectedCardMachineId
                                                                            }
                                                                            onChange={(
                                                                                e
                                                                            ) =>
                                                                                setCardMachineIdByClient(
                                                                                    (
                                                                                        prev
                                                                                    ) => ({
                                                                                        ...prev,
                                                                                        [account.clientId]:
                                                                                            e
                                                                                                .target
                                                                                                .value,
                                                                                    })
                                                                                )
                                                                            }
                                                                            className="h-9 rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary"
                                                                            disabled={
                                                                                isBusyGlobal ||
                                                                                isPaying ||
                                                                                anyOrderBusy
                                                                            }
                                                                        >
                                                                            <option value="">
                                                                                {availableCardMachines.length ===
                                                                                0
                                                                                    ? 'Sem máquinas cadastradas'
                                                                                    : 'Selecione a máquina'}
                                                                            </option>

                                                                            {availableCardMachines.map(
                                                                                (
                                                                                    machine
                                                                                ) => (
                                                                                    <option
                                                                                        key={
                                                                                            machine.id
                                                                                        }
                                                                                        value={
                                                                                            machine.id
                                                                                        }
                                                                                    >
                                                                                        {
                                                                                            machine.name
                                                                                        }{' '}
                                                                                        •{' '}
                                                                                        {
                                                                                            machine.unitName
                                                                                        }
                                                                                    </option>
                                                                                )
                                                                            )}
                                                                        </select>
                                                                    </div>

                                                                    {selectedPaymentMethod ===
                                                                    'CREDIT' ? (
                                                                        <div className="flex flex-col gap-1 min-w-40">
                                                                            <label className="text-xs text-content-secondary">
                                                                                Parcelas
                                                                            </label>

                                                                            <select
                                                                                value={String(
                                                                                    selectedCardInstallments
                                                                                )}
                                                                                onChange={(
                                                                                    e
                                                                                ) =>
                                                                                    setCardInstallmentsByClient(
                                                                                        (
                                                                                            prev
                                                                                        ) => ({
                                                                                            ...prev,
                                                                                            [account.clientId]:
                                                                                                Number(
                                                                                                    e
                                                                                                        .target
                                                                                                        .value
                                                                                                ) ||
                                                                                                1,
                                                                                        })
                                                                                    )
                                                                                }
                                                                                className="h-9 rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary"
                                                                                disabled={
                                                                                    isBusyGlobal ||
                                                                                    isPaying ||
                                                                                    anyOrderBusy
                                                                                }
                                                                            >
                                                                                {Array.from(
                                                                                    {
                                                                                        length: 12,
                                                                                    },
                                                                                    (
                                                                                        _,
                                                                                        index
                                                                                    ) => {
                                                                                        const installments =
                                                                                            index +
                                                                                            1;

                                                                                        return (
                                                                                            <option
                                                                                                key={
                                                                                                    installments
                                                                                                }
                                                                                                value={
                                                                                                    installments
                                                                                                }
                                                                                            >
                                                                                                {
                                                                                                    installments
                                                                                                }

                                                                                                x
                                                                                            </option>
                                                                                        );
                                                                                    }
                                                                                )}
                                                                            </select>
                                                                        </div>
                                                                    ) : null}
                                                                </>
                                                            ) : null}
                                                        </div>

                                                        {requiresCardMachine ? (
                                                            <div className="space-y-1">
                                                                {availableCardMachines.length ===
                                                                0 ? (
                                                                    <p className="text-xs text-amber-700">
                                                                        Não há
                                                                        máquina
                                                                        cadastrada
                                                                        para
                                                                        concluir
                                                                        pagamento
                                                                        em
                                                                        crédito
                                                                        ou
                                                                        débito.
                                                                    </p>
                                                                ) : null}

                                                                {selectedCardFeeLabel ? (
                                                                    <p className="text-xs text-content-tertiary">
                                                                        Taxa
                                                                        aplicada
                                                                        nesta
                                                                        conta:{' '}
                                                                        <span className="font-medium text-content-secondary">
                                                                            {
                                                                                selectedCardFeeLabel
                                                                            }
                                                                        </span>
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() =>
                                                        handleCancelAccount(
                                                            account
                                                        )
                                                    }
                                                    disabled={
                                                        isPaying ||
                                                        anyOrderBusy ||
                                                        isCanceling ||
                                                        isAdding ||
                                                        (account.hasProducts &&
                                                            !accountTotalIsZero &&
                                                            missingProfessionalCount >
                                                                0)
                                                    }
                                                    title={
                                                        isPaying ||
                                                        anyOrderBusy ||
                                                        isCanceling ||
                                                        isAdding
                                                            ? 'Processando...'
                                                            : 'Cancela todos os pedidos pendentes da conta'
                                                    }
                                                >
                                                    {isCanceling
                                                        ? 'Cancelando...'
                                                        : 'Cancelar conta'}
                                                </Button>

                                                <Button
                                                    type="button"
                                                    variant="edit2"
                                                    size="sm"
                                                    onClick={() =>
                                                        handleMarkAllAsPaid(
                                                            account
                                                        )
                                                    }
                                                    disabled={
                                                        isPaying ||
                                                        anyOrderBusy ||
                                                        isCanceling ||
                                                        isAdding ||
                                                        (account.hasProducts &&
                                                            !accountTotalIsZero &&
                                                            missingProfessionalCount >
                                                                0) ||
                                                        checkoutBlockedByPayment
                                                    }
                                                    title={
                                                        account.hasProducts &&
                                                        !accountTotalIsZero &&
                                                        missingProfessionalCount >
                                                            0
                                                            ? `Faltam ${missingProfessionalCount} item(ns) de produto sem profissional.`
                                                            : !accountTotalIsZero &&
                                                                !selectedPaymentMethod
                                                              ? 'Selecione a forma de pagamento.'
                                                              : !accountTotalIsZero &&
                                                                  requiresCardMachine &&
                                                                  !selectedCardMachineId
                                                                ? 'Selecione a máquina de cartão.'
                                                                : !accountTotalIsZero &&
                                                                    selectedPaymentMethod ===
                                                                        'CREDIT' &&
                                                                    !selectedCardInstallments
                                                                  ? 'Selecione a quantidade de parcelas.'
                                                                  : isPaying ||
                                                                      anyOrderBusy ||
                                                                      isCanceling ||
                                                                      isAdding
                                                                    ? 'Concluindo checkout...'
                                                                    : undefined
                                                    }
                                                >
                                                    {isPaying || anyOrderBusy
                                                        ? 'Concluindo...'
                                                        : 'Marcar tudo como pago'}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {orphanServiceOrders.length > 0 ||
                    orphanProductOrders.length > 0 ? (
                        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-4 space-y-2">
                            <p className="text-paragraph-small text-content-secondary">
                                Alguns pedidos pendentes não estão vinculados a
                                um cliente e não podem ser agrupados
                                automaticamente.
                            </p>
                        </div>
                    ) : null}
                </section>
            )}

            {activeTab === 'OPEN_ORDERS' && (
                <OrdersSection
                    monthLabel={monthLabel}
                    totalCountLabel={`${monthGroups.reduce((sum, g) => sum + g.orders.length, 0)} pedidos`}
                    groups={monthGroups}
                />
            )}

            {activeTab === 'CANCELLATION_FEES' && (
                <section className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-subtitle text-content-primary">
                            Taxas de cancelamento{' '}
                            <span className="text-content-secondary font-normal">
                                ({pendingCancellationChargesCount})
                            </span>
                        </h2>
                    </div>

                    {pendingCancellationCharges.length === 0 ? (
                        <EmptyState title="Não há taxas de cancelamento pendentes no momento." />
                    ) : (
                        <div className="space-y-3">
                            {pendingCancellationCharges.map((group) => (
                                <div
                                    key={`${group.clientId}:${group.unitId}`}
                                    className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-paragraph-small text-content-primary truncate">
                                                Cliente:{' '}
                                                <span className="font-medium">
                                                    {group.clientLabel}
                                                </span>
                                            </p>

                                            <p className="text-paragraph-small text-content-secondary">
                                                Unidade:{' '}
                                                <span className="font-medium">
                                                    {group.unitName}
                                                </span>
                                            </p>

                                            <p className="text-paragraph-small text-content-secondary">
                                                Última movimentação em{' '}
                                                {group.latestLabel}
                                            </p>
                                        </div>

                                        <div className="flex flex-col gap-1 md:items-end">
                                            <span className="text-paragraph-small font-semibold text-content-primary">
                                                Total pendente:{' '}
                                                {group.totalLabel}
                                            </span>

                                            <StatusBadge status="PENDING" />
                                        </div>
                                    </div>

                                    <div className="pt-2 border-t border-border-primary space-y-2">
                                        <p className="text-label-small text-content-secondary">
                                            Taxas ({group.charges.length})
                                        </p>

                                        <div className="space-y-2">
                                            {group.charges.map((charge) => (
                                                <div
                                                    key={charge.id}
                                                    className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2"
                                                >
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-paragraph-small text-content-primary truncate">
                                                                {
                                                                    charge.serviceName
                                                                }
                                                            </p>

                                                            <p className="text-paragraph-small text-content-secondary">
                                                                Agendamento:{' '}
                                                                {
                                                                    charge.appointmentLabel
                                                                }
                                                            </p>

                                                            <p className="text-paragraph-small text-content-secondary">
                                                                Valor original:{' '}
                                                                {
                                                                    charge.originalServicePriceLabel
                                                                }
                                                            </p>

                                                            <p className="text-paragraph-small text-content-secondary">
                                                                Taxa:{' '}
                                                                {
                                                                    charge.cancelFeePercentageLabel
                                                                }{' '}
                                                                •{' '}
                                                                <span className="font-medium text-content-primary">
                                                                    {
                                                                        charge.cancelFeeValueLabel
                                                                    }
                                                                </span>
                                                            </p>

                                                            {charge.professionalName ? (
                                                                <p className="text-paragraph-small text-content-secondary">
                                                                    Profissional:{' '}
                                                                    {
                                                                        charge.professionalName
                                                                    }
                                                                </p>
                                                            ) : null}

                                                            <p className="text-paragraph-small text-content-secondary">
                                                                Comissão
                                                                profissional:{' '}
                                                                {
                                                                    charge.professionalCommissionValueLabel
                                                                }
                                                            </p>

                                                            <p className="text-xs text-content-tertiary mt-1">
                                                                Criada em{' '}
                                                                {
                                                                    charge.createdAtLabel
                                                                }
                                                            </p>
                                                        </div>

                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className="text-paragraph-small font-semibold text-content-primary">
                                                                {
                                                                    charge.cancelFeeValueLabel
                                                                }
                                                            </span>

                                                            <StatusBadge status="PENDING" />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
