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
    FileText,
} from 'lucide-react';

type CategoryOption = {
    id: string;
    name: string;
    isActive: boolean;
    showInServices: boolean;
    showInProducts: boolean;
    showInFaq: boolean;
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

type FaqApiPostResponse =
    | {
          ok: true;
          data: { id: string };
      }
    | { ok: false; error?: string };

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

export function FaqNewDialog() {
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isPending, setIsPending] = useState(false);

    const [categories, setCategories] = useState<CategoryOption[]>([]);

    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [sortOrder, setSortOrder] = useState('100');

    const activeFaqCategories = useMemo(
        () => categories.filter((c) => c.isActive && c.showInFaq),
        [categories]
    );

    const hasCategories = activeFaqCategories.length > 0;
    const busy = loading || isPending;

    function resetForm(nextCategories?: CategoryOption[]) {
        const nextActive =
            (nextCategories ?? categories).find(
                (c) => c.isActive && c.showInFaq
            )?.id ?? '';

        setSelectedCategoryId(nextActive);
        setQuestion('');
        setAnswer('');
        setSortOrder('100');
    }

    async function loadData() {
        setLoading(true);

        try {
            const res = await fetch('/api/admin/faq', {
                method: 'GET',
                cache: 'no-store',
                headers: { accept: 'application/json' },
            });

            const json = (await res
                .json()
                .catch(() => null)) as FaqApiGetResponse | null;

            if (!res.ok || !json || (json as any).ok !== true) {
                const msg =
                    (json &&
                        (json as any).ok === false &&
                        (json as any).error) ||
                    'Não foi possível carregar dados.';
                setCategories([]);
                toast.error(msg);
                return;
            }

            const nextCategories = (json as any).data?.categories ?? [];
            setCategories(nextCategories);

            setSelectedCategoryId((prev) => {
                if (prev) return prev;
                return (
                    (nextCategories as CategoryOption[]).find(
                        (c) => c.isActive && c.showInFaq
                    )?.id ?? ''
                );
            });
        } catch {
            setCategories([]);
            toast.error('Não foi possível carregar dados.');
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
                'Cadastre pelo menos 1 categoria ativa com uso em Tirar dúvidas antes de criar dúvidas.'
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

        setIsPending(true);

        try {
            const res = await fetch('/api/admin/faq', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    categoryId: selectedCategoryId,
                    question: question.trim(),
                    answer: answer.trim(),
                    sortOrder: sortOrderNum,
                }),
            });

            const json = (await res
                .json()
                .catch(() => null)) as FaqApiPostResponse | null;

            if (!res.ok || !json || (json as any).ok !== true) {
                const msg =
                    (json &&
                        (json as any).ok === false &&
                        (json as any).error) ||
                    'Não foi possível criar a dúvida.';
                toast.error(msg);
                return;
            }

            toast.success('Dúvida criada com sucesso!');
            setOpen(false);
            resetForm();
            router.refresh();
        } catch {
            toast.error('Não foi possível criar a dúvida.');
        } finally {
            setIsPending(false);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (busy) return;
                setOpen(next);
                if (!next) resetForm();
            }}
        >
            <DialogTrigger asChild>
                <Button variant="brand">Nova dúvida</Button>
            </DialogTrigger>

            <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Nova dúvida
                    </DialogTitle>
                </DialogHeader>

                {!loading && !hasCategories ? (
                    <div className="rounded-xl border border-dashed border-border-primary bg-background-tertiary p-4 text-sm text-content-secondary">
                        Você ainda não tem categorias ativas marcadas para Tirar
                        dúvidas. Crie ou edite uma categoria e marque essa opção
                        antes de cadastrar dúvidas.
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 pb-2">
                        {/* CATEGORIA */}
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

                        {/* PERGUNTA */}
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

                        {/* RESPOSTA */}
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

                        {/* ORDEM */}
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
                                {isPending ? 'Salvando...' : 'Criar dúvida'}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
