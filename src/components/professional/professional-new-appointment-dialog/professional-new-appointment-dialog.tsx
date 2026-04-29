'use client';

import * as React from 'react';
import { useMemo, useRef, useState } from 'react';
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

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

import {
    Calendar as CalendarIcon,
    Check,
    ChevronDown,
    Clock,
    CreditCard,
    Loader2,
    Phone,
    Search,
    Scissors,
    User,
    Wallet,
    X,
} from 'lucide-react';

import { format } from 'date-fns';
import { IMaskInput } from 'react-imask';

export type UnitOption = { id: string; name: string };

export type ClientOption = {
    id: string;
    name: string;
    phone: string | null;
};

export type ProfessionalOption = {
    id: string;
    name: string;
    imageUrl: string | null;
    isActive: boolean;
    unitId?: string | null;
};

export type ServiceOption = {
    id: string;
    name: string;
    durationMinutes: number;
    price?: number | string;
    isActive: boolean;
    unitId?: string | null;
};

export type AppointmentOption = {
    id: string;
    unitId: string;
    clientId: string;
    clientName: string;
    phone: string;
    description: string;
    scheduleAt: string | Date;
    status: 'PENDING' | 'DONE' | 'CANCELED';
    professionalId: string | null;
    serviceId: string | null;
};

type AvailabilityTimesResponse = {
    ok: boolean;
    error?: string;
    data?: {
        date?: string;
        unitId?: string;
        professionalId?: string;
        source?: string;
        durationMinutes?: number;
        intervals?: Array<{ startTime: string; endTime: string }>;
        times?: string[];
    };
};

type ActivePlanServiceOption = {
    clientPlanServiceBalanceId?: string;
    serviceId: string;
    serviceName: string;
    creditsRemaining: number;
};

type ActivePlanProfessionalOption = {
    professionalId: string;
    professionalName: string;
};

type ActivePlanForAppointmentResponse = {
    ok: boolean;
    error?: string;
    data?: {
        clientPlanId: string;
        planId: string;
        planName: string;
        expiresAt: string;
        services: ActivePlanServiceOption[];
        professionals: ActivePlanProfessionalOption[];
    } | null;
};

type BookingMode = 'AVULSO' | 'PLANO';

type Props = {
    children?: React.ReactNode;

    forcedUnitId: string;
    forcedProfessionalId: string;

    units?: UnitOption[];
    clients?: ClientOption[];
    professionals?: ProfessionalOption[];
    services?: ServiceOption[];
    appointments?: AppointmentOption[];
};

function formatDateParamYYYYMMDD(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export default function ProfessionalNewAppointmentDialog({
    children,
    forcedUnitId,
    forcedProfessionalId,
    units = [],
    clients = [],
    professionals = [],
    services = [],
    appointments: _appointments = [],
}: Props) {
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

    const [isClientPickerOpen, setIsClientPickerOpen] = useState(false);
    const [clientQuery, setClientQuery] = useState('');
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [clientResults, setClientResults] = useState<ClientOption[]>([]);
    const [isSearchingClients, setIsSearchingClients] = useState(false);

    const [clientName, setClientName] = useState('');
    const [phone, setPhone] = useState('');

    const [isLoadingActivePlan, setIsLoadingActivePlan] = useState(false);
    const [activePlanError, setActivePlanError] = useState<string | null>(null);
    const [activePlan, setActivePlan] =
        useState<ActivePlanForAppointmentResponse['data']>(null);
    const [bookingMode, setBookingMode] = useState<BookingMode>('AVULSO');
    const lastActivePlanAbortRef = useRef<AbortController | null>(null);

    const [serviceId, setServiceId] = useState<string>('');
    const [scheduleDate, setScheduleDate] = useState<Date | undefined>(
        undefined
    );
    const [time, setTime] = useState<string>('');

    const [availableTimes, setAvailableTimes] = useState<string[]>([]);
    const [isLoadingTimes, setIsLoadingTimes] = useState(false);
    const [timesError, setTimesError] = useState<string | null>(null);
    const lastTimesAbortRef = useRef<AbortController | null>(null);

    const [submitting, setSubmitting] = useState(false);

    const selectedClient = useMemo(() => {
        if (!selectedClientId) return null;

        return (
            clientResults.find((c) => c.id === selectedClientId) ??
            clients.find((c) => c.id === selectedClientId) ??
            null
        );
    }, [selectedClientId, clientResults, clients]);

    const forcedUnitLabel = useMemo(() => {
        return units.find((u) => u.id === forcedUnitId)?.name ?? 'Unidade';
    }, [forcedUnitId, units]);

    const forcedProfessionalLabel = useMemo(() => {
        return (
            professionals.find((p) => p.id === forcedProfessionalId)?.name ??
            'Profissional'
        );
    }, [forcedProfessionalId, professionals]);

    const planServiceMap = useMemo(() => {
        const map = new Map<string, ActivePlanServiceOption>();
        for (const item of activePlan?.services ?? []) {
            if (!item?.serviceId) continue;
            map.set(item.serviceId, item);
        }
        return map;
    }, [activePlan]);

    const servicesForUnit = useMemo(() => {
        const base = services
            .filter((s) => s.isActive !== false)
            .filter((s) => (s.unitId ? s.unitId === forcedUnitId : true));

        if (bookingMode !== 'PLANO') return base;
        if (!activePlan) return [];

        return base.filter((s) => planServiceMap.has(s.id));
    }, [services, forcedUnitId, bookingMode, activePlan, planServiceMap]);

    const canProceed = !!selectedClientId;
    const hasActivePlan = !!activePlan;
    const isUsingPlan = hasActivePlan && bookingMode === 'PLANO';

    const lastClientSearchAbortRef = useRef<AbortController | null>(null);

    const resetDependentFlow = () => {
        setServiceId('');
        setScheduleDate(undefined);
        setTime('');
        setAvailableTimes([]);
        setTimesError(null);
        setIsLoadingTimes(false);
    };

    const resetPlanState = () => {
        setIsLoadingActivePlan(false);
        setActivePlanError(null);
        setActivePlan(null);
        setBookingMode('AVULSO');
    };

    const handleSelectClient = (c: ClientOption) => {
        setSelectedClientId(c.id);
        setClientName(c.name ?? '');
        setPhone(c.phone ?? '');
        setClientQuery(`${c.name}${c.phone ? ` • ${c.phone}` : ''}`);
        setClientResults([c]);
        setIsClientPickerOpen(false);
        resetDependentFlow();
        resetPlanState();
    };

    const clearSelectedClient = () => {
        setSelectedClientId('');
        setClientQuery('');
        setClientResults([]);
        setIsClientPickerOpen(false);

        setClientName('');
        setPhone('');
        resetDependentFlow();
        resetPlanState();
    };

    React.useEffect(() => {
        if (!open) return;

        const q = clientQuery.trim();

        if (!q) {
            setClientResults([]);
            setIsSearchingClients(false);
            setIsClientPickerOpen(false);

            if (lastClientSearchAbortRef.current) {
                lastClientSearchAbortRef.current.abort();
            }
            return;
        }

        if (selectedClientId && selectedClient) {
            const label = `${selectedClient.name}${selectedClient.phone ? ` • ${selectedClient.phone}` : ''}`;
            if (q === label) {
                setClientResults([selectedClient]);
                setIsSearchingClients(false);
                return;
            }
        }

        if (q.length < 2) {
            setClientResults(
                clients
                    .filter((c) => {
                        const name = (c.name ?? '').toLowerCase();
                        const ph = (c.phone ?? '').toLowerCase();
                        const qq = q.toLowerCase();
                        return name.includes(qq) || ph.includes(qq);
                    })
                    .slice(0, 20)
            );
            setIsSearchingClients(false);
            return;
        }

        const debounce = setTimeout(() => {
            setIsSearchingClients(false);
            setClientResults(
                clients
                    .filter((c) => {
                        const name = (c.name ?? '').toLowerCase();
                        const ph = (c.phone ?? '').toLowerCase();
                        const qq = q.toLowerCase();
                        return name.includes(qq) || ph.includes(qq);
                    })
                    .slice(0, 20)
            );
        }, 220);

        return () => clearTimeout(debounce);
    }, [clientQuery, open, selectedClientId, selectedClient, clients]);

    React.useEffect(() => {
        if (!open || !selectedClientId) {
            resetPlanState();
            return;
        }

        const run = async () => {
            try {
                setIsLoadingActivePlan(true);
                setActivePlanError(null);
                setActivePlan(null);
                setBookingMode('AVULSO');

                if (lastActivePlanAbortRef.current) {
                    lastActivePlanAbortRef.current.abort();
                }

                const ac = new AbortController();
                lastActivePlanAbortRef.current = ac;

                const res = await fetch(
                    `/api/professional/clients/${selectedClientId}/active-plan-for-appointment`,
                    {
                        method: 'GET',
                        signal: ac.signal,
                        headers: { 'Content-Type': 'application/json' },
                    }
                );

                const payload = (await res
                    .json()
                    .catch(
                        () => null
                    )) as ActivePlanForAppointmentResponse | null;

                if (!res.ok || !payload?.ok) {
                    setActivePlan(null);
                    setActivePlanError(
                        payload?.error ??
                            'Não foi possível verificar o plano ativo do cliente.'
                    );
                    return;
                }

                const planData = payload?.data ?? null;
                setActivePlan(planData);

                if (planData) {
                    setBookingMode('PLANO');
                } else {
                    setBookingMode('AVULSO');
                }
            } catch (err: any) {
                if (err?.name === 'AbortError') return;
                setActivePlan(null);
                setActivePlanError(
                    'Erro ao verificar o plano ativo do cliente.'
                );
                setBookingMode('AVULSO');
            } finally {
                setIsLoadingActivePlan(false);
            }
        };

        run();

        return () => {
            if (lastActivePlanAbortRef.current) {
                lastActivePlanAbortRef.current.abort();
            }
        };
    }, [open, selectedClientId]);

    React.useEffect(() => {
        resetDependentFlow();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookingMode]);

    React.useEffect(() => {
        if (!serviceId) return;
        const exists = servicesForUnit.some((s) => s.id === serviceId);
        if (!exists) {
            setServiceId('');
            setScheduleDate(undefined);
            setTime('');
            setAvailableTimes([]);
            setTimesError(null);
        }
    }, [serviceId, servicesForUnit]);

    React.useEffect(() => {
        if (!open) return;

        if (!canProceed || !serviceId || !scheduleDate) {
            setAvailableTimes([]);
            setTimesError(null);
            setIsLoadingTimes(false);
            return;
        }

        const dateStr = formatDateParamYYYYMMDD(scheduleDate);

        const run = async () => {
            try {
                setIsLoadingTimes(true);
                setTimesError(null);

                if (lastTimesAbortRef.current) {
                    lastTimesAbortRef.current.abort();
                }
                const ac = new AbortController();
                lastTimesAbortRef.current = ac;

                const params = new URLSearchParams();
                params.set('unitId', forcedUnitId);
                params.set('professionalId', forcedProfessionalId);
                params.set('serviceId', serviceId);
                params.set('date', dateStr);

                const res = await fetch(
                    `/api/professional/availability/times?${params.toString()}`,
                    {
                        method: 'GET',
                        signal: ac.signal,
                        headers: { 'Content-Type': 'application/json' },
                    }
                );

                const payload = (await res
                    .json()
                    .catch(() => null)) as AvailabilityTimesResponse | null;

                if (!res.ok || !payload?.ok) {
                    const msg =
                        payload?.error ??
                        'Não foi possível carregar os horários do profissional.';
                    setAvailableTimes([]);
                    setTimesError(msg);
                    return;
                }

                const times = Array.isArray(payload?.data?.times)
                    ? (payload.data?.times ?? [])
                    : [];

                setAvailableTimes(times);

                if (time && !times.includes(time)) {
                    setTime('');
                }
            } catch (err: any) {
                if (err?.name === 'AbortError') return;
                setAvailableTimes([]);
                setTimesError('Erro ao carregar os horários do profissional.');
            } finally {
                setIsLoadingTimes(false);
            }
        };

        run();
    }, [
        open,
        canProceed,
        forcedUnitId,
        forcedProfessionalId,
        serviceId,
        scheduleDate,
        time,
    ]);

    const handleSubmit = async () => {
        if (!selectedClientId) {
            toast.error('Selecione um cliente para continuar.');
            return;
        }
        if (!clientName.trim()) {
            toast.error('Informe o nome do cliente.');
            return;
        }
        if (!phone.trim()) {
            toast.error('Informe o telefone.');
            return;
        }
        if (!serviceId) {
            toast.error('Selecione o serviço.');
            return;
        }
        if (!scheduleDate) {
            toast.error('Selecione o dia.');
            return;
        }
        if (!time) {
            toast.error('Selecione o horário.');
            return;
        }

        if (isUsingPlan && !hasActivePlan) {
            toast.error('Nenhum plano ativo disponível para este cliente.');
            return;
        }

        if (availableTimes.length > 0 && !availableTimes.includes(time)) {
            toast.error(
                'Este horário não está mais disponível. Selecione outro.'
            );
            setTime('');
            return;
        }

        const [hh, mm] = time.split(':').map(Number);
        const scheduleAt = new Date(scheduleDate);
        scheduleAt.setHours(hh, mm, 0, 0);

        const service = services.find((s) => s.id === serviceId);
        const description = service?.name ?? 'Atendimento';

        try {
            setSubmitting(true);

            const res = await fetch('/api/professional/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: selectedClientId,
                    clientName: clientName.trim(),
                    phone: phone.trim(),
                    unitId: forcedUnitId,
                    professionalId: forcedProfessionalId,
                    serviceId,
                    description,
                    scheduleAt: scheduleAt.toISOString(),
                    usePlanCredit: isUsingPlan,
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                toast.error(
                    data?.error ?? 'Não foi possível criar o agendamento.'
                );
                return;
            }

            toast.success('Agendamento criado com sucesso!');
            setOpen(false);

            clearSelectedClient();
            setServiceId('');
            setScheduleDate(undefined);
            setTime('');
            setAvailableTimes([]);
            setTimesError(null);
            setIsLoadingTimes(false);

            router.refresh();
        } catch {
            toast.error('Erro ao criar agendamento.');
        } finally {
            setSubmitting(false);
        }
    };

    const timeSelectDisabled =
        !canProceed || !serviceId || !scheduleDate || isLoadingTimes;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <span className="inline-flex">{children}</span>
            </DialogTrigger>

            <DialogContent
                variant="appointment"
                overlayVariant="blurred"
                showCloseButton
            >
                <DialogHeader>
                    <DialogTitle size="modal">Novo agendamento</DialogTitle>
                    <DialogDescription size="modal">
                        Selecione um cliente e preencha os dados para realizar o
                        agendamento:
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <p className="text-label-medium-size text-content-primary">
                            Cliente
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
                                            setIsClientPickerOpen(true)
                                        }
                                        onChange={(e) => {
                                            const value = e.target.value;

                                            setClientQuery(value);

                                            if (selectedClientId) {
                                                setSelectedClientId('');
                                            }

                                            setIsClientPickerOpen(
                                                value.trim().length > 0
                                            );
                                        }}
                                        placeholder="Digite para buscar um cliente"
                                        className="pl-10 pr-10"
                                    />

                                    {selectedClientId || clientQuery ? (
                                        <button
                                            type="button"
                                            className="absolute right-2 top-1/2 -translate-y-1/2 transform rounded-md p-1 text-content-secondary hover:text-content-primary"
                                            onClick={clearSelectedClient}
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
                                onOpenAutoFocus={(e) => e.preventDefault()}
                                onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                                <div className="max-h-64 overflow-auto rounded-md border border-border-primary bg-background-secondary">
                                    {!clientQuery.trim() ? null : isSearchingClients ? (
                                        <div className="flex items-center gap-2 px-3 py-3 text-sm text-content-secondary">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Buscando clientes...
                                        </div>
                                    ) : clientQuery.trim().length < 2 ? (
                                        <div className="px-3 py-3 text-sm text-content-secondary">
                                            Dica: digite pelo menos{' '}
                                            <b>2 letras</b> para buscar melhor.
                                        </div>
                                    ) : clientResults.length === 0 ? (
                                        <div className="px-3 py-3 text-sm text-content-secondary">
                                            Nenhum cliente encontrado
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-border-primary">
                                            {clientResults.map((c) => {
                                                const active =
                                                    selectedClientId === c.id;
                                                return (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        className={cn(
                                                            'w-full px-3 py-2 text-left text-sm hover:bg-background-tertiary',
                                                            'flex items-center justify-between gap-3',
                                                            active &&
                                                                'bg-background-tertiary'
                                                        )}
                                                        onClick={() =>
                                                            handleSelectClient(
                                                                c
                                                            )
                                                        }
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="truncate font-medium text-content-primary">
                                                                {c.name}
                                                            </p>
                                                            {c.phone ? (
                                                                <p className="truncate text-xs text-content-secondary">
                                                                    {c.phone}
                                                                </p>
                                                            ) : null}
                                                        </div>

                                                        {active ? (
                                                            <Check className="h-4 w-4 text-content-brand shrink-0" />
                                                        ) : null}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <p className="text-label-medium-size text-content-primary">
                            Nome do cliente
                        </p>

                        <div className="relative">
                            <User
                                className="absolute left-3 top-1/2 -translate-y-1/2 transform text-content-brand"
                                size={20}
                            />
                            <Input
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="Nome do cliente"
                                className="pl-10"
                                disabled={!canProceed}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-label-medium-size text-content-primary">
                            Telefone
                        </p>

                        <div className="relative">
                            <Phone
                                className="absolute left-3 top-1/2 -translate-y-1/2 transform text-content-brand"
                                size={20}
                            />

                            <IMaskInput
                                value={phone ?? ''}
                                onAccept={(v) => setPhone(String(v))}
                                placeholder="(99) 99999-9999"
                                mask="(00) 00000-0000"
                                className="pl-10 flex h-12 w-full rounded-md border border-border-primary bg-background-tertiary px-3 py-2 text-sm text-content-primary ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-content-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-border-brand disabled:cursor-not-allowed disabled:opacity-50 hover:border-border-secondary focus:border-border-brand focus-visible:border-border-brand aria-invalid:ring-destructive/20 aria-invalid:border-destructive"
                                disabled={!canProceed}
                            />
                        </div>
                    </div>

                    {canProceed ? (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-label-medium-size text-content-primary">
                                    Forma de agendamento
                                </p>

                                {isLoadingActivePlan ? (
                                    <span className="inline-flex items-center gap-2 text-xs text-content-secondary">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Verificando plano...
                                    </span>
                                ) : null}
                            </div>

                            {hasActivePlan ? (
                                <div className="rounded-xl border border-border-primary bg-background-secondary p-3 space-y-3">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-content-primary">
                                            Plano ativo encontrado
                                        </p>
                                        <p className="text-xs text-content-secondary">
                                            {activePlan?.planName} • expira em{' '}
                                            {activePlan?.expiresAt
                                                ? format(
                                                      new Date(
                                                          activePlan.expiresAt
                                                      ),
                                                      'dd/MM/yyyy'
                                                  )
                                                : '-'}
                                        </p>
                                    </div>

                                    <Select
                                        value={bookingMode}
                                        onValueChange={(v) =>
                                            setBookingMode(v as BookingMode)
                                        }
                                        disabled={isLoadingActivePlan}
                                    >
                                        <SelectTrigger>
                                            <div className="flex items-center gap-2">
                                                {bookingMode === 'PLANO' ? (
                                                    <CreditCard className="h-4 w-4 text-content-brand" />
                                                ) : (
                                                    <Wallet className="h-4 w-4 text-content-brand" />
                                                )}
                                                <SelectValue placeholder="Selecione a forma de agendamento" />
                                            </div>
                                        </SelectTrigger>

                                        <SelectContent>
                                            <SelectItem value="PLANO">
                                                Usar créditos do plano
                                            </SelectItem>
                                            <SelectItem value="AVULSO">
                                                Seguir no avulso
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>

                                    {bookingMode === 'PLANO' ? (
                                        <div className="rounded-lg border border-border-primary bg-background-tertiary p-3">
                                            <p className="text-xs font-medium text-content-primary mb-2">
                                                Serviços disponíveis no plano:
                                            </p>

                                            {activePlan?.services?.length ? (
                                                <div className="space-y-1">
                                                    {activePlan.services.map(
                                                        (item) => (
                                                            <div
                                                                key={
                                                                    item.serviceId
                                                                }
                                                                className="flex items-center justify-between gap-3 text-xs"
                                                            >
                                                                <span className="text-content-primary">
                                                                    {
                                                                        item.serviceName
                                                                    }
                                                                </span>
                                                                <span className="text-content-secondary">
                                                                    {
                                                                        item.creditsRemaining
                                                                    }{' '}
                                                                    crédito(s)
                                                                </span>
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-content-secondary">
                                                    Este plano não possui
                                                    créditos disponíveis para
                                                    agendamento.
                                                </p>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border-primary bg-background-secondary p-3">
                                    <p className="text-sm text-content-primary">
                                        Este cliente seguirá no agendamento
                                        avulso.
                                    </p>
                                    {activePlanError ? (
                                        <p className="mt-1 text-xs text-content-secondary">
                                            {activePlanError}
                                        </p>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    ) : null}

                    <div className="space-y-2">
                        <p className="text-label-medium-size text-content-primary">
                            Unidade
                        </p>

                        <div className="relative">
                            <Input
                                value={forcedUnitLabel}
                                readOnly
                                className="pl-10"
                                disabled
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-brand">
                                <Scissors className="h-4 w-4 opacity-0" />
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-label-medium-size text-content-primary">
                            Profissional
                        </p>

                        <div className="relative">
                            <Input
                                value={forcedProfessionalLabel}
                                readOnly
                                className="pl-10"
                                disabled
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-brand">
                                <User className="h-4 w-4" />
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-label-medium-size text-content-primary">
                            Serviço
                        </p>

                        <Select
                            value={serviceId}
                            onValueChange={(v) => {
                                setServiceId(v);
                                setScheduleDate(undefined);
                                setTime('');
                                setAvailableTimes([]);
                                setTimesError(null);
                            }}
                            disabled={!canProceed}
                        >
                            <SelectTrigger>
                                <div className="flex items-center gap-2">
                                    <Scissors className="h-4 w-4 text-content-brand" />
                                    <SelectValue
                                        placeholder={
                                            !canProceed
                                                ? 'Selecione um cliente'
                                                : isUsingPlan
                                                  ? 'Selecione um serviço com crédito disponível'
                                                  : 'Selecione o serviço'
                                        }
                                    />
                                </div>
                            </SelectTrigger>

                            <SelectContent>
                                {servicesForUnit.length === 0 ? (
                                    <SelectItem disabled value="no-services">
                                        {isUsingPlan
                                            ? 'Nenhum serviço com crédito disponível neste plano'
                                            : 'Nenhum serviço disponível'}
                                    </SelectItem>
                                ) : (
                                    servicesForUnit.map((s) => {
                                        const planInfo = planServiceMap.get(
                                            s.id
                                        );

                                        return (
                                            <SelectItem key={s.id} value={s.id}>
                                                {isUsingPlan && planInfo
                                                    ? `${s.name} • ${planInfo.creditsRemaining} crédito(s)`
                                                    : s.name}
                                            </SelectItem>
                                        );
                                    })
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <p className="text-label-medium-size text-content-primary">
                            Dia
                        </p>

                        <Popover
                            open={isDatePickerOpen}
                            onOpenChange={setIsDatePickerOpen}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    disabled={!canProceed || !serviceId}
                                    className={cn(
                                        'w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand disabled:opacity-60 disabled:cursor-not-allowed',
                                        !scheduleDate &&
                                            'text-content-secondary'
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <CalendarIcon
                                            className="text-content-brand"
                                            size={20}
                                        />
                                        {scheduleDate ? (
                                            format(scheduleDate, 'dd/MM/yyyy')
                                        ) : (
                                            <span>
                                                {!canProceed
                                                    ? 'Selecione um cliente'
                                                    : !serviceId
                                                      ? 'Selecione o serviço'
                                                      : 'Selecione um dia'}
                                            </span>
                                        )}
                                    </div>
                                    <ChevronDown className="opacity-50 h-4 w-4" />
                                </Button>
                            </PopoverTrigger>

                            <PopoverContent
                                className="w-auto p-0"
                                align="start"
                            >
                                <Calendar
                                    mode="single"
                                    selected={scheduleDate}
                                    onSelect={(d) => {
                                        setScheduleDate(d ?? undefined);
                                        setTime('');
                                        setAvailableTimes([]);
                                        setTimesError(null);
                                        if (d) setIsDatePickerOpen(false);
                                    }}
                                    disabled={undefined}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-label-medium-size text-content-primary">
                                Horário
                            </p>

                            {isLoadingTimes ? (
                                <span className="inline-flex items-center gap-2 text-xs text-content-secondary">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Carregando horários...
                                </span>
                            ) : null}
                        </div>

                        <Select
                            value={time}
                            onValueChange={(v) => setTime(v)}
                            disabled={timeSelectDisabled}
                        >
                            <SelectTrigger
                                className="
                                  w-full justify-between text-left font-normal
                                  bg-background-tertiary border-border-primary text-content-primary
                                  focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand
                                  focus:border-border-brand focus-visible:border-border-brand
                                  disabled:opacity-60 disabled:cursor-not-allowed
                                "
                            >
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-content-brand" />
                                    <SelectValue
                                        placeholder={
                                            !canProceed
                                                ? 'Selecione um cliente'
                                                : !serviceId
                                                  ? 'Selecione o serviço'
                                                  : !scheduleDate
                                                    ? 'Selecione o dia'
                                                    : isLoadingTimes
                                                      ? 'Carregando horários...'
                                                      : timesError
                                                        ? 'Erro ao carregar horários'
                                                        : availableTimes.length ===
                                                            0
                                                          ? 'Sem horários disponíveis'
                                                          : 'Selecione um horário'
                                        }
                                    />
                                </div>
                            </SelectTrigger>

                            <SelectContent>
                                {timesError ? (
                                    <SelectItem disabled value="times-error">
                                        {timesError}
                                    </SelectItem>
                                ) : isLoadingTimes ? (
                                    <SelectItem disabled value="times-loading">
                                        Carregando...
                                    </SelectItem>
                                ) : availableTimes.length === 0 ? (
                                    <SelectItem disabled value="no-times">
                                        Nenhum horário disponível
                                    </SelectItem>
                                ) : (
                                    availableTimes.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {t}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>

                        {timesError ? (
                            <p className="text-xs text-destructive">
                                {timesError}
                            </p>
                        ) : null}
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button
                            type="button"
                            variant="brand"
                            onClick={handleSubmit}
                            disabled={
                                submitting ||
                                !selectedClientId ||
                                !serviceId ||
                                !scheduleDate ||
                                !time ||
                                isLoadingTimes ||
                                isLoadingActivePlan
                            }
                        >
                            {submitting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            Agendar
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
