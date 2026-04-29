'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FaqEditDialog } from '@/components/admin/faq/faq-edit-dialog/faq-edit-dialog';

import type { FaqRowItem } from '@/components/admin/faq/faq-row/faq-row';
import {
    buildFaqDialogShape,
    normalizeFaqForUI,
    patchFaq,
    FaqRow,
} from '@/components/admin/faq/faq-row/faq-row';

/* ---------------------------------------------
 * ✅ Media query hook (evita render duplicado)
 * --------------------------------------------- */
function useMediaQuery(query: string) {
    const getMatch = React.useCallback(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(query).matches;
    }, [query]);

    const [matches, setMatches] = React.useState<boolean>(() => getMatch());

    React.useEffect(() => {
        const mql = window.matchMedia(query);

        const onChange = () => setMatches(mql.matches);

        setMatches(mql.matches);

        if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', onChange);
            return () => mql.removeEventListener('change', onChange);
        }

        mql.addListener(onChange);
        return () => mql.removeListener(onChange);
    }, [query]);

    return matches;
}

function FaqCard({ faq }: { faq: FaqRowItem }) {
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
        <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3">
            <div className="min-w-0 space-y-1">
                <p className="text-paragraph-medium-size font-semibold text-content-primary wrap-break-word">
                    {faq.question}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-0.5">
                    <p className="text-[11px] text-content-tertiary">
                        Categoria
                    </p>
                    <p className="text-paragraph-small text-content-primary font-medium">
                        {faq.categoryName || '—'}
                    </p>
                </div>

                <div className="space-y-0.5">
                    <p className="text-[11px] text-content-tertiary">Ordem</p>
                    <p className="text-paragraph-small text-content-primary font-medium">
                        {normalized.sortOrder}
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
                <FaqEditDialog faq={faqLikeForDialog} />

                <Button
                    variant={isActive ? 'destructive' : 'active'}
                    size="sm"
                    type="button"
                    onClick={handleToggleActive}
                    disabled={isToggling}
                    className="border-border-primary hover:bg-muted/40 w-full"
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
        </div>
    );
}

export function FaqResponsiveList({ faqs }: { faqs: FaqRowItem[] }) {
    const list = Array.isArray(faqs) ? faqs : [];

    const isDesktop = useMediaQuery('(min-width: 768px)');

    if (!isDesktop) {
        return (
            <section className="space-y-2">
                {list.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhuma dúvida cadastrada ainda.
                        </p>
                    </div>
                ) : (
                    list.map((faq) => <FaqCard key={faq.id} faq={faq} />)
                )}
            </section>
        );
    }

    return (
        <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
            <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                    <col className="w-100" />
                    <col className="w-40" />
                    <col className="w-20" />
                    <col className="w-50" />
                </colgroup>

                <thead>
                    <tr className="border-b border-border-primary bg-background-secondary">
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Pergunta
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Categoria
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                            Ordem
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                            Ações
                        </th>
                    </tr>
                </thead>

                <tbody className="[&>tr>td]:align-middle">
                    {list.length === 0 ? (
                        <tr className="border-t border-border-primary">
                            <td
                                colSpan={4}
                                className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                            >
                                Nenhuma dúvida cadastrada ainda.
                            </td>
                        </tr>
                    ) : (
                        list.map((faq) => <FaqRow key={faq.id} faq={faq} />)
                    )}
                </tbody>
            </table>
        </section>
    );
}
