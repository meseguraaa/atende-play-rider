'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FaqEditDialog } from '@/components/admin/faq/faq-edit-dialog/faq-edit-dialog';

export type FaqRowItem = {
    id: string;

    question: string;
    answer: string;

    sortOrder?: number | null;

    isActive: boolean;

    companyId?: string | null;
    categoryId?: string | null;
    categoryName?: string | null;
};

type FaqRowProps = {
    faq: FaqRowItem;
};

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error?: string };

export async function patchFaq(
    faqId: string,
    payload: Record<string, unknown>
) {
    const res = await fetch(`/api/admin/faq/${faqId}`, {
        method: 'PATCH',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => null)) as
        | ApiOk<unknown>
        | ApiErr
        | null;

    if (!res.ok || !json || json.ok !== true) {
        const msg =
            (json && json.ok === false && json.error) ||
            'Não foi possível salvar.';
        return { ok: false as const, error: msg };
    }

    return { ok: true as const, data: json.data };
}

export function normalizeFaqForUI(faq: FaqRowItem) {
    const sortOrder =
        typeof faq.sortOrder === 'number' && Number.isFinite(faq.sortOrder)
            ? faq.sortOrder
            : 100;

    return { sortOrder };
}

export function buildFaqDialogShape(
    faq: FaqRowItem,
    normalized: ReturnType<typeof normalizeFaqForUI>
) {
    return {
        id: faq.id,
        companyId: faq.companyId ?? null,
        categoryId: faq.categoryId ?? null,
        categoryName: faq.categoryName ?? null,
        question: faq.question,
        answer: faq.answer,
        sortOrder: normalized.sortOrder,
        isActive: Boolean(faq.isActive),
    } as const;
}

export function FaqRow({ faq }: FaqRowProps) {
    const router = useRouter();

    const isActive = Boolean(faq.isActive);
    const [isToggling, setIsToggling] = React.useState(false);

    const normalized = React.useMemo(() => normalizeFaqForUI(faq), [faq]);

    const faqLikeForDialog = React.useMemo(
        () => buildFaqDialogShape(faq, normalized),
        [faq, normalized]
    );

    async function handleToggleActive() {
        if (isToggling) return;

        setIsToggling(true);

        const res = await patchFaq(faq.id, { isActive: !isActive });

        setIsToggling(false);

        if (!res.ok) {
            toast.error(res.error);
            return;
        }

        toast.success(isActive ? 'Dúvida desativada!' : 'Dúvida ativada!');
        router.refresh();
    }

    return (
        <tr className="border-t border-border-primary">
            <td className="px-4 py-3">
                <div className="space-y-0.5">
                    <p className="text-paragraph-medium-size text-content-primary">
                        {faq.question}
                    </p>
                </div>
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {faq.categoryName || '—'}
            </td>

            <td className="px-4 py-3 text-paragraph-small text-content-secondary">
                {normalized.sortOrder}
            </td>

            <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                    <FaqEditDialog faq={faqLikeForDialog} />

                    <Button
                        variant={isActive ? 'destructive' : 'active'}
                        size="sm"
                        type="button"
                        onClick={handleToggleActive}
                        disabled={isToggling}
                        className="border-border-primary hover:bg-muted/40"
                        title={
                            isToggling
                                ? 'Salvando...'
                                : isActive
                                  ? 'Desativar dúvida'
                                  : 'Ativar dúvida'
                        }
                    >
                        {isToggling
                            ? 'Salvando...'
                            : isActive
                              ? 'Desativar'
                              : 'Ativar'}
                    </Button>
                </div>
            </td>
        </tr>
    );
}
