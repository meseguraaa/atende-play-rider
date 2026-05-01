// src/app/admin/setting/admin-settings-client.tsx
'use client';

import * as React from 'react';

import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Building2, Phone, MapPin, User, Mail, KeyRound } from 'lucide-react';

import { toast } from 'sonner';

type PermissionsUI = {
    canAccessDashboard: boolean;
    canAccessRides: boolean;
    canAccessCategories: boolean;
    canAccessProducts: boolean;
    canAccessMembers: boolean;
    canAccessCommunication: boolean;
    canAccessReviews: boolean;
    canAccessFaq: boolean;
    canAccessReports: boolean;
    canAccessFinance: boolean;
    canAccessSettings: boolean;
};

type AdminUI = {
    id: string;
    name: string;
    email: string;
    phone: string;
    createdAt: Date;
    isOwner: boolean;
    isActive: boolean;
    permissions: PermissionsUI;
};

type CompanyUI = {
    id: string;
    name: string;
    city: string;
    state: string;
};

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type CompanyApi = {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
};

type AdminApi = {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    createdAt: string;
    isOwner: boolean;
    isActive: boolean;
    permissions: PermissionsUI;
};

function formatDateTimeBR(d: Date) {
    try {
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(d);
    } catch {
        return d.toISOString();
    }
}

function toCompanyMessage(code: string) {
    const map: Record<string, string> = {
        forbidden_owner_only: 'Somente o dono pode editar dados da empresa.',
        company_not_found: 'Não foi possível encontrar a empresa.',
        company_name_required: 'Informe o nome da empresa.',
        invalid_json: 'Erro ao enviar dados. Tente novamente.',
        internal_error: 'Erro interno. Tente novamente.',
        forbidden: 'Você não tem permissão para acessar esta área.',
    };

    return map[code] ?? 'Algo deu errado. Tente novamente.';
}

function toAdminMessage(code: string) {
    const map: Record<string, string> = {
        forbidden_owner_only:
            'Somente o dono pode criar/editar administradores.',
        forbidden_cannot_edit_owner:
            'Não é possível editar permissões do dono (OWNER).',
        target_not_found: 'Não foi possível encontrar esse administrador.',
        target_not_admin: 'Esse usuário não é um administrador.',
        nothing_to_update: 'Nenhuma alteração foi enviada.',
        invalid_id: 'Administrador inválido.',
        admin_name_required: 'Informe o nome do administrador.',
        admin_email_required: 'Informe o e-mail do administrador.',
        admin_email_invalid: 'Informe um e-mail válido.',
        admin_phone_invalid: 'Informe um telefone válido.',
        admin_password_invalid: 'A senha deve ter pelo menos 6 caracteres.',
        email_in_use: 'Este e-mail já está em uso.',
        missing_company: 'Empresa não encontrada para criar administradores.',
        invalid_json: 'Erro ao enviar dados. Tente novamente.',
        internal_error: 'Erro interno. Tente novamente.',
        forbidden: 'Você não tem permissão para acessar esta área.',
        unauthorized: 'Sua sessão expirou. Faça login novamente.',
        admin_not_found: 'Não foi possível encontrar esse administrador.',
    };

    return map[code] ?? 'Algo deu errado. Tente novamente.';
}

function safeApiError(json: unknown): string {
    if (
        json &&
        typeof json === 'object' &&
        'ok' in json &&
        (json as any).ok === false &&
        typeof (json as any).error === 'string'
    ) {
        return String((json as any).error);
    }

    return 'internal_error';
}

function onlyDigits(v: string) {
    return v.replace(/\D/g, '');
}

function formatPhoneBR(input: string) {
    const d = onlyDigits(input).slice(0, 11);
    if (d.length === 0) return '';
    if (d.length < 3) return `(${d}`;

    const ddd = d.slice(0, 2);
    const rest = d.slice(2);

    if (d.length <= 10) {
        const p1 = rest.slice(0, 4);
        const p2 = rest.slice(4, 8);
        if (rest.length <= 4) return `(${ddd}) ${p1}`;
        return `(${ddd}) ${p1}-${p2}`;
    }

    const p1 = rest.slice(0, 5);
    const p2 = rest.slice(5, 9);
    if (rest.length <= 5) return `(${ddd}) ${p1}`;
    return `(${ddd}) ${p1}-${p2}`;
}

const PERMISSION_LABELS: Record<keyof PermissionsUI, string> = {
    canAccessDashboard: 'Dashboard',
    canAccessRides: 'Rolê',
    canAccessCategories: 'Categorias',
    canAccessProducts: 'Produtos',
    canAccessMembers: 'Membros',
    canAccessCommunication: 'Comunicação',
    canAccessReviews: 'Avaliação',
    canAccessFaq: 'Dúvidas',
    canAccessReports: 'Relatórios',
    canAccessFinance: 'Financeiro',
    canAccessSettings: 'Configurações',
};

function clonePerms(p: PermissionsUI): PermissionsUI {
    return {
        canAccessDashboard: !!p.canAccessDashboard,
        canAccessRides: !!p.canAccessRides,
        canAccessCategories: !!p.canAccessCategories,
        canAccessProducts: !!p.canAccessProducts,
        canAccessMembers: !!p.canAccessMembers,
        canAccessCommunication: !!p.canAccessCommunication,
        canAccessReviews: !!p.canAccessReviews,
        canAccessFaq: !!p.canAccessFaq,
        canAccessReports: !!p.canAccessReports,
        canAccessFinance: !!p.canAccessFinance,
        canAccessSettings: !!p.canAccessSettings,
    };
}

function arePermsEqual(a: PermissionsUI, b: PermissionsUI) {
    const keys = Object.keys(PERMISSION_LABELS) as (keyof PermissionsUI)[];
    for (const k of keys) {
        if (!!a[k] !== !!b[k]) return false;
    }

    return true;
}

function normalizeCompanyFromApi(c: CompanyApi): CompanyUI {
    return {
        id: c.id,
        name: c.name ?? '',
        city: c.city ?? '',
        state: c.state ?? '',
    };
}

function normalizeAdminFromApi(a: AdminApi): AdminUI {
    const createdAt = new Date(a.createdAt);

    return {
        id: a.id,
        name: (a.name ?? '').trim() || '—',
        email: a.email,
        phone: (a.phone ?? '').trim() || '—',
        createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
        isOwner: !!a.isOwner,
        isActive: !!a.isActive,
        permissions: {
            canAccessDashboard: !!a.permissions?.canAccessDashboard,
            canAccessRides: !!a.permissions?.canAccessRides,
            canAccessCategories: !!a.permissions?.canAccessCategories,
            canAccessProducts: !!a.permissions?.canAccessProducts,
            canAccessMembers: !!a.permissions?.canAccessMembers,
            canAccessCommunication: !!a.permissions?.canAccessCommunication,
            canAccessReviews: !!a.permissions?.canAccessReviews,
            canAccessFaq: !!a.permissions?.canAccessFaq,
            canAccessReports: !!a.permissions?.canAccessReports,
            canAccessFinance: !!a.permissions?.canAccessFinance,
            canAccessSettings: !!a.permissions?.canAccessSettings,
        },
    };
}

function PermissionBox(props: {
    label: string;
    value: boolean;
    disabled?: boolean;
    onToggle?: () => void;
}) {
    const { label, value, disabled, onToggle } = props;

    const base =
        'flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition select-none';
    const enabledStyles = value
        ? 'border-emerald-500/40 bg-emerald-500/10'
        : 'border-destructive/40 bg-destructive/10';
    const disabledStyles = 'opacity-70 cursor-not-allowed';
    const clickableStyles = disabled ? disabledStyles : 'cursor-pointer';

    return (
        <button
            type="button"
            onClick={disabled ? undefined : onToggle}
            disabled={disabled}
            className={`${base} ${enabledStyles} ${clickableStyles}`}
            aria-pressed={value}
        >
            <span className="text-[11px] text-content-secondary">{label}</span>
            <span
                className={`text-[11px] font-medium ${
                    value ? 'text-emerald-500' : 'text-content-secondary'
                }`}
            >
                {value ? 'Liberado' : 'Bloqueado'}
            </span>
        </button>
    );
}

function IconInput(
    props: {
        icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
        iconClassName?: string;
        inputClassName?: string;
        wrapperClassName?: string;
        disabledIcon?: boolean;
    } & React.ComponentProps<typeof Input>
) {
    const {
        icon: Icon,
        iconClassName,
        inputClassName,
        wrapperClassName,
        disabledIcon,
        className,
        ...rest
    } = props;

    return (
        <div className={`relative ${wrapperClassName ?? ''}`}>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 -mt-px pointer-events-none">
                <Icon
                    width={20}
                    height={20}
                    className={`${
                        disabledIcon
                            ? 'text-content-secondary/50'
                            : 'text-content-brand'
                    } ${iconClassName ?? ''}`}
                />
            </div>

            <Input
                {...rest}
                className={`pl-10 ${inputClassName ?? ''} ${className ?? ''}`}
            />
        </div>
    );
}

export default function AdminSettingsClient() {
    const [company, setCompany] = React.useState<CompanyUI>({
        id: '',
        name: '',
        city: '',
        state: '',
    });

    const [companyLoading, setCompanyLoading] = React.useState(true);
    const [companySaving, setCompanySaving] = React.useState(false);
    const [companyError, setCompanyError] = React.useState<string | null>(null);

    const [admins, setAdmins] = React.useState<AdminUI[]>([]);
    const [adminsLoading, setAdminsLoading] = React.useState(true);

    const [pendingPermsByAdminId, setPendingPermsByAdminId] = React.useState<
        Record<string, PermissionsUI>
    >({});
    const [dirtyPermsByAdminId, setDirtyPermsByAdminId] = React.useState<
        Record<string, boolean>
    >({});
    const [savingPermsByAdminId, setSavingPermsByAdminId] = React.useState<
        Record<string, boolean>
    >({});

    const [newAdmin, setNewAdmin] = React.useState({
        name: '',
        email: '',
        phone: '',
        password: '',
    });

    const [newAdminPerms, setNewAdminPerms] = React.useState<PermissionsUI>({
        canAccessDashboard: false,
        canAccessRides: false,
        canAccessCategories: false,
        canAccessProducts: false,
        canAccessMembers: false,
        canAccessCommunication: false,
        canAccessReviews: false,
        canAccessFaq: false,
        canAccessReports: false,
        canAccessFinance: false,
        canAccessSettings: false,
    });

    const [adminCreating, setAdminCreating] = React.useState(false);

    const fetchAdmins = React.useCallback(async () => {
        setAdminsLoading(true);

        try {
            const res = await fetch('/api/admin/settings/admins', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            let json: ApiResp<AdminApi[]> | null = null;

            try {
                json = (await res.json()) as ApiResp<AdminApi[]>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                toast.error(toAdminMessage(code));
                setAdmins([]);
                return;
            }

            const mapped = (json.data || []).map(normalizeAdminFromApi);
            mapped.sort((a, b) => {
                if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
                return b.createdAt.getTime() - a.createdAt.getTime();
            });

            setAdmins(mapped);

            setPendingPermsByAdminId((prev) => {
                const next: Record<string, PermissionsUI> = { ...prev };

                for (const a of mapped) {
                    if (!a.isOwner) next[a.id] = clonePerms(a.permissions);
                }

                return next;
            });

            setDirtyPermsByAdminId((prev) => {
                const next: Record<string, boolean> = { ...prev };

                for (const a of mapped) {
                    if (!a.isOwner) next[a.id] = false;
                }

                return next;
            });
        } catch {
            toast.error(
                'Não foi possível carregar os administradores. Verifique sua conexão.'
            );
            setAdmins([]);
        } finally {
            setAdminsLoading(false);
        }
    }, []);

    React.useEffect(() => {
        let alive = true;
        const controller = new AbortController();

        async function run() {
            setCompanyLoading(true);
            setCompanyError(null);

            try {
                const res = await fetch('/api/admin/settings/company', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                });

                let json: ApiResp<CompanyApi> | null = null;

                try {
                    json = (await res.json()) as ApiResp<CompanyApi>;
                } catch {
                    json = null;
                }

                if (!alive) return;

                if (!res.ok || !json || !json.ok) {
                    const code = json ? safeApiError(json) : 'internal_error';
                    setCompanyError(toCompanyMessage(code));
                    return;
                }

                setCompany(normalizeCompanyFromApi(json.data));
            } catch (err: any) {
                if (!alive) return;
                if (err?.name === 'AbortError') return;

                setCompanyError(
                    'Não foi possível carregar a empresa. Verifique sua conexão.'
                );
            } finally {
                if (!alive) return;
                setCompanyLoading(false);
            }
        }

        run();
        fetchAdmins();

        return () => {
            alive = false;
            controller.abort();
        };
    }, [fetchAdmins]);

    async function handleSaveCompany(e: React.FormEvent) {
        e.preventDefault();

        setCompanyError(null);

        const name = company.name.trim();

        if (!name) {
            setCompanyError('Informe o nome da empresa.');
            return;
        }

        setCompanySaving(true);

        try {
            const res = await fetch('/api/admin/settings/company', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    city: company.city.trim() || null,
                    state: company.state.trim() || null,
                }),
            });

            let json: ApiResp<CompanyApi> | null = null;

            try {
                json = (await res.json()) as ApiResp<CompanyApi>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                const msg = toCompanyMessage(code);
                setCompanyError(msg);
                toast.error(msg);
                return;
            }

            setCompany(normalizeCompanyFromApi(json.data));
            toast.success('Empresa salva.');
        } catch {
            const msg = 'Não foi possível salvar. Verifique sua conexão.';
            setCompanyError(msg);
            toast.error(msg);
        } finally {
            setCompanySaving(false);
        }
    }

    function togglePermission(adminId: string, key: keyof PermissionsUI) {
        const admin = admins.find((a) => a.id === adminId) ?? null;
        if (!admin || admin.isOwner) return;

        const currentPending = pendingPermsByAdminId[adminId]
            ? clonePerms(pendingPermsByAdminId[adminId])
            : clonePerms(admin.permissions);

        const nextPending: PermissionsUI = {
            ...currentPending,
            [key]: !currentPending[key],
        };

        setPendingPermsByAdminId((prev) => ({
            ...prev,
            [adminId]: nextPending,
        }));

        const isDirtyNow = !arePermsEqual(nextPending, admin.permissions);
        setDirtyPermsByAdminId((prev) => ({ ...prev, [adminId]: isDirtyNow }));
    }

    async function saveAdminPermissions(adminId: string) {
        const admin = admins.find((a) => a.id === adminId) ?? null;
        if (!admin || admin.isOwner) return;

        const pending = pendingPermsByAdminId[adminId];
        if (!pending) return;

        const isDirty = !!dirtyPermsByAdminId[adminId];
        if (!isDirty) return;

        setSavingPermsByAdminId((prev) => ({ ...prev, [adminId]: true }));

        try {
            const res = await fetch(`/api/admin/settings/admins/${adminId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    permissions: pending,
                }),
            });

            let json: ApiResp<AdminApi> | null = null;

            try {
                json = (await res.json()) as ApiResp<AdminApi>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                toast.error(toAdminMessage(code));
                return;
            }

            toast.success('Permissões salvas.');

            setAdmins((prev) =>
                prev.map((x) =>
                    x.id === adminId
                        ? { ...x, permissions: clonePerms(pending) }
                        : x
                )
            );

            setDirtyPermsByAdminId((prev) => ({ ...prev, [adminId]: false }));
        } catch {
            toast.error(
                'Não foi possível salvar as permissões. Verifique sua conexão.'
            );
        } finally {
            setSavingPermsByAdminId((prev) => ({ ...prev, [adminId]: false }));
        }
    }

    async function handleCreateAdmin(e: React.FormEvent) {
        e.preventDefault();

        const name = newAdmin.name.trim();
        const email = newAdmin.email.trim();
        const phone = newAdmin.phone.trim();
        const password = newAdmin.password;

        if (!name) {
            toast.error('Informe o nome do administrador.');
            return;
        }

        if (!email) {
            toast.error('Informe o e-mail do administrador.');
            return;
        }

        if (!password || password.length < 6) {
            toast.error('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        setAdminCreating(true);

        try {
            const res = await fetch('/api/admin/settings/admins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    email,
                    phone: phone || null,
                    password,
                    permissions: newAdminPerms,
                }),
            });

            let json: ApiResp<AdminApi> | null = null;

            try {
                json = (await res.json()) as ApiResp<AdminApi>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                toast.error(toAdminMessage(code));
                return;
            }

            toast.success('Administrador criado.');

            setNewAdmin({ name: '', email: '', phone: '', password: '' });
            setNewAdminPerms({
                canAccessDashboard: true,
                canAccessRides: true,
                canAccessCategories: false,
                canAccessProducts: false,
                canAccessMembers: true,
                canAccessCommunication: false,
                canAccessReviews: false,
                canAccessFaq: false,
                canAccessReports: false,
                canAccessFinance: false,
                canAccessSettings: false,
            });

            await fetchAdmins();
        } catch {
            toast.error(
                'Não foi possível criar o administrador. Verifique sua conexão.'
            );
        } finally {
            setAdminCreating(false);
        }
    }

    async function toggleAdminActive(adminId: string, nextActive: boolean) {
        const a = admins.find((x) => x.id === adminId) ?? null;
        if (!a) return;

        if (a.isOwner) {
            toast.error('Não é possível alterar o status do dono.');
            return;
        }

        setAdmins((prev) =>
            prev.map((x) =>
                x.id === adminId ? { ...x, isActive: nextActive } : x
            )
        );

        try {
            const res = await fetch(`/api/admin/settings/admins/${adminId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: nextActive }),
            });

            let json: ApiResp<AdminApi> | null = null;

            try {
                json = (await res.json()) as ApiResp<AdminApi>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                toast.error(toAdminMessage(code));

                setAdmins((prev) =>
                    prev.map((x) =>
                        x.id === adminId ? { ...x, isActive: a.isActive } : x
                    )
                );

                return;
            }

            toast.success(nextActive ? 'Admin ativado.' : 'Admin desativado.');
            await fetchAdmins();
        } catch {
            toast.error('Não foi possível alterar o status do admin.');

            setAdmins((prev) =>
                prev.map((x) =>
                    x.id === adminId ? { ...x, isActive: a.isActive } : x
                )
            );
        }
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-title text-content-primary">
                        Configurações
                    </h1>
                    <p className="text-paragraph-medium text-content-secondary">
                        Gerencie os dados da empresa e as permissões dos
                        administradores.
                    </p>
                </div>
            </header>

            <section className="space-y-3">
                <div>
                    <h2 className="text-paragraph-medium font-semibold text-content-primary">
                        Empresa
                    </h2>
                    <p className="text-paragraph-small text-content-secondary">
                        Cadastro principal vinculado ao companyId.
                    </p>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3">
                    {companyLoading ? (
                        <div className="space-y-2">
                            <div className="h-10 w-full rounded-lg bg-background-secondary/60" />
                            <div className="h-10 w-full rounded-lg bg-background-secondary/60" />
                            <p className="text-[11px] text-content-secondary">
                                Carregando empresa…
                            </p>
                        </div>
                    ) : (
                        <form
                            onSubmit={handleSaveCompany}
                            className="space-y-4"
                        >
                            <div className="grid gap-3 md:grid-cols-3">
                                <IconInput
                                    icon={Building2}
                                    placeholder="Nome da empresa"
                                    value={company.name}
                                    onChange={(e) => {
                                        setCompanyError(null);
                                        setCompany((prev) => ({
                                            ...prev,
                                            name: e.target.value,
                                        }));
                                    }}
                                    className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                />

                                <IconInput
                                    icon={MapPin}
                                    placeholder="Cidade"
                                    value={company.city}
                                    onChange={(e) =>
                                        setCompany((prev) => ({
                                            ...prev,
                                            city: e.target.value,
                                        }))
                                    }
                                    className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                />

                                <IconInput
                                    icon={MapPin}
                                    placeholder="Estado"
                                    value={company.state}
                                    onChange={(e) =>
                                        setCompany((prev) => ({
                                            ...prev,
                                            state: e.target.value,
                                        }))
                                    }
                                    className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                />
                            </div>

                            {companyError && (
                                <div className="rounded-xl border p-3 border-destructive/40 bg-destructive/5">
                                    <p className="text-[11px] text-destructive">
                                        {companyError}
                                    </p>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3 flex-wrap">
                                <Button
                                    type="submit"
                                    variant="edit2"
                                    size="sm"
                                    disabled={
                                        companySaving ||
                                        companyLoading ||
                                        !company.name.trim()
                                    }
                                >
                                    {companySaving
                                        ? 'Salvando…'
                                        : 'Salvar empresa'}
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </section>

            <section className="space-y-3">
                <div>
                    <h2 className="text-paragraph-medium font-semibold text-content-primary">
                        Administradores
                    </h2>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3">
                    <form onSubmit={handleCreateAdmin} className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-4">
                            <IconInput
                                icon={User}
                                placeholder="Nome"
                                value={newAdmin.name}
                                onChange={(e) =>
                                    setNewAdmin((p) => ({
                                        ...p,
                                        name: e.target.value,
                                    }))
                                }
                                className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                            />

                            <IconInput
                                icon={Mail}
                                placeholder="E-mail"
                                value={newAdmin.email}
                                onChange={(e) =>
                                    setNewAdmin((p) => ({
                                        ...p,
                                        email: e.target.value,
                                    }))
                                }
                                className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                            />

                            <IconInput
                                icon={Phone}
                                placeholder="Telefone (00) 00000-0000"
                                inputMode="tel"
                                value={newAdmin.phone}
                                onChange={(e) => {
                                    const next = formatPhoneBR(e.target.value);
                                    setNewAdmin((p) => ({ ...p, phone: next }));
                                }}
                                className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                            />

                            <IconInput
                                icon={KeyRound}
                                placeholder="Senha"
                                type="password"
                                value={newAdmin.password}
                                onChange={(e) =>
                                    setNewAdmin((p) => ({
                                        ...p,
                                        password: e.target.value,
                                    }))
                                }
                                className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                            />
                        </div>

                        <div className="flex items-center justify-end">
                            <p className="text-[11px] text-content-secondary">
                                A senha deve ter pelo menos 6 caracteres.
                            </p>
                        </div>

                        <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                            <p className="text-label-small text-content-primary">
                                Permissões iniciais
                            </p>

                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {(
                                    Object.keys(
                                        PERMISSION_LABELS
                                    ) as (keyof PermissionsUI)[]
                                ).map((k) => (
                                    <PermissionBox
                                        key={k}
                                        label={PERMISSION_LABELS[k]}
                                        value={!!newAdminPerms[k]}
                                        disabled={adminCreating}
                                        onToggle={() =>
                                            setNewAdminPerms((prev) => ({
                                                ...prev,
                                                [k]: !prev[k],
                                            }))
                                        }
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 flex-wrap">
                            <Button
                                type="submit"
                                variant="edit2"
                                size="sm"
                                disabled={
                                    adminCreating ||
                                    !newAdmin.name.trim() ||
                                    !newAdmin.email.trim() ||
                                    newAdmin.password.length < 6
                                }
                            >
                                {adminCreating
                                    ? 'Criando…'
                                    : 'Criar administrador'}
                            </Button>
                        </div>
                    </form>
                </div>

                {adminsLoading ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary p-5 space-y-2">
                        <div className="h-10 w-full rounded-lg bg-background-secondary/60" />
                        <div className="h-10 w-full rounded-lg bg-background-secondary/60" />
                        <p className="text-[11px] text-content-secondary">
                            Carregando administradores…
                        </p>
                    </div>
                ) : admins.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary p-5">
                        <p className="text-paragraph-medium text-content-primary font-semibold">
                            Nenhum administrador cadastrado ainda.
                        </p>
                        <p className="text-paragraph-small text-content-secondary mt-1">
                            Crie um admin para delegar acessos do painel.
                        </p>
                    </div>
                ) : (
                    <Accordion type="single" collapsible className="space-y-2">
                        {admins.map((row) => {
                            const pending =
                                pendingPermsByAdminId[row.id] ??
                                clonePerms(row.permissions);
                            const isDirty = !!dirtyPermsByAdminId[row.id];
                            const isSaving = !!savingPermsByAdminId[row.id];

                            return (
                                <AccordionItem
                                    key={row.id}
                                    value={row.id}
                                    className="border border-border-primary rounded-xl bg-background-tertiary"
                                >
                                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                                        <AccordionTrigger className="flex flex-1 items-center gap-6 hover:no-underline px-0 py-0">
                                            <div className="flex flex-col text-left min-w-60 flex-1">
                                                <p className="text-paragraph-medium font-semibold text-content-primary">
                                                    {row.name}
                                                </p>
                                                <p className="text-xs text-content-secondary truncate max-w-65">
                                                    {row.email || 'Sem e-mail'}
                                                </p>
                                            </div>

                                            <div className="hidden md:flex flex-col text-left w-35">
                                                <span className="text-[11px] text-content-secondary">
                                                    Telefone
                                                </span>
                                                <span className="text-xs text-content-primary">
                                                    {row.phone}
                                                </span>
                                            </div>

                                            <div className="hidden sm:flex flex-col text-left w-45">
                                                <span className="text-[11px] text-content-secondary">
                                                    Tipo
                                                </span>
                                                <span className="text-xs text-content-primary">
                                                    {row.isOwner
                                                        ? 'Dono (acesso total)'
                                                        : 'Admin configurável'}
                                                </span>
                                            </div>
                                        </AccordionTrigger>

                                        {!row.isOwner && (
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="edit2"
                                                    size="sm"
                                                    disabled={
                                                        !isDirty || isSaving
                                                    }
                                                    onClick={() =>
                                                        saveAdminPermissions(
                                                            row.id
                                                        )
                                                    }
                                                >
                                                    {isSaving
                                                        ? 'Salvando…'
                                                        : 'Salvar permissões'}
                                                </Button>

                                                <Button
                                                    type="button"
                                                    variant={
                                                        row.isActive
                                                            ? 'destructive'
                                                            : 'active'
                                                    }
                                                    size="sm"
                                                    onClick={() =>
                                                        toggleAdminActive(
                                                            row.id,
                                                            !row.isActive
                                                        )
                                                    }
                                                >
                                                    {row.isActive
                                                        ? 'Desativar'
                                                        : 'Ativar'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    <AccordionContent className="border-t border-border-primary px-4 py-4">
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-2">
                                                <p className="text-label-small text-content-primary">
                                                    Dados do admin
                                                </p>

                                                <div className="space-y-1 text-paragraph-small">
                                                    <p>
                                                        <span className="text-content-secondary">
                                                            Nome:{' '}
                                                        </span>
                                                        <span className="text-content-primary font-medium">
                                                            {row.name}
                                                        </span>
                                                    </p>

                                                    <p>
                                                        <span className="text-content-secondary">
                                                            E-mail:{' '}
                                                        </span>
                                                        <span className="text-content-primary">
                                                            {row.email || '—'}
                                                        </span>
                                                    </p>

                                                    <p>
                                                        <span className="text-content-secondary">
                                                            Telefone:{' '}
                                                        </span>
                                                        <span className="text-content-primary">
                                                            {row.phone}
                                                        </span>
                                                    </p>

                                                    <p>
                                                        <span className="text-content-secondary">
                                                            Cadastrado em:{' '}
                                                        </span>
                                                        <span className="text-content-primary">
                                                            {formatDateTimeBR(
                                                                row.createdAt
                                                            )}
                                                        </span>
                                                    </p>

                                                    <p>
                                                        <span className="text-content-secondary">
                                                            Status:{' '}
                                                        </span>
                                                        <span className="text-content-primary font-medium">
                                                            {row.isActive
                                                                ? 'Ativo'
                                                                : 'Inativo'}
                                                        </span>
                                                    </p>
                                                </div>

                                                {!row.isOwner && isDirty && (
                                                    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                                                        <p className="text-[11px] text-content-secondary">
                                                            Você tem alterações
                                                            pendentes. Clique em{' '}
                                                            <strong className="text-content-primary">
                                                                “Salvar
                                                                permissões”
                                                            </strong>{' '}
                                                            para aplicar.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                                                <p className="text-label-small text-content-primary">
                                                    Permissões de acesso
                                                </p>

                                                {row.isOwner ? (
                                                    <p className="text-paragraph-small text-content-secondary">
                                                        Este usuário é o{' '}
                                                        <strong>dono</strong> do
                                                        estabelecimento e possui
                                                        acesso total a todos os
                                                        módulos.
                                                    </p>
                                                ) : (
                                                    <>
                                                        <div className="grid gap-2 sm:grid-cols-2">
                                                            {(
                                                                Object.keys(
                                                                    PERMISSION_LABELS
                                                                ) as (keyof PermissionsUI)[]
                                                            ).map((k) => (
                                                                <PermissionBox
                                                                    key={k}
                                                                    label={
                                                                        PERMISSION_LABELS[
                                                                            k
                                                                        ]
                                                                    }
                                                                    value={
                                                                        !!pending[
                                                                            k
                                                                        ]
                                                                    }
                                                                    disabled={
                                                                        isSaving
                                                                    }
                                                                    onToggle={() =>
                                                                        togglePermission(
                                                                            row.id,
                                                                            k
                                                                        )
                                                                    }
                                                                />
                                                            ))}
                                                        </div>

                                                        <p className="text-[11px] text-content-secondary">
                                                            Clique nos boxes
                                                            para
                                                            liberar/bloquear.
                                                        </p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                )}
            </section>
        </div>
    );
}
