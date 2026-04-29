'use client';

import * as React from 'react';
import { Loader2, Search, User, X } from 'lucide-react';
import { toast } from 'sonner';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type PlanActiveClientsDialogProps = {
    planId: string;
    planName: string;
    children: React.ReactNode;
};

type ActiveClientItem = {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    status?: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELED' | string;
    creditsTotal?: number;
    creditsUsed?: number;
    creditsRemaining?: number;
    creditsLabel?: string;
    serviceBalances?: Array<{
        serviceId: string;
        serviceName: string;
        creditsTotal: number;
        creditsUsed: number;
        creditsRemaining: number;
        creditsLabel: string;
        sortOrder: number;
    }>;
};

type PlanActiveClientsGetResponse = {
    ok: boolean;
    data?: {
        plan: {
            id: string;
            name: string;
            type: 'GENERAL' | 'CUSTOM';
            isActive: boolean;
            customForClientId: string | null;
        };
        linkedClients?: ActiveClientItem[];
    };
    error?: string;
};

function getClientPlanStatusLabel(status?: string, isActive?: boolean) {
    if (status === 'ACTIVE') return 'Ativo';
    if (status === 'COMPLETED') return 'Créditos utilizados';
    if (status === 'EXPIRED') return 'Plano expirado';
    if (status === 'CANCELED') return 'Cancelado';

    return isActive ? 'Ativo' : 'Inativo';
}

export function PlanActiveClientsDialog({
    planId,
    planName,
    children,
}: PlanActiveClientsDialogProps) {
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [clients, setClients] = React.useState<ActiveClientItem[]>([]);
    const [query, setQuery] = React.useState('');

    const normalizedQuery = query.trim().toLowerCase();

    const filteredClients = React.useMemo(() => {
        if (!normalizedQuery) return clients;

        return clients.filter((client) => {
            const serviceText = Array.isArray(client.serviceBalances)
                ? client.serviceBalances
                      .map((service) => service.serviceName)
                      .join(' ')
                : '';

            const haystack = [
                client.name,
                client.email,
                client.status ?? '',
                client.creditsLabel ?? '',
                serviceText,
            ]
                .join(' ')
                .toLowerCase();

            return haystack.includes(normalizedQuery);
        });
    }, [clients, normalizedQuery]);

    function resetState() {
        setQuery('');
    }

    async function loadActiveClients() {
        setLoading(true);

        try {
            const res = await fetch(`/api/admin/plans/${planId}/clients`, {
                method: 'GET',
                cache: 'no-store',
                headers: { accept: 'application/json' },
            });

            const json = (await res
                .json()
                .catch(() => null)) as PlanActiveClientsGetResponse | null;

            if (!res.ok || !json?.ok || !json.data) {
                const msg =
                    (json && json.ok === false && json.error) ||
                    'Não foi possível carregar os clientes ativos do plano.';
                toast.error(msg);
                setClients([]);
                return;
            }

            const nextClients = Array.isArray(json.data.linkedClients)
                ? json.data.linkedClients
                : [];

            setClients(nextClients);
        } catch {
            toast.error(
                'Não foi possível carregar os clientes ativos do plano.'
            );
            setClients([]);
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => {
        if (!open) return;
        void loadActiveClients();
    }, [open, planId]);

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) resetState();
            }}
        >
            <DialogTrigger asChild>{children}</DialogTrigger>

            <DialogContent
                variant="fullscreen"
                className="w-[calc(100vw-2rem)] sm:w-[calc(100vw-3rem)] max-w-5xl border border-border-primary bg-background-secondary p-0"
            >
                <DialogHeader className="shrink-0 border-b border-border-primary px-6 py-4">
                    <DialogTitle className="text-title text-content-primary">
                        Clientes ativos do plano
                    </DialogTitle>

                    <DialogDescription className="space-y-2 text-content-secondary">
                        <span className="block">
                            Plano: <b>{planName}</b>.
                        </span>
                        <span className="block">
                            Aqui você visualiza os clientes ativos e os créditos
                            totais e por serviço.
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[calc(100vh-9rem)] overflow-y-auto px-6 py-5">
                    <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
                        <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-content-brand" />
                            <p className="text-label-medium-size text-content-primary">
                                Clientes ativos
                            </p>
                        </div>

                        <div className="relative">
                            <Search
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-content-brand"
                                size={18}
                            />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Filtre por nome, email ou serviço"
                                className="pl-10 pr-10"
                            />
                            {query ? (
                                <button
                                    type="button"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-content-secondary hover:text-content-primary"
                                    onClick={() => setQuery('')}
                                    aria-label="Limpar busca"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            ) : null}
                        </div>

                        {loading ? (
                            <div className="rounded-xl border border-dashed border-border-primary bg-background-secondary p-4 text-sm text-content-secondary">
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Carregando clientes ativos...
                                </span>
                            </div>
                        ) : clients.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border-primary bg-background-secondary p-4 text-sm text-content-secondary">
                                Nenhum cliente ativo neste plano no momento.
                            </div>
                        ) : filteredClients.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border-primary bg-background-secondary p-4 text-sm text-content-secondary">
                                Nenhum cliente encontrado para a busca
                                informada.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {filteredClients.map((client) => (
                                    <div
                                        key={client.id}
                                        className="rounded-xl border border-border-primary bg-background-secondary p-4"
                                    >
                                        <div className="min-w-0 space-y-1">
                                            <p className="text-paragraph-medium-size font-medium text-content-primary">
                                                {client.name}
                                            </p>

                                            <p className="text-paragraph-small text-content-secondary">
                                                {client.email}
                                            </p>

                                            <p className="text-xs text-content-tertiary">
                                                Status:{' '}
                                                {getClientPlanStatusLabel(
                                                    client.status,
                                                    client.isActive
                                                )}
                                            </p>

                                            {typeof client.creditsTotal ===
                                                'number' &&
                                            client.creditsTotal > 0 ? (
                                                <p className="pt-2 text-xs text-content-tertiary">
                                                    Total de créditos:{' '}
                                                    <span className="font-medium text-content-secondary">
                                                        {client.creditsLabel ??
                                                            `${client.creditsUsed ?? 0}/${client.creditsTotal}`}
                                                    </span>
                                                    {typeof client.creditsRemaining ===
                                                    'number' ? (
                                                        <span className="text-content-tertiary">
                                                            {' '}
                                                            • restantes:{' '}
                                                            {
                                                                client.creditsRemaining
                                                            }
                                                        </span>
                                                    ) : null}
                                                </p>
                                            ) : null}

                                            {Array.isArray(
                                                client.serviceBalances
                                            ) &&
                                            client.serviceBalances.length >
                                                0 ? (
                                                <div className="">
                                                    {client.serviceBalances
                                                        .slice()
                                                        .sort(
                                                            (a, b) =>
                                                                a.sortOrder -
                                                                b.sortOrder
                                                        )
                                                        .map((service) => (
                                                            <div
                                                                key={`${client.id}_${service.serviceId}_${service.sortOrder}`}
                                                            ></div>
                                                        ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}
