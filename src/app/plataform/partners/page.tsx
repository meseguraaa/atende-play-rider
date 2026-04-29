// src/app/platform/partners/page.tsx
import type { Metadata } from 'next';
import { headers, cookies } from 'next/headers';

import { requirePlatformForModule } from '@/lib/plataform-permissions';

import { PartnerRow } from '@/components/plataform/partners/partner-row/partner-row';
import { PartnerNewDialog } from '@/components/plataform/partners/partner-new-dialog/partner-new-dialog';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Plataforma | Parceiros',
};

export type PartnerForRow = {
    id: string;
    name: string;

    logoUrl: string | null;
    logoKey: string | null;

    discountPct: number;

    description: string | null;
    rules: string | null;

    ctaUrl: string | null;
    ctaLabel: string | null;

    isActive: boolean;
    visibilityMode: 'ALL' | 'SELECTED';
    sortOrder: number;

    createdAt?: string | Date;
    updatedAt?: string | Date;
};

type PartnersApiResponse = {
    ok: boolean;
    data?: { partners: PartnerForRow[] };
    error?: string;
};

// ✅ Tipagem compatível com o ReadonlyHeaders do Next
function getBaseUrlFromHeaders(h: { get(name: string): string | null }) {
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? 'http';
    if (!host) return null;
    return `${proto}://${host}`;
}

export default async function PlatformPartnersPage() {
    // ✅ Plataforma: acesso controlado pelo seu perfil ATENDEPLAY
    await requirePlatformForModule('PARTNERS');

    // ✅ No seu Next: headers() e cookies() são Promise
    const h = await headers();
    const baseUrl = getBaseUrlFromHeaders(h);

    const cookieStore = await cookies();
    const cookieHeader = cookieStore
        .getAll()
        .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
        .join('; ');

    let partners: PartnerForRow[] = [];

    try {
        const url = baseUrl
            ? `${baseUrl}/api/plataform/partners`
            : '/api/plataform/partners';

        const res = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                accept: 'application/json',
                cookie: cookieHeader,
            },
        });

        const json = (await res
            .json()
            .catch(() => null)) as PartnersApiResponse | null;

        if (res.ok && json?.ok && json.data) {
            partners = json.data.partners ?? [];
        } else {
            partners = [];
        }
    } catch {
        partners = [];
    }

    return (
        <div className="max-w-7xl space-y-6">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-title text-content-primary">
                        Parceiros
                    </h1>
                    <p className="text-paragraph-medium-size text-content-secondary">
                        Cadastre parceiros, descontos e links para abrir no app.
                    </p>
                </div>

                <PartnerNewDialog />
            </header>

            <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
                <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                        <col className="w-95" />
                        <col className="w-40" />
                        <col className="w-40" />
                        <col className="w-40" />
                        <col className="w-40" />
                        <col className="w-60" />
                    </colgroup>

                    <thead>
                        <tr className="border-b border-border-primary bg-background-secondary">
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Parceiro
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Desconto
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Visibilidade
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Ordem
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Status
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                                Ações
                            </th>
                        </tr>
                    </thead>

                    <tbody className="[&>tr>td]:align-middle">
                        {partners.length === 0 ? (
                            <tr className="border-t border-border-primary">
                                <td
                                    colSpan={6}
                                    className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                                >
                                    Nenhum parceiro cadastrado ainda.
                                </td>
                            </tr>
                        ) : (
                            partners.map((partner) => (
                                <PartnerRow
                                    key={partner.id}
                                    partner={partner}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
