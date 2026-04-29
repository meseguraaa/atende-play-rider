// src/components/plataform/companies/company-edit-dialog/company-edit-dialog.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
    Building2,
    Hash,
    Layers,
    Pencil,
    KeyRound,
    Loader2,
    ShieldPlus,
    UserPlus,
    Mail,
    User,
    Phone,
} from 'lucide-react';

export type CompanyForEdit = {
    id: string;
    name: string;
    slug: string | null;
    segment: string;
    isActive: boolean;
    whatsappCredits?: number;
    birthdayMessageEnabled?: boolean;
};

type OwnerFromApi = {
    userId: string;
    name: string | null;
    email: string;
    phone: string | null;
    isActive: boolean;
    role?: string;
    isOwner?: boolean;
};

type PromotableMemberFromApi = {
    userId: string;
    name: string | null;
    email: string;
    phone: string | null;
    isActive: boolean;
    role: string;
    isOwner: boolean;
};

type CompanyGetResponse =
    | {
          ok: true;
          data: {
              company: CompanyForEdit & {
                  whatsappCredits?: number;
                  birthdayMessageEnabled?: boolean;
              };
              owners: OwnerFromApi[];
              promotableMembers: PromotableMemberFromApi[];
          };
      }
    | { ok: false; error?: string };

type NewOwnerDraft = {
    name: string;
    email: string;
    phone: string;
    password: string;
};

const INPUT_BASE =
    'bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0';

function normalizeString(raw: unknown) {
    const s = String(raw ?? '').trim();
    return s.length ? s : '';
}

function normalizeSlug(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const normalized = s
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '');

    return normalized.length ? normalized : null;
}

function normalizeSegment(raw: unknown): string {
    return String(raw ?? '').trim();
}

function isValidPassword(raw: string): boolean {
    return String(raw ?? '').trim().length >= 8;
}

function isValidEmail(raw: string): boolean {
    const s = String(raw ?? '')
        .trim()
        .toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isValidPhoneLoose(raw: string): boolean {
    const s = String(raw ?? '').trim();
    if (!s) return true;
    const digits = s.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
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

type OwnerPasswordDraft = {
    userId: string;
    email: string;
    newPassword: string;
};

function emptyNewOwnerDraft(): NewOwnerDraft {
    return {
        name: '',
        email: '',
        phone: '',
        password: '',
    };
}

export function CompanyEditDialog({
    company,
    triggerVariant = 'edit2',
    triggerLabel = 'Editar',
}: {
    company: CompanyForEdit;
    triggerVariant?: React.ComponentProps<typeof Button>['variant'];
    triggerLabel?: string;
}) {
    const router = useRouter();

    const [open, setOpen] = React.useState(false);
    const [isPending, startTransition] = React.useTransition();

    const [loading, setLoading] = React.useState(false);

    const [name, setName] = React.useState(company.name ?? '');
    const [slug, setSlug] = React.useState(company.slug ?? '');
    const [segmentRaw, setSegmentRaw] = React.useState(
        String(company.segment ?? '')
    );
    const [isActive, setIsActive] = React.useState<boolean>(
        Boolean(company.isActive)
    );

    // 🔥 NOVO: comunicação
    const [whatsappCredits, setWhatsappCredits] = React.useState(0);
    const [birthdayMessageEnabled, setBirthdayMessageEnabled] =
        React.useState(false);

    const [owners, setOwners] = React.useState<OwnerFromApi[]>([]);
    const [promotableMembers, setPromotableMembers] = React.useState<
        PromotableMemberFromApi[]
    >([]);
    const [selectedPromoteUserIds, setSelectedPromoteUserIds] = React.useState<
        string[]
    >([]);
    const [ownerPass, setOwnerPass] = React.useState<OwnerPasswordDraft[]>([]);
    const [newOwner, setNewOwner] =
        React.useState<NewOwnerDraft>(emptyNewOwnerDraft());

    const normalizedSlug = React.useMemo(() => normalizeSlug(slug), [slug]);
    const normalizedSegment = React.useMemo(
        () => normalizeSegment(segmentRaw),
        [segmentRaw]
    );

    const newOwnerName = normalizeString(newOwner.name);
    const newOwnerEmail = normalizeString(newOwner.email).toLowerCase();
    const newOwnerPhone = normalizeString(newOwner.phone);
    const newOwnerPassword = String(newOwner.password ?? '').trim();

    const newOwnerTouched =
        !!newOwnerName ||
        !!newOwnerEmail ||
        !!newOwnerPhone ||
        !!newOwnerPassword;

    const newOwnerEmailOk =
        !newOwnerTouched || !newOwnerEmail || isValidEmail(newOwnerEmail);
    const newOwnerPhoneOk =
        !newOwnerTouched || !newOwnerPhone || isValidPhoneLoose(newOwnerPhone);
    const newOwnerPasswordOk =
        !newOwnerTouched ||
        !newOwnerPassword ||
        isValidPassword(newOwnerPassword);

    const existingOwnerEmailSet = React.useMemo(
        () => new Set(owners.map((o) => String(o.email).trim().toLowerCase())),
        [owners]
    );

    const existingPromotableEmailSet = React.useMemo(
        () =>
            new Set(
                promotableMembers.map((m) =>
                    String(m.email).trim().toLowerCase()
                )
            ),
        [promotableMembers]
    );

    const newOwnerDuplicateEmail =
        !!newOwnerEmail &&
        (existingOwnerEmailSet.has(newOwnerEmail) ||
            existingPromotableEmailSet.has(newOwnerEmail));

    const newOwnerReady =
        !!newOwnerName &&
        !!newOwnerEmail &&
        isValidEmail(newOwnerEmail) &&
        isValidPhoneLoose(newOwnerPhone) &&
        isValidPassword(newOwnerPassword) &&
        !newOwnerDuplicateEmail;

    React.useEffect(() => {
        if (!open) return;

        let alive = true;

        async function load() {
            setLoading(true);
            try {
                const res = await fetch(
                    `/api/plataform/companies/${company.id}`,
                    { method: 'GET' }
                );
                const json = (await res
                    .json()
                    .catch(() => null)) as CompanyGetResponse | null;

                if (!alive) return;

                if (!res.ok || !json || (json as any).ok !== true) {
                    toast.error(
                        (json as any)?.error ||
                            'Não foi possível carregar a empresa.'
                    );
                    setOwners([]);
                    setPromotableMembers([]);
                    setSelectedPromoteUserIds([]);
                    setOwnerPass([]);
                    setNewOwner(emptyNewOwnerDraft());
                    return;
                }

                const data = (json as any).data;

                setName(data.company.name ?? '');
                setSlug(data.company.slug ?? '');
                setSegmentRaw(String(data.company.segment ?? ''));
                setIsActive(Boolean(data.company.isActive));

                // 🔥 NOVO
                setWhatsappCredits(Number(data.company.whatsappCredits ?? 0));
                setBirthdayMessageEnabled(
                    Boolean(data.company.birthdayMessageEnabled)
                );

                const ownersList: OwnerFromApi[] = Array.isArray(data.owners)
                    ? data.owners
                    : [];
                const promotableList: PromotableMemberFromApi[] = Array.isArray(
                    data.promotableMembers
                )
                    ? data.promotableMembers
                    : [];

                setOwners(ownersList);
                setPromotableMembers(promotableList);
                setSelectedPromoteUserIds([]);
                setNewOwner(emptyNewOwnerDraft());

                setOwnerPass(
                    ownersList.map((o) => ({
                        userId: o.userId,
                        email: o.email,
                        newPassword: '',
                    }))
                );
            } catch {
                if (!alive) return;
                toast.error('Erro de rede ao carregar empresa.');
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        }

        void load();

        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const requiredInvalid = !name.trim() || !normalizedSegment;

    const anyOwnerPasswordInvalid = ownerPass.some(
        (o) =>
            o.newPassword.trim().length > 0 && !isValidPassword(o.newPassword)
    );

    const newOwnerInvalid =
        newOwnerTouched &&
        (!newOwnerReady ||
            !newOwnerEmailOk ||
            !newOwnerPhoneOk ||
            !newOwnerPasswordOk);

    const formInvalid =
        requiredInvalid ||
        anyOwnerPasswordInvalid ||
        newOwnerInvalid ||
        loading;

    function setOwnerPassword(userId: string, value: string) {
        setOwnerPass((prev) =>
            prev.map((o) =>
                o.userId === userId ? { ...o, newPassword: value } : o
            )
        );
    }

    function togglePromotableUser(userId: string, checked: boolean) {
        setSelectedPromoteUserIds((prev) => {
            if (checked) {
                if (prev.includes(userId)) return prev;
                return [...prev, userId];
            }
            return prev.filter((id) => id !== userId);
        });
    }

    function updateNewOwner(patch: Partial<NewOwnerDraft>) {
        setNewOwner((prev) => ({ ...prev, ...patch }));
    }

    function buildPayload() {
        const resetOwnerPasswords = ownerPass
            .filter((o) => o.newPassword.trim().length > 0)
            .map((o) => ({
                email: o.email,
                password: o.newPassword.trim(),
            }));

        const addOwners = newOwnerReady
            ? [
                  {
                      name: newOwnerName,
                      email: newOwnerEmail,
                      phone: newOwnerPhone || null,
                      password: newOwnerPassword,
                  },
              ]
            : [];

        return {
            update: {
                name: normalizeString(name),
                slug: normalizedSlug,
                segment: normalizedSegment,
                isActive,

                // 🔥 NOVO
                whatsappCredits,
                birthdayMessageEnabled,

                addOwners,
                promoteMemberUserIds: selectedPromoteUserIds,
                resetOwnerPasswords,
            },
        };
    }

    async function handleSave() {
        if (formInvalid) {
            if (!name.trim()) {
                return toast.error('Nome da empresa é obrigatório.');
            }
            if (!normalizedSegment) {
                return toast.error('Segmento da empresa é obrigatório.');
            }
            if (anyOwnerPasswordInvalid) {
                return toast.error('Senha inválida (mínimo 8 caracteres).');
            }
            if (newOwnerTouched) {
                if (!newOwnerName) {
                    return toast.error('Informe o nome do novo dono.');
                }
                if (!newOwnerEmail || !isValidEmail(newOwnerEmail)) {
                    return toast.error(
                        'Informe um e-mail válido para o novo dono.'
                    );
                }
                if (!isValidPhoneLoose(newOwnerPhone)) {
                    return toast.error(
                        'Telefone inválido para o novo dono. Use 10 a 15 dígitos.'
                    );
                }
                if (!isValidPassword(newOwnerPassword)) {
                    return toast.error(
                        'Senha do novo dono inválida (mínimo 8 caracteres).'
                    );
                }
                if (newOwnerDuplicateEmail) {
                    return toast.error(
                        'Este e-mail já pertence a um usuário vinculado à empresa.'
                    );
                }
            }
            return toast.error('Corrija o formulário antes de salvar.');
        }

        const payload = buildPayload();

        startTransition(async () => {
            try {
                const res = await fetch(
                    `/api/plataform/companies/${company.id}`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    }
                );

                const json = (await res.json().catch(() => null)) as
                    | { ok: true; data?: any }
                    | { ok: false; error?: string }
                    | null;

                if (!res.ok || !json || (json as any).ok !== true) {
                    toast.error(
                        (json as any)?.error ||
                            'Não foi possível salvar a empresa.'
                    );
                    return;
                }

                toast.success('Empresa atualizada!');
                setOpen(false);
                router.refresh();
            } catch {
                toast.error('Erro de rede ao salvar empresa.');
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !isPending && setOpen(v)}>
            <DialogTrigger asChild>
                <Button
                    variant={triggerVariant}
                    size="sm"
                    className="border-border-primary hover:bg-muted/40"
                    type="button"
                >
                    <span className="inline-flex items-center gap-2">
                        <Pencil className="h-4 w-4" />
                        {triggerLabel}
                    </span>
                </Button>
            </DialogTrigger>

            <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-title text-content-primary">
                        Editar empresa
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center gap-2 py-8 text-sm text-content-secondary">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando...
                    </div>
                ) : (
                    <div className="space-y-4 pb-2">
                        <div className="space-y-2">
                            <label className="text-label-small text-content-secondary">
                                Nome da empresa{' '}
                                <span className="text-red-500">*</span>
                            </label>
                            <IconInput
                                icon={Building2}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={isPending}
                                className={INPUT_BASE}
                            />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-label-small text-content-secondary">
                                    Slug (opcional)
                                </label>
                                <IconInput
                                    icon={Hash}
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                    disabled={isPending}
                                    className={INPUT_BASE}
                                />
                                <p className="text-[11px] text-content-secondary/70">
                                    Normaliza para URL:{' '}
                                    <span className="text-content-primary">
                                        {normalizedSlug ?? '—'}
                                    </span>
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-label-small text-content-secondary">
                                    Segmento{' '}
                                    <span className="text-red-500">*</span>
                                </label>
                                <IconInput
                                    icon={Layers}
                                    value={segmentRaw}
                                    onChange={(e) =>
                                        setSegmentRaw(e.target.value)
                                    }
                                    disabled={isPending}
                                    className={INPUT_BASE}
                                    placeholder="ex: barbearia, estética, clínica..."
                                />
                                <p className="text-[11px] text-content-secondary/70">
                                    Vai salvar como:{' '}
                                    <span className="text-content-primary">
                                        {normalizedSegment || '—'}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2 rounded-xl border border-border-primary bg-background-tertiary p-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-content-primary">
                                        Status
                                    </p>
                                    <p className="text-[11px] text-content-secondary/70">
                                        Ative/desative sem apagar dados.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant={isActive ? 'outline' : 'brand'}
                                        className="h-9"
                                        disabled={isPending}
                                        onClick={() => setIsActive(false)}
                                    >
                                        Inativa
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={isActive ? 'brand' : 'outline'}
                                        className="h-9"
                                        disabled={isPending}
                                        onClick={() => setIsActive(true)}
                                    >
                                        Ativa
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 rounded-xl border border-border-primary bg-background-tertiary p-3">
                            <div>
                                <p className="text-sm font-medium text-content-primary">
                                    Comunicação com clientes
                                </p>
                            </div>

                            <div className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2">
                                <p className="text-[11px] text-content-secondary">
                                    WhatsApp sempre disponível com{' '}
                                    <span className="font-semibold text-content-primary">
                                        1 mensagem grátis por mês
                                    </span>
                                    .
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-label-small text-content-secondary">
                                    Créditos extras de WhatsApp
                                </label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={whatsappCredits}
                                    onChange={(e) =>
                                        setWhatsappCredits(
                                            Math.max(
                                                0,
                                                Number(e.target.value) || 0
                                            )
                                        )
                                    }
                                    disabled={isPending}
                                    className={INPUT_BASE}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-sm text-content-primary">
                                    Mensagem automática de aniversário
                                </span>

                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant={
                                            birthdayMessageEnabled
                                                ? 'brand'
                                                : 'outline'
                                        }
                                        size="sm"
                                        onClick={() =>
                                            setBirthdayMessageEnabled(true)
                                        }
                                        disabled={isPending}
                                    >
                                        ON
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={
                                            !birthdayMessageEnabled
                                                ? 'brand'
                                                : 'outline'
                                        }
                                        size="sm"
                                        onClick={() =>
                                            setBirthdayMessageEnabled(false)
                                        }
                                        disabled={isPending}
                                    >
                                        OFF
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 rounded-xl border border-border-primary bg-background-tertiary p-3">
                            <div>
                                <p className="text-sm font-medium text-content-primary">
                                    Criar novo admin dono
                                </p>
                                <p className="text-[11px] text-content-secondary/70">
                                    Preencha os dados abaixo para criar um novo
                                    usuário já como admin dono desta empresa.
                                </p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-label-small text-content-secondary">
                                        Nome
                                    </label>
                                    <IconInput
                                        icon={User}
                                        value={newOwner.name}
                                        onChange={(e) =>
                                            updateNewOwner({
                                                name: e.target.value,
                                            })
                                        }
                                        disabled={isPending}
                                        className={INPUT_BASE}
                                        placeholder="Ex: Bruno Leal"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-label-small text-content-secondary">
                                        E-mail
                                    </label>
                                    <IconInput
                                        icon={Mail}
                                        value={newOwner.email}
                                        onChange={(e) =>
                                            updateNewOwner({
                                                email: e.target.value,
                                            })
                                        }
                                        disabled={isPending}
                                        className={cn(
                                            INPUT_BASE,
                                            newOwnerEmailOk &&
                                                !newOwnerDuplicateEmail
                                                ? ''
                                                : 'border-red-500/60'
                                        )}
                                        placeholder="email@dominio.com"
                                        inputMode="email"
                                    />
                                    {!newOwnerEmailOk ? (
                                        <p className="text-[11px] text-red-500">
                                            E-mail inválido.
                                        </p>
                                    ) : null}
                                    {newOwnerDuplicateEmail ? (
                                        <p className="text-[11px] text-red-500">
                                            Este e-mail já está vinculado à
                                            empresa.
                                        </p>
                                    ) : null}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-label-small text-content-secondary">
                                        Telefone (opcional)
                                    </label>
                                    <IconInput
                                        icon={Phone}
                                        value={newOwner.phone}
                                        onChange={(e) =>
                                            updateNewOwner({
                                                phone: e.target.value,
                                            })
                                        }
                                        disabled={isPending}
                                        className={cn(
                                            INPUT_BASE,
                                            newOwnerPhoneOk
                                                ? ''
                                                : 'border-red-500/60'
                                        )}
                                        placeholder="(11) 99999-9999"
                                        inputMode="tel"
                                    />
                                    {!newOwnerPhoneOk ? (
                                        <p className="text-[11px] text-red-500">
                                            Telefone inválido (10 a 15 dígitos).
                                        </p>
                                    ) : null}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-label-small text-content-secondary">
                                        Senha
                                    </label>
                                    <IconInput
                                        icon={KeyRound}
                                        value={newOwner.password}
                                        onChange={(e) =>
                                            updateNewOwner({
                                                password: e.target.value,
                                            })
                                        }
                                        disabled={isPending}
                                        className={cn(
                                            INPUT_BASE,
                                            newOwnerPasswordOk
                                                ? ''
                                                : 'border-red-500/60'
                                        )}
                                        placeholder="mínimo 8 caracteres"
                                        type="password"
                                    />
                                    {!newOwnerPasswordOk ? (
                                        <p className="text-[11px] text-red-500">
                                            Senha inválida (mínimo 8
                                            caracteres).
                                        </p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2">
                                <p className="text-[11px] text-content-secondary">
                                    Você pode deixar tudo em branco para não
                                    criar ninguém novo. Se começar a preencher,
                                    o formulário vai exigir nome, e-mail válido
                                    e senha para esse novo dono.
                                </p>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-content-secondary">
                                <UserPlus className="h-4 w-4 text-content-brand" />
                                <span>
                                    {newOwnerReady
                                        ? 'Novo admin dono pronto para ser criado ao salvar.'
                                        : 'Novo admin dono opcional.'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2 rounded-xl border border-border-primary bg-background-tertiary p-3">
                            <div>
                                <p className="text-sm font-medium text-content-primary">
                                    Promover admins para dono
                                </p>
                                <p className="text-[11px] text-content-secondary/70">
                                    Selecione admins já vinculados à empresa
                                    para virarem admin dono.
                                </p>
                            </div>

                            {promotableMembers.length === 0 ? (
                                <p className="text-xs text-content-secondary">
                                    Nenhum admin elegível para promoção
                                    encontrado.
                                </p>
                            ) : (
                                <div className="space-y-3 pt-2">
                                    {promotableMembers.map((member) => {
                                        const checked =
                                            selectedPromoteUserIds.includes(
                                                member.userId
                                            );

                                        return (
                                            <label
                                                key={member.userId}
                                                className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-primary bg-background-secondary p-3"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 h-4 w-4 rounded border-border-primary"
                                                    checked={checked}
                                                    disabled={isPending}
                                                    onChange={(e) =>
                                                        togglePromotableUser(
                                                            member.userId,
                                                            e.target.checked
                                                        )
                                                    }
                                                />

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="truncate text-sm font-semibold text-content-primary">
                                                            {member.name ?? '—'}
                                                        </p>
                                                        <span className="inline-flex items-center rounded-md border border-border-primary px-2 py-0.5 text-[10px] font-medium text-content-secondary">
                                                            {member.role ||
                                                                'ADMIN'}
                                                        </span>
                                                    </div>
                                                    <p className="truncate text-xs text-content-secondary">
                                                        {member.email}
                                                    </p>
                                                    {member.phone ? (
                                                        <p className="truncate text-[11px] text-content-secondary/70">
                                                            {member.phone}
                                                        </p>
                                                    ) : null}
                                                </div>

                                                <div className="shrink-0 pt-0.5 text-content-brand">
                                                    <ShieldPlus className="h-4 w-4" />
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 rounded-xl border border-border-primary bg-background-tertiary p-3">
                            <div>
                                <p className="text-sm font-medium text-content-primary">
                                    Donos (reset de senha)
                                </p>
                                <p className="text-[11px] text-content-secondary/70">
                                    Preencha só se quiser trocar a senha. Mínimo
                                    8 caracteres.
                                </p>
                            </div>

                            {owners.length === 0 ? (
                                <p className="text-xs text-content-secondary">
                                    Nenhum dono ativo encontrado.
                                </p>
                            ) : (
                                <div className="space-y-3 pt-2">
                                    {owners.map((o) => {
                                        const draft = ownerPass.find(
                                            (d) => d.userId === o.userId
                                        );
                                        const pass = draft?.newPassword ?? '';
                                        const passOk =
                                            pass.trim().length === 0 ||
                                            isValidPassword(pass);

                                        return (
                                            <div
                                                key={o.userId}
                                                className="rounded-xl border border-border-primary bg-background-secondary p-3"
                                            >
                                                <div className="flex items-center justify-between gap-3 pb-2">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-content-primary">
                                                            {o.name ?? '—'}
                                                        </p>
                                                        <p className="truncate text-xs text-content-secondary">
                                                            {o.email}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-label-small text-content-secondary">
                                                        Nova senha (opcional)
                                                    </label>
                                                    <IconInput
                                                        icon={KeyRound}
                                                        value={pass}
                                                        onChange={(e) =>
                                                            setOwnerPassword(
                                                                o.userId,
                                                                e.target.value
                                                            )
                                                        }
                                                        disabled={isPending}
                                                        className={cn(
                                                            INPUT_BASE,
                                                            passOk
                                                                ? ''
                                                                : 'border-red-500/60'
                                                        )}
                                                        type="password"
                                                        placeholder="mínimo 8 caracteres"
                                                    />
                                                    {!passOk ? (
                                                        <p className="text-[11px] text-red-500">
                                                            Senha inválida
                                                            (mínimo 8
                                                            caracteres).
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="brand"
                                disabled={isPending || formInvalid}
                                onClick={handleSave}
                                title={
                                    !name.trim()
                                        ? 'Preencha o nome da empresa'
                                        : !normalizedSegment
                                          ? 'Preencha o segmento da empresa'
                                          : anyOwnerPasswordInvalid
                                            ? 'Senha mínimo 8 caracteres'
                                            : newOwnerInvalid
                                              ? 'Corrija os dados do novo dono'
                                              : undefined
                                }
                            >
                                {isPending ? 'Salvando...' : 'Salvar'}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
