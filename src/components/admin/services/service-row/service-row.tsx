// src/components/admin/services/service-row.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ServiceEditDialog } from '@/components/admin/services/service-edit-dialog';

export type ServiceRowItem = {
    id: string;

    name: string;
    description?: string | null;

    // Formato UI (API atual)
    priceInCents?: number | null;
    durationInMinutes?: number | null;
    barberPercentage?: number | null;

    // Formato “prisma-like” (page antiga)
    price?: string | number | null; // decimal string
    durationMinutes?: number | null;
    professionalPercentage?: string | number | null;

    cancelLimitHours?: number | null;
    cancelFeePercentage?: number | string | null;

    isActive: boolean;

    companyId?: string | null;
    unitId?: string | null;
};

type ServiceRowProps = {
    service: ServiceRowItem;
};

export function formatBRLFromCents(valueInCents: number | null | undefined) {
    if (typeof valueInCents !== 'number' || !Number.isFinite(valueInCents))
        return '—';

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(valueInCents / 100);
}

export function formatMinutes(value: number | null | undefined) {
    const v = Number(value ?? 0);
    if (!Number.isFinite(v) || v <= 0) return '—';
    if (v < 60) return `${v} min`;
    const h = Math.floor(v / 60);
    const m = v % 60;
    return m ? `${h}h ${m}min` : `${h}h`;
}

export function toFiniteNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    if (typeof value === 'string') {
        const normalized = value.trim().replace(',', '.');
        const n = Number(normalized);
        return Number.isFinite(n) ? n : null;
    }

    return null;
}

export function centsToDecimalString(valueInCents: number | null | undefined) {
    if (typeof valueInCents !== 'number' || !Number.isFinite(valueInCents))
        return '';
    return (valueInCents / 100).toFixed(2);
}

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error?: string };

export async function patchService(
    serviceId: string,
    payload: Record<string, unknown>
) {
    const res = await fetch(`/api/admin/services/${serviceId}`, {
        method: 'PATCH',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => null)) as
        | ApiOk<unknown>
        | ApiErr
        | null;

    if (!res.ok || !json || json.ok !== true) {
        const msg =
            (json && json.ok === false && json.error) ||
            'Não foi possível salvar.';
        return { ok: false as const, error: msg };
    }

    return { ok: true as const, data: json.data };
}

export function normalizeServiceForUI(service: ServiceRowItem) {
    const priceInCents =
        typeof service.priceInCents === 'number'
            ? service.priceInCents
            : (() => {
                  const priceDecimal = toFiniteNumber(service.price);
                  if (priceDecimal === null) return null;
                  return Math.round(priceDecimal * 100);
              })();

    const durationInMinutes =
        typeof service.durationInMinutes === 'number'
            ? service.durationInMinutes
            : typeof service.durationMinutes === 'number'
              ? service.durationMinutes
              : null;

    const commissionPct =
        typeof service.barberPercentage === 'number'
            ? service.barberPercentage
            : (() => {
                  const n = toFiniteNumber(service.professionalPercentage);
                  return n === null ? null : n;
              })();

    const cancelFeePct =
        typeof service.cancelFeePercentage === 'number'
            ? service.cancelFeePercentage
            : (() => {
                  const n = toFiniteNumber(service.cancelFeePercentage);
                  return n === null ? null : n;
              })();

    return { priceInCents, durationInMinutes, commissionPct, cancelFeePct };
}

export function buildServiceDialogShape(
    service: ServiceRowItem,
    normalized: ReturnType<typeof normalizeServiceForUI>
) {
    return {
        id: service.id,
        unitId: service.unitId ?? null,
        name: service.name,
        price: centsToDecimalString(normalized.priceInCents),
        durationMinutes: normalized.durationInMinutes ?? 0,
        professionalPercentage:
            normalized.commissionPct !== null
                ? String(normalized.commissionPct)
                : '50',
        cancelLimitHours: service.cancelLimitHours ?? null,
        cancelFeePercentage:
            normalized.cancelFeePct !== null
                ? String(normalized.cancelFeePct)
                : null,
        isActive: Boolean(service.isActive),
    } as any;
}

export function ServiceRow({ service }: ServiceRowProps) {
    const router = useRouter();

    const isActive = Boolean(service.isActive);

    const [isToggling, setIsToggling] = React.useState(false);

    const normalized = React.useMemo(
        () => normalizeServiceForUI(service),
        [service]
    );

    const serviceLikeForDialog = React.useMemo(
        () => buildServiceDialogShape(service, normalized),
        [service, normalized]
    );

    async function handleToggleActive() {
        if (isToggling) return;

        setIsToggling(true);

        const res = await patchService(service.id, { isActive: !isActive });

        setIsToggling(false);

        if (!res.ok) {
            toast.error(res.error);
            return;
        }

        toast.success(isActive ? 'Serviço desativado!' : 'Serviço ativado!');
        router.refresh();
    }

    return (
        <tr className="border-t border-border-primary">
            <td className="px-4 py-3">
                <div className="space-y-0.5">
                    <p className="text-paragraph-medium-size text-content-primary">
                        {service.name}
                    </p>

                    {service.description ? (
                        <p className="text-paragraph-small text-content-tertiary line-clamp-2">
                            {service.description}
                        </p>
                    ) : (
                        <p className="text-paragraph-small text-content-tertiary"></p>
                    )}
                </div>
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {formatBRLFromCents(normalized.priceInCents)}
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {formatMinutes(normalized.durationInMinutes)}
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {typeof normalized.commissionPct === 'number'
                    ? `${normalized.commissionPct}%`
                    : '—'}
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {typeof service.cancelLimitHours === 'number'
                    ? `Até ${service.cancelLimitHours}h antes`
                    : '—'}
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {typeof normalized.cancelFeePct === 'number'
                    ? `${normalized.cancelFeePct}%`
                    : '—'}
            </td>

            {/* ✅ Removido: coluna Status */}

            <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                    <ServiceEditDialog service={serviceLikeForDialog} />

                    <Button
                        variant={isActive ? 'destructive' : 'active'}
                        size="sm"
                        type="button"
                        onClick={handleToggleActive}
                        disabled={isToggling}
                        className="border-border-primary hover:bg-muted/40"
                    >
                        {isToggling
                            ? 'Salvando...'
                            : isActive
                              ? 'Desativar'
                              : 'Ativar'}
                    </Button>
                </div>
            </td>
        </tr>
    );
}
