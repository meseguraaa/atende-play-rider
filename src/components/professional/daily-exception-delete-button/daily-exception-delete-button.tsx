'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type DailyExceptionDeleteButtonProps = {
    professionalId: string;
    dateISO: string;

    /**
     * Se quiser controlar a remoção por fora (ex: chamar API),
     * retorne uma Promise e o botão fica em loading até concluir.
     *
     * Observação:
     * - Se você passar onDelete, este componente NÃO dispara toast/refresh
     *   para evitar duplicação (o pai pode controlar isso).
     * - Se NÃO passar, ele chama a API, mostra toast e dá refresh.
     */
    onDelete?: (args: {
        professionalId: string;
        dateISO: string;
    }) => void | Promise<void>;
};

export function DailyExceptionDeleteButton({
    professionalId,
    dateISO,
    onDelete,
}: DailyExceptionDeleteButtonProps) {
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);

    const handleDelete = async () => {
        try {
            setIsPending(true);

            // ✅ Se o pai controla, só delega (sem duplicar toast/refresh)
            if (onDelete) {
                await onDelete({ professionalId, dateISO });
                return;
            }

            // ✅ Caso contrário, este componente resolve tudo
            const res = await fetch(
                `/api/professional/availability/exceptions?dateISO=${encodeURIComponent(
                    dateISO
                )}`,
                {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                }
            );

            const json = (await res.json()) as { ok: boolean; error?: string };

            if (!res.ok || !json?.ok) {
                toast.error(json?.error ?? 'Erro ao remover exceção.');
                return;
            }

            toast.success('Exceção removida com sucesso.');
            router.refresh();
        } catch {
            toast.error('Falha ao remover exceção. Tente novamente.');
        } finally {
            setIsPending(false);
        }
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isPending}
                >
                    Excluir
                </Button>
            </AlertDialogTrigger>

            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Remover exceção deste dia?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        Este dia voltará a seguir apenas o padrão semanal de
                        disponibilidade. Os horários customizados serão
                        apagados.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>
                        Cancelar
                    </AlertDialogCancel>

                    <AlertDialogAction asChild>
                        <Button
                            onClick={handleDelete}
                            disabled={isPending}
                            variant="destructive"
                            type="button"
                        >
                            {isPending ? 'Removendo...' : 'Remover exceção'}
                        </Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
