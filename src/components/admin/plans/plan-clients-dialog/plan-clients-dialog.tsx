'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

import { cn } from '@/lib/utils';

import { Check, Loader2, Search, User, X, Link2, Unlink2 } from 'lucide-react';

type PlanClientsDialogProps = {
    planId: string;
    planName: string;
    children?: React.ReactNode;
};

type ClientPlanSummary = {
    id: string;
    planId: string;
    planName: string;
    status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELED' | string;
    startsAt?: string | null;
    expiresAt?: string | null;
    isPaid: boolean;
    creditsTotal?: number;
    creditsUsed?: number;
    creditsRemaining?: number;
    creditsLabel?: string;
    isEffectivelyActive?: boolean;
};

type ClientOption = {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    isActive: boolean;
    isSelected?: boolean;
    currentPlan?: ClientPlanSummary | null;
};

type LinkedClientItem = {
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

type PlanClientsGetResponse = {
    ok: boolean;
    data?: {
        plan: {
            id: string;
            name: string;
            type: 'GENERAL' | 'CUSTOM';
            isActive: boolean;
            customForClientId: string | null;
        };
        currentClient?: LinkedClientItem | null;
        linkedClients?: LinkedClientItem[];
        clients: Array<{
            id: string;
            name: string;
            email: string;
            phone?: string | null;
            isActive: boolean;
            isSelected: boolean;
            currentPlan?: ClientPlanSummary | null;
        }>;
    };
    error?: string;
};

type PlanClientsPostResponse = {
    ok: boolean;
    data?: {
        plan: {
            id: string;
            name: string;
            customForClientId?: string | null;
        };
        client: {
            id: string;
            name: string;
            email: string;
        } | null;
        clientPlan?: {
            id: string;
            startsAt: string;
            expiresAt: string;
            status: string;
            isPaid: boolean;
        };
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

export function PlanClientsDialog({
    planId,
    planName,
    children,
}: PlanClientsDialogProps) {
    const router = useRouter();

    const [open, setOpen] = useState(false);

    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [removingClientId, setRemovingClientId] = useState<string | null>(
        null
    );

    const [planType, setPlanType] = useState<'GENERAL' | 'CUSTOM' | null>(null);

    const [linkedClients, setLinkedClients] = useState<LinkedClientItem[]>([]);
    const [availableClients, setAvailableClients] = useState<ClientOption[]>(
        []
    );

    const [isClientPickerOpen, setIsClientPickerOpen] = useState(false);
    const [clientQuery, setClientQuery] = useState('');
    const [selectedClientId, setSelectedClientId] = useState('');
    const [selectedClientName, setSelectedClientName] = useState('');
    const [linkedClientQuery, setLinkedClientQuery] = useState('');

    const isCustomPlan = planType === 'CUSTOM';
    const hasLinkedClients = linkedClients.length > 0;
    const canLinkClient =
        !isCustomPlan &&
        !!selectedClientId &&
        !submitting &&
        !loading &&
        !removingClientId;

    const clientResults = React.useMemo(() => {
        const q = clientQuery.trim().toLowerCase();

        const base = availableClients.filter(
            (client) => client.isActive && !client.isSelected
        );

        if (!q) return [];
        if (q.length < 2) return [];

        return base.filter((client) => {
            const haystack = [
                client.name,
                client.email,
                client.phone ?? '',
                client.currentPlan?.planName ?? '',
                client.currentPlan?.status ?? '',
                client.currentPlan?.creditsLabel ?? '',
            ]
                .join(' ')
                .toLowerCase();

            return haystack.includes(q);
        });
    }, [availableClients, clientQuery]);

    const normalizedLinkedClientQuery = linkedClientQuery.trim().toLowerCase();

    const filteredLinkedClients = React.useMemo(() => {
        if (normalizedLinkedClientQuery.length < 2) return [];

        return linkedClients.filter((client) => {
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

            return haystack.includes(normalizedLinkedClientQuery);
        });
    }, [linkedClients, normalizedLinkedClientQuery]);

    function resetForm() {
        setClientQuery('');
        setSelectedClientId('');
        setSelectedClientName('');
        setIsClientPickerOpen(false);
        setLinkedClientQuery('');
    }

    function closeAndReset() {
        setOpen(false);
        resetForm();
    }

    async function loadPlanClients() {
        setLoading(true);

        try {
            const res = await fetch(`/api/admin/plans/${planId}/clients`, {
                method: 'GET',
                cache: 'no-store',
                headers: { accept: 'application/json' },
            });

            const json = (await res
                .json()
                .catch(() => null)) as PlanClientsGetResponse | null;

            if (!res.ok || !json?.ok || !json.data) {
                const msg =
                    (json && json.ok === false && json.error) ||
                    'Não foi possível carregar os clientes do plano.';
                toast.error(msg);
                setPlanType(null);
                setLinkedClients([]);
                setAvailableClients([]);
                return;
            }

            const nextLinkedClients = Array.isArray(json.data.linkedClients)
                ? json.data.linkedClients
                : json.data.currentClient
                  ? [json.data.currentClient]
                  : [];

            setPlanType(json.data.plan?.type ?? null);
            setLinkedClients(nextLinkedClients);
            setAvailableClients(json.data.clients ?? []);
        } catch {
            toast.error('Não foi possível carregar os clientes do plano.');
            setPlanType(null);
            setLinkedClients([]);
            setAvailableClients([]);
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => {
        if (!open) return;
        void loadPlanClients();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, planId]);

    function handleSelectClient(client: ClientOption) {
        setSelectedClientId(client.id);
        setSelectedClientName(client.name);
        setClientQuery(
            `${client.name}${client.phone ? ` • ${client.phone}` : ''}`
        );
        setIsClientPickerOpen(false);
    }

    function clearSelectedClient() {
        setSelectedClientId('');
        setSelectedClientName('');
        setClientQuery('');
        setIsClientPickerOpen(false);
    }

    async function handleLinkClient() {
        if (isCustomPlan) {
            toast.error(
                'Planos personalizados já são vinculados automaticamente ao cliente na criação.'
            );
            return;
        }

        if (!selectedClientId) {
            toast.error('Selecione um cliente.');
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch(`/api/admin/plans/${planId}/clients`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json',
                },
                body: JSON.stringify({
                    clientId: selectedClientId,
                }),
            });

            const json = (await res
                .json()
                .catch(() => null)) as PlanClientsPostResponse | null;

            if (!res.ok || !json?.ok) {
                const msg =
                    (json && json.ok === false && json.error) ||
                    'Não foi possível vincular e ativar o plano.';
                toast.error(msg);
                return;
            }

            toast.success('Cliente vinculado e plano ativado com sucesso!');
            clearSelectedClient();
            await loadPlanClients();
            router.refresh();
        } catch {
            toast.error('Não foi possível vincular e ativar o plano.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleUnlinkClient(clientId: string) {
        if (isCustomPlan) {
            toast.error(
                'Planos personalizados não podem ser desvinculados por esta tela.'
            );
            return;
        }

        setRemovingClientId(clientId);

        try {
            const res = await fetch(
                `/api/admin/plans/${planId}/clients/${clientId}`,
                {
                    method: 'DELETE',
                    headers: {
                        accept: 'application/json',
                    },
                }
            );

            const json = (await res.json().catch(() => null)) as
                | { ok: true }
                | { ok: false; error?: string }
                | null;

            if (!res.ok || !json || json.ok !== true) {
                const msg =
                    (json && json.ok === false && json.error) ||
                    'Não foi possível remover o cliente do plano.';
                toast.error(msg);
                return;
            }

            toast.success('Cliente removido do plano!');
            clearSelectedClient();
            await loadPlanClients();
            router.refresh();
        } catch {
            toast.error('Não foi possível remover o cliente do plano.');
        } finally {
            setRemovingClientId(null);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (submitting || !!removingClientId) return;
                setOpen(next);
                if (!next) resetForm();
            }}
        >
            <DialogTrigger asChild>
                {children ?? (
                    <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        className="border-border-primary hover:bg-muted/40"
                    >
                        Clientes
                    </Button>
                )}
            </DialogTrigger>

            <DialogContent
                variant="fullscreen"
                className="w-[calc(100vw-2rem)] sm:w-[calc(100vw-3rem)] max-w-5xl border border-border-primary bg-background-secondary p-0"
            >
                <DialogHeader className="shrink-0 border-b border-border-primary px-6 py-4">
                    <DialogTitle className="text-title text-content-primary">
                        Clientes do plano
                    </DialogTitle>

                    <DialogDescription className="space-y-2 text-content-secondary">
                        <span className="block">
                            Plano: <b>{planName}</b>.
                        </span>

                        <span className="block">
                            Regra: cada cliente pode ter apenas{' '}
                            <b>1 plano ativo</b> por vez.
                        </span>

                        {planType ? (
                            <span className="block">
                                <span className="inline-flex rounded-md border border-border-primary bg-background-tertiary px-2 py-1 text-xs text-content-primary">
                                    {planType === 'CUSTOM'
                                        ? 'Plano personalizado'
                                        : 'Plano geral'}
                                </span>
                            </span>
                        ) : null}
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[calc(100vh-9rem)] overflow-y-auto px-6 py-5">
                    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
                        {!isCustomPlan ? (
                            <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
                                <div className="space-y-2">
                                    <p className="text-label-medium-size text-content-primary">
                                        Buscar cliente
                                    </p>

                                    <p className="text-paragraph-small text-content-secondary">
                                        Ao vincular, o plano será ativado
                                        imediatamente para o cliente.
                                    </p>

                                    <Popover
                                        open={isClientPickerOpen}
                                        onOpenChange={setIsClientPickerOpen}
                                    >
                                        <PopoverTrigger asChild>
                                            <div className="relative">
                                                <Search
                                                    className="absolute left-3 top-1/2 -translate-y-1/2 transform text-content-brand"
                                                    size={18}
                                                />

                                                <Input
                                                    value={clientQuery}
                                                    onFocus={() =>
                                                        setIsClientPickerOpen(
                                                            true
                                                        )
                                                    }
                                                    onChange={(e) => {
                                                        const value =
                                                            e.target.value;

                                                        setClientQuery(value);

                                                        if (selectedClientId) {
                                                            setSelectedClientId(
                                                                ''
                                                            );
                                                            setSelectedClientName(
                                                                ''
                                                            );
                                                        }

                                                        setIsClientPickerOpen(
                                                            value.trim()
                                                                .length > 0
                                                        );
                                                    }}
                                                    placeholder="Digite nome, email ou telefone"
                                                    className="pl-10 pr-10"
                                                />

                                                {selectedClientId ||
                                                clientQuery ? (
                                                    <button
                                                        type="button"
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 transform rounded-md p-1 text-content-secondary hover:text-content-primary"
                                                        onClick={
                                                            clearSelectedClient
                                                        }
                                                        aria-label="Limpar cliente"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                ) : null}
                                            </div>
                                        </PopoverTrigger>

                                        <PopoverContent
                                            className="w-[--radix-popover-trigger-width] p-2"
                                            align="start"
                                            onOpenAutoFocus={(e) =>
                                                e.preventDefault()
                                            }
                                            onCloseAutoFocus={(e) =>
                                                e.preventDefault()
                                            }
                                        >
                                            <div className="max-h-64 overflow-auto rounded-md border border-border-primary bg-background-secondary">
                                                {!clientQuery.trim() ? null : clientQuery.trim()
                                                      .length < 2 ? (
                                                    <div className="px-3 py-3 text-sm text-content-secondary">
                                                        Digite pelo menos{' '}
                                                        <b>2 caracteres</b>.
                                                    </div>
                                                ) : clientResults.length ===
                                                  0 ? (
                                                    <div className="px-3 py-3 text-sm text-content-secondary">
                                                        Nenhum cliente
                                                        disponível para vínculo.
                                                    </div>
                                                ) : (
                                                    <div className="divide-y divide-border-primary">
                                                        {clientResults.map(
                                                            (client) => {
                                                                const active =
                                                                    selectedClientId ===
                                                                    client.id;

                                                                return (
                                                                    <button
                                                                        key={
                                                                            client.id
                                                                        }
                                                                        type="button"
                                                                        className={cn(
                                                                            'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-background-tertiary',
                                                                            active &&
                                                                                'bg-background-tertiary'
                                                                        )}
                                                                        onClick={() =>
                                                                            handleSelectClient(
                                                                                client
                                                                            )
                                                                        }
                                                                    >
                                                                        <div className="min-w-0">
                                                                            <p className="truncate font-medium text-content-primary">
                                                                                {
                                                                                    client.name
                                                                                }
                                                                            </p>
                                                                            <p className="truncate text-xs text-content-secondary">
                                                                                {
                                                                                    client.email
                                                                                }
                                                                            </p>
                                                                            {client.phone ? (
                                                                                <p className="truncate text-xs text-content-secondary">
                                                                                    {
                                                                                        client.phone
                                                                                    }
                                                                                </p>
                                                                            ) : null}

                                                                            {client.currentPlan ? (
                                                                                <div className="mt-1 space-y-0.5">
                                                                                    <p className="truncate text-xs text-content-tertiary">
                                                                                        Plano
                                                                                        anterior:{' '}
                                                                                        <span className="font-medium text-content-secondary">
                                                                                            {getClientPlanStatusLabel(
                                                                                                client
                                                                                                    .currentPlan
                                                                                                    ?.status
                                                                                            )}
                                                                                        </span>
                                                                                    </p>

                                                                                    {typeof client
                                                                                        .currentPlan
                                                                                        ?.creditsTotal ===
                                                                                        'number' &&
                                                                                    client
                                                                                        .currentPlan
                                                                                        .creditsTotal >
                                                                                        0 ? (
                                                                                        <p className="truncate text-xs text-content-tertiary">
                                                                                            Créditos:{' '}
                                                                                            <span className="font-medium text-content-secondary">
                                                                                                {client
                                                                                                    .currentPlan
                                                                                                    .creditsLabel ??
                                                                                                    `${client.currentPlan.creditsUsed ?? 0}/${client.currentPlan.creditsTotal}`}
                                                                                            </span>
                                                                                        </p>
                                                                                    ) : null}
                                                                                </div>
                                                                            ) : null}
                                                                        </div>

                                                                        {active ? (
                                                                            <Check className="h-4 w-4 shrink-0 text-content-brand" />
                                                                        ) : null}
                                                                    </button>
                                                                );
                                                            }
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-content-brand" />
                                        <p className="text-paragraph-small font-medium text-content-primary">
                                            Cliente selecionado
                                        </p>
                                    </div>

                                    {selectedClientId ? (
                                        <div className="rounded-lg border border-border-primary bg-background-tertiary px-3 py-3">
                                            <p className="text-paragraph-small font-medium text-content-primary">
                                                {selectedClientName}
                                            </p>
                                            <p className="text-xs text-content-secondary">
                                                ID: {selectedClientId}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-paragraph-small text-content-secondary">
                                            Nenhum cliente selecionado.
                                        </p>
                                    )}

                                    <Button
                                        type="button"
                                        variant="brand"
                                        disabled={!canLinkClient}
                                        onClick={handleLinkClient}
                                        className="w-full"
                                    >
                                        {submitting ? (
                                            <span className="inline-flex items-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Vinculando e ativando...
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-2">
                                                <Link2 className="h-4 w-4" />
                                                Vincular e ativar plano
                                            </span>
                                        )}
                                    </Button>
                                </div>
                            </section>
                        ) : (
                            <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
                                <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-2">
                                    <p className="text-label-medium-size text-content-primary">
                                        Plano personalizado
                                    </p>
                                    <p className="text-paragraph-small text-content-secondary">
                                        Este plano já é vinculado
                                        automaticamente ao cliente no momento da
                                        criação.
                                    </p>
                                    <p className="text-paragraph-small text-content-secondary">
                                        Nesta tela, o vínculo é exibido apenas
                                        para consulta.
                                    </p>
                                </div>
                            </section>
                        )}

                        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
                            <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-content-brand" />
                                <p className="text-label-medium-size text-content-primary">
                                    Clientes vinculados ao plano
                                </p>
                            </div>

                            <div className="relative">
                                <Search
                                    className="absolute left-3 top-1/2 -translate-y-1/2 transform text-content-brand"
                                    size={18}
                                />
                                <Input
                                    value={linkedClientQuery}
                                    onChange={(e) =>
                                        setLinkedClientQuery(e.target.value)
                                    }
                                    placeholder="Digite nome, email ou serviço"
                                    className="pl-10 pr-10"
                                />
                                {linkedClientQuery ? (
                                    <button
                                        type="button"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 transform rounded-md p-1 text-content-secondary hover:text-content-primary"
                                        onClick={() => setLinkedClientQuery('')}
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
                                        Carregando clientes vinculados...
                                    </span>
                                </div>
                            ) : !hasLinkedClients ? (
                                <div className="rounded-xl border border-dashed border-border-primary bg-background-secondary p-4 text-sm text-content-secondary">
                                    Nenhum cliente vinculado a este plano ainda.
                                </div>
                            ) : normalizedLinkedClientQuery.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-border-primary bg-background-secondary p-4 text-sm text-content-secondary">
                                    Digite pelo menos <b>2 caracteres</b> para
                                    buscar clientes vinculados.
                                </div>
                            ) : normalizedLinkedClientQuery.length < 2 ? (
                                <div className="rounded-xl border border-dashed border-border-primary bg-background-secondary p-4 text-sm text-content-secondary">
                                    Digite pelo menos <b>2 caracteres</b> para
                                    iniciar a busca.
                                </div>
                            ) : filteredLinkedClients.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-border-primary bg-background-secondary p-4 text-sm text-content-secondary">
                                    Nenhum cliente encontrado para a busca
                                    informada.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredLinkedClients.map((client) => (
                                        <div
                                            key={client.id}
                                            className="rounded-xl border border-border-primary bg-background-secondary p-4"
                                        >
                                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div className="min-w-0 space-y-1 flex-1">
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

                                                    {Array.isArray(
                                                        client.serviceBalances
                                                    ) &&
                                                    client.serviceBalances
                                                        .length > 0 ? (
                                                        <div className="mt-3 space-y-2">
                                                            {client.serviceBalances.map(
                                                                (service) => (
                                                                    <div
                                                                        key={
                                                                            service.serviceId
                                                                        }
                                                                        className="border-b border-border-primary/40 pb-1 last:border-none"
                                                                    >
                                                                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center text-xs text-content-tertiary">
                                                                            <span className="truncate pr-2">
                                                                                {
                                                                                    service.serviceName
                                                                                }
                                                                            </span>

                                                                            <span className="font-medium text-content-secondary whitespace-nowrap text-left pl-6">
                                                                                {
                                                                                    service.creditsLabel
                                                                                }
                                                                                <span className="text-content-tertiary">
                                                                                    {' '}
                                                                                    •
                                                                                    restantes:{' '}
                                                                                    {
                                                                                        service.creditsRemaining
                                                                                    }
                                                                                </span>
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    ) : null}

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
                                                </div>

                                                {!isCustomPlan ? (
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="sm"
                                                        disabled={
                                                            removingClientId ===
                                                            client.id
                                                        }
                                                        onClick={() =>
                                                            handleUnlinkClient(
                                                                client.id
                                                            )
                                                        }
                                                    >
                                                        {removingClientId ===
                                                        client.id ? (
                                                            <span className="inline-flex items-center gap-2">
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                                Removendo...
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-2">
                                                                <Unlink2 className="h-4 w-4" />
                                                                Remover do plano
                                                            </span>
                                                        )}
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>

                    <div className="mt-4 flex justify-end gap-2 border-t border-border-primary pt-4">
                        <Button
                            type="button"
                            variant="brand"
                            onClick={closeAndReset}
                            disabled={submitting || !!removingClientId}
                        >
                            Fechar
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
