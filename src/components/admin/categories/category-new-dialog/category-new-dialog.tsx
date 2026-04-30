'use client';

import { useState } from 'react';
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
import { FolderTree } from 'lucide-react';

type CategoriesApiPostResponse =
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

const INPUT_BASE =
    'bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0';

export function CategoryNewDialog() {
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [isPending, setIsPending] = useState(false);

    const [name, setName] = useState('');
    const [showInProducts, setShowInProducts] = useState(false);
    const [showInFaq, setShowInFaq] = useState(false);

    const busy = isPending;
    const requiredOk = name.trim().length > 0 && (showInProducts || showInFaq);

    function resetForm() {
        setName('');
        setShowInProducts(false);
        setShowInFaq(false);
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (busy) return;

        if (name.trim().length === 0) {
            toast.error('Informe o nome da categoria.');
            return;
        }

        setIsPending(true);

        try {
            const res = await fetch('/api/admin/categories', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    showInProducts,
                    showInFaq,
                }),
            });

            const json = (await res
                .json()
                .catch(() => null)) as CategoriesApiPostResponse | null;

            if (!res.ok || !json || (json as any).ok !== true) {
                const msg =
                    (json &&
                        (json as any).ok === false &&
                        (json as any).error) ||
                    'Não foi possível criar a categoria.';
                toast.error(msg);
                return;
            }

            toast.success('Categoria criada com sucesso!');
            setOpen(false);
            resetForm();
            router.refresh();
        } catch {
            toast.error('Não foi possível criar a categoria.');
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
                <Button variant="brand">Nova categoria</Button>
            </DialogTrigger>

            <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Nova categoria
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pb-2">
                    <div className="space-y-2">
                        <label
                            className="text-label-small text-content-secondary"
                            htmlFor="name"
                        >
                            Nome da categoria{' '}
                            <span className="text-red-500">*</span>
                        </label>

                        <IconInput
                            id="name"
                            name="name"
                            required
                            icon={FolderTree}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={busy}
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
                                    className="h-4 w-4 rounded border-border-primary"
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
                                    className="h-4 w-4 rounded border-border-primary"
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
                                Marque pelo menos uma opção: Produtos e/ou Tirar
                                dúvidas.
                            </p>
                        ) : null}
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
                            {isPending ? 'Salvando...' : 'Criar categoria'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
