'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type AdminClientStatusButtonProps = {
    clientId: string;
    isActive: boolean;
};

export function AdminClientStatusButton({
    clientId,
    isActive,
}: AdminClientStatusButtonProps) {
    const router = useRouter();
    const [isPending, setIsPending] = React.useState(false);

    async function handleClick() {
        if (isPending) return;

        try {
            setIsPending(true);

            const res = await fetch(
                `/api/admin/clients/${clientId}/toggle-status`,
                {
                    method: 'PATCH',
                }
            );

            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                toast.error(
                    json?.error ||
                        'Não foi possível alterar o status do cliente.'
                );
                return;
            }

            toast.success(
                json.isActive
                    ? 'Cliente reativado com sucesso!'
                    : 'Cliente inativado com sucesso!'
            );

            router.refresh();
        } catch {
            toast.error('Erro de rede ao alterar o status do cliente.');
        } finally {
            setIsPending(false);
        }
    }

    return (
        <Button
            type="button"
            variant={isActive ? 'destructive' : 'active'}
            size="sm"
            className="border-border-primary hover:bg-muted/40"
            onClick={handleClick}
            disabled={isPending}
            title={isPending ? 'Processando...' : undefined}
        >
            {isPending ? 'Aguarde...' : isActive ? 'Inativar' : 'Reativar'}
        </Button>
    );
}
