// src/app/admin/checkout/page.tsx
import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { requireAdminForModule } from '@/lib/admin-permissions';

import AdminCheckoutClient, {
    type OpenAccountUI,
    type MonthGroupUI,
    type CardMachineUI,
} from './admin-checkout-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Checkout',
};

type CheckoutApiResponse =
    | {
          ok: true;
          data: {
              monthQuery: string;
              monthLabel: string;
              activeUnitId: string | null;
              cardMachines: CardMachineUI[];
              cardMachinesCount: number;
              openAccounts: OpenAccountUI[];
              openAccountsCount: number;
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
              pendingCancellationChargesCount: number;
              monthGroups: MonthGroupUI[];
              monthOrdersCount: number;
          };
      }
    | { ok: false; error: string };

type AdminCheckoutPageProps = {
    searchParams?: Promise<{
        month?: string; // yyyy-MM
    }>;
};

/**
 * Resolve a base URL segura para chamadas server-side.
 *
 * Problema em prod:
 * - o tenant host (ex: atendeplay.atendeplay.com.br) pode não estar coberto
 *   pelo certificado usado na infra, causando:
 *   ERR_TLS_CERT_ALTNAME_INVALID
 *
 * Solução:
 * - para páginas do ADMIN, preferimos o host canônico do painel.
 * - permite override via env (recomendado):
 *   PAINEL_BASE_URL=https://painel.atendeplay.com.br
 */
function resolveAdminBaseUrl(h: Headers): string {
    const envBase = (process.env.PAINEL_BASE_URL || '').trim();
    if (envBase) return envBase.replace(/\/+$/, '');

    const forwardedHost = (h.get('x-forwarded-host') ?? '').trim();
    const host = (forwardedHost || h.get('host') || '').trim();

    // fallback seguro: se estiver dentro de *.atendeplay.com.br, força painel
    // (evita depender do cert de cada subdomínio tenant)
    if (
        host.endsWith('.atendeplay.com.br') &&
        host !== 'painel.atendeplay.com.br'
    ) {
        return 'https://painel.atendeplay.com.br';
    }

    // último recurso: usa o próprio host
    const proto = (h.get('x-forwarded-proto') ?? 'https').trim() || 'https';
    return host ? `${proto}://${host}` : 'https://painel.atendeplay.com.br';
}

async function fetchCheckoutData(params: {
    month?: string;
}): Promise<CheckoutApiResponse> {
    const h = await headers();

    const baseUrl = resolveAdminBaseUrl(h);

    const sp = new URLSearchParams();
    if (params.month) sp.set('month', params.month);

    const url = `${baseUrl}/api/admin/checkout${
        sp.toString() ? `?${sp.toString()}` : ''
    }`;

    const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
            // mantém sessão do admin
            cookie: h.get('cookie') ?? '',
        },
    });

    const json = (await res
        .json()
        .catch(() => null)) as CheckoutApiResponse | null;

    if (!res.ok || !json) {
        return { ok: false, error: 'Falha ao carregar dados do checkout.' };
    }

    return json;
}

export default async function AdminCheckoutPage({
    searchParams,
}: AdminCheckoutPageProps) {
    const session = await requireAdminForModule('CHECKOUT');

    const sp = (await searchParams) ?? {};
    const month = sp.month;

    const api = await fetchCheckoutData({ month });

    const monthLabel = api.ok ? api.data.monthLabel : '—';
    const cardMachines: CardMachineUI[] = api.ok ? api.data.cardMachines : [];
    const openAccounts: OpenAccountUI[] = api.ok ? api.data.openAccounts : [];
    const pendingCancellationCharges = api.ok
        ? api.data.pendingCancellationCharges
        : [];
    const monthGroups: MonthGroupUI[] = api.ok ? api.data.monthGroups : [];

    return (
        <AdminCheckoutClient
            canSeeAllUnits={session.canSeeAllUnits}
            monthLabel={monthLabel}
            cardMachines={cardMachines}
            openAccounts={openAccounts}
            pendingCancellationCharges={pendingCancellationCharges}
            monthGroups={monthGroups}
        />
    );
}
