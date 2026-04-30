// src/components/admin/products/product-new-dialog/product-new-dialog.tsx
'use client';

import * as React from 'react';
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

import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import {
    Package,
    Image as ImageIcon,
    AlignLeft,
    Wallet,
    Boxes,
    Clock,
    Upload,
    X,
    FolderTree,
} from 'lucide-react';

type CategoryOption = {
    id: string;
    name: string;
    isActive: boolean;
    showInProducts: boolean;
};

type UploadResponse =
    | {
          ok: true;
          data: {
              url: string;
              key: string;
              mime: string;
              size: number;
              originalName: string;
              module?: 'PRODUCTS';
              category?: 'products';
          };
      }
    | { ok: false; error?: string };

const MAX_UPLOAD_MB = 5;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

function toMoneyNumber(raw: string): number {
    const s = String(raw ?? '')
        .trim()
        .replace(/\s/g, '')
        .replace(',', '.');

    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}

function normalizeProductImageUrl(raw: unknown): string {
    const s = String(raw ?? '').trim();
    if (!s) return '';

    const lowered = s.toLowerCase();

    if (lowered.startsWith('blob:')) return '';

    if (s.startsWith('media/')) return `/${s}`;
    if (s.startsWith('uploads/')) return `/${s}`;

    return s;
}

function isValidProductImageUrl(raw: unknown): boolean {
    const s0 = String(raw ?? '').trim();
    if (!s0) return false;

    const s = normalizeProductImageUrl(s0);
    if (!s) return false;

    const lowered = s.toLowerCase();

    if (lowered.startsWith('javascript:')) return false;
    if (lowered.startsWith('data:')) return false;
    if (lowered.startsWith('blob:')) return false;

    if (s.startsWith('/media/')) return true;
    if (s.startsWith('/uploads/')) return true;
    if (lowered.startsWith('http://') || lowered.startsWith('https://')) {
        return true;
    }

    return false;
}

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

export function ProductNewDialog({
    categories = [],
}: {
    categories?: CategoryOption[];
}) {
    const router = useRouter();

    const activeProductCategories = React.useMemo(
        () =>
            categories
                .filter((c) => c.isActive && c.showInProducts)
                .sort((a, b) => a.name.localeCompare(b.name)),
        [categories]
    );

    const hasCategories = activeProductCategories.length > 0;

    const [open, setOpen] = React.useState(false);
    const [isPending, startTransition] = React.useTransition();

    const [isFeatured, setIsFeatured] = React.useState(false);

    const [name, setName] = React.useState('');
    const [imageUrl, setImageUrl] = React.useState('');
    const [description, setDescription] = React.useState('');

    const [price, setPrice] = React.useState('');
    const [stockQuantity, setStockQuantity] = React.useState('');
    const [pickupDeadlineDays, setPickupDeadlineDays] = React.useState('2');

    const [selectedCategoryIds, setSelectedCategoryIds] = React.useState<
        string[]
    >([]);

    const fileInputRef = React.useRef<HTMLInputElement | null>(null);
    const [uploadingImage, setUploadingImage] = React.useState(false);

    function resetForm() {
        setIsFeatured(false);

        setName('');
        setImageUrl('');
        setDescription('');

        setPrice('');
        setStockQuantity('');
        setPickupDeadlineDays('2');

        setSelectedCategoryIds([]);
        setUploadingImage(false);

        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    const categoriesInvalid = selectedCategoryIds.length === 0;

    const requiredInvalid =
        !name.trim() ||
        !description.trim() ||
        !price.trim() ||
        !stockQuantity.trim() ||
        !pickupDeadlineDays.trim();

    const formInvalid =
        requiredInvalid ||
        categoriesInvalid ||
        uploadingImage ||
        !hasCategories;

    async function uploadImage(file: File) {
        if (!file.type?.startsWith('image/')) {
            toast.error('Selecione um arquivo de imagem.');
            return;
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            toast.error(`Imagem muito grande. Máximo: ${MAX_UPLOAD_MB}MB.`);
            return;
        }

        setUploadingImage(true);

        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('module', 'PRODUCTS');

            const res = await fetch('/api/admin/uploads', {
                method: 'POST',
                body: fd,
            });

            const json = (await res
                .json()
                .catch(() => null)) as UploadResponse | null;

            if (!res.ok || !json || json.ok !== true) {
                const msg =
                    json && json.ok === false && json.error
                        ? json.error
                        : 'Não foi possível criar o produto. Tente novamente.';

                toast.error(msg);
                return;
            }

            const url = normalizeProductImageUrl(json.data.url);

            if (!isValidProductImageUrl(url)) {
                toast.error('Upload retornou uma URL inválida para o produto.');
                return;
            }

            setImageUrl(url);
            toast.success('Imagem enviada!');
        } catch {
            toast.error('Erro de rede ao fazer upload da imagem.');
        } finally {
            setUploadingImage(false);
        }
    }

    function toggleCategory(categoryId: string) {
        setSelectedCategoryIds((prev) => {
            if (prev.includes(categoryId)) {
                return prev.filter((id) => id !== categoryId);
            }

            return [...prev, categoryId];
        });
    }

    function buildPayload() {
        const priceN = toMoneyNumber(price);
        const stockN = Number(String(stockQuantity).replace(',', '.'));
        const deadlineN = Number(String(pickupDeadlineDays).replace(',', '.'));

        const firstSelectedCategoryName =
            activeProductCategories.find((c) => c.id === selectedCategoryIds[0])
                ?.name ?? '';

        const payload: any = {
            name: name.trim(),
            description: description.trim(),

            category: firstSelectedCategoryName,
            categoryIds: selectedCategoryIds,

            price: priceN,

            stockQuantity: stockN,
            pickupDeadlineDays: deadlineN,

            isActive: true,
            isFeatured,
        };

        const img = imageUrl.trim();
        if (img) payload.imageUrl = img;

        return payload;
    }

    async function handleCreate() {
        if (formInvalid) {
            toast.error('Preencha os campos obrigatórios antes de criar.');
            return;
        }

        const payload = buildPayload();

        if (!Number.isFinite(payload.price) || payload.price <= 0) {
            toast.error('Preço inválido.');
            return;
        }

        if (
            !Number.isFinite(payload.stockQuantity) ||
            payload.stockQuantity < 0
        ) {
            toast.error('Estoque inválido.');
            return;
        }

        if (
            !Number.isFinite(payload.pickupDeadlineDays) ||
            payload.pickupDeadlineDays < 1 ||
            payload.pickupDeadlineDays > 30
        ) {
            toast.error('Prazo para retirada inválido (1 a 30).');
            return;
        }

        if (
            !Array.isArray(payload.categoryIds) ||
            payload.categoryIds.length === 0
        ) {
            toast.error('Selecione pelo menos 1 categoria.');
            return;
        }

        startTransition(async () => {
            try {
                const res = await fetch('/api/admin/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                const json = (await res.json().catch(() => null)) as
                    | { ok: true; data?: any }
                    | { ok: false; error?: string }
                    | null;

                if (!res.ok || !json || json.ok !== true) {
                    const msg =
                        json && json.ok === false && json.error
                            ? json.error
                            : 'Não foi possível salvar o produto. Tente novamente.';

                    toast.error(msg);
                    return;
                }

                toast.success('Produto criado com sucesso!');
                setOpen(false);
                resetForm();
                router.refresh();
            } catch {
                toast.error('Erro de rede ao criar produto.');
            }
        });
    }

    const previewUrl = imageUrl.trim() ? imageUrl.trim() : null;

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => !isPending && !uploadingImage && setOpen(v)}
        >
            <DialogTrigger asChild>
                <Button variant="brand">Novo produto</Button>
            </DialogTrigger>

            <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Novo produto
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pb-2">
                    <div className="space-y-2 rounded-xl border border-border-primary bg-background-tertiary p-3">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium text-content-primary">
                                    ⭐ Destaque no app
                                </p>
                                <p className="text-xs text-content-secondary">
                                    Quando ativo, este produto aparece no
                                    carrossel de Destaques no app.
                                </p>
                            </div>

                            <label className="inline-flex items-center gap-2 text-xs text-content-secondary">
                                <input
                                    type="checkbox"
                                    checked={isFeatured}
                                    disabled={isPending}
                                    onChange={(e) =>
                                        setIsFeatured(e.target.checked)
                                    }
                                    className="h-4 w-4 accent-current"
                                />
                                Ativar
                            </label>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-label-small text-content-secondary">
                            Nome do produto{' '}
                            <span className="text-red-500">*</span>
                        </label>

                        <IconInput
                            icon={Package}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isPending}
                            className={INPUT_BASE}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-label-small text-content-secondary">
                            Foto do produto{' '}
                            <span className="text-content-secondary/70">
                                (opcional)
                            </span>
                        </label>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={isPending || uploadingImage}
                            onChange={(e) => {
                                const f = e.currentTarget.files?.[0];
                                if (!f) return;
                                void uploadImage(f);
                            }}
                        />

                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                            <div className="relative">
                                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                                    <ImageIcon className="h-4 w-4 text-content-brand" />
                                </div>

                                <Input
                                    value={previewUrl ?? ''}
                                    readOnly
                                    placeholder="Clique em Upload para escolher uma imagem."
                                    className={cn('pl-10 pr-10', INPUT_BASE)}
                                />

                                {previewUrl ? (
                                    <button
                                        type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content-primary"
                                        onClick={() => {
                                            setImageUrl('');
                                            if (fileInputRef.current) {
                                                fileInputRef.current.value = '';
                                            }
                                        }}
                                        disabled={isPending || uploadingImage}
                                        title="Remover imagem"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                ) : null}
                            </div>

                            <Button
                                type="button"
                                variant="brand"
                                className="h-10"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isPending || uploadingImage}
                            >
                                <span className="inline-flex items-center gap-2">
                                    <Upload className="h-4 w-4" />
                                    {uploadingImage ? 'Enviando...' : 'Upload'}
                                </span>
                            </Button>
                        </div>

                        {previewUrl ? (
                            <div className="overflow-hidden rounded-xl border border-border-primary bg-background-tertiary">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={previewUrl}
                                    alt="Preview do produto"
                                    className="h-40 w-full object-cover"
                                />
                            </div>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <label className="text-label-small text-content-secondary">
                            Descrição <span className="text-red-500">*</span>
                        </label>

                        <div className="relative">
                            <div className="pointer-events-none absolute left-3 top-3">
                                <AlignLeft className="h-4 w-4 text-content-brand" />
                            </div>

                            <Textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                disabled={isPending}
                                rows={3}
                                className={cn('pl-10', INPUT_BASE)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-label-small text-content-secondary">
                            Valor (R$) <span className="text-red-500">*</span>
                        </label>

                        <IconInput
                            icon={Wallet}
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            disabled={isPending}
                            placeholder="Ex: 79.90"
                            className={INPUT_BASE}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-label-small text-content-secondary">
                            Estoque <span className="text-red-500">*</span>
                        </label>

                        <IconInput
                            icon={Boxes}
                            value={stockQuantity}
                            onChange={(e) => setStockQuantity(e.target.value)}
                            disabled={isPending}
                            type="number"
                            min={0}
                            placeholder="Ex: 10"
                            className={INPUT_BASE}
                        />
                    </div>

                    <div className="space-y-2">
                        <p className="text-label-small text-content-secondary">
                            Categorias do produto{' '}
                            <span className="text-red-500">*</span>
                        </p>

                        {!hasCategories ? (
                            <div className="rounded-xl border border-dashed border-border-primary bg-background-tertiary p-4 text-sm text-content-secondary">
                                Nenhuma categoria ativa para produtos foi
                                encontrada. Crie uma categoria e marque uso em
                                produtos antes de cadastrar produtos.
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-xl border border-border-primary bg-background-tertiary">
                                <div className="flex items-center justify-between gap-2 border-b border-border-primary bg-background-secondary px-3 py-2">
                                    <span className="inline-flex items-center gap-2 text-xs text-content-secondary">
                                        <FolderTree className="h-4 w-4 text-content-brand" />
                                        Selecione uma ou mais categorias
                                    </span>

                                    <span className="text-xs text-content-secondary">
                                        {selectedCategoryIds.length} selecionada
                                        {selectedCategoryIds.length === 1
                                            ? ''
                                            : 's'}
                                    </span>
                                </div>

                                <div className="max-h-56 space-y-1 overflow-y-auto p-2">
                                    {activeProductCategories.map((c) => {
                                        const checked =
                                            selectedCategoryIds.includes(c.id);

                                        return (
                                            <label
                                                key={c.id}
                                                className={cn(
                                                    'flex items-center gap-2 rounded-lg px-2 py-1 text-paragraph-small',
                                                    'hover:bg-muted/30'
                                                )}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-border-primary"
                                                    checked={checked}
                                                    onChange={() =>
                                                        toggleCategory(c.id)
                                                    }
                                                    disabled={isPending}
                                                />

                                                <span className="text-content-primary">
                                                    {c.name}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {hasCategories && categoriesInvalid ? (
                            <p className="text-xs text-red-500">
                                Selecione pelo menos 1 categoria.
                            </p>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <label className="text-label-small text-content-secondary">
                            Prazo para retirada (dias){' '}
                            <span className="text-red-500">*</span>
                        </label>

                        <IconInput
                            icon={Clock}
                            value={pickupDeadlineDays}
                            onChange={(e) =>
                                setPickupDeadlineDays(e.target.value)
                            }
                            disabled={isPending}
                            type="number"
                            min={1}
                            max={30}
                            className={INPUT_BASE}
                        />

                        <p className="text-xs text-content-secondary">
                            Após esse prazo, a reserva pode expirar e o produto
                            volta ao estoque.
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="brand"
                            disabled={isPending || formInvalid}
                            onClick={handleCreate}
                            title={
                                uploadingImage
                                    ? 'Aguarde o upload da imagem'
                                    : !hasCategories
                                      ? 'Cadastre ao menos 1 categoria ativa para produtos'
                                      : categoriesInvalid
                                        ? 'Selecione ao menos 1 categoria'
                                        : requiredInvalid
                                          ? 'Preencha os campos obrigatórios'
                                          : undefined
                            }
                        >
                            {isPending ? 'Criando...' : 'Criar produto'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
