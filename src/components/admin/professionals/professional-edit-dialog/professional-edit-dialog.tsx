// src/components/professional-edit-dialog/index.tsx
'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
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

import { updateProfessional } from '@/lib/admin-professionals-api';

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

type ProfessionalForEdit = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    userId: string | null;

    imageUrl: string | null;
};

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

// ✅ SSR-safe: sem window
// - URL absoluta -> mantém
// - caminho relativo -> normaliza para "/..."
function normalizeAdminImageUrl(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) return s;

    // deixa como path; o browser resolve e no SSR não quebra
    return s.startsWith('/') ? s : `/${s}`;
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

export function ProfessionalEditDialog({
    barber,
    units,
    selectedUnitIds,
    defaultUnitId = null,
    canSeeAllUnits = true,
}: {
    barber: ProfessionalForEdit;
    units: UnitOption[];
    selectedUnitIds: string[];
    defaultUnitId?: string | null;
    canSeeAllUnits?: boolean;
}) {
    const router = useRouter();

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [open, setOpen] = useState(false);
    const [isPending, setIsPending] = useState(false);

    // upload UI state
    const [uploadingImage, setUploadingImage] = useState(false);

    // controlled (pra enviar com fetch)
    const [name, setName] = useState(barber.name ?? '');
    const [email, setEmail] = useState(barber.email ?? '');
    const [phone, setPhone] = useState(barber.phone ?? '');

    // ✅ imagem (upload)
    const [imageUrl, setImageUrl] = useState(barber.imageUrl ?? '');

    const [password, setPassword] = useState('');

    const hasUnits = (units?.length ?? 0) > 0;

    // ✅ unidade única (igual produtos)
    const firstActiveUnitId = useMemo(() => {
        if (defaultUnitId && units.some((u) => u.id === defaultUnitId)) {
            return defaultUnitId;
        }

        return units.find((u) => u.isActive)?.id ?? '';
    }, [defaultUnitId, units]);

    const [selectedUnitId, setSelectedUnitId] = useState<string>(() => {
        if (!canSeeAllUnits) {
            return firstActiveUnitId;
        }

        const fromProps = selectedUnitIds?.[0] ?? '';
        return fromProps || firstActiveUnitId;
    });

    // ✅ quando abre, sincroniza (evita ficar “velho” se revalidou no servidor)
    useEffect(() => {
        if (!open) return;

        setName(barber.name ?? '');
        setEmail(barber.email ?? '');
        setPhone(barber.phone ?? '');
        setImageUrl(barber.imageUrl ?? '');
        setPassword('');

        const fromProps = selectedUnitIds?.[0] ?? '';
        const next = !canSeeAllUnits
            ? firstActiveUnitId
            : fromProps || firstActiveUnitId;

        setSelectedUnitId(next);

        setUploadingImage(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [
        open,
        barber.name,
        barber.email,
        barber.phone,
        barber.imageUrl,
        selectedUnitIds,
        firstActiveUnitId,
        canSeeAllUnits,
    ]);

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

    // ✅ usa normalização (caso venha relativa ou com host estranho)
    const previewUrl = useMemo(() => {
        const raw = imageUrl.trim();
        if (!raw) return null;
        return normalizeAdminImageUrl(raw);
    }, [imageUrl]);

    const busy = isPending || uploadingImage;
    const unitInvalid = !hasUnits || !selectedUnitId;

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (busy) return;

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

        const res = await updateProfessional(barber.id, {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            imageUrl: previewUrl,
            password: password || undefined,
            unitIds: [selectedUnitId],
        });

        setIsPending(false);

        if (!res.ok) {
            toast.error(res.error);
            return;
        }

        toast.success('Alterações salvas!');
        setOpen(false);

        router.refresh();
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (busy) return;
                setOpen(next);
            }}
        >
            <DialogTrigger asChild>
                <Button
                    variant="edit2"
                    size="sm"
                    className="border-border-primary hover:bg-muted/40"
                >
                    Editar
                </Button>
            </DialogTrigger>

            <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Editar profissional
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pb-2">
                    {/* UNIDADE (obrigatório) */}
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

                    {/* IMAGEM (UPLOAD) */}
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
                                onClick={() => fileInputRef.current?.click()}
                                disabled={busy}
                                title={
                                    uploadingImage ? 'Enviando...' : undefined
                                }
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
                                    alt="Preview do profissional"
                                    className="h-40 w-full object-cover"
                                />
                            </div>
                        ) : null}
                    </div>

                    {/* NOME */}
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

                    {/* E-MAIL */}
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

                    {/* TELEFONE */}
                    <div className="space-y-2">
                        <label className="text-label-small text-content-secondary">
                            Telefone <span className="text-red-500">*</span>
                        </label>
                        <IconInput
                            icon={Phone}
                            name="phone"
                            required
                            placeholder="(99) 99999-9999"
                            value={phone ?? ''}
                            onChange={handlePhoneChange}
                            disabled={busy}
                            className={INPUT_BASE}
                        />
                    </div>

                    {/* SENHA */}
                    <div className="space-y-2">
                        <label className="text-label-small text-content-secondary">
                            Nova senha
                        </label>
                        <IconInput
                            icon={KeyRound}
                            type="password"
                            name="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={busy}
                            placeholder="Preencha para alterar a senha"
                            className={INPUT_BASE}
                        />
                        <p className="text-[11px] text-content-secondary">
                            Deixe vazio para manter a senha atual. Se preencher:
                            mín. 6, 1 maiúscula, 1 número e 1 especial
                            (!@#$%^&*()_+-=[]{};':&quot;,.&lt;&gt;/?\|)
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
                                  : 'Salvar alterações'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
