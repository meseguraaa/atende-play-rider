// src/components/plataform/companies/company-row/company-row.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { CompanyEditDialog } from '@/components/plataform/companies/company-edit-dialog/company-edit-dialog';

type CompanyCounts = {
    members?: number | string | null;
    units?: number | string | null;
    professionals?: number | string | null;
};

export type CompanyForRow = {
    id: string;
    name: string;
    slug?: string | null;
    segment?: string | null;
    isActive?: boolean | null;

    // NOVO: comunicação
    whatsappCredits?: number;
    birthdayMessageEnabled?: boolean;

    counts?: CompanyCounts | null;
    createdAt?: string | Date | null;
    updatedAt?: string | Date | null;
};

function Pill({
    children,
    variant = 'neutral',
}: {
    children: React.ReactNode;
    variant?: 'neutral' | 'success' | 'danger';
}) {
    const cls =
        variant === 'success'
            ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
            : variant === 'danger'
              ? 'bg-rose-500/10 text-rose-700 border-rose-500/20'
              : 'bg-black/5 text-content-secondary border-border-primary';

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
                cls
            )}
        >
            {children}
        </span>
    );
}

function StatusBadge({
    isActive,
    title,
}: {
    isActive: boolean;
    title?: string;
}) {
    const toneClass = isActive
        ? 'bg-green-500/15 text-green-600 border-green-500/30'
        : 'bg-red-500/15 text-red-600 border-red-500/30';

    return (
        <span
            title={title}
            className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-xs',
                toneClass
            )}
        >
            {isActive ? 'Ativa' : 'Inativa'}
        </span>
    );
}

function initials(name: string) {
    return (name || '?')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

function CompanyBadge({ name }: { name: string }) {
    return (
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-border-primary bg-background-secondary">
            <span className="text-[11px] font-semibold text-content-secondary">
                {initials(name)}
            </span>
        </div>
    );
}

function formatCounts(c: CompanyForRow['counts']) {
    const members = Number(c?.members ?? 0);
    const units = Number(c?.units ?? 0);
    const pros = Number(c?.professionals ?? 0);

    const parts: string[] = [];
    parts.push(`${units} un.`);
    parts.push(`${pros} prof.`);
    parts.push(`${members} memb.`);
    return parts.join(' • ');
}

export function CompanyRow({ company }: { company: CompanyForRow }) {
    const router = useRouter();
    const [isPending, startTransition] = React.useTransition();

    function handleToggleActive() {
        startTransition(async () => {
            try {
                const res = await fetch(
                    `/api/plataform/companies/${company.id}`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ toggleActive: true }),
                    }
                );

                const json = (await res.json().catch(() => null)) as
                    | { ok: true; data?: any }
                    | { ok: false; error?: string }
                    | null;

                if (!res.ok || !json || (json as any).ok !== true) {
                    const msg =
                        (json as any)?.error ||
                        'Não foi possível alterar o status da empresa.';
                    toast.error(msg);
                    return;
                }

                toast.success(
                    company.isActive
                        ? 'Empresa desativada.'
                        : 'Empresa ativada.'
                );
                router.refresh();
            } catch {
                toast.error('Erro de rede ao alterar status da empresa.');
            }
        });
    }

    return (
        <tr className="border-t border-border-primary">
            <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="min-w-0">
                        <p className="truncate font-semibold text-content-primary">
                            {company.name}
                        </p>
                        <p className="truncate text-xs text-content-secondary">
                            {company.id}
                        </p>
                    </div>
                </div>
            </td>

            <td className="px-4 py-3">
                <Pill variant="neutral">{company.slug ?? '—'}</Pill>
            </td>

            <td className="px-4 py-3">
                <Pill variant="neutral">{company.segment ?? '—'}</Pill>
            </td>

            <td className="px-4 py-3">
                <StatusBadge isActive={Boolean(company.isActive)} />
            </td>

            <td className="px-4 py-3">
                <span className="text-xs font-semibold text-content-secondary">
                    {formatCounts(company.counts)}
                </span>
            </td>

            <td className="px-4 py-3">
                <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-content-secondary">
                            Grátis:
                        </span>
                        <span className="font-semibold text-content-primary">
                            1 por mês
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="font-medium text-content-secondary">
                            Créditos:
                        </span>
                        <span className="font-semibold text-content-primary">
                            {company.whatsappCredits ?? 0}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="font-medium text-content-secondary">
                            Aniversário:
                        </span>
                        <span
                            className={cn(
                                'font-semibold',
                                company.birthdayMessageEnabled
                                    ? 'text-emerald-600'
                                    : 'text-rose-600'
                            )}
                        >
                            {company.birthdayMessageEnabled ? 'ON' : 'OFF'}
                        </span>
                    </div>
                </div>
            </td>

            <td className="px-4 py-3 text-right">
                <div className="inline-flex items-center gap-2">
                    <CompanyEditDialog
                        company={{
                            id: company.id,
                            name: company.name,
                            slug: company.slug ?? null,
                            segment: company.segment ?? '',
                            isActive: Boolean(company.isActive),
                        }}
                    />

                    <Button
                        variant={company.isActive ? 'destructive' : 'active'}
                        size="sm"
                        type="button"
                        className="border-border-primary hover:bg-muted/40"
                        onClick={handleToggleActive}
                        disabled={isPending}
                        title={isPending ? 'Processando...' : undefined}
                    >
                        {isPending
                            ? 'Aguarde...'
                            : company.isActive
                              ? 'Desativar'
                              : 'Ativar'}
                    </Button>
                </div>
            </td>
        </tr>
    );
}
