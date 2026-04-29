'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

import { cn } from '@/lib/utils';
import {
    ArrowDown,
    ArrowUp,
    BadgeDollarSign,
    CalendarDays,
    Clock3,
    FileText,
    Loader2,
    Percent,
    Ticket,
    Users,
    Scissors,
    ListOrdered,
    Search,
    Check,
    X,
} from 'lucide-react';

type ServiceOption = {
    id: string;
    name: string;
    isActive: boolean;
    price: string;
    durationMinutes: number;
    professionalPercentage: string;
};

type ProfessionalOption = {
    id: string;
    name: string;
    isActive: boolean;
};

type ClientOption = {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
};

type PlanGetResponse =
    | {
          ok: true;
          data: {
              plans: unknown[];
              services: ServiceOption[];
              professionals: ProfessionalOption[];
              clients: ClientOption[];
          };
      }
    | { ok: false; error?: string };

type PlanPostResponse =
    | {
          ok: true;
          data: { id: string };
      }
    | { ok: false; error?: string };

type PlanType = 'GENERAL' | 'CUSTOM' | 'SUBSCRIPTION';

type ServiceItemForm = {
    tempId: string;
    serviceId: string;
    creditsIncluded: string;
    professionalPercentage: string;
};

const SUBSCRIPTION_CREDITS = '31';
const SUBSCRIPTION_VALIDITY_DAYS = '30';

function makeTempId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function IconInput(
    props: React.ComponentProps<typeof Input> & {
        icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    }
) {
    const { icon: Icon, className, ...rest } = props;

    return (
        <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                <Icon className="h-4 w-4 text-content-brand" />
            </div>

            <Input {...rest} className={cn('pl-10', className)} />
        </div>
    );
}

function IconTextarea(
    props: React.ComponentProps<typeof Textarea> & {
        icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    }
) {
    const { icon: Icon, className, ...rest } = props;

    return (
        <div className="relative">
            <div className="pointer-events-none absolute left-3 top-3">
                <Icon className="h-4 w-4 text-content-brand" />
            </div>

            <Textarea {...rest} className={cn('pl-10', className)} />
        </div>
    );
}

const INPUT_BASE =
    'bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0';

const SELECT_TRIGGER =
    'h-10 w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0 focus-visible:border-border-brand';

function parseNumberPtBR(value: string) {
    const normalized = String(value ?? '')
        .trim()
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.');

    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
}

function parseIntegerSafe(value: string) {
    const n = Number(String(value ?? '').trim());
    return Number.isInteger(n) ? n : NaN;
}

function weekdayLabel(value: number) {
    switch (value) {
        case 0:
            return 'Dom';
        case 1:
            return 'Seg';
        case 2:
            return 'Ter';
        case 3:
            return 'Qua';
        case 4:
            return 'Qui';
        case 5:
            return 'Sex';
        case 6:
            return 'Sáb';
        default:
            return String(value);
    }
}

function formatCurrency(value: string | number) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return 'R$ 0,00';

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(n);
}

function duplicateServiceIds(items: ServiceItemForm[]) {
    const counts = new Map<string, number>();

    for (const item of items) {
        const key = item.serviceId.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([serviceId]) => serviceId);
}

function arraysEqual(a: string[], b: string[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function PlanNewDialog() {
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isPending, setIsPending] = useState(false);

    const [services, setServices] = useState<ServiceOption[]>([]);
    const [professionals, setProfessionals] = useState<ProfessionalOption[]>(
        []
    );
    const [clients, setClients] = useState<ClientOption[]>([]);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<PlanType>('GENERAL');
    const [customForClientId, setCustomForClientId] = useState('');
    const [customForClientQuery, setCustomForClientQuery] = useState('');
    const [isClientPickerOpen, setIsClientPickerOpen] = useState(false);
    const [price, setPrice] = useState('');
    const [validityDays, setValidityDays] = useState('30');
    const [allowedStartTime, setAllowedStartTime] = useState('');
    const [allowedEndTime, setAllowedEndTime] = useState('');

    const [selectedProfessionalIds, setSelectedProfessionalIds] = useState<
        string[]
    >([]);

    const [allowedWeekdays, setAllowedWeekdays] = useState<number[]>([]);
    const [serviceItems, setServiceItems] = useState<ServiceItemForm[]>([]);
    const [creditOrderServiceIds, setCreditOrderServiceIds] = useState<
        string[]
    >([]);

    const busy = loading || isPending;
    const isCustomPlan = type === 'CUSTOM';
    const isSubscriptionPlan = type === 'SUBSCRIPTION';

    const activeServices = useMemo(
        () => services.filter((s) => s.isActive),
        [services]
    );

    const activeProfessionals = useMemo(
        () => professionals.filter((p) => p.isActive),
        [professionals]
    );

    const activeClients = useMemo(
        () => clients.filter((c) => c.isActive),
        [clients]
    );

    const hasServices = activeServices.length > 0;
    const hasActiveClients = activeClients.length > 0;

    const selectedCustomClient = useMemo(() => {
        return (
            activeClients.find((client) => client.id === customForClientId) ??
            null
        );
    }, [activeClients, customForClientId]);

    const filteredCustomClients = useMemo(() => {
        const q = customForClientQuery.trim().toLowerCase();

        if (!q) return [];
        if (q.length < 2) return [];

        return activeClients.filter((client) => {
            const haystack = `${client.name} ${client.email}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [activeClients, customForClientQuery]);

    const serviceMap = useMemo(() => {
        return new Map(activeServices.map((s) => [s.id, s]));
    }, [activeServices]);

    const serviceItemsDetailed = useMemo(() => {
        return serviceItems.map((item, index) => {
            const service = serviceMap.get(item.serviceId);
            const credits = parseIntegerSafe(item.creditsIncluded);
            const pct = parseNumberPtBR(item.professionalPercentage);

            return {
                ...item,
                index,
                service,
                credits,
                pct,
            };
        });
    }, [serviceItems, serviceMap]);

    const automaticCreditOrderServiceIds = useMemo(() => {
        return serviceItemsDetailed
            .slice()
            .sort((a, b) => a.index - b.index)
            .flatMap((item) => {
                if (!item.serviceId) return [];
                if (!Number.isInteger(item.credits) || item.credits <= 0)
                    return [];

                return Array.from(
                    { length: item.credits },
                    () => item.serviceId
                );
            });
    }, [serviceItemsDetailed]);

    const normalizedCreditOrderServiceIds = useMemo(() => {
        const expectedCounts = new Map<string, number>();

        for (const serviceId of automaticCreditOrderServiceIds) {
            expectedCounts.set(
                serviceId,
                (expectedCounts.get(serviceId) ?? 0) + 1
            );
        }

        if (expectedCounts.size === 0) return [];

        const usedCounts = new Map<string, number>();
        const kept: string[] = [];

        for (const serviceId of creditOrderServiceIds) {
            const expected = expectedCounts.get(serviceId) ?? 0;
            const used = usedCounts.get(serviceId) ?? 0;

            if (expected <= 0 || used >= expected) continue;

            kept.push(serviceId);
            usedCounts.set(serviceId, used + 1);
        }

        for (const serviceId of automaticCreditOrderServiceIds) {
            const expected = expectedCounts.get(serviceId) ?? 0;
            const used = usedCounts.get(serviceId) ?? 0;

            if (used >= expected) continue;

            kept.push(serviceId);
            usedCounts.set(serviceId, used + 1);
        }

        return kept;
    }, [automaticCreditOrderServiceIds, creditOrderServiceIds]);

    useEffect(() => {
        if (
            arraysEqual(creditOrderServiceIds, normalizedCreditOrderServiceIds)
        ) {
            return;
        }

        setCreditOrderServiceIds(normalizedCreditOrderServiceIds);
    }, [creditOrderServiceIds, normalizedCreditOrderServiceIds]);

    const totalCredits = useMemo(() => {
        return serviceItemsDetailed.reduce((sum, item) => {
            return (
                sum +
                (Number.isInteger(item.credits) && item.credits > 0
                    ? item.credits
                    : 0)
            );
        }, 0);
    }, [serviceItemsDetailed]);

    const avulsoTotal = useMemo(() => {
        return serviceItemsDetailed.reduce((sum, item) => {
            if (!item.service) return sum;
            if (!Number.isInteger(item.credits) || item.credits <= 0)
                return sum;

            const servicePrice = Number(item.service.price);
            if (!Number.isFinite(servicePrice)) return sum;

            return sum + servicePrice * item.credits;
        }, 0);
    }, [serviceItemsDetailed]);

    const planPriceNumber = useMemo(() => parseNumberPtBR(price), [price]);

    const economyValue = useMemo(() => {
        if (!Number.isFinite(avulsoTotal)) return 0;
        if (!Number.isFinite(planPriceNumber)) return 0;
        return Math.max(0, avulsoTotal - planPriceNumber);
    }, [avulsoTotal, planPriceNumber]);

    const economyPct = useMemo(() => {
        if (!Number.isFinite(avulsoTotal) || avulsoTotal <= 0) return 0;
        if (!Number.isFinite(planPriceNumber)) return 0;
        return Math.max(
            0,
            ((avulsoTotal - planPriceNumber) / avulsoTotal) * 100
        );
    }, [avulsoTotal, planPriceNumber]);

    const creditOrderPreview = useMemo(() => {
        return normalizedCreditOrderServiceIds.map((serviceId, index) => ({
            index,
            serviceId,
            service: serviceMap.get(serviceId),
        }));
    }, [normalizedCreditOrderServiceIds, serviceMap]);

    function resetForm() {
        setName('');
        setDescription('');
        setType('GENERAL');
        setCustomForClientId('');
        setCustomForClientQuery('');
        setIsClientPickerOpen(false);
        setPrice('');
        setValidityDays('30');
        setAllowedStartTime('');
        setAllowedEndTime('');
        setSelectedProfessionalIds([]);
        setAllowedWeekdays([]);
        setServiceItems([]);
        setCreditOrderServiceIds([]);
    }

    async function loadData() {
        setLoading(true);

        try {
            const res = await fetch('/api/admin/plans', {
                method: 'GET',
                cache: 'no-store',
                headers: { accept: 'application/json' },
            });

            const json = (await res
                .json()
                .catch(() => null)) as PlanGetResponse | null;

            if (!res.ok || !json || (json as any).ok !== true) {
                const msg =
                    (json &&
                        (json as any).ok === false &&
                        (json as any).error) ||
                    'Não foi possível carregar dados.';
                setServices([]);
                setProfessionals([]);
                setClients([]);
                toast.error(msg);
                return;
            }

            const nextServices = (json as any).data?.services ?? [];
            const nextProfessionals = (json as any).data?.professionals ?? [];
            const nextClients = (json as any).data?.clients ?? [];

            setServices(nextServices);
            setProfessionals(nextProfessionals);
            setClients(nextClients);
        } catch {
            setServices([]);
            setProfessionals([]);
            setClients([]);
            toast.error('Não foi possível carregar dados.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!open) return;
        void loadData();
    }, [open]);

    useEffect(() => {
        if (type !== 'CUSTOM' && customForClientId) {
            setCustomForClientId('');
            setCustomForClientQuery('');
            setIsClientPickerOpen(false);
        }
    }, [type, customForClientId]);

    useEffect(() => {
        if (!isSubscriptionPlan) return;

        if (validityDays !== SUBSCRIPTION_VALIDITY_DAYS) {
            setValidityDays(SUBSCRIPTION_VALIDITY_DAYS);
        }

        if (serviceItems.length > 1) {
            setServiceItems((prev) => prev.slice(0, 1));
        }

        setServiceItems((prev) =>
            prev.map((item) => ({
                ...item,
                creditsIncluded: SUBSCRIPTION_CREDITS,
            }))
        );
    }, [isSubscriptionPlan, validityDays, serviceItems.length]);

    function toggleProfessional(id: string) {
        setSelectedProfessionalIds((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            return [...prev, id];
        });
    }

    function toggleWeekday(day: number) {
        setAllowedWeekdays((prev) => {
            if (prev.includes(day)) return prev.filter((x) => x !== day);
            return [...prev, day].sort((a, b) => a - b);
        });
    }

    function addServiceItem() {
        const defaultService = activeServices[0];

        const nextItem: ServiceItemForm = {
            tempId: makeTempId(),
            serviceId: defaultService?.id ?? '',
            creditsIncluded: isSubscriptionPlan ? SUBSCRIPTION_CREDITS : '1',
            professionalPercentage:
                defaultService?.professionalPercentage ?? '50',
        };

        setServiceItems((prev) => {
            if (isSubscriptionPlan) {
                return [nextItem];
            }

            return [...prev, nextItem];
        });
    }

    function updateServiceItem(
        tempId: string,
        patch: Partial<ServiceItemForm>
    ) {
        setServiceItems((prev) =>
            prev.map((item) => {
                if (item.tempId !== tempId) return item;

                const next = { ...item, ...patch };

                if (
                    patch.serviceId !== undefined &&
                    patch.serviceId.trim() !== item.serviceId.trim()
                ) {
                    const service = serviceMap.get(patch.serviceId.trim());
                    if (service) {
                        next.professionalPercentage =
                            service.professionalPercentage ?? '50';
                    }
                }

                if (isSubscriptionPlan) {
                    next.creditsIncluded = SUBSCRIPTION_CREDITS;
                }

                return next;
            })
        );
    }

    function removeServiceItem(tempId: string) {
        setServiceItems((prev) =>
            prev.filter((item) => item.tempId !== tempId)
        );
    }

    function moveCreditOrderItem(index: number, direction: 'up' | 'down') {
        setCreditOrderServiceIds((prev) => {
            const next = [...prev];
            const targetIndex = direction === 'up' ? index - 1 : index + 1;

            if (targetIndex < 0 || targetIndex >= next.length) {
                return prev;
            }

            const temp = next[index];
            next[index] = next[targetIndex];
            next[targetIndex] = temp;

            return next;
        });
    }

    function handleSelectCustomClient(client: ClientOption) {
        setCustomForClientId(client.id);
        setCustomForClientQuery(`${client.name} • ${client.email}`);
        setIsClientPickerOpen(false);
    }

    function clearSelectedCustomClient() {
        setCustomForClientId('');
        setCustomForClientQuery('');
        setIsClientPickerOpen(false);
    }

    const duplicateIds = duplicateServiceIds(serviceItems);
    const duplicateNames = duplicateIds
        .map((id) => serviceMap.get(id)?.name ?? 'Serviço')
        .filter(Boolean);

    const requiredOk =
        name.trim().length > 0 &&
        Number.isFinite(planPriceNumber) &&
        planPriceNumber >= 0 &&
        Number.isInteger(parseIntegerSafe(validityDays)) &&
        parseIntegerSafe(validityDays) > 0 &&
        serviceItems.length > 0 &&
        duplicateIds.length === 0 &&
        (!isSubscriptionPlan || serviceItems.length === 1) &&
        (!isSubscriptionPlan ||
            parseIntegerSafe(validityDays) ===
                Number(SUBSCRIPTION_VALIDITY_DAYS)) &&
        serviceItemsDetailed.every(
            (item) =>
                !!item.service &&
                Number.isInteger(item.credits) &&
                item.credits > 0 &&
                (!isSubscriptionPlan ||
                    item.credits === Number(SUBSCRIPTION_CREDITS)) &&
                Number.isFinite(item.pct) &&
                item.pct >= 0 &&
                item.pct <= 100
        ) &&
        (type !== 'CUSTOM' || customForClientId.trim().length > 0);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (busy) return;

        if (!hasServices) {
            toast.error(
                'Cadastre pelo menos 1 serviço ativo antes de criar planos.'
            );
            return;
        }

        if (type === 'CUSTOM' && !hasActiveClients) {
            toast.error(
                'Não há clientes ativos disponíveis para criar um plano personalizado.'
            );
            return;
        }

        if (!requiredOk) {
            toast.error('Preencha os campos obrigatórios.');
            return;
        }

        if (duplicateIds.length > 0) {
            toast.error(
                `Não repita serviços no plano. Repetidos: ${duplicateNames.join(', ')}.`
            );
            return;
        }

        if (isSubscriptionPlan && serviceItems.length !== 1) {
            toast.error('A assinatura deve ter exatamente 1 serviço.');
            return;
        }

        if (
            allowedStartTime.trim() &&
            allowedEndTime.trim() &&
            allowedStartTime >= allowedEndTime
        ) {
            toast.error(
                'O horário final deve ser maior que o horário inicial.'
            );
            return;
        }

        const validityDaysNum = isSubscriptionPlan
            ? Number(SUBSCRIPTION_VALIDITY_DAYS)
            : parseIntegerSafe(validityDays);

        const payload = {
            name: name.trim(),
            description: description.trim() || null,
            type,
            customForClientId:
                type === 'CUSTOM' ? customForClientId.trim() : null,
            price: planPriceNumber,
            validityDays: validityDaysNum,
            allowedWeekdays,
            allowedStartTime: allowedStartTime.trim() || null,
            allowedEndTime: allowedEndTime.trim() || null,
            sortOrder: 100,
            professionalIds: selectedProfessionalIds,
            serviceItems: serviceItemsDetailed.map((item, index) => ({
                serviceId: item.serviceId,
                creditsIncluded: isSubscriptionPlan
                    ? Number(SUBSCRIPTION_CREDITS)
                    : item.credits,
                professionalPercentage: item.pct,
                sortOrder: index + 1,
            })),
            creditOrderServiceIds: isSubscriptionPlan
                ? serviceItemsDetailed.length === 1 &&
                  serviceItemsDetailed[0]?.serviceId
                    ? Array.from(
                          { length: Number(SUBSCRIPTION_CREDITS) },
                          () => serviceItemsDetailed[0].serviceId
                      )
                    : []
                : normalizedCreditOrderServiceIds,
        };

        setIsPending(true);

        try {
            const res = await fetch('/api/admin/plans', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const json = (await res
                .json()
                .catch(() => null)) as PlanPostResponse | null;

            if (!res.ok || !json || (json as any).ok !== true) {
                const msg =
                    (json &&
                        (json as any).ok === false &&
                        (json as any).error) ||
                    'Não foi possível criar o plano.';
                toast.error(msg);
                return;
            }

            toast.success(
                isCustomPlan
                    ? 'Plano personalizado criado e ativado com sucesso!'
                    : 'Plano criado com sucesso!'
            );
            setOpen(false);
            resetForm();
            router.refresh();
        } catch {
            toast.error('Não foi possível criar o plano.');
        } finally {
            setIsPending(false);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (busy) return;
                setOpen(next);
                if (!next) resetForm();
            }}
        >
            <DialogTrigger asChild>
                <Button variant="brand">Novo plano</Button>
            </DialogTrigger>

            <DialogContent
                variant="fullscreen"
                className="w-[calc(100vw-2rem)] sm:w-[calc(100vw-3rem)] max-w-425 bg-background-secondary border border-border-primary p-0"
            >
                <DialogHeader className="shrink-0 border-b border-border-primary px-6 py-4">
                    <DialogTitle className="text-title text-content-primary">
                        Novo plano
                    </DialogTitle>
                </DialogHeader>

                <div className="max-h-[calc(100vh-9rem)] overflow-y-auto px-6 py-5">
                    {!loading && !hasServices ? (
                        <div className="rounded-xl border border-dashed border-border-primary bg-background-tertiary p-4 text-sm text-content-secondary">
                            Você ainda não tem serviços ativos. Cadastre pelo
                            menos 1 serviço antes de criar planos.
                        </div>
                    ) : (
                        <form
                            onSubmit={handleSubmit}
                            className="space-y-4 pb-2"
                        >
                            <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
                                <div className="space-y-2 max-w">
                                    <label className="text-label-small text-content-secondary">
                                        Tipo do plano{' '}
                                        <span className="text-red-500">*</span>
                                    </label>

                                    <Select
                                        value={type}
                                        onValueChange={(value) =>
                                            setType(value as PlanType)
                                        }
                                        disabled={busy}
                                    >
                                        <SelectTrigger
                                            className={SELECT_TRIGGER}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Ticket className="h-4 w-4 text-content-brand" />
                                                <SelectValue placeholder="Selecione o tipo" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="GENERAL">
                                                Geral
                                            </SelectItem>
                                            <SelectItem
                                                value="CUSTOM"
                                                disabled={!hasActiveClients}
                                            >
                                                Personalizado
                                            </SelectItem>
                                            <SelectItem value="SUBSCRIPTION">
                                                Assinatura
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>

                                    {!hasActiveClients ? (
                                        <p className="text-xs text-content-tertiary">
                                            Não há clientes ativos disponíveis
                                            para criar plano personalizado no
                                            momento.
                                        </p>
                                    ) : null}
                                </div>

                                {type === 'CUSTOM' ? (
                                    <div className="space-y-2 max-w-xl">
                                        <label className="text-label-small text-content-secondary">
                                            Cliente do plano{' '}
                                            <span className="text-red-500">
                                                *
                                            </span>
                                        </label>

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
                                                        value={
                                                            customForClientQuery
                                                        }
                                                        onFocus={() =>
                                                            setIsClientPickerOpen(
                                                                true
                                                            )
                                                        }
                                                        onChange={(e) => {
                                                            const value =
                                                                e.target.value;

                                                            setCustomForClientQuery(
                                                                value
                                                            );

                                                            if (
                                                                customForClientId
                                                            ) {
                                                                setCustomForClientId(
                                                                    ''
                                                                );
                                                            }

                                                            setIsClientPickerOpen(
                                                                value.trim()
                                                                    .length > 0
                                                            );
                                                        }}
                                                        placeholder="Digite nome ou email do cliente"
                                                        disabled={
                                                            busy ||
                                                            !hasActiveClients
                                                        }
                                                        className="pl-10 pr-10"
                                                    />

                                                    {customForClientId ||
                                                    customForClientQuery ? (
                                                        <button
                                                            type="button"
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 transform rounded-md p-1 text-content-secondary hover:text-content-primary"
                                                            onClick={
                                                                clearSelectedCustomClient
                                                            }
                                                            aria-label="Limpar cliente"
                                                            disabled={busy}
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
                                                    {!customForClientQuery.trim() ? null : customForClientQuery.trim()
                                                          .length < 2 ? (
                                                        <div className="px-3 py-3 text-sm text-content-secondary">
                                                            Digite pelo menos{' '}
                                                            <b>2 caracteres</b>.
                                                        </div>
                                                    ) : filteredCustomClients.length ===
                                                      0 ? (
                                                        <div className="px-3 py-3 text-sm text-content-secondary">
                                                            Nenhum cliente
                                                            encontrado.
                                                        </div>
                                                    ) : (
                                                        <div className="divide-y divide-border-primary">
                                                            {filteredCustomClients.map(
                                                                (client) => {
                                                                    const active =
                                                                        customForClientId ===
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
                                                                                handleSelectCustomClient(
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

                                        {!hasActiveClients ? (
                                            <p className="text-xs text-red-500">
                                                Não há clientes ativos
                                                disponíveis para criar um plano
                                                personalizado.
                                            </p>
                                        ) : !customForClientId.trim() ? (
                                            <p className="text-xs text-red-500">
                                                Selecione o cliente do plano
                                                personalizado.
                                            </p>
                                        ) : selectedCustomClient ? (
                                            <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-1">
                                                <p className="text-paragraph-small font-medium text-content-primary">
                                                    {selectedCustomClient.name}
                                                </p>
                                                <p className="text-xs text-content-secondary">
                                                    {selectedCustomClient.email}
                                                </p>
                                                <p className="text-xs text-content-tertiary">
                                                    Ao criar um plano
                                                    personalizado, ele já será
                                                    vinculado e ativado
                                                    automaticamente para o
                                                    cliente selecionado.
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-content-tertiary">
                                                Ao criar um plano personalizado,
                                                ele já será vinculado e ativado
                                                automaticamente para o cliente
                                                selecionado.
                                            </p>
                                        )}
                                    </div>
                                ) : null}

                                <div
                                    className="grid grid-cols-1 gap-4 md:grid-cols-5"
                                    style={{
                                        gridTemplateColumns:
                                            typeof window !== 'undefined' &&
                                            window.innerWidth >= 768
                                                ? '3fr 1fr 1fr'
                                                : undefined,
                                    }}
                                >
                                    <div className="space-y-2 min-w-0">
                                        <label
                                            className="text-label-small text-content-secondary"
                                            htmlFor="plan-name"
                                        >
                                            Nome do plano{' '}
                                            <span className="text-red-500">
                                                *
                                            </span>
                                        </label>

                                        <IconInput
                                            id="plan-name"
                                            name="name"
                                            required
                                            icon={Ticket}
                                            value={name}
                                            onChange={(e) =>
                                                setName(e.target.value)
                                            }
                                            disabled={busy}
                                            className={INPUT_BASE}
                                        />
                                    </div>

                                    <div className="space-y-2 min-w-0">
                                        <label
                                            className="text-label-small text-content-secondary"
                                            htmlFor="plan-price"
                                        >
                                            Valor do plano (R$){' '}
                                            <span className="text-red-500">
                                                *
                                            </span>
                                        </label>

                                        <IconInput
                                            id="plan-price"
                                            name="price"
                                            inputMode="decimal"
                                            placeholder="Ex: 149,90"
                                            required
                                            icon={BadgeDollarSign}
                                            value={price}
                                            onChange={(e) =>
                                                setPrice(e.target.value)
                                            }
                                            disabled={busy}
                                            className={INPUT_BASE}
                                        />
                                    </div>

                                    <div className="space-y-2 min-w-0">
                                        <label
                                            className="text-label-small text-content-secondary"
                                            htmlFor="plan-validity"
                                        >
                                            Validade{' '}
                                            <span className="text-red-500">
                                                *
                                            </span>
                                        </label>

                                        <IconInput
                                            id="plan-validity"
                                            name="validityDays"
                                            type="number"
                                            min={1}
                                            required
                                            icon={CalendarDays}
                                            value={validityDays}
                                            onChange={(e) =>
                                                setValidityDays(e.target.value)
                                            }
                                            disabled={
                                                busy || isSubscriptionPlan
                                            }
                                            className={INPUT_BASE}
                                        />
                                        {isSubscriptionPlan ? (
                                            <p className="text-xs text-content-tertiary">
                                                Assinaturas sempre têm validade
                                                fixa de 30 dias.
                                            </p>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label
                                        className="text-label-small text-content-secondary"
                                        htmlFor="plan-description"
                                    >
                                        Descrição
                                    </label>

                                    <IconTextarea
                                        id="plan-description"
                                        name="description"
                                        rows={3}
                                        placeholder="Ex: Plano mensal com créditos para barba e acabamento."
                                        icon={FileText}
                                        value={description}
                                        onChange={(e) =>
                                            setDescription(e.target.value)
                                        }
                                        disabled={busy}
                                        className={cn(INPUT_BASE, 'min-h-24')}
                                    />
                                </div>
                            </section>

                            <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
                                <div className="space-y-2">
                                    <p className="text-label-small text-content-secondary">
                                        Dias de uso
                                    </p>

                                    <div className="flex w-full gap-2">
                                        {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                                            const checked =
                                                allowedWeekdays.includes(day);

                                            return (
                                                <label
                                                    key={day}
                                                    className={cn(
                                                        'flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-paragraph-small',
                                                        checked
                                                            ? 'border-border-brand bg-background-secondary text-content-primary'
                                                            : 'border-border-primary bg-background-secondary text-content-secondary'
                                                    )}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 rounded border-border-primary"
                                                        disabled={busy}
                                                        checked={checked}
                                                        onChange={() =>
                                                            toggleWeekday(day)
                                                        }
                                                    />
                                                    <span>
                                                        {weekdayLabel(day)}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>

                                    <p className="text-xs text-content-tertiary">
                                        Se nada for marcado, o plano poderá ser
                                        usado em qualquer dia.
                                    </p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <label
                                            className="text-label-small text-content-secondary"
                                            htmlFor="allowedStartTime"
                                        >
                                            Horário inicial permitido
                                        </label>

                                        <IconInput
                                            id="allowedStartTime"
                                            name="allowedStartTime"
                                            type="time"
                                            icon={Clock3}
                                            value={allowedStartTime}
                                            onChange={(e) =>
                                                setAllowedStartTime(
                                                    e.target.value
                                                )
                                            }
                                            disabled={busy}
                                            className={INPUT_BASE}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label
                                            className="text-label-small text-content-secondary"
                                            htmlFor="allowedEndTime"
                                        >
                                            Horário final permitido
                                        </label>

                                        <IconInput
                                            id="allowedEndTime"
                                            name="allowedEndTime"
                                            type="time"
                                            icon={Clock3}
                                            value={allowedEndTime}
                                            onChange={(e) =>
                                                setAllowedEndTime(
                                                    e.target.value
                                                )
                                            }
                                            disabled={busy}
                                            className={INPUT_BASE}
                                        />
                                    </div>
                                </div>
                            </section>

                            <div className="grid gap-4 xl:grid-cols-2">
                                <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-label-small text-content-secondary">
                                            Serviços do plano{' '}
                                            <span className="text-red-500">
                                                *
                                            </span>
                                        </p>

                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={
                                                busy ||
                                                !hasServices ||
                                                (isSubscriptionPlan &&
                                                    serviceItems.length >= 1)
                                            }
                                            onClick={addServiceItem}
                                        >
                                            Adicionar serviço
                                        </Button>
                                    </div>

                                    {serviceItems.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-border-primary bg-background-secondary p-4 text-sm text-content-secondary">
                                            Adicione pelo menos 1 serviço ao
                                            plano.
                                        </div>
                                    ) : (
                                        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                                            {serviceItemsDetailed.map(
                                                (item) => (
                                                    <div
                                                        key={item.tempId}
                                                        className="rounded-xl border border-border-primary bg-background-secondary p-3 space-y-3"
                                                    >
                                                        <div
                                                            className="grid grid-cols-1 gap-3 md:grid-cols-5"
                                                            style={{
                                                                gridTemplateColumns:
                                                                    typeof window !==
                                                                        'undefined' &&
                                                                    window.innerWidth >=
                                                                        768
                                                                        ? '3fr 1fr 1fr'
                                                                        : undefined,
                                                            }}
                                                        >
                                                            <div className="space-y-2 min-w-0">
                                                                <label className="text-label-small text-content-secondary">
                                                                    Serviço
                                                                </label>

                                                                <Select
                                                                    value={
                                                                        item.serviceId
                                                                    }
                                                                    onValueChange={(
                                                                        value
                                                                    ) =>
                                                                        updateServiceItem(
                                                                            item.tempId,
                                                                            {
                                                                                serviceId:
                                                                                    value,
                                                                            }
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        busy
                                                                    }
                                                                >
                                                                    <SelectTrigger
                                                                        className={
                                                                            SELECT_TRIGGER
                                                                        }
                                                                    >
                                                                        <div className="flex items-center gap-2">
                                                                            <Scissors className="h-4 w-4 text-content-brand" />
                                                                            <SelectValue placeholder="Selecione o serviço" />
                                                                        </div>
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {activeServices.map(
                                                                            (
                                                                                service
                                                                            ) => (
                                                                                <SelectItem
                                                                                    key={
                                                                                        service.id
                                                                                    }
                                                                                    value={
                                                                                        service.id
                                                                                    }
                                                                                >
                                                                                    {
                                                                                        service.name
                                                                                    }
                                                                                </SelectItem>
                                                                            )
                                                                        )}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>

                                                            <div className="space-y-2 min-w-0">
                                                                <label className="text-label-small text-content-secondary">
                                                                    Créditos
                                                                </label>

                                                                <IconInput
                                                                    type="number"
                                                                    min={1}
                                                                    icon={
                                                                        ListOrdered
                                                                    }
                                                                    value={
                                                                        item.creditsIncluded
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) =>
                                                                        updateServiceItem(
                                                                            item.tempId,
                                                                            {
                                                                                creditsIncluded:
                                                                                    e
                                                                                        .target
                                                                                        .value,
                                                                            }
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        busy ||
                                                                        isSubscriptionPlan
                                                                    }
                                                                    className={
                                                                        INPUT_BASE
                                                                    }
                                                                />
                                                                {isSubscriptionPlan ? (
                                                                    <p className="text-xs text-content-tertiary">
                                                                        Assinaturas
                                                                        sempre
                                                                        usam 31
                                                                        créditos.
                                                                    </p>
                                                                ) : null}
                                                            </div>

                                                            <div className="space-y-2 min-w-0">
                                                                <label className="text-label-small text-content-secondary">
                                                                    Comissão (%)
                                                                </label>

                                                                <IconInput
                                                                    type="number"
                                                                    step="0.01"
                                                                    min={0}
                                                                    max={100}
                                                                    icon={
                                                                        Percent
                                                                    }
                                                                    value={
                                                                        item.professionalPercentage
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) =>
                                                                        updateServiceItem(
                                                                            item.tempId,
                                                                            {
                                                                                professionalPercentage:
                                                                                    e
                                                                                        .target
                                                                                        .value,
                                                                            }
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        busy
                                                                    }
                                                                    className={
                                                                        INPUT_BASE
                                                                    }
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div className="text-xs text-content-secondary">
                                                                {item.service ? (
                                                                    <>
                                                                        Valor
                                                                        avulso:{' '}
                                                                        <span className="font-medium text-content-primary">
                                                                            {formatCurrency(
                                                                                item
                                                                                    .service
                                                                                    .price
                                                                            )}
                                                                        </span>
                                                                        {' • '}
                                                                        Duração:{' '}
                                                                        <span className="font-medium text-content-primary">
                                                                            {
                                                                                item
                                                                                    .service
                                                                                    .durationMinutes
                                                                            }{' '}
                                                                            min
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    'Selecione um serviço válido.'
                                                                )}
                                                            </div>

                                                            <Button
                                                                type="button"
                                                                variant="destructive"
                                                                size="sm"
                                                                disabled={busy}
                                                                onClick={() =>
                                                                    removeServiceItem(
                                                                        item.tempId
                                                                    )
                                                                }
                                                            >
                                                                Remover
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}

                                    {duplicateNames.length > 0 ? (
                                        <p className="text-xs text-red-500">
                                            Não repita o mesmo serviço.
                                            Repetidos:{' '}
                                            {duplicateNames.join(', ')}.
                                        </p>
                                    ) : null}

                                    <div className="border-t border-border-primary pt-4 space-y-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-label-small text-content-secondary">
                                                Ordem sugerida
                                            </p>

                                            <span className="text-xs text-content-tertiary">
                                                A ordem inicial segue a inclusão
                                                dos serviços
                                            </span>
                                        </div>

                                        <div className="rounded-lg border border-border-primary bg-background-secondary p-3 min-h-36 max-h-72 overflow-y-auto">
                                            {creditOrderPreview.length === 0 ? (
                                                <p className="text-paragraph-small text-content-secondary">
                                                    Adicione serviços ao plano
                                                    para montar a ordem
                                                    sugerida.
                                                </p>
                                            ) : (
                                                <div className="grid gap-2">
                                                    {creditOrderPreview.map(
                                                        (item, index) => (
                                                            <div
                                                                key={`${item.serviceId}_${index}`}
                                                                className="flex items-center justify-between gap-3 rounded-lg border border-border-primary bg-background-tertiary px-3 py-2"
                                                            >
                                                                <div className="min-w-0">
                                                                    <span className="text-paragraph-small text-content-primary">
                                                                        {index +
                                                                            1}
                                                                        .{' '}
                                                                        {item
                                                                            .service
                                                                            ?.name ??
                                                                            'Serviço'}
                                                                    </span>
                                                                </div>

                                                                <div className="flex items-center gap-1">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="icon"
                                                                        className="h-8 w-8 border-border-primary"
                                                                        disabled={
                                                                            busy ||
                                                                            index ===
                                                                                0
                                                                        }
                                                                        onClick={() =>
                                                                            moveCreditOrderItem(
                                                                                index,
                                                                                'up'
                                                                            )
                                                                        }
                                                                        title="Mover para cima"
                                                                    >
                                                                        <ArrowUp className="h-4 w-4" />
                                                                    </Button>

                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="icon"
                                                                        className="h-8 w-8 border-border-primary"
                                                                        disabled={
                                                                            busy ||
                                                                            index ===
                                                                                creditOrderPreview.length -
                                                                                    1
                                                                        }
                                                                        onClick={() =>
                                                                            moveCreditOrderItem(
                                                                                index,
                                                                                'down'
                                                                            )
                                                                        }
                                                                        title="Mover para baixo"
                                                                    >
                                                                        <ArrowDown className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            )}

                                            <p className="mt-3 text-xs text-content-tertiary">
                                                {isSubscriptionPlan
                                                    ? 'Na assinatura, a sequência fica vinculada ao único serviço do plano.'
                                                    : 'Você pode ajustar a sequência manualmente. O uso do cliente continua livre entre os créditos disponíveis.'}
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                                    <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
                                        <p className="text-label-small text-content-secondary">
                                            Profissionais permitidos
                                        </p>

                                        <div className="rounded-lg border border-border-primary bg-background-secondary p-3 min-h-40 max-h-80 overflow-y-auto">
                                            <div className="mb-2 flex items-center gap-2 px-1 text-paragraph-small text-content-secondary">
                                                <Users className="h-4 w-4 text-content-brand" />
                                                <span>
                                                    Se nenhum for selecionado,
                                                    todos poderão atender
                                                </span>
                                            </div>

                                            {loading ? (
                                                <div className="px-1 py-3 text-paragraph-small text-content-secondary">
                                                    Carregando profissionais...
                                                </div>
                                            ) : activeProfessionals.length ===
                                              0 ? (
                                                <div className="px-1 py-3 text-paragraph-small text-content-secondary">
                                                    Nenhum profissional ativo
                                                    cadastrado no momento.
                                                </div>
                                            ) : (
                                                <div className="grid gap-2 md:grid-cols-2">
                                                    {activeProfessionals.map(
                                                        (p) => (
                                                            <label
                                                                key={p.id}
                                                                className="flex items-center gap-2 text-paragraph-small text-content-primary"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    className="h-4 w-4 rounded border-border-primary"
                                                                    disabled={
                                                                        busy
                                                                    }
                                                                    checked={selectedProfessionalIds.includes(
                                                                        p.id
                                                                    )}
                                                                    onChange={() =>
                                                                        toggleProfessional(
                                                                            p.id
                                                                        )
                                                                    }
                                                                />
                                                                <span>
                                                                    {p.name}
                                                                </span>
                                                            </label>
                                                        )
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
                                        <p className="text-label-small text-content-primary">
                                            Resumo comercial
                                        </p>

                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-lg border border-border-primary bg-background-secondary px-3 py-3">
                                                <p className="text-[11px] text-content-tertiary">
                                                    Total de créditos
                                                </p>
                                                <p className="text-paragraph-medium font-medium text-content-primary">
                                                    {isSubscriptionPlan
                                                        ? SUBSCRIPTION_CREDITS
                                                        : totalCredits}
                                                </p>
                                            </div>

                                            <div className="rounded-lg border border-border-primary bg-background-secondary px-3 py-3">
                                                <p className="text-[11px] text-content-tertiary">
                                                    Valor avulso
                                                </p>
                                                <p className="text-paragraph-medium font-medium text-content-primary">
                                                    {formatCurrency(
                                                        avulsoTotal
                                                    )}
                                                </p>
                                            </div>

                                            <div className="rounded-lg border border-border-primary bg-background-secondary px-3 py-3">
                                                <p className="text-[11px] text-content-tertiary">
                                                    Valor do plano
                                                </p>
                                                <p className="text-paragraph-medium font-medium text-content-primary">
                                                    {Number.isFinite(
                                                        planPriceNumber
                                                    )
                                                        ? formatCurrency(
                                                              planPriceNumber
                                                          )
                                                        : '—'}
                                                </p>
                                            </div>

                                            <div className="rounded-lg border border-border-primary bg-background-secondary px-3 py-3">
                                                <p className="text-[11px] text-content-tertiary">
                                                    Economia estimada
                                                </p>
                                                <p className="text-paragraph-medium font-medium text-content-primary">
                                                    {formatCurrency(
                                                        economyValue
                                                    )}{' '}
                                                    • {economyPct.toFixed(2)}%
                                                </p>
                                                {isSubscriptionPlan ? (
                                                    <p className="mt-1 text-[11px] text-content-tertiary">
                                                        Assinatura: 1 serviço,
                                                        31 créditos e 30 dias de
                                                        validade.
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 border-t border-border-primary pt-4">
                                <Button
                                    type="submit"
                                    variant="brand"
                                    disabled={busy || !requiredOk}
                                    title={
                                        !requiredOk
                                            ? 'Preencha os campos obrigatórios'
                                            : undefined
                                    }
                                >
                                    {isPending ? (
                                        <span className="inline-flex items-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Salvando...
                                        </span>
                                    ) : isCustomPlan ? (
                                        'Criar e ativar plano'
                                    ) : isSubscriptionPlan ? (
                                        'Criar assinatura'
                                    ) : (
                                        'Criar plano'
                                    )}
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
