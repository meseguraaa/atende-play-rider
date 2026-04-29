// src/components/admin/partners/partner-new-dialog/partner-new-dialog.tsx
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

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import {
    Handshake,
    Image as ImageIcon,
    AlignLeft,
    BadgePercent,
    Link as LinkIcon,
    ArrowRight,
    Upload,
    X,
    SlidersHorizontal,
    ListOrdered,
    FileText,
    Building2,
    Search,
    Check,
    Loader2,
} from 'lucide-react';

type PartnerVisibilityMode = 'ALL' | 'SELECTED';

type UploadResponse =
    | {
          ok: true;
          data: {
              url: string;
              key: string;
              mime: string;
              size: number;
              originalName: string;
              module?: 'PRODUCTS' | 'PROFESSIONALS' | 'PARTNERS';
              category?: 'products' | 'professionals' | 'partners';
          };
      }
    | { ok: false; error?: string };

type CompanyOption = {
    id: string;
    name: string;
    isActive?: boolean;
};

const MAX_UPLOAD_MB = 5;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

function clampPct(raw: string): number | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const n = Number(s.replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, Math.floor(n)));
}

function toInt(raw: string): number | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const n = Number(s.replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
}

function normalizeCtaUrl(raw: string): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    if (lower.startsWith('javascript:')) return null;
    if (lower.startsWith('data:')) return null;

    if (lower.startsWith('http://') || lower.startsWith('https://')) return s;
    if (lower.startsWith('www.')) return `https://${s}`;

    return null;
}

function initials(name: string) {
    return (name || '?')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

function isValidPartnerLogoUrl(raw: unknown): boolean {
    const s = String(raw ?? '').trim();
    if (!s) return false;

    const lowered = s.toLowerCase();

    // bloqueios óbvios
    if (lowered.startsWith('javascript:')) return false;
    if (lowered.startsWith('data:')) return false;
    if (lowered.startsWith('blob:')) return false;

    // ✅ nosso upload atual
    if (s.startsWith('/media/')) return true;

    // ✅ legado
    if (s.startsWith('/uploads/')) return true;

    // URL absoluta
    if (lowered.startsWith('http://') || lowered.startsWith('https://'))
        return true;

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

const INPUT_SECONDARY =
    'bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0';

const SELECT_TRIGGER =
    'h-10 w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0 focus-visible:border-border-brand';

async function safeReadJson<T>(res: Response): Promise<T | null> {
    try {
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

/**
 * ✅ Busca empresas do painel da PLATAFORMA
 * GET /api/plataform/companies/options
 */
async function fetchCompaniesPlatform(): Promise<CompanyOption[]> {
    const res = await fetch('/api/plataform/companies/options', {
        method: 'GET',
    });
    if (!res.ok) return [];

    const json = await safeReadJson<any>(res);
    if (!json || json.ok !== true) return [];

    const rawList =
        json.companies ?? json.items ?? json.data ?? json.list ?? [];
    if (!Array.isArray(rawList)) return [];

    return rawList
        .map((c: any) => ({
            id: String(c?.id ?? '').trim(),
            name: String(c?.name ?? c?.title ?? '').trim(),
            isActive: typeof c?.isActive === 'boolean' ? c.isActive : undefined,
        }))
        .filter((c: CompanyOption) => c.id && c.name);
}

export function PartnerNewDialog() {
    const router = useRouter();

    const [open, setOpen] = React.useState(false);
    const [isPending, startTransition] = React.useTransition();

    // form
    const [name, setName] = React.useState('');
    const [logoUrl, setLogoUrl] = React.useState('');
    const [logoKey, setLogoKey] = React.useState<string>('');

    const [discountPct, setDiscountPct] = React.useState('');

    const [description, setDescription] = React.useState('');
    const [rules, setRules] = React.useState('');

    const [ctaUrl, setCtaUrl] = React.useState('');
    const [ctaLabel, setCtaLabel] = React.useState(
        'Ativar cashback e ir pra loja'
    );

    const [visibilityMode, setVisibilityMode] =
        React.useState<PartnerVisibilityMode>('ALL');

    const [sortOrder, setSortOrder] = React.useState('100');

    // upload
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);
    const [uploadingImage, setUploadingImage] = React.useState(false);

    // ✅ preview robusto (se img quebrar, mostra iniciais)
    const [previewBroken, setPreviewBroken] = React.useState(false);

    // companies (para SELECTED)
    const [companies, setCompanies] = React.useState<CompanyOption[]>([]);
    const [companiesLoading, setCompaniesLoading] = React.useState(false);
    const [companiesQuery, setCompaniesQuery] = React.useState('');
    const [selectedCompanyIds, setSelectedCompanyIds] = React.useState<
        string[]
    >([]);

    function resetForm() {
        setName('');
        setLogoUrl('');
        setLogoKey('');

        setDiscountPct('');

        setDescription('');
        setRules('');

        setCtaUrl('');
        setCtaLabel('Ativar cashback e ir pra loja');

        setVisibilityMode('ALL');
        setSortOrder('100');

        setSelectedCompanyIds([]);
        setCompaniesQuery('');

        setUploadingImage(false);
        setPreviewBroken(false);

        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    React.useEffect(() => {
        if (open) return;
        resetForm();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // carrega empresas quando o dialog abre
    React.useEffect(() => {
        if (!open) return;

        let alive = true;

        async function load() {
            setCompaniesLoading(true);
            try {
                const list = await fetchCompaniesPlatform();
                if (!alive) return;

                if (!list.length) {
                    toast.error(
                        'Não encontrei empresas para listar. Verifique /api/plataform/companies/options.'
                    );
                }

                setCompanies(list);
            } catch {
                if (!alive) return;
                toast.error('Erro ao carregar empresas.');
            } finally {
                if (!alive) return;
                setCompaniesLoading(false);
            }
        }

        void load();

        return () => {
            alive = false;
        };
    }, [open]);

    // ✅ se trocar pra ALL, limpa seleção
    React.useEffect(() => {
        if (visibilityMode !== 'ALL') return;
        if (selectedCompanyIds.length === 0) return;
        setSelectedCompanyIds([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibilityMode]);

    // ✅ se mudou logoUrl, reseta o "broken" do preview
    React.useEffect(() => {
        setPreviewBroken(false);
    }, [logoUrl]);

    const filteredCompanies = React.useMemo(() => {
        const q = companiesQuery.trim().toLowerCase();
        if (!q) return companies;

        return companies.filter((c) =>
            String(c.name ?? '')
                .toLowerCase()
                .includes(q)
        );
    }, [companies, companiesQuery]);

    const requiredInvalid =
        !name.trim() ||
        !logoUrl.trim() ||
        !ctaUrl.trim() ||
        !ctaLabel.trim() ||
        !sortOrder.trim();

    const selectedInvalid =
        visibilityMode === 'SELECTED' && selectedCompanyIds.length === 0;

    const loadingSelectedData =
        visibilityMode === 'SELECTED' && companiesLoading;

    const formInvalid =
        requiredInvalid ||
        selectedInvalid ||
        uploadingImage ||
        loadingSelectedData;

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
            fd.append('module', 'PARTNERS');

            const res = await fetch('/api/admin/uploads', {
                method: 'POST',
                body: fd,
            });

            const json = (await res
                .json()
                .catch(() => null)) as UploadResponse | null;

            if (!res.ok || !json || json.ok !== true) {
                const msg =
                    (json && json.ok === false && json.error) ||
                    'Não foi possível fazer upload da imagem.';
                toast.error(msg);
                return;
            }

            const url = String(json.data.url ?? '').trim();

            // ✅ valida retorno do upload (aceita /media, /uploads, http(s))
            if (!isValidPartnerLogoUrl(url)) {
                toast.error(
                    'Upload retornou uma URL inválida para o parceiro. O esperado é /media/... (recomendado), /uploads/... (legado) ou http(s).'
                );
                return;
            }

            setLogoUrl(url);
            setLogoKey(String(json.data.key ?? '').trim());
            setPreviewBroken(false);
            toast.success('Logo enviada!');
        } catch {
            toast.error('Erro de rede ao fazer upload da logo.');
        } finally {
            setUploadingImage(false);
        }
    }

    function buildPayload() {
        const pct = clampPct(discountPct) ?? 0;
        const so = toInt(sortOrder);
        const cta = normalizeCtaUrl(ctaUrl);

        const companyIds =
            visibilityMode === 'SELECTED' ? selectedCompanyIds : [];

        return {
            name: name.trim(),
            logoUrl: logoUrl.trim(),
            logoKey: logoKey.trim() || null,

            discountPct: pct,

            description: String(description ?? '').trim() || null,
            rules: String(rules ?? '').trim() || null,

            ctaUrl: cta ?? ctaUrl.trim(),
            ctaLabel: ctaLabel.trim() || 'Ativar cashback e ir pra loja',

            isActive: true,
            visibilityMode,
            sortOrder: Number.isFinite(so as any) ? Number(so) : 100,

            companyIds,
        };
    }

    async function handleCreate() {
        if (formInvalid) {
            if (loadingSelectedData) {
                toast.error('Aguarde carregar as empresas antes de criar.');
                return;
            }
            if (selectedInvalid) {
                toast.error('Selecione pelo menos 1 empresa para SELECTED.');
                return;
            }
            if (!logoUrl.trim()) {
                toast.error('Logo é obrigatória.');
                return;
            }
            toast.error('Preencha os campos obrigatórios antes de criar.');
            return;
        }

        const payload = buildPayload();

        if (!payload.name) {
            toast.error('Nome é obrigatório.');
            return;
        }

        if (!payload.logoUrl) {
            toast.error('Logo é obrigatória.');
            return;
        }

        // ✅ valida também no client (pra não depender do backend)
        if (!isValidPartnerLogoUrl(payload.logoUrl)) {
            toast.error(
                'logoUrl inválida. Envie uma imagem (/media ou /uploads) ou forneça uma URL http(s) válida.'
            );
            return;
        }

        const pct = Number(payload.discountPct);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
            toast.error('Desconto inválido (0 a 100).');
            return;
        }

        const so = Number(payload.sortOrder);
        if (!Number.isFinite(so) || so < 0) {
            toast.error('Ordem inválida (0 ou maior).');
            return;
        }

        const cta = normalizeCtaUrl(payload.ctaUrl);
        if (!cta) {
            toast.error('CTA URL inválida. Use http(s) ou comece com www.');
            return;
        }

        startTransition(async () => {
            try {
                const res = await fetch('/api/plataform/partners', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, ctaUrl: cta }),
                });

                const json = (await res.json().catch(() => null)) as
                    | { ok: true; data?: any }
                    | { ok: false; error?: string }
                    | null;

                if (!res.ok || !json || (json as any).ok !== true) {
                    const msg =
                        (json as any)?.error ||
                        'Não foi possível criar o parceiro. Tente novamente.';
                    toast.error(msg);
                    return;
                }

                toast.success('Parceiro criado com sucesso!');
                setOpen(false);
                router.refresh();
            } catch {
                toast.error('Erro de rede ao criar parceiro.');
            }
        });
    }

    const previewUrl = logoUrl.trim() ? logoUrl.trim() : null;

    function toggleCompany(id: string) {
        setSelectedCompanyIds((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            return [...prev, id];
        });
    }

    function selectAllFiltered() {
        const ids = filteredCompanies.map((c) => c.id);
        setSelectedCompanyIds((prev) => {
            const set = new Set(prev);
            ids.forEach((id) => set.add(id));
            return Array.from(set);
        });
    }

    function clearAll() {
        setSelectedCompanyIds([]);
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => !isPending && !uploadingImage && setOpen(v)}
        >
            <DialogTrigger asChild>
                <Button variant="brand">Novo parceiro</Button>
            </DialogTrigger>

            <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Novo parceiro
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pb-2">
                    <div className="space-y-2">
                        <label className="text-label-small text-content-secondary">
                            Nome do parceiro{' '}
                            <span className="text-red-500">*</span>
                        </label>
                        <IconInput
                            icon={Handshake}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isPending}
                            className={INPUT_BASE}
                        />
                    </div>

                    {/* LOGO (UPLOAD) */}
                    <div className="space-y-2">
                        <label className="text-label-small text-content-secondary">
                            Logo / imagem{' '}
                            <span className="text-red-500">*</span>
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
                                                setLogoUrl('');
                                                setLogoKey('');
                                                setPreviewBroken(false);
                                                if (fileInputRef.current)
                                                    fileInputRef.current.value =
                                                        '';
                                            }}
                                            disabled={
                                                isPending || uploadingImage
                                            }
                                            title="Remover imagem"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    ) : null}
                                </div>

                                {logoKey ? (
                                    <p className="text-[11px] text-content-secondary/70">
                                        key:{' '}
                                        <span className="text-content-primary">
                                            {logoKey}
                                        </span>
                                    </p>
                                ) : null}
                            </div>

                            <Button
                                type="button"
                                variant="brand"
                                className="h-10"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isPending || uploadingImage}
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

                        {/* ✅ preview com fallback se quebrar */}
                        {previewUrl ? (
                            <div className="overflow-hidden rounded-xl border border-border-primary bg-background-tertiary">
                                <div className="h-40 w-full flex items-center justify-center">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {!previewBroken ? (
                                        <img
                                            src={previewUrl}
                                            alt="Preview da logo"
                                            className="h-40 w-full object-cover"
                                            onError={() =>
                                                setPreviewBroken(true)
                                            }
                                        />
                                    ) : (
                                        <div className="h-40 w-full flex items-center justify-center">
                                            <div className="h-16 w-16 rounded-2xl border border-border-primary bg-background-secondary flex items-center justify-center">
                                                <span className="text-sm font-semibold text-content-secondary">
                                                    {initials(name)}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                Desconto (%)
                            </label>
                            <IconInput
                                icon={BadgePercent}
                                value={discountPct}
                                onChange={(e) => setDiscountPct(e.target.value)}
                                disabled={isPending}
                                inputMode="numeric"
                                placeholder="Ex: 10"
                                className={INPUT_BASE}
                            />
                            <p className="text-[11px] text-content-secondary/70">
                                O servidor normaliza para 0–100.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                Ordem (menor aparece primeiro){' '}
                                <span className="text-red-500">*</span>
                            </label>
                            <IconInput
                                icon={ListOrdered}
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value)}
                                disabled={isPending}
                                inputMode="numeric"
                                placeholder="Ex: 100"
                                className={INPUT_BASE}
                            />
                        </div>
                    </div>

                    {/* VISIBILIDADE */}
                    <div className="space-y-2 rounded-xl border border-border-primary bg-background-tertiary p-3">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium text-content-primary">
                                    Visibilidade
                                </p>
                            </div>
                        </div>

                        <Select
                            value={visibilityMode}
                            onValueChange={(v) =>
                                setVisibilityMode(v as PartnerVisibilityMode)
                            }
                            disabled={isPending}
                        >
                            <SelectTrigger className={SELECT_TRIGGER}>
                                <div className="flex items-center gap-2">
                                    <SlidersHorizontal className="h-4 w-4 text-content-brand" />
                                    <SelectValue placeholder="Selecione" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">
                                    Todas as empresas
                                </SelectItem>
                                <SelectItem value="SELECTED">
                                    Empresas selecionadas
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        {visibilityMode === 'SELECTED' ? (
                            <div className="mt-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-medium text-content-primary">
                                        Empresas selecionadas (
                                        {selectedCompanyIds.length})
                                    </p>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 px-3"
                                            onClick={selectAllFiltered}
                                            disabled={
                                                companiesLoading || isPending
                                            }
                                            title="Selecionar todas as empresas filtradas"
                                        >
                                            <span className="inline-flex items-center gap-2 text-xs">
                                                <Check className="h-4 w-4" />
                                                Selecionar
                                            </span>
                                        </Button>

                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="h-8 px-3"
                                            onClick={clearAll}
                                            disabled={
                                                companiesLoading || isPending
                                            }
                                            title="Limpar seleção"
                                        >
                                            <span className="text-xs">
                                                Limpar
                                            </span>
                                        </Button>
                                    </div>
                                </div>

                                <div className="relative">
                                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                                        <Search className="h-4 w-4 text-content-brand" />
                                    </div>
                                    <Input
                                        value={companiesQuery}
                                        onChange={(e) =>
                                            setCompaniesQuery(e.target.value)
                                        }
                                        disabled={companiesLoading || isPending}
                                        placeholder="Buscar empresa..."
                                        className={cn('pl-10', INPUT_BASE)}
                                    />
                                </div>

                                <div className="rounded-xl border border-border-primary bg-background-secondary p-2">
                                    {companiesLoading ? (
                                        <div className="flex items-center gap-2 p-2 text-xs text-content-secondary">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Carregando empresas...
                                        </div>
                                    ) : filteredCompanies.length === 0 ? (
                                        <div className="p-2 text-xs text-content-secondary">
                                            Nenhuma empresa encontrada.
                                        </div>
                                    ) : (
                                        <div className="max-h-56 overflow-y-auto">
                                            {filteredCompanies.map((c) => {
                                                const checked =
                                                    selectedCompanyIds.includes(
                                                        c.id
                                                    );

                                                return (
                                                    <label
                                                        key={c.id}
                                                        className={cn(
                                                            'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-background-tertiary',
                                                            checked
                                                                ? 'bg-background-tertiary'
                                                                : ''
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Building2 className="h-4 w-4 text-content-brand" />
                                                            <span className="text-sm text-content-primary">
                                                                {c.name}
                                                            </span>
                                                            {c.isActive ===
                                                            false ? (
                                                                <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] text-red-500">
                                                                    inativa
                                                                </span>
                                                            ) : null}
                                                        </div>

                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() =>
                                                                toggleCompany(
                                                                    c.id
                                                                )
                                                            }
                                                            disabled={isPending}
                                                            className="h-4 w-4 accent-(--brand)"
                                                        />
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {selectedInvalid ? (
                                    <p className="text-[11px] text-red-500">
                                        Se estiver em SELECTED, você precisa
                                        selecionar pelo menos 1 empresa.
                                    </p>
                                ) : (
                                    <p className="text-[11px] text-content-secondary/70">
                                        Essas empresas vão no payload como{' '}
                                        <span className="text-content-primary">
                                            companyIds
                                        </span>{' '}
                                        para o backend criar os vínculos.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="mt-2 text-[11px] text-content-secondary/70">
                                Em ALL, não precisa selecionar empresas.
                            </p>
                        )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                Link do parceiro (ctaUrl){' '}
                                <span className="text-red-500">*</span>
                            </label>
                            <IconInput
                                icon={LinkIcon}
                                value={ctaUrl}
                                onChange={(e) => setCtaUrl(e.target.value)}
                                disabled={isPending}
                                placeholder="https://... ou www..."
                                className={INPUT_SECONDARY}
                            />
                            <p className="text-[11px] text-content-secondary/70">
                                Aceita http(s) e “www.” (o servidor normaliza).
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                Texto do botão (ctaLabel){' '}
                                <span className="text-red-500">*</span>
                            </label>
                            <IconInput
                                icon={ArrowRight}
                                value={ctaLabel}
                                onChange={(e) => setCtaLabel(e.target.value)}
                                disabled={isPending}
                                className={INPUT_SECONDARY}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-label-small text-content-secondary">
                            Descrição
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
                                placeholder="Sobre o parceiro..."
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-label-small text-content-secondary">
                            Regras
                        </label>
                        <div className="relative">
                            <div className="pointer-events-none absolute left-3 top-3">
                                <FileText className="h-4 w-4 text-content-brand" />
                            </div>
                            <Textarea
                                value={rules}
                                onChange={(e) => setRules(e.target.value)}
                                disabled={isPending}
                                rows={3}
                                className={cn('pl-10', INPUT_BASE)}
                                placeholder="Condições e regras..."
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="brand"
                            disabled={isPending || formInvalid}
                            onClick={handleCreate}
                            title={
                                loadingSelectedData
                                    ? 'Aguarde carregar as empresas'
                                    : uploadingImage
                                      ? 'Aguarde o upload da imagem'
                                      : selectedInvalid
                                        ? 'Selecione pelo menos 1 empresa'
                                        : requiredInvalid
                                          ? 'Preencha os campos obrigatórios'
                                          : undefined
                            }
                        >
                            {isPending ? 'Criando...' : 'Criar parceiro'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
