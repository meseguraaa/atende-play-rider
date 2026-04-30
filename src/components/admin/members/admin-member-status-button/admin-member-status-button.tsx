'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type AdminMemberStatusButtonProps = {
    memberId: string;
    isActive: boolean;
};

export function AdminMemberStatusButton({
    memberId,
    isActive,
}: AdminMemberStatusButtonProps) {
    const router = useRouter();
    const [isPending, setIsPending] = React.useState(false);

    async function handleClick() {
        if (isPending) return;

        try {
            setIsPending(true);

            const res = await fetch(
                `/api/admin/members/${memberId}/toggle-status`,
                {
                    method: 'PATCH',
                }
            );

            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                toast.error(
                    json?.error ||
                        'Não foi possível alterar o status do membro.'
                );
                return;
            }

            toast.success(
                json.isActive
                    ? 'Membro reativado com sucesso!'
                    : 'Membro inativado com sucesso!'
            );

            router.refresh();
        } catch {
            toast.error('Erro de rede ao alterar o status do membro.');
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
