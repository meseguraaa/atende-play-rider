'use client';

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

export type AdminMemberRowData = {
    id: string;
    name: string;
    email: string;
    phone: string;
    createdAt: Date;
    image: string | null;
    totalAppointments: number;
    doneCount: number;
    canceledCount: number;
    canceledWithFeeCount: number;
    totalCancelFee: number;
    totalPlans: number;
    hasActivePlan: boolean;
    frequencyLabel: string;
    lastDoneDate: Date | null;
    totalSpent: number;
    whatsappUrl: string | null;
};

type AdminMemberRowProps = {
    row: AdminMemberRowData;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
});

function formatDateBR(v: Date | null) {
    if (!v) return '—';
    const d = v instanceof Date ? v : new Date(v);
    return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

function Avatar({ name, image }: { name: string; image: string | null }) {
    return (
        <div className="h-10 w-10 overflow-hidden rounded-lg bg-background-secondary border border-border-primary flex items-center justify-center text-xs font-medium text-content-secondary shrink-0">
            {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={image}
                    alt={name}
                    className="h-full w-full object-cover"
                />
            ) : (
                <span>
                    {String(name || '?')
                        .charAt(0)
                        .toUpperCase()}
                </span>
            )}
        </div>
    );
}

function PlanPill({ active }: { active: boolean }) {
    return active ? (
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            Ativo
        </span>
    ) : (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-content-secondary">
            —
        </span>
    );
}

/**
 * ✅ DESKTOP (Tabela)
 */
export function AdminMemberRow({ row }: AdminMemberRowProps) {
    const createdAtLabel = formatDateBR(row.createdAt);
    const lastDoneLabel = formatDateBR(row.lastDoneDate);

    const totalSpentLabel = currencyFormatter.format(
        Number(row.totalSpent ?? 0)
    );
    const totalCancelFeeLabel = currencyFormatter.format(
        Number(row.totalCancelFee ?? 0)
    );

    return (
        <tr className="border-b border-border-primary last:border-b-0">
            {/* CLIENTE (foto + nome + email + telefone) */}
            <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                    <Avatar name={row.name} image={row.image} />

                    <div className="flex flex-col min-w-0">
                        <span className="text-paragraph-medium text-content-primary font-medium truncate">
                            {row.name}
                        </span>
                        <span className="text-paragraph-small text-content-secondary truncate">
                            {row.email || 'Sem e-mail'}
                        </span>
                        <span className="text-paragraph-small text-content-secondary truncate">
                            {row.phone}
                        </span>
                    </div>
                </div>
            </td>

            {/* CRIADO EM */}
            <td className="px-4 py-3 text-paragraph-small text-content-primary">
                {createdAtLabel}
            </td>

            {/* AGEND. */}
            <td className="px-4 py-3 text-center text-paragraph-small text-content-primary">
                {row.totalAppointments}
            </td>

            {/* CONCLUÍDOS */}
            <td className="px-4 py-3 text-center text-paragraph-small text-content-primary">
                {row.doneCount}
            </td>

            {/* CANCELADOS */}
            <td className="px-4 py-3 text-center text-paragraph-small text-content-primary">
                {row.canceledCount}
            </td>

            {/* CANC. C/ TAXA */}
            <td className="px-4 py-3 text-center text-paragraph-small text-content-primary">
                {row.canceledWithFeeCount}
            </td>

            {/* TAXAS COBRADAS */}
            <td className="px-4 py-3 text-right text-paragraph-small text-content-primary">
                {totalCancelFeeLabel}
            </td>

            {/* PLANOS */}
            <td className="px-4 py-3 text-center text-paragraph-small text-content-primary">
                {row.totalPlans}
            </td>

            {/* PLANO ATIVO */}
            <td className="px-4 py-3 text-center">
                <PlanPill active={Boolean(row.hasActivePlan)} />
            </td>

            {/* FREQUÊNCIA */}
            <td className="px-4 py-3 text-paragraph-small text-content-primary">
                {row.frequencyLabel}
            </td>

            {/* ÚLTIMO ATENDIMENTO */}
            <td className="px-4 py-3 text-paragraph-small text-content-primary">
                {lastDoneLabel}
            </td>

            {/* TOTAL GASTO */}
            <td className="px-4 py-3 text-right text-paragraph-small text-content-primary font-medium whitespace-nowrap">
                {totalSpentLabel}
            </td>

            {/* AÇÕES (WhatsApp) */}
            <td className="px-4 py-3 text-right">
                {row.whatsappUrl ? (
                    <a
                        href={row.whatsappUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex"
                    >
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-border-primary text-content-primary hover:bg-muted/40"
                        >
                            WhatsApp
                            <ExternalLink className="ml-1 h-3 w-3" />
                        </Button>
                    </a>
                ) : (
                    <span className="text-paragraph-small text-content-secondary">
                        —
                    </span>
                )}
            </td>
        </tr>
    );
}

/**
 * ✅ MOBILE (Card)
 */
export function AdminMemberRowMobile({ row }: AdminMemberRowProps) {
    const createdAtLabel = formatDateBR(row.createdAt);
    const lastDoneLabel = formatDateBR(row.lastDoneDate);

    const totalSpentLabel = currencyFormatter.format(
        Number(row.totalSpent ?? 0)
    );
    const totalCancelFeeLabel = currencyFormatter.format(
        Number(row.totalCancelFee ?? 0)
    );

    return (
        <div className="rounded-xl border border-border-primary bg-background-tertiary overflow-hidden">
            <div className="p-4 space-y-3">
                {/* topo: avatar + nome + plano */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={row.name} image={row.image} />

                        <div className="min-w-0">
                            <p className="text-paragraph-medium-size font-semibold text-content-primary truncate">
                                {row.name}
                            </p>
                            <p className="text-xs text-content-secondary truncate">
                                {row.email || 'Sem e-mail'}
                            </p>
                            <p className="text-xs text-content-secondary truncate">
                                {row.phone}
                            </p>
                        </div>
                    </div>

                    <div className="shrink-0">
                        <PlanPill active={Boolean(row.hasActivePlan)} />
                    </div>
                </div>

                {/* métricas em grid */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-0.5">
                        <p className="text-content-tertiary">Criado em</p>
                        <p className="text-content-primary font-medium">
                            {createdAtLabel}
                        </p>
                    </div>

                    <div className="space-y-0.5">
                        <p className="text-content-tertiary">
                            Último atendimento
                        </p>
                        <p className="text-content-primary font-medium">
                            {lastDoneLabel}
                        </p>
                    </div>

                    <div className="space-y-0.5">
                        <p className="text-content-tertiary">Agendamentos</p>
                        <p className="text-content-primary font-medium">
                            {row.totalAppointments}
                        </p>
                    </div>

                    <div className="space-y-0.5">
                        <p className="text-content-tertiary">Concluídos</p>
                        <p className="text-content-primary font-medium">
                            {row.doneCount}
                        </p>
                    </div>

                    <div className="space-y-0.5">
                        <p className="text-content-tertiary">Cancelados</p>
                        <p className="text-content-primary font-medium">
                            {row.canceledCount}
                        </p>
                    </div>

                    <div className="space-y-0.5">
                        <p className="text-content-tertiary">Canc. c/ taxa</p>
                        <p className="text-content-primary font-medium">
                            {row.canceledWithFeeCount}
                        </p>
                    </div>

                    <div className="space-y-0.5">
                        <p className="text-content-tertiary">Taxas</p>
                        <p className="text-content-primary font-medium">
                            {totalCancelFeeLabel}
                        </p>
                    </div>

                    <div className="space-y-0.5">
                        <p className="text-content-tertiary">Planos</p>
                        <p className="text-content-primary font-medium">
                            {row.totalPlans}
                        </p>
                    </div>

                    <div className="col-span-2 space-y-0.5">
                        <p className="text-content-tertiary">Frequência</p>
                        <p className="text-content-primary font-medium">
                            {row.frequencyLabel}
                        </p>
                    </div>

                    <div className="col-span-2 space-y-0.5">
                        <p className="text-content-tertiary">Total gasto</p>
                        <p className="text-content-primary font-semibold">
                            {totalSpentLabel}
                        </p>
                    </div>
                </div>

                {/* ações */}
                <div className="pt-1">
                    {row.whatsappUrl ? (
                        <a
                            href={row.whatsappUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex w-full"
                        >
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="w-full border-border-primary text-content-primary hover:bg-muted/40"
                            >
                                WhatsApp
                                <ExternalLink className="ml-1 h-3 w-3" />
                            </Button>
                        </a>
                    ) : (
                        <div className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-center text-xs text-content-secondary">
                            WhatsApp não disponível
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
