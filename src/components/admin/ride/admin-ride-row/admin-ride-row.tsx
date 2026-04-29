// src/components/admin/ride/admin-ride-row.tsx
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
import EditRideDialog from '@/components/admin/ride/edit-ride-dialog/edit-ride-dialog';

export type RideStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELED' | 'FINISHED';

export type AdminRideRowItem = {
    id: string;
    unitId: string | null;
    title: string;
    destination: string;
    description: string | null;
    observation: string | null;
    startsAt: string | Date;
    endsAt: string | Date | null;
    status: RideStatus;
    confirmedCount: number;
    arrivedHomeCount: number;
    images?: Array<{
        id: string;
        imageUrl: string;
        order: number;
    }>;
    meetingPoints?: Array<{
        id: string;
        name: string;
        address: string | null;
        order: number;
    }>;
};

type Props = {
    ride: AdminRideRowItem;
};

function formatDateTime(value: string | Date | null): string {
    if (!value) return '-';

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return '-';

    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function StatusBadge({ status }: { status: RideStatus }) {
    const label =
        status === 'DRAFT'
            ? 'Rascunho'
            : status === 'PUBLISHED'
              ? 'Publicado'
              : status === 'FINISHED'
                ? 'Finalizado'
                : 'Cancelado';

    const toneClass =
        status === 'DRAFT'
            ? 'border-amber-500/30 bg-amber-500/15 text-amber-500'
            : status === 'PUBLISHED'
              ? 'border-blue-500/30 bg-blue-500/15 text-blue-500'
              : status === 'FINISHED'
                ? 'border-green-500/30 bg-green-500/15 text-green-500'
                : 'border-red-500/30 bg-red-500/15 text-red-500';

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
                toneClass
            )}
        >
            {label}
        </span>
    );
}

function useRideActions(ride: AdminRideRowItem) {
    const router = useRouter();

    const [loadingAction, setLoadingAction] = React.useState<
        null | 'publish' | 'cancel'
    >(null);

    async function runAction(action: 'publish' | 'cancel') {
        try {
            setLoadingAction(action);

            const response = await fetch(`/api/admin/rides/${ride.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                toast.error(
                    data?.error ?? 'Não foi possível atualizar o rolê.'
                );
                return;
            }

            toast.success(
                action === 'publish'
                    ? 'Rolê publicado com sucesso!'
                    : 'Rolê cancelado com sucesso!'
            );

            router.refresh();
        } catch {
            toast.error('Erro ao atualizar o rolê.');
        } finally {
            setLoadingAction(null);
        }
    }

    return {
        loadingAction,
        isBusy: loadingAction !== null,
        publish: () => runAction('publish'),
        cancel: () => runAction('cancel'),
    };
}

export function AdminRideRow({ ride }: Props) {
    const { loadingAction, isBusy, publish, cancel } = useRideActions(ride);

    const coverImage = ride.images?.[0]?.imageUrl ?? null;
    const firstMeetingPoint = ride.meetingPoints?.[0] ?? null;

    const canEdit = ride.status === 'DRAFT';
    const canPublish = ride.status === 'DRAFT';
    const canCancel = ride.status === 'DRAFT' || ride.status === 'PUBLISHED';

    return (
        <tr className="border-b border-border-primary hover:bg-muted/30">
            <td className="px-4 py-3">
                <div className="min-w-0">
                    <p className="truncate font-medium text-content-primary">
                        {ride.title}
                    </p>
                    <p className="truncate text-xs text-content-secondary">
                        {ride.destination}
                    </p>
                </div>
            </td>

            <td className="px-4 py-3 text-content-secondary whitespace-nowrap">
                {formatDateTime(ride.startsAt)}
            </td>

            <td className="px-4 py-3 text-content-secondary whitespace-nowrap">
                {formatDateTime(ride.endsAt)}
            </td>

            <td className="px-4 py-3 whitespace-nowrap">
                <StatusBadge status={ride.status} />
            </td>

            <td className="px-4 py-3 text-center text-content-primary whitespace-nowrap">
                {ride.confirmedCount}
            </td>

            <td className="px-4 py-3 text-center text-content-primary whitespace-nowrap">
                {ride.arrivedHomeCount}
            </td>

            <td className="px-4 py-3 text-right whitespace-nowrap">
                <div className="flex flex-wrap justify-end gap-2">
                    {canEdit ? (
                        <EditRideDialog ride={ride}>
                            <Button
                                type="button"
                                variant="edit2"
                                size="sm"
                                disabled={isBusy}
                            >
                                Editar
                            </Button>
                        </EditRideDialog>
                    ) : null}

                    {canPublish ? (
                        <Button
                            type="button"
                            variant="active"
                            size="sm"
                            disabled={isBusy}
                            onClick={publish}
                        >
                            {loadingAction === 'publish'
                                ? 'Publicando...'
                                : 'Publicar'}
                        </Button>
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
                                        Cancelar este rolê?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        O rolê <b>{ride.title}</b> será
                                        cancelado. Os membros não poderão mais
                                        confirmar presença.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>

                                <AlertDialogFooter>
                                    <AlertDialogPrimitive.Cancel asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={
                                                loadingAction === 'cancel'
                                            }
                                        >
                                            Voltar
                                        </Button>
                                    </AlertDialogPrimitive.Cancel>

                                    <AlertDialogPrimitive.Action asChild>
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            onClick={cancel}
                                            disabled={
                                                loadingAction === 'cancel'
                                            }
                                        >
                                            {loadingAction === 'cancel'
                                                ? 'Cancelando...'
                                                : 'Cancelar rolê'}
                                        </Button>
                                    </AlertDialogPrimitive.Action>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    ) : null}
                </div>
            </td>
        </tr>
    );
}

export function AdminRideRowMobile({ ride }: Props) {
    const { loadingAction, isBusy, publish, cancel } = useRideActions(ride);

    const coverImage = ride.images?.[0]?.imageUrl ?? null;
    const firstMeetingPoint = ride.meetingPoints?.[0] ?? null;

    const canEdit = ride.status === 'DRAFT';
    const canPublish = ride.status === 'DRAFT';
    const canCancel = ride.status === 'DRAFT' || ride.status === 'PUBLISHED';

    return (
        <div className="p-4">
            <div className="flex gap-3">
                <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-border-primary bg-background-secondary">
                    {coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={coverImage}
                            alt={ride.title}
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-content-tertiary">
                            Sem foto
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium text-content-primary">
                        {ride.title}
                    </p>
                    <p className="truncate text-sm text-content-secondary">
                        {ride.destination}
                    </p>
                    <StatusBadge status={ride.status} />
                </div>
            </div>

            <div className="mt-4 grid gap-3">
                <div>
                    <p className="text-label-small text-content-secondary">
                        Início
                    </p>
                    <p className="text-paragraph-medium text-content-primary">
                        {formatDateTime(ride.startsAt)}
                    </p>
                </div>

                <div>
                    <p className="text-label-small text-content-secondary">
                        Fim
                    </p>
                    <p className="text-paragraph-medium text-content-primary">
                        {formatDateTime(ride.endsAt)}
                    </p>
                </div>

                <div>
                    <p className="text-label-small text-content-secondary">
                        Primeiro ponto de encontro
                    </p>
                    <p className="text-paragraph-medium text-content-secondary">
                        {firstMeetingPoint?.name ?? '-'}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <p className="text-label-small text-content-secondary">
                            Confirmados
                        </p>
                        <p className="text-paragraph-medium text-content-primary">
                            {ride.confirmedCount}
                        </p>
                    </div>

                    <div>
                        <p className="text-label-small text-content-secondary">
                            Chegaram em casa
                        </p>
                        <p className="text-paragraph-medium text-content-primary">
                            {ride.arrivedHomeCount}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                    {canEdit ? (
                        <EditRideDialog ride={ride}>
                            <Button
                                type="button"
                                variant="edit2"
                                size="sm"
                                disabled={isBusy}
                            >
                                Editar
                            </Button>
                        </EditRideDialog>
                    ) : null}

                    {canPublish ? (
                        <Button
                            type="button"
                            variant="active"
                            size="sm"
                            disabled={isBusy}
                            onClick={publish}
                        >
                            {loadingAction === 'publish'
                                ? 'Publicando...'
                                : 'Publicar'}
                        </Button>
                    ) : null}

                    {canCancel ? (
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={isBusy}
                            onClick={cancel}
                        >
                            {loadingAction === 'cancel'
                                ? 'Cancelando...'
                                : 'Cancelar'}
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export default AdminRideRow;
