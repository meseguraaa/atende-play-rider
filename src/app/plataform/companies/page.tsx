// src/app/platform/companies/page.tsx
import type { Metadata } from 'next';
import { headers, cookies } from 'next/headers';

import { requirePlatformForModule } from '@/lib/plataform-permissions';

import { CompanyRow } from '@/components/plataform/companies/company-row/company-row';
import { CompanyNewDialog } from '@/components/plataform/companies/company-new-dialog/company-new-dialog';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Plataforma | Empresas',
};

export type CompanyForRow = {
    id: string;
    name: string;
    slug: string | null;
    segment: string;
    isActive: boolean;

    // 🔥 NOVO: comunicação
    whatsappCredits?: number;
    birthdayMessageEnabled?: boolean;

    counts?: {
        members: number;
        units: number;
        professionals: number;
    };

    createdAt?: string | Date;
    updatedAt?: string | Date;
};

type CompaniesApiResponse = {
    ok: boolean;
    data?: { companies: CompanyForRow[] };
    error?: string;
};

// ✅ Tipagem compatível com o ReadonlyHeaders do Next
function getBaseUrlFromHeaders(h: { get(name: string): string | null }) {
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? 'http';
    if (!host) return null;
    return `${proto}://${host}`;
}

function normalizeActiveParam(raw: string | null): '' | '1' | '0' {
    const v = String(raw ?? '').trim();
    if (v === '1') return '1';
    if (v === '0') return '0';
    return '';
}

export default async function PlatformCompaniesPage(props: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requirePlatformForModule('COMPANIES');

    const searchParams = (await props.searchParams) ?? {};
    const qRaw = searchParams.q;
    const activeRaw = searchParams.active;

    const q =
        typeof qRaw === 'string'
            ? qRaw.trim()
            : Array.isArray(qRaw)
              ? String(qRaw[0] ?? '').trim()
              : '';

    const active =
        typeof activeRaw === 'string'
            ? normalizeActiveParam(activeRaw)
            : Array.isArray(activeRaw)
              ? normalizeActiveParam(String(activeRaw[0] ?? ''))
              : '';

    const h = await headers();
    const baseUrl = getBaseUrlFromHeaders(h);

    const cookieStore = await cookies();
    const cookieHeader = cookieStore
        .getAll()
        .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
        .join('; ');

    let companies: CompanyForRow[] = [];

    try {
        const apiBase = baseUrl ? `${baseUrl}` : '';
        const url = new URL(`${apiBase}/api/plataform/companies`);

        if (q) url.searchParams.set('q', q);
        if (active) url.searchParams.set('active', active);

        const res = await fetch(url.toString(), {
            method: 'GET',
            cache: 'no-store',
            headers: {
                accept: 'application/json',
                cookie: cookieHeader,
            },
        });

        const json = (await res
            .json()
            .catch(() => null)) as CompaniesApiResponse | null;

        if (res.ok && json?.ok && json.data) {
            companies = json.data.companies ?? [];
        } else {
            companies = [];
        }
    } catch {
        companies = [];
    }

    return (
        <div className="max-w-7xl space-y-6">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-title text-content-primary">
                        Empresas
                    </h1>
                    <p className="text-paragraph-medium-size text-content-secondary">
                        Liste empresas, filtre por status e crie uma nova
                        empresa já com 1+ donos admins.
                    </p>
                </div>

                <CompanyNewDialog />
            </header>

            <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
                <form
                    action="/platform/companies"
                    method="GET"
                    className="flex flex-col gap-3 md:flex-row md:items-end"
                >
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-content-secondary">
                            Buscar
                        </label>
                        <input
                            name="q"
                            defaultValue={q}
                            placeholder="Nome ou slug…"
                            className="mt-1 w-full rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-content-primary outline-none focus:ring-2 focus:ring-border-primary"
                        />
                    </div>

                    <div className="w-full md:w-56">
                        <label className="block text-xs font-medium text-content-secondary">
                            Status
                        </label>
                        <select
                            name="active"
                            defaultValue={active}
                            className="mt-1 w-full rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-content-primary outline-none focus:ring-2 focus:ring-border-primary"
                        >
                            <option value="">Todas</option>
                            <option value="1">Ativas</option>
                            <option value="0">Inativas</option>
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="submit"
                            className="rounded-lg border border-border-primary bg-background-secondary px-4 py-2 text-sm text-content-primary hover:opacity-90"
                        >
                            Aplicar
                        </button>

                        <a
                            href="/platform/companies"
                            className="rounded-lg border border-border-primary bg-background-secondary px-4 py-2 text-sm text-content-primary hover:opacity-90"
                        >
                            Limpar
                        </a>
                    </div>
                </form>
            </section>

            <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
                <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                        <col className="w-50" />
                        <col className="w-40" />
                        <col className="w-40" />
                        <col className="w-20" />
                        <col className="w-40" />
                        <col className="w-50" />
                        <col className="w-50" />
                    </colgroup>

                    <thead>
                        <tr className="border-b border-border-primary bg-background-secondary">
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Empresa
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Slug
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Segmento
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Status
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Totais
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                                Comunicação
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                                Ações
                            </th>
                        </tr>
                    </thead>

                    <tbody className="[&>tr>td]:align-middle">
                        {companies.length === 0 ? (
                            <tr className="border-t border-border-primary">
                                <td
                                    colSpan={7}
                                    className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                                >
                                    Nenhuma empresa encontrada.
                                </td>
                            </tr>
                        ) : (
                            companies.map((company) => (
                                <CompanyRow
                                    key={company.id}
                                    company={company}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
