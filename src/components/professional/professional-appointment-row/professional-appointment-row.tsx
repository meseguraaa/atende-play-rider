'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';

import ProfessionalEditAppointmentDialog, {
    type AppointmentToEdit,
    type UnitOption,
    type ClientOption,
    type ProfessionalOption,
    type ServiceOption,
} from '@/components/professional/professional-edit-appointment-dialog/professional-edit-appointment-dialog';

type AppointmentStatus = 'PENDING' | 'DONE' | 'CANCELED';

type AppointmentConfirmationStatus =
    | 'PENDING'
    | 'CONFIRMED'
    | 'CANCELED'
    | 'NOT_REQUIRED';

type CustomerLevel = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';

type CancellationFeePreview = {
    originalServicePrice: number;
    cancelFeePercentage: number;
    cancelFeeValue: number;
    professionalPercentage: number;
    professionalCommissionValue: number;
    serviceName: string;
    cancelLimitHours: number;
};

type PlanCreditPreview = {
    serviceName: string;
    creditsAvailable: number;
    creditsToConsume: number;
};

export type ProfessionalAppointmentRowItem = {
    id: string;

    unitId: string;
    clientId: string;

    clientName: string;
    phone: string;
    clientLevel?: CustomerLevel | null;

    description: string;
    scheduleAt: string | Date;

    status: AppointmentStatus;
    confirmationStatus?: AppointmentConfirmationStatus | null;

    professionalId: string | null;
    serviceId: string | null;
};

type Props = {
    appt: ProfessionalAppointmentRowItem;

    forcedUnitId?: string | null;
    units: UnitOption[];
    clients: ClientOption[];
    professionals: ProfessionalOption[];
    services: ServiceOption[];
};

function formatTimeHHmm(value: string | Date): string {
    const d = value instanceof Date ? value : new Date(value);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

function formatCurrencyBRL(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(Number.isFinite(value) ? value : 0);
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
    const label =
        status === 'PENDING'
            ? 'Pendente'
            : status === 'DONE'
              ? 'Concluído'
              : 'Cancelado';

    const toneClass =
        status === 'DONE'
            ? 'bg-green-500/15 text-green-600 border-green-500/30'
            : status === 'PENDING'
              ? 'bg-amber-500/15 text-amber-700 border-amber-500/30'
              : 'bg-red-500/15 text-red-600 border-red-500/30';

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-xs',
                toneClass
            )}
        >
            {label}
        </span>
    );
}

function ConfirmationBadge({
    status,
}: {
    status?: AppointmentConfirmationStatus | null;
}) {
    const resolved: AppointmentConfirmationStatus = status ?? 'PENDING';

    const label =
        resolved === 'CONFIRMED'
            ? 'Confirmado'
            : resolved === 'CANCELED'
              ? 'Cancelou'
              : resolved === 'NOT_REQUIRED'
                ? 'Não se aplica'
                : 'Pendente';

    const toneClass =
        resolved === 'CONFIRMED'
            ? 'bg-green-500/15 text-green-600 border-green-500/30'
            : resolved === 'CANCELED'
              ? 'bg-red-500/15 text-red-600 border-red-500/30'
              : resolved === 'NOT_REQUIRED'
                ? 'bg-muted text-content-secondary border-border-primary'
                : 'bg-amber-500/15 text-amber-700 border-amber-500/30';

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-xs',
                toneClass
            )}
        >
            {label}
        </span>
    );
}

function levelLabel(level: CustomerLevel) {
    switch (level) {
        case 'BRONZE':
            return 'Bronze';
        case 'PRATA':
            return 'Prata';
        case 'OURO':
            return 'Ouro';
        case 'DIAMANTE':
            return 'Diamante';
    }
}

function levelBadgeClass(level: CustomerLevel) {
    switch (level) {
        case 'BRONZE':
            return 'bg-amber-500/10 text-amber-700 border-amber-500/30';
        case 'PRATA':
            return 'bg-slate-500/10 text-slate-200 border-slate-500/30';
        case 'OURO':
            return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30';
        case 'DIAMANTE':
            return 'bg-sky-500/10 text-sky-700 border-sky-500/30';
    }
}

function CustomerLevelBadge({ level }: { level?: CustomerLevel | null }) {
    const resolved = level ?? 'BRONZE';

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-xs',
                levelBadgeClass(resolved)
            )}
        >
            {levelLabel(resolved)}
        </span>
    );
}

function CancellationFeeDialog({
    open,
    onOpenChange,
    appt,
    timeLabel,
    feePreview,
    loading,
    onConfirmCharge,
    onConfirmWithoutCharge,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    appt: ProfessionalAppointmentRowItem;
    timeLabel: string;
    feePreview: CancellationFeePreview | null;
    loading: boolean;
    onConfirmCharge: () => Promise<void>;
    onConfirmWithoutCharge: () => Promise<void>;
}) {
    if (!feePreview) return null;

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Cobrar taxa de cancelamento?
                    </AlertDialogTitle>

                    <AlertDialogDescription asChild>
                        <div className="space-y-3 text-sm text-content-secondary">
                            <p>
                                O agendamento de <b>{appt.clientName}</b> às{' '}
                                <b>{timeLabel}</b> foi cancelado fora do prazo
                                permitido e poderá ser cobrado.
                            </p>

                            <div className="rounded-lg border border-border-primary bg-muted/40 p-3">
                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Serviço</span>
                                        <b className="text-content-primary">
                                            {feePreview.serviceName ||
                                                appt.description}
                                        </b>
                                    </div>

                                    <div className="flex items-center justify-between gap-3">
                                        <span>Valor do serviço</span>
                                        <b className="text-content-primary">
                                            {formatCurrencyBRL(
                                                feePreview.originalServicePrice
                                            )}
                                        </b>
                                    </div>

                                    <div className="flex items-center justify-between gap-3">
                                        <span>Taxa de cancelamento</span>
                                        <b className="text-content-primary">
                                            {feePreview.cancelFeePercentage}%
                                        </b>
                                    </div>

                                    <div className="flex items-center justify-between gap-3">
                                        <span>Valor da cobrança</span>
                                        <b className="text-content-primary">
                                            {formatCurrencyBRL(
                                                feePreview.cancelFeeValue
                                            )}
                                        </b>
                                    </div>
                                </div>
                            </div>

                            <p>
                                Esse agendamento poderá ser cobrado com taxa de
                                cancelamento. Deseja efetuar a cobrança?
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={onConfirmWithoutCharge}
                        disabled={loading}
                    >
                        {loading ? 'Processando...' : 'Não'}
                    </Button>

                    <Button
                        type="button"
                        variant="active"
                        size="sm"
                        onClick={onConfirmCharge}
                        disabled={loading}
                    >
                        {loading ? 'Processando...' : 'Sim'}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function PlanCreditDialog({
    open,
    onOpenChange,
    appt,
    timeLabel,
    preview,
    loading,
    onConfirmDebit,
    onSkipDebit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    appt: ProfessionalAppointmentRowItem;
    timeLabel: string;
    preview: PlanCreditPreview | null;
    loading: boolean;
    onConfirmDebit: () => Promise<void>;
    onSkipDebit: () => Promise<void>;
}) {
    if (!preview) return null;

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Debitar crédito do plano?
                    </AlertDialogTitle>

                    <AlertDialogDescription asChild>
                        <div className="space-y-3 text-sm text-content-secondary">
                            <p>
                                O agendamento de <b>{appt.clientName}</b> às{' '}
                                <b>{timeLabel}</b> utiliza crédito de plano.
                            </p>

                            <div className="rounded-lg border border-border-primary bg-muted/40 p-3">
                                <div className="grid gap-2">
                                    <div className="flex justify-between">
                                        <span>Serviço</span>
                                        <b>{preview.serviceName}</b>
                                    </div>

                                    <div className="flex justify-between">
                                        <span>Créditos disponíveis</span>
                                        <b>{preview.creditsAvailable}</b>
                                    </div>

                                    <div className="flex justify-between">
                                        <span>Créditos a debitar</span>
                                        <b>{preview.creditsToConsume}</b>
                                    </div>
                                </div>
                            </div>

                            <p>
                                Deseja debitar o crédito mesmo com o
                                cancelamento?
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={onSkipDebit}
                        disabled={loading}
                    >
                        {loading ? 'Processando...' : 'Não debitar'}
                    </Button>

                    <Button
                        variant="active"
                        size="sm"
                        onClick={onConfirmDebit}
                        disabled={loading}
                    >
                        {loading ? 'Processando...' : 'Debitar crédito'}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function AppointmentActions({
    appt,
    timeLabel,
    canEdit,
    canDone,
    canCancel,
    isBusy,
    loadingAction,
    forcedUnitId,
    units,
    clients,
    professionals,
    services,
    onDone,
    onCancel,
}: {
    appt: ProfessionalAppointmentRowItem;
    timeLabel: string;
    canEdit: boolean;
    canDone: boolean;
    canCancel: boolean;
    isBusy: boolean;
    loadingAction: null | 'done' | 'cancel';
    forcedUnitId: string | null;
    units: UnitOption[];
    clients: ClientOption[];
    professionals: ProfessionalOption[];
    services: ServiceOption[];
    onDone: () => Promise<void>;
    onCancel: () => Promise<void>;
}) {
    const apptForEdit: AppointmentToEdit = {
        id: appt.id,
        unitId: appt.unitId,
        clientId: appt.clientId,
        clientName: appt.clientName,
        phone: appt.phone,
        description: appt.description,
        scheduleAt: appt.scheduleAt,
        status: appt.status,
        professionalId: appt.professionalId,
        serviceId: appt.serviceId,
    };

    if (!canEdit && !canDone && !canCancel) {
        return (
            <span className="text-paragraph-small text-content-tertiary">
                —
            </span>
        );
    }

    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            {canEdit ? (
                <ProfessionalEditAppointmentDialog
                    appt={apptForEdit}
                    forcedUnitId={forcedUnitId}
                    forcedProfessionalId={appt.professionalId}
                    units={units}
                    clients={clients}
                    professionals={professionals}
                    services={services}
                >
                    <Button
                        type="button"
                        variant="edit2"
                        size="sm"
                        disabled={isBusy}
                    >
                        Editar
                    </Button>
                </ProfessionalEditAppointmentDialog>
            ) : null}

            {canDone ? (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            type="button"
                            variant="active"
                            size="sm"
                            disabled={isBusy}
                        >
                            Concluir
                        </Button>
                    </AlertDialogTrigger>

                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Concluir este agendamento?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Você vai marcar como concluído o agendamento de{' '}
                                <b>{appt.clientName}</b> às <b>{timeLabel}</b> (
                                {appt.description}).
                            </AlertDialogDescription>
                        </AlertDialogHeader>

                        <AlertDialogFooter>
                            <AlertDialogPrimitive.Cancel asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={loadingAction === 'done'}
                                >
                                    Voltar
                                </Button>
                            </AlertDialogPrimitive.Cancel>

                            <AlertDialogPrimitive.Action asChild>
                                <Button
                                    type="button"
                                    variant="active"
                                    size="sm"
                                    onClick={onDone}
                                    disabled={loadingAction === 'done'}
                                >
                                    {loadingAction === 'done'
                                        ? 'Concluindo...'
                                        : 'Concluir agendamento'}
                                </Button>
                            </AlertDialogPrimitive.Action>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            ) : null}

            {canCancel ? (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={isBusy}
                        >
                            Cancelar
                        </Button>
                    </AlertDialogTrigger>

                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Cancelar este agendamento?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                O agendamento de <b>{appt.clientName}</b> às{' '}
                                <b>{timeLabel}</b> será cancelado.
                            </AlertDialogDescription>
                        </AlertDialogHeader>

                        <AlertDialogFooter>
                            <AlertDialogPrimitive.Cancel asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={loadingAction === 'cancel'}
                                >
                                    Voltar
                                </Button>
                            </AlertDialogPrimitive.Cancel>

                            <AlertDialogPrimitive.Action asChild>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={onCancel}
                                    disabled={loadingAction === 'cancel'}
                                >
                                    {loadingAction === 'cancel'
                                        ? 'Cancelando...'
                                        : 'Cancelar agendamento'}
                                </Button>
                            </AlertDialogPrimitive.Action>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            ) : null}
        </div>
    );
}

function useProfessionalAppointmentRowActions(
    appt: ProfessionalAppointmentRowItem
) {
    const router = useRouter();
    const [loadingAction, setLoadingAction] = React.useState<
        null | 'done' | 'cancel'
    >(null);
    const [feeDialogOpen, setFeeDialogOpen] = React.useState(false);
    const [feePreview, setFeePreview] =
        React.useState<CancellationFeePreview | null>(null);

    const [planDialogOpen, setPlanDialogOpen] = React.useState(false);
    const [planPreview, setPlanPreview] =
        React.useState<PlanCreditPreview | null>(null);

    const runDone = React.useCallback(async () => {
        try {
            setLoadingAction('done');

            const res = await fetch(
                `/api/professional/appointments/${appt.id}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'done' }),
                }
            );

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                toast.error(
                    data?.error ?? 'Não foi possível concluir o agendamento.'
                );
                return;
            }

            toast.success(
                'Agendamento concluído! O pedido foi enviado para cobrança.'
            );
            router.refresh();
        } catch {
            toast.error('Erro ao concluir o agendamento.');
        } finally {
            setLoadingAction(null);
        }
    }, [appt.id, router]);

    const finalizeCancel = React.useCallback(
        async (
            confirmCancelFeeCharge: boolean,
            confirmPlanCreditDebit?: boolean
        ) => {
            try {
                setLoadingAction('cancel');

                const res = await fetch(
                    `/api/professional/appointments/${appt.id}`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'cancel',
                            confirmCancelFeeCharge,
                            confirmPlanCreditDebit,
                        }),
                    }
                );

                const data = await res.json().catch(() => ({}));

                if (!res.ok) {
                    toast.error(
                        data?.error ??
                            'Não foi possível cancelar o agendamento.'
                    );
                    return;
                }

                setFeeDialogOpen(false);
                setFeePreview(null);
                setPlanDialogOpen(false);
                setPlanPreview(null);

                if (confirmCancelFeeCharge) {
                    toast.success(
                        'Agendamento cancelado e taxa enviada para cobrança.'
                    );
                } else if (confirmPlanCreditDebit === true) {
                    toast.success(
                        'Agendamento cancelado e crédito do plano debitado.'
                    );
                } else {
                    toast.success('Agendamento cancelado.');
                }

                router.refresh();
            } catch {
                toast.error('Erro ao cancelar o agendamento.');
            } finally {
                setLoadingAction(null);
            }
        },
        [appt.id, router]
    );

    const finalizePlanCancel = React.useCallback(
        async (confirmPlanCreditDebit: boolean) => {
            try {
                setLoadingAction('cancel');

                const res = await fetch(
                    `/api/professional/appointments/${appt.id}`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'cancel',
                            confirmPlanCreditDebit,
                        }),
                    }
                );

                const data = await res.json().catch(() => ({}));

                if (!res.ok) {
                    toast.error(
                        data?.error ??
                            'Não foi possível cancelar o agendamento.'
                    );
                    return;
                }

                setPlanDialogOpen(false);
                setPlanPreview(null);

                if (confirmPlanCreditDebit) {
                    toast.success(
                        'Agendamento cancelado e crédito debitado do plano.'
                    );
                } else {
                    toast.success('Agendamento cancelado sem debitar crédito.');
                }

                router.refresh();
            } catch {
                toast.error('Erro ao cancelar o agendamento.');
            } finally {
                setLoadingAction(null);
            }
        },
        [appt.id, router]
    );

    const runCancel = React.useCallback(async () => {
        try {
            setLoadingAction('cancel');

            const res = await fetch(
                `/api/professional/appointments/${appt.id}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'cancel' }),
                }
            );

            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                toast.success('Agendamento cancelado.');
                router.refresh();
                return;
            }

            if (res.status === 409) {
                if (data?.requiresCancellationFeeConfirmation === true) {
                    setFeePreview(data?.cancellationFeePreview ?? null);
                    setFeeDialogOpen(true);
                    return;
                }

                if (data?.requiresPlanCreditConfirmation === true) {
                    setPlanPreview(data?.planCreditPreview ?? null);
                    setPlanDialogOpen(true);
                    return;
                }
            }

            toast.error(
                data?.error ?? 'Não foi possível cancelar o agendamento.'
            );
        } catch {
            toast.error('Erro ao cancelar o agendamento.');
        } finally {
            setLoadingAction(null);
        }
    }, [appt.id, router]);

    return {
        loadingAction,
        isBusy: loadingAction !== null,

        feeDialogOpen,
        setFeeDialogOpen,
        feePreview,

        planDialogOpen,
        setPlanDialogOpen,
        planPreview,

        runDone,
        runCancel,

        confirmCancelWithCharge: async () => finalizeCancel(true),
        confirmCancelWithoutCharge: async () => finalizeCancel(false),

        confirmPlanDebit: async () => finalizePlanCancel(true),
        skipPlanDebit: async () => finalizePlanCancel(false),
    };
}

export function ProfessionalAppointmentRow({
    appt,
    forcedUnitId = null,
    units,
    clients,
    professionals,
    services,
}: Props) {
    const {
        loadingAction,
        isBusy,
        feeDialogOpen,
        setFeeDialogOpen,
        feePreview,
        planDialogOpen,
        setPlanDialogOpen,
        planPreview,
        runDone,
        runCancel,
        confirmCancelWithCharge,
        confirmCancelWithoutCharge,
        confirmPlanDebit,
        skipPlanDebit,
    } = useProfessionalAppointmentRowActions(appt);

    const isPending = appt.status === 'PENDING';
    const isClientCanceled = appt.confirmationStatus === 'CANCELED';

    const canEdit = isPending && !isClientCanceled;
    const canDone = isPending && !isClientCanceled;
    const canCancel = isPending;

    const timeLabel = formatTimeHHmm(appt.scheduleAt);

    return (
        <>
            <tr className="border-b border-border-primary hover:bg-muted/30">
                <td className="px-4 py-3 font-medium text-content-primary">
                    {timeLabel}
                </td>

                <td className="px-4 py-3 text-content-primary">
                    {appt.clientName}
                </td>

                <td className="px-4 py-3">
                    <CustomerLevelBadge level={appt.clientLevel} />
                </td>

                <td className="px-4 py-3 text-content-secondary">
                    {appt.phone}
                </td>

                <td className="px-4 py-3 text-content-secondary">
                    {appt.description}
                </td>

                <td className="px-4 py-3">
                    <StatusBadge status={appt.status} />
                </td>

                <td className="px-4 py-3">
                    <ConfirmationBadge status={appt.confirmationStatus} />
                </td>

                <td className="px-4 py-3 text-right">
                    <AppointmentActions
                        appt={appt}
                        timeLabel={timeLabel}
                        canEdit={canEdit}
                        canDone={canDone}
                        canCancel={canCancel}
                        isBusy={isBusy}
                        loadingAction={loadingAction}
                        forcedUnitId={forcedUnitId}
                        units={units}
                        clients={clients}
                        professionals={professionals}
                        services={services}
                        onDone={runDone}
                        onCancel={runCancel}
                    />
                </td>
            </tr>

            <CancellationFeeDialog
                open={feeDialogOpen}
                onOpenChange={setFeeDialogOpen}
                appt={appt}
                timeLabel={timeLabel}
                feePreview={feePreview}
                loading={loadingAction === 'cancel'}
                onConfirmCharge={confirmCancelWithCharge}
                onConfirmWithoutCharge={confirmCancelWithoutCharge}
            />

            <PlanCreditDialog
                open={planDialogOpen}
                onOpenChange={setPlanDialogOpen}
                appt={appt}
                timeLabel={timeLabel}
                preview={planPreview}
                loading={loadingAction === 'cancel'}
                onConfirmDebit={confirmPlanDebit}
                onSkipDebit={skipPlanDebit}
            />
        </>
    );
}

export function ProfessionalAppointmentRowMobile({
    appt,
    forcedUnitId = null,
    units,
    clients,
    professionals,
    services,
}: Props) {
    const {
        loadingAction,
        isBusy,
        feeDialogOpen,
        setFeeDialogOpen,
        feePreview,
        planDialogOpen,
        setPlanDialogOpen,
        planPreview,
        runDone,
        runCancel,
        confirmCancelWithCharge,
        confirmCancelWithoutCharge,
        confirmPlanDebit,
        skipPlanDebit,
    } = useProfessionalAppointmentRowActions(appt);

    const isPending = appt.status === 'PENDING';
    const isClientCanceled = appt.confirmationStatus === 'CANCELED';

    const canEdit = isPending && !isClientCanceled;
    const canDone = isPending && !isClientCanceled;
    const canCancel = isPending;

    const timeLabel = formatTimeHHmm(appt.scheduleAt);

    return (
        <>
            <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <p className="text-label-small text-content-secondary">
                            Hora
                        </p>
                        <p className="text-paragraph-medium font-semibold text-content-primary">
                            {timeLabel}
                        </p>
                    </div>

                    <div className="shrink-0 space-y-2 text-right">
                        <StatusBadge status={appt.status} />
                        <div>
                            <ConfirmationBadge
                                status={appt.confirmationStatus}
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-3 grid gap-3">
                    <div>
                        <p className="text-label-small text-content-secondary">
                            Cliente
                        </p>
                        <p className="text-paragraph-medium text-content-primary">
                            {appt.clientName}
                        </p>
                    </div>

                    <div>
                        <p className="text-label-small text-content-secondary">
                            Nível
                        </p>
                        <p className="mt-1">
                            <CustomerLevelBadge level={appt.clientLevel} />
                        </p>
                    </div>

                    <div>
                        <p className="text-label-small text-content-secondary">
                            Telefone
                        </p>
                        <p className="text-paragraph-medium text-content-secondary">
                            {appt.phone}
                        </p>
                    </div>

                    <div>
                        <p className="text-label-small text-content-secondary">
                            Serviço
                        </p>
                        <p className="text-paragraph-medium text-content-secondary">
                            {appt.description}
                        </p>
                    </div>

                    <div>
                        <p className="text-label-small text-content-secondary">
                            Confirmação
                        </p>
                        <p className="mt-1">
                            <ConfirmationBadge
                                status={appt.confirmationStatus}
                            />
                        </p>
                    </div>

                    <div className="pt-1">
                        <p className="mb-2 text-label-small text-content-secondary">
                            Ações
                        </p>

                        <div className="flex flex-wrap gap-2">
                            <AppointmentActions
                                appt={appt}
                                timeLabel={timeLabel}
                                canEdit={canEdit}
                                canDone={canDone}
                                canCancel={canCancel}
                                isBusy={isBusy}
                                loadingAction={loadingAction}
                                forcedUnitId={forcedUnitId}
                                units={units}
                                clients={clients}
                                professionals={professionals}
                                services={services}
                                onDone={runDone}
                                onCancel={runCancel}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <CancellationFeeDialog
                open={feeDialogOpen}
                onOpenChange={setFeeDialogOpen}
                appt={appt}
                timeLabel={timeLabel}
                feePreview={feePreview}
                loading={loadingAction === 'cancel'}
                onConfirmCharge={confirmCancelWithCharge}
                onConfirmWithoutCharge={confirmCancelWithoutCharge}
            />

            <PlanCreditDialog
                open={planDialogOpen}
                onOpenChange={setPlanDialogOpen}
                appt={appt}
                timeLabel={timeLabel}
                preview={planPreview}
                loading={loadingAction === 'cancel'}
                onConfirmDebit={confirmPlanDebit}
                onSkipDebit={skipPlanDebit}
            />
        </>
    );
}

export default ProfessionalAppointmentRow;
