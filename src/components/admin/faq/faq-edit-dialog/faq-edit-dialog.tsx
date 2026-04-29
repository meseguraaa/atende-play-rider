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

import { cn } from '@/lib/utils';
import {
    CircleHelp,
    FolderTree,
    ListOrdered,
    MessageSquareText,
} from 'lucide-react';

type CategoryOption = {
    id: string;
    name: string;
    isActive: boolean;
    showInServices: boolean;
    showInProducts: boolean;
    showInFaq: boolean;
};

type FaqEditDialogProps = {
    faq: {
        id: string;
        companyId?: string | null;
        categoryId?: string | null;
        categoryName?: string | null;
        question: string;
        answer: string;
        sortOrder?: number | null;
        isActive: boolean;
    };
};

type FaqApiGetResponse =
    | {
          ok: true;
          data: {
              faqItems: unknown[];
              categories: CategoryOption[];
          };
      }
    | { ok: false; error?: string };

type FaqDetailsApiResponse = {
    ok: boolean;
    data?: {
        faq: {
            id: string;
            companyId: string;
            categoryId: string;
            question: string;
            answer: string;
            sortOrder: number;
            isActive: boolean;
            createdAt: string | Date;
            updatedAt: string | Date;
        };
    };
    error?: string;
};

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

function parseInteger(value: string) {
    const n = Number(String(value ?? '').trim());
    return Number.isFinite(n) ? n : NaN;
}

export function FaqEditDialog({ faq }: FaqEditDialogProps) {
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [categories, setCategories] = useState<CategoryOption[]>([]);

    const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
        faq.categoryId ?? ''
    );
    const [question, setQuestion] = useState(faq.question ?? '');
    const [answer, setAnswer] = useState(faq.answer ?? '');
    const [sortOrder, setSortOrder] = useState(
        typeof faq.sortOrder === 'number' ? String(faq.sortOrder) : '100'
    );

    const activeFaqCategories = useMemo(
        () => categories.filter((c) => c.isActive && c.showInFaq),
        [categories]
    );

    const hasCategories = activeFaqCategories.length > 0;
    const busy = loading || saving;

    function resetToInitial() {
        setSelectedCategoryId(faq.categoryId ?? '');
        setQuestion(faq.question ?? '');
        setAnswer(faq.answer ?? '');
        setSortOrder(
            typeof faq.sortOrder === 'number' ? String(faq.sortOrder) : '100'
        );
    }

    async function loadData() {
        setLoading(true);

        try {
            const [faqRes, listRes] = await Promise.all([
                fetch(`/api/admin/faq/${faq.id}`, {
                    method: 'GET',
                    cache: 'no-store',
                    headers: { accept: 'application/json' },
                }),
                fetch('/api/admin/faq', {
                    method: 'GET',
                    cache: 'no-store',
                    headers: { accept: 'application/json' },
                }),
            ]);

            const faqJson = (await faqRes
                .json()
                .catch(() => null)) as FaqDetailsApiResponse | null;

            const listJson = (await listRes
                .json()
                .catch(() => null)) as FaqApiGetResponse | null;

            if (!faqRes.ok || !faqJson?.ok || !faqJson.data?.faq) {
                const msg =
                    (faqJson && faqJson.ok === false && faqJson.error) ||
                    'Não foi possível carregar os dados da dúvida.';
                toast.error(msg);
                return;
            }

            if (!listRes.ok || !listJson || (listJson as any).ok !== true) {
                const msg =
                    (listJson &&
                        (listJson as any).ok === false &&
                        (listJson as any).error) ||
                    'Não foi possível carregar as categorias.';
                toast.error(msg);
                return;
            }

            const nextCategories = (listJson as any).data?.categories ?? [];
            const currentFaq = faqJson.data.faq;

            setCategories(nextCategories);
            setSelectedCategoryId(currentFaq.categoryId ?? '');
            setQuestion(currentFaq.question ?? '');
            setAnswer(currentFaq.answer ?? '');
            setSortOrder(
                typeof currentFaq.sortOrder === 'number'
                    ? String(currentFaq.sortOrder)
                    : '100'
            );
        } catch {
            toast.error('Não foi possível carregar os dados da dúvida.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!open) return;
        void loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const categoryIsValid =
        !!selectedCategoryId &&
        (categories.find((c) => c.id === selectedCategoryId)?.isActive ??
            false) &&
        (categories.find((c) => c.id === selectedCategoryId)?.showInFaq ??
            false);

    const requiredOk =
        categoryIsValid &&
        question.trim().length > 0 &&
        answer.trim().length > 0 &&
        Number.isFinite(parseInteger(sortOrder));

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (busy) return;

        if (!hasCategories) {
            toast.error(
                'Cadastre pelo menos 1 categoria ativa com uso em Tirar dúvidas antes de editar dúvidas.'
            );
            return;
        }

        if (!categoryIsValid) {
            toast.error('Selecione uma categoria ativa para Tirar dúvidas.');
            return;
        }

        if (!requiredOk) {
            toast.error('Preencha os campos obrigatórios.');
            return;
        }

        const sortOrderNum = parseInteger(sortOrder);

        if (!Number.isFinite(sortOrderNum)) {
            toast.error('A ordem de exibição é inválida.');
            return;
        }

        setSaving(true);

        try {
            const res = await fetch(`/api/admin/faq/${faq.id}`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json',
                },
                body: JSON.stringify({
                    categoryId: selectedCategoryId,
                    question: question.trim(),
                    answer: answer.trim(),
                    sortOrder: sortOrderNum,
                }),
            });

            const json = (await res.json().catch(() => null)) as
                | { ok: true; data?: unknown }
                | { ok: false; error?: string }
                | null;

            if (!res.ok || !json || (json as any).ok !== true) {
                const msg =
                    (json &&
                        (json as any).ok === false &&
                        (json as any).error) ||
                    'Não foi possível salvar a dúvida.';
                toast.error(msg);
                return;
            }

            toast.success('Dúvida atualizada com sucesso!');
            setOpen(false);
            router.refresh();
        } catch {
            toast.error('Não foi possível salvar a dúvida.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (busy) return;
                setOpen(next);
                if (!next) resetToInitial();
            }}
        >
            <DialogTrigger asChild>
                <Button
                    variant="edit2"
                    size="sm"
                    className="border-border-primary hover:bg-muted/40"
                    type="button"
                >
                    Editar
                </Button>
            </DialogTrigger>

            <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Editar dúvida
                    </DialogTitle>
                </DialogHeader>

                {!loading && !hasCategories ? (
                    <div className="rounded-xl border border-dashed border-border-primary bg-background-tertiary p-4 text-sm text-content-secondary">
                        Você ainda não tem categorias ativas marcadas para Tirar
                        dúvidas. Crie ou edite uma categoria e marque essa opção
                        antes de editar dúvidas.
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 pb-2">
                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                Categoria{' '}
                                <span className="text-red-500">*</span>
                            </label>

                            <Select
                                value={selectedCategoryId}
                                onValueChange={(v) => setSelectedCategoryId(v)}
                                disabled={
                                    busy || activeFaqCategories.length === 0
                                }
                            >
                                <SelectTrigger className={SELECT_TRIGGER}>
                                    <div className="flex items-center gap-2">
                                        <FolderTree className="h-4 w-4 text-content-brand" />
                                        <SelectValue placeholder="Selecione a categoria" />
                                    </div>
                                </SelectTrigger>

                                <SelectContent>
                                    {categories.map((c) => (
                                        <SelectItem
                                            key={c.id}
                                            value={c.id}
                                            disabled={
                                                !c.isActive || !c.showInFaq
                                            }
                                        >
                                            {c.name}
                                            {!c.isActive
                                                ? ' (inativa)'
                                                : !c.showInFaq
                                                  ? ' (sem uso em dúvidas)'
                                                  : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {!categoryIsValid ? (
                                <p className="text-xs text-red-500">
                                    Selecione uma categoria ativa para Tirar
                                    dúvidas.
                                </p>
                            ) : null}
                        </div>

                        <div className="space-y-2">
                            <label
                                className="text-label-small text-content-secondary"
                                htmlFor="question"
                            >
                                Pergunta <span className="text-red-500">*</span>
                            </label>

                            <IconInput
                                id="question"
                                name="question"
                                required
                                icon={CircleHelp}
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                disabled={busy}
                                className={INPUT_BASE}
                                placeholder="Ex: Quais formas de pagamento vocês aceitam?"
                            />
                        </div>

                        <div className="space-y-2">
                            <label
                                className="text-label-small text-content-secondary"
                                htmlFor="answer"
                            >
                                Resposta <span className="text-red-500">*</span>
                            </label>

                            <IconTextarea
                                id="answer"
                                name="answer"
                                rows={5}
                                required
                                placeholder="Digite a resposta que será enviada no WhatsApp."
                                icon={MessageSquareText}
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                disabled={busy}
                                className={cn(
                                    INPUT_BASE,
                                    'min-h-28 whitespace-pre-line'
                                )}
                            />
                        </div>

                        <div className="space-y-2">
                            <label
                                className="text-label-small text-content-secondary"
                                htmlFor="sortOrder"
                            >
                                Ordem de exibição
                            </label>

                            <IconInput
                                id="sortOrder"
                                name="sortOrder"
                                type="number"
                                min={0}
                                icon={ListOrdered}
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value)}
                                disabled={busy}
                                className={INPUT_BASE}
                                placeholder="Ex: 100"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
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
                                {saving ? 'Salvando...' : 'Salvar alterações'}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
