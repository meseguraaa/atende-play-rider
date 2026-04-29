// src/components/professional-new-dialog/index.tsx
'use client';

import { useMemo, useRef, useState, type ChangeEvent, useEffect } from 'react';
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

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import { createProfessional } from '@/lib/admin-professionals-api';

import { cn } from '@/lib/utils';
import {
    Image as ImageIcon,
    Upload,
    X,
    Building2,
    User,
    Mail,
    Phone,
    KeyRound,
} from 'lucide-react';

type UnitOption = {
    id: string;
    name: string;
    isActive: boolean;
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
              module?: 'PRODUCTS' | 'PROFESSIONALS';
              category?: 'products' | 'professionals';
          };
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

const SELECT_TRIGGER =
    'h-10 w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0 focus-visible:border-border-brand';

// normaliza URL de imagem no Admin (browser)
function normalizeAdminImageUrl(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) return s;

    const path = s.startsWith('/') ? s : `/${s}`;
    return `${window.location.origin}${path}`;
}

async function uploadProfessionalImage(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('module', 'PROFESSIONALS');

    const res = await fetch('/api/admin/uploads', {
        method: 'POST',
        body: fd,
    });

    const json = (await res.json().catch(() => null)) as UploadResponse | null;

    if (!res.ok || !json || json.ok !== true) {
        const msg =
            (json && json.ok === false && json.error) ||
            'Não foi possível fazer upload da imagem.';
        return { ok: false as const, error: msg };
    }

    return { ok: true as const, data: json.data };
}

export function ProfessionalNewDialog({
    units,
    defaultUnitId = null,
    canSeeAllUnits = true,
}: {
    units: UnitOption[];
    defaultUnitId?: string | null;
    canSeeAllUnits?: boolean;
}) {
    const router = useRouter();

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [open, setOpen] = useState(false);
    const [isPending, setIsPending] = useState(false);

    const [uploadingImage, setUploadingImage] = useState(false);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');

    const hasUnits = (units?.length ?? 0) > 0;

    const firstActiveUnitId = useMemo(() => {
        if (defaultUnitId && units.some((u) => u.id === defaultUnitId)) {
            return defaultUnitId;
        }

        return units.find((u) => u.isActive)?.id ?? '';
    }, [defaultUnitId, units]);

    const [selectedUnitId, setSelectedUnitId] = useState<string>(() => {
        return firstActiveUnitId;
    });

    const [imageUrl, setImageUrl] = useState('');

    useEffect(() => {
        if (!open) return;

        setSelectedUnitId((prev) => {
            if (!canSeeAllUnits) return firstActiveUnitId;
            return prev || firstActiveUnitId;
        });
    }, [open, firstActiveUnitId, canSeeAllUnits]);

    useEffect(() => {
        if (canSeeAllUnits) return;
        setSelectedUnitId(firstActiveUnitId);
    }, [canSeeAllUnits, firstActiveUnitId]);

    function handlePhoneChange(e: ChangeEvent<HTMLInputElement>) {
        let value = e.target.value.replace(/\D/g, '').slice(0, 11);

        if (value.length <= 10) {
            value = value
                .replace(/(\d{2})(\d)/, '($1) $2')
                .replace(/(\d{4})(\d)/, '$1-$2');
        } else {
            value = value
                .replace(/(\d{2})(\d)/, '($1) $2')
                .replace(/(\d{5})(\d)/, '$1-$2');
        }

        setPhone(value);
    }

    function resetForm() {
        setName('');
        setEmail('');
        setPhone('');
        setPassword('');
        setSelectedUnitId(firstActiveUnitId);
        setImageUrl('');
        setUploadingImage(false);

        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    async function uploadImage(file: File) {
        if (!file.type?.startsWith('image/')) {
            toast.error('Selecione um arquivo de imagem.');
            return;
        }

        const maxBytes = 5 * 1024 * 1024;
        if (file.size > maxBytes) {
            toast.error('Imagem muito grande. Máximo: 5MB.');
            return;
        }

        setUploadingImage(true);

        const up = await uploadProfessionalImage(file);

        setUploadingImage(false);

        if (!up.ok) {
            toast.error(up.error);
            return;
        }

        setImageUrl(up.data.url);
        toast.success('Imagem enviada!');
    }

    const previewUrl = useMemo(() => {
        const raw = imageUrl.trim();
        if (!raw) return null;
        return normalizeAdminImageUrl(raw);
    }, [imageUrl]);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (isPending || uploadingImage) return;

        if (!hasUnits) {
            toast.error(
                'Crie pelo menos 1 unidade antes de cadastrar profissionais.'
            );
            return;
        }

        const selected = units.find((u) => u.id === selectedUnitId) || null;
        if (!selected || !selected.isActive) {
            toast.error('Selecione uma unidade ativa.');
            return;
        }

        setIsPending(true);

        const res = await createProfessional({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            password,
            unitIds: [selectedUnitId],
            imageUrl: previewUrl,
        });

        setIsPending(false);

        if (!res.ok) {
            toast.error(res.error);
            return;
        }

        toast.success('Profissional criado com sucesso!');
        setOpen(false);
        resetForm();

        router.refresh();
    }

    const busy = isPending || uploadingImage;
    const unitInvalid = !hasUnits || !selectedUnitId;

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
                <Button variant="brand" disabled={!hasUnits}>
                    Novo profissional
                </Button>
            </DialogTrigger>

            <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Novo profissional
                    </DialogTitle>
                </DialogHeader>

                {!hasUnits ? (
                    <div className="rounded-xl border border-dashed border-border-primary bg-background-tertiary p-4 text-sm text-content-secondary">
                        Você ainda não tem unidades ativas. Crie uma unidade
                        primeiro para cadastrar profissionais.
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 pb-2">
                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                Unidade <span className="text-red-500">*</span>
                            </label>

                            <Select
                                value={selectedUnitId}
                                onValueChange={(v) => setSelectedUnitId(v)}
                                disabled={!hasUnits || busy || !canSeeAllUnits}
                            >
                                <SelectTrigger className={SELECT_TRIGGER}>
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-content-brand" />
                                        <SelectValue
                                            placeholder={
                                                hasUnits
                                                    ? canSeeAllUnits
                                                        ? 'Selecione a unidade'
                                                        : 'Unidade definida pelo seu acesso'
                                                    : 'Nenhuma unidade cadastrada'
                                            }
                                        />
                                    </div>
                                </SelectTrigger>

                                <SelectContent>
                                    {units.map((u) => (
                                        <SelectItem
                                            key={u.id}
                                            value={u.id}
                                            disabled={!u.isActive}
                                        >
                                            {u.name}{' '}
                                            {!u.isActive ? '(inativa)' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {unitInvalid ? (
                                <p className="text-xs text-red-500">
                                    Selecione uma unidade ativa.
                                </p>
                            ) : null}
                        </div>

                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                Foto do profissional
                            </label>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={busy}
                                onChange={(e) => {
                                    const f = e.currentTarget.files?.[0];
                                    if (!f) return;
                                    void uploadImage(f);
                                }}
                            />

                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                                <div className="space-y-2">
                                    <div className="relative">
                                        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                                            <ImageIcon className="h-4 w-4 text-content-brand" />
                                        </div>

                                        <Input
                                            value={previewUrl ?? ''}
                                            readOnly
                                            placeholder="Escolha seu arquivo clicando em Upload."
                                            className={cn(
                                                'pl-10 pr-10',
                                                INPUT_BASE
                                            )}
                                        />

                                        {previewUrl ? (
                                            <button
                                                type="button"
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content-primary"
                                                onClick={() => {
                                                    setImageUrl('');
                                                    if (fileInputRef.current)
                                                        fileInputRef.current.value =
                                                            '';
                                                }}
                                                disabled={busy}
                                                title="Remover imagem"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        ) : null}
                                    </div>
                                </div>

                                <Button
                                    type="button"
                                    variant="brand"
                                    className="h-10"
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                    disabled={busy}
                                    title={
                                        uploadingImage
                                            ? 'Enviando...'
                                            : undefined
                                    }
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <Upload className="h-4 w-4" />
                                        {uploadingImage
                                            ? 'Enviando...'
                                            : 'Upload'}
                                    </span>
                                </Button>
                            </div>

                            {previewUrl ? (
                                <div className="overflow-hidden rounded-xl border border-border-primary bg-background-tertiary">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={previewUrl}
                                        alt="Preview do profissional"
                                        className="h-40 w-full object-cover"
                                    />
                                </div>
                            ) : null}
                        </div>

                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                Nome <span className="text-red-500">*</span>
                            </label>
                            <IconInput
                                icon={User}
                                name="name"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={busy}
                                className={INPUT_BASE}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                E-mail <span className="text-red-500">*</span>
                            </label>
                            <IconInput
                                icon={Mail}
                                type="email"
                                name="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={busy}
                                className={INPUT_BASE}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                Telefone <span className="text-red-500">*</span>
                            </label>
                            <IconInput
                                icon={Phone}
                                name="phone"
                                required
                                placeholder="(99) 99999-9999"
                                value={phone}
                                onChange={handlePhoneChange}
                                disabled={busy}
                                className={INPUT_BASE}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                Senha <span className="text-red-500">*</span>
                            </label>
                            <IconInput
                                icon={KeyRound}
                                type="password"
                                name="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={busy}
                                placeholder="Defina a senha do profissional"
                                className={INPUT_BASE}
                            />
                            <p className="text-[11px] text-content-secondary">
                                Mín. 6 caracteres, 1 maiúscula, 1 número e 1
                                especial (!@#$%^&*()_+-=[]{}
                                ;':&quot;,.&lt;&gt;/?\|)
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                type="submit"
                                variant="brand"
                                disabled={busy || unitInvalid}
                                title={
                                    unitInvalid
                                        ? 'Selecione uma unidade ativa'
                                        : undefined
                                }
                            >
                                {uploadingImage
                                    ? 'Enviando...'
                                    : isPending
                                      ? 'Salvando...'
                                      : 'Criar profissional'}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
