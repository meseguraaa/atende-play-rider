'use client';

import { useEffect, useState } from 'react';
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

import { cn } from '@/lib/utils';
import { FolderTree, Loader2 } from 'lucide-react';

type CategoryEditDialogProps = {
    category: {
        id: string;
        companyId?: string | null;
        name: string;
        showInProducts: boolean;
        showInFaq: boolean;
        isActive: boolean;
    };
};

type CategoryDetailsApiResponse = {
    ok: boolean;
    data?: {
        category: {
            id: string;
            companyId: string;
            name: string;
            isActive: boolean;
            showInServices: boolean;
            showInProducts: boolean;
            showInFaq: boolean;
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

const INPUT_BASE =
    'bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0';

export function CategoryEditDialog({ category }: CategoryEditDialogProps) {
    const router = useRouter();

    const [open, setOpen] = useState(false);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [name, setName] = useState(category.name ?? '');
    const [showInProducts, setShowInProducts] = useState(
        Boolean(category.showInProducts)
    );
    const [showInFaq, setShowInFaq] = useState(Boolean(category.showInFaq));

    const busy = loading || saving;
    const requiredOk = name.trim().length > 0 && (showInProducts || showInFaq);

    function resetToInitial() {
        setName(category.name ?? '');
        setShowInProducts(Boolean(category.showInProducts));
        setShowInFaq(Boolean(category.showInFaq));
    }

    async function fetchDetails() {
        setLoading(true);

        try {
            const res = await fetch(`/api/admin/categories/${category.id}`, {
                method: 'GET',
                cache: 'no-store',
                headers: { accept: 'application/json' },
            });

            const json = (await res
                .json()
                .catch(() => null)) as CategoryDetailsApiResponse | null;

            if (!res.ok || !json?.ok || !json.data) {
                const msg =
                    (json && json.ok === false && json.error) ||
                    'Não foi possível carregar os dados da categoria.';
                toast.error(msg);
                return;
            }

            const c = json.data.category;

            setName(c.name ?? '');
            setShowInProducts(Boolean(c.showInProducts));
            setShowInFaq(Boolean(c.showInFaq));
        } catch {
            toast.error('Não foi possível carregar os dados da categoria.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!open) return;
        void fetchDetails();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (busy) return;

        const nameTrim = String(name ?? '').trim();
        if (!nameTrim) {
            toast.error('Nome da categoria é obrigatório.');
            return;
        }

        if (!showInProducts && !showInFaq) {
            toast.error(
                'Marque pelo menos uma opção: Produtos e/ou Tirar dúvidas.'
            );
            return;
        }

        setSaving(true);

        try {
            const payload = {
                name: nameTrim,
                showInProducts,
                showInFaq,
            };

            const res = await fetch(`/api/admin/categories/${category.id}`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const json = (await res.json().catch(() => null)) as
                | { ok: true; data?: any }
                | { ok: false; error?: string }
                | null;

            if (!res.ok || !json || (json as any).ok !== true) {
                const msg =
                    (json &&
                        (json as any).ok === false &&
                        (json as any).error) ||
                    'Não foi possível salvar a categoria.';
                toast.error(msg);
                return;
            }

            toast.success('Categoria atualizada com sucesso!');
            setOpen(false);
            router.refresh();
        } catch {
            toast.error('Não foi possível salvar a categoria.');
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
                        Editar categoria
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="rounded-xl border border-dashed border-border-primary bg-background-tertiary p-4 text-sm text-content-secondary">
                        <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Carregando dados da categoria...
                        </span>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 pb-2">
                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                Nome da categoria{' '}
                                <span className="text-red-500">*</span>
                            </label>

                            <IconInput
                                name="name"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={busy}
                                icon={FolderTree}
                                className={INPUT_BASE}
                            />
                        </div>

                        <div className="space-y-2">
                            <p className="text-label-small text-content-secondary">
                                Onde esta categoria pode aparecer?{' '}
                                <span className="text-red-500">*</span>
                            </p>

                            <div className="rounded-lg border border-border-primary bg-background-tertiary p-3 space-y-3">
                                <label className="flex items-center gap-2 text-paragraph-small text-content-primary">
                                    <input
                                        type="checkbox"
                                        checked={showInProducts}
                                        onChange={(e) =>
                                            setShowInProducts(e.target.checked)
                                        }
                                        disabled={busy}
                                    />
                                    <span>Produtos</span>
                                </label>

                                <label className="flex items-center gap-2 text-paragraph-small text-content-primary">
                                    <input
                                        type="checkbox"
                                        checked={showInFaq}
                                        onChange={(e) =>
                                            setShowInFaq(e.target.checked)
                                        }
                                        disabled={busy}
                                    />
                                    <span>Tirar dúvidas</span>
                                </label>
                            </div>

                            {!showInProducts && !showInFaq ? (
                                <p className="text-xs text-red-500">
                                    Marque pelo menos uma opção: Produtos e/ou
                                    Tirar dúvidas.
                                </p>
                            ) : null}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                type="submit"
                                variant="brand"
                                disabled={busy || !requiredOk}
                            >
                                {saving ? (
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Salvando...
                                    </span>
                                ) : (
                                    'Salvar alterações'
                                )}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
