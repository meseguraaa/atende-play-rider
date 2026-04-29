'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type SendCampaignFilters = {
    q: string;
    level: string;
    status: string;
    plan: string;
    lastVisit: string;
    frequency: string;
    minSpent: number;
    unitId: string;
};

type SendCampaignCardProps = {
    eligibleCount: number;
    eligibleWithPhoneCount: number;
    estimatedConsumptionLabel: string;
    balanceNow: number;
    freeAvailable: boolean;
    filters: SendCampaignFilters;
};

type SendCampaignResponse =
    | {
          ok: true;
          data: {
              sentCount: number;
              failedCount: number;
              audienceCount: number;
              creditMode: string;
              remainingCredits: number;
          };
      }
    | {
          ok: false;
          error?: string;
      };

export function SendCampaignCard({
    eligibleCount,
    eligibleWithPhoneCount,
    estimatedConsumptionLabel,
    balanceNow,
    freeAvailable,
    filters,
}: SendCampaignCardProps) {
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [isPending, startTransition] = useTransition();

    const hasAudience = eligibleWithPhoneCount > 0;
    const availableSends = balanceNow + (freeAvailable ? 1 : 0);
    const hasCreditsAvailable = availableSends > 0;

    const canSend =
        hasAudience &&
        hasCreditsAvailable &&
        title.trim().length > 0 &&
        message.trim().length > 0 &&
        !isPending;

    async function handleSend() {
        if (!hasAudience) {
            toast.error('Nenhum cliente elegível com push ativo.');
            return;
        }

        if (!hasCreditsAvailable) {
            toast.error('Você não possui créditos para enviar mensagem.');
            return;
        }

        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            toast.error('Digite o título antes de enviar.');
            return;
        }

        const trimmedMessage = message.trim();
        if (!trimmedMessage) {
            toast.error('Digite a mensagem antes de enviar.');
            return;
        }

        startTransition(async () => {
            try {
                const response = await fetch(
                    '/api/admin/communication/send-campaign',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            title: trimmedTitle,
                            message: trimmedMessage,
                            filters,
                        }),
                    }
                );

                const data = (await response
                    .json()
                    .catch(() => null)) as SendCampaignResponse | null;

                if (!response.ok || !data?.ok) {
                    toast.error(
                        data && !data.ok && data.error
                            ? data.error
                            : 'Não foi possível enviar a campanha.'
                    );
                    return;
                }

                toast.success(
                    `Campanha enviada. ${data.data.sentCount} enviado(s), ${data.data.failedCount} falha(s).`
                );

                setTitle('');
                setMessage('');
                window.location.reload();
            } catch {
                toast.error('Erro ao enviar a campanha.');
            }
        });
    }

    return (
        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                    <p className="text-label-small text-content-secondary">
                        Público estimado
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-md border border-border-primary px-2.5 py-1 text-sm text-content-primary">
                            {eligibleCount} clientes encontrados
                        </span>

                        <span className="inline-flex items-center rounded-md border border-green-600/40 px-2.5 py-1 text-sm text-green-600">
                            {eligibleWithPhoneCount} com push ativo
                        </span>
                    </div>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3 min-w-65">
                    <p className="text-[11px] text-content-secondary">
                        Próximo disparo
                    </p>

                    <p className="text-sm font-semibold text-content-primary mt-1">
                        {estimatedConsumptionLabel === '1 grátis'
                            ? 'Vai usar seu envio grátis'
                            : estimatedConsumptionLabel === '1 crédito'
                              ? 'Vai consumir 1 crédito'
                              : estimatedConsumptionLabel}
                    </p>

                    <p className="text-[11px] text-content-secondary mt-1">
                        Saldo disponível: {availableSends} envio(s)
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-[11px] text-content-secondary">
                        Título
                    </label>

                    {!hasCreditsAvailable ? (
                        <div className="h-10 rounded-md border border-border-primary bg-background-secondary px-4 text-sm text-content-secondary flex items-center">
                            Você não possui créditos para enviar mensagem.
                        </div>
                    ) : (
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Digite o título da notificação..."
                            className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary outline-none"
                            disabled={isPending}
                        />
                    )}
                </div>

                <div className="space-y-2">
                    <label className="text-[11px] text-content-secondary">
                        Mensagem
                    </label>

                    {!hasCreditsAvailable ? (
                        <div className="min-h-40 rounded-md border border-border-primary bg-background-secondary px-4 py-3 text-sm text-content-secondary flex items-center">
                            Você não possui créditos para enviar mensagem.
                        </div>
                    ) : (
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Escreva aqui a mensagem que será enviada para o público filtrado..."
                            className="min-h-40 bg-background-secondary border-border-primary"
                            disabled={isPending}
                        />
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="edit2"
                    size="sm"
                    onClick={handleSend}
                    disabled={!canSend}
                >
                    {isPending ? 'Enviando...' : 'Enviar campanha'}
                </Button>
            </div>
        </section>
    );
}
