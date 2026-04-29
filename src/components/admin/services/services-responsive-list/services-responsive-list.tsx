// src/components/admin/services/services-responsive-list/services-responsive-list.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ServiceEditDialog } from '@/components/admin/services/service-edit-dialog';

import type { ServiceRowItem } from '@/components/admin/services/service-row';
import {
    normalizeServiceForUI,
    buildServiceDialogShape,
    patchService,
    formatBRLFromCents,
    formatMinutes,
    ServiceRow,
} from '@/components/admin/services/service-row';

/* ---------------------------------------------
 * ✅ Media query hook (evita render duplicado)
 * --------------------------------------------- */
function useMediaQuery(query: string) {
    const getMatch = React.useCallback(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(query).matches;
    }, [query]);

    const [matches, setMatches] = React.useState<boolean>(() => getMatch());

    React.useEffect(() => {
        const mql = window.matchMedia(query);

        const onChange = () => setMatches(mql.matches);

        // seta já (caso o primeiro render pegue antes do matchMedia atualizar)
        setMatches(mql.matches);

        if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', onChange);
            return () => mql.removeEventListener('change', onChange);
        }

        // Safari antigo
        mql.addListener(onChange);
        return () => mql.removeListener(onChange);
    }, [query]);

    return matches;
}

function ServiceCard({ service }: { service: ServiceRowItem }) {
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

    const commissionLabel =
        typeof normalized.commissionPct === 'number'
            ? `${normalized.commissionPct}%`
            : '—';

    const cancelLimitLabel =
        typeof service.cancelLimitHours === 'number'
            ? `Até ${service.cancelLimitHours}h antes`
            : '—';

    const cancelFeeLabel =
        typeof normalized.cancelFeePct === 'number'
            ? `${normalized.cancelFeePct}%`
            : '—';

    return (
        <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3">
            <div className="min-w-0 space-y-1">
                <p className="text-paragraph-medium-size font-semibold text-content-primary wrap-break-word">
                    {service.name}
                </p>

                {service.description ? (
                    <p className="text-paragraph-small text-content-tertiary line-clamp-2">
                        {service.description}
                    </p>
                ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-0.5">
                    <p className="text-[11px] text-content-tertiary">Preço</p>
                    <p className="text-paragraph-small text-content-primary font-medium">
                        {formatBRLFromCents(normalized.priceInCents)}
                    </p>
                </div>

                <div className="space-y-0.5">
                    <p className="text-[11px] text-content-tertiary">Duração</p>
                    <p className="text-paragraph-small text-content-primary font-medium">
                        {formatMinutes(normalized.durationInMinutes)}
                    </p>
                </div>

                <div className="space-y-0.5">
                    <p className="text-[11px] text-content-tertiary">
                        Comissão
                    </p>
                    <p className="text-paragraph-small text-content-primary font-medium">
                        {commissionLabel}
                    </p>
                </div>

                <div className="space-y-0.5">
                    <p className="text-[11px] text-content-tertiary">
                        Cancelamento
                    </p>
                    <p className="text-paragraph-small text-content-primary font-medium">
                        {cancelLimitLabel}
                    </p>
                </div>

                <div className="space-y-0.5">
                    <p className="text-[11px] text-content-tertiary">Taxa</p>
                    <p className="text-paragraph-small text-content-primary font-medium">
                        {cancelFeeLabel}
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
                <ServiceEditDialog service={serviceLikeForDialog} />

                <Button
                    variant={isActive ? 'destructive' : 'active'}
                    size="sm"
                    type="button"
                    onClick={handleToggleActive}
                    disabled={isToggling}
                    className="border-border-primary hover:bg-muted/40 w-full"
                    title={
                        isToggling
                            ? 'Salvando...'
                            : isActive
                              ? 'Desativar serviço'
                              : 'Ativar serviço'
                    }
                >
                    {isToggling
                        ? 'Salvando...'
                        : isActive
                          ? 'Desativar'
                          : 'Ativar'}
                </Button>
            </div>
        </div>
    );
}

export function ServicesResponsiveList({
    services,
}: {
    services: ServiceRowItem[];
}) {
    const list = Array.isArray(services) ? services : [];

    // ✅ Desktop = min-width 768px (mesmo breakpoint do md do Tailwind)
    const isDesktop = useMediaQuery('(min-width: 768px)');

    // ✅ Render ÚNICO (nunca mais card + tabela juntos)
    if (!isDesktop) {
        return (
            <section className="space-y-2">
                {list.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhum serviço cadastrado ainda.
                        </p>
                    </div>
                ) : (
                    list.map((s) => <ServiceCard key={s.id} service={s} />)
                )}
            </section>
        );
    }

    return (
        <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
            <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                    <col className="w-60" />
                    <col className="w-15" />
                    <col className="w-15" />
                    <col className="w-15" />
                    <col className="w-20" />
                    <col className="w-15" />
                    <col className="w-27.5" />
                </colgroup>

                <thead>
                    <tr className="border-b border-border-primary bg-background-secondary">
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Serviço
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Preço
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Duração
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Comissão
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Cancelamento
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Taxa
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                            Ações
                        </th>
                    </tr>
                </thead>

                <tbody className="[&>tr>td]:align-middle">
                    {list.length === 0 ? (
                        <tr className="border-t border-border-primary">
                            <td
                                colSpan={7}
                                className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                            >
                                Nenhum serviço cadastrado ainda.
                            </td>
                        </tr>
                    ) : (
                        list.map((service) => (
                            <ServiceRow key={service.id} service={service} />
                        ))
                    )}
                </tbody>
            </table>
        </section>
    );
}
