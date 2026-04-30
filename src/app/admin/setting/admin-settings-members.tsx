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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';

import {
    Building2,
    Phone,
    MapPin,
    Hash,
    Loader2,
    ToggleRight,
    User,
    Mail,
    KeyRound,
} from 'lucide-react';

import { toast } from 'sonner';
import {
    UnitAvailabilityCard,
    type WeeklyDayUI,
} from '@/components/admin/setting/unit-availability-card/unit-availability-card';

type UnitUI = {
    id: string;
    name: string;
    phone: string;
    address: string;
    isActive: boolean;
    createdAt: Date;
};

type CardMachineCreditFeeUI = {
    installments: number;
    feePercent: number | null;
};

type CardMachineUI = {
    id: string;
    name: string;
    debitFee: number | null;
    creditFees: CardMachineCreditFeeUI[];
    isActive: boolean;
};

type PermissionsUI = {
    canAccessDashboard: boolean;
    canAccessReports: boolean;
    canAccessRides: boolean;
    canAccessCategories: boolean;
    canAccessReviews: boolean;
    canAccessFaq: boolean;
    canAccessCommunication: boolean;
    canAccessProducts: boolean;
    canAccessPartners: boolean;
    canAccessMembers: boolean;
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
    segment: 'BARBERSHOP' | 'AESTHETIC';
    isActive: boolean;
};

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type UnitApi = {
    id: string;
    name: string;
    phone: string | null;
    cep: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    address: string | null;
    slotIntervalMinutes: number;
    reminderLeadHours: number;
    bookingWindowDays: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
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

type UnitWeeklyApiItem = {
    weekday: number;
    isActive: boolean;
    startTime: string | null;
    endTime: string | null;
};

type ViaCepResp =
    | {
          cep: string;
          logradouro: string;
          complemento: string;
          bairro: string;
          localidade: string;
          uf: string;
          ibge?: string;
          gia?: string;
          ddd?: string;
          siafi?: string;
          erro?: false;
      }
    | { erro: true };

const WEEKDAY_FULL = [
    'Domingo',
    'Segunda',
    'Terça',
    'Quarta',
    'Quinta',
    'Sexta',
    'Sábado',
] as const;

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

function toUnitMessage(code: string) {
    const map: Record<string, string> = {
        forbidden_owner_only: 'Somente o dono pode criar unidades.',
        unit_name_required: 'Informe o nome da unidade.',
        invalid_json: 'Erro ao enviar dados. Tente novamente.',
        internal_error: 'Erro interno. Tente novamente.',
        forbidden: 'Você não tem permissão para gerenciar unidades.',
        unit_not_found: 'Não foi possível encontrar essa unidade.',
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
        missing_unit:
            'Você precisa ter pelo menos 1 unidade ativa para criar administradores.',
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

function makeDefaultWeekly() {
    return Array.from({ length: 7 }).reduce<Record<number, WeeklyDayUI>>(
        (acc, _, i) => {
            acc[i] =
                i === 0
                    ? { isActive: false, startTime: '', endTime: '' }
                    : { isActive: true, startTime: '09:00', endTime: '18:00' };
            return acc;
        },
        {}
    );
}

function normalizeWeeklyFromApi(items: UnitWeeklyApiItem[] | null | undefined) {
    const base = makeDefaultWeekly();

    if (!Array.isArray(items)) return base;

    for (const item of items) {
        const weekday = Number(item?.weekday);
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;

        base[weekday] = {
            isActive: !!item?.isActive,
            startTime: item?.startTime?.trim() || '',
            endTime: item?.endTime?.trim() || '',
        };
    }

    return base;
}

function normalizeUnitFromApi(u: UnitApi): UnitUI {
    const createdAt = new Date(u.createdAt);
    const addressLine =
        u.address ||
        [u.street, u.number ? `, ${u.number}` : ''].join('').trim() ||
        '—';

    return {
        id: u.id,
        name: u.name,
        phone: u.phone?.trim() ? u.phone : '—',
        address: addressLine || '—',
        isActive: !!u.isActive,
        createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
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
            canAccessReports: !!a.permissions?.canAccessReports,
            canAccessRides: !!a.permissions?.canAccessRides,
            canAccessCategories: !!a.permissions?.canAccessCategories,
            canAccessReviews: !!a.permissions?.canAccessReviews,
            canAccessFaq: !!a.permissions?.canAccessFaq,
            canAccessCommunication: !!a.permissions?.canAccessCommunication,
            canAccessProducts: !!a.permissions?.canAccessProducts,
            canAccessPartners: !!a.permissions?.canAccessPartners,
            canAccessMembers: !!a.permissions?.canAccessMembers,
            canAccessFinance: !!a.permissions?.canAccessFinance,
            canAccessSettings: !!a.permissions?.canAccessSettings,
        },
    };
}

function onlyDigits(v: string) {
    return v.replace(/\D/g, '');
}

function formatCepBR(digits: string) {
    const d = onlyDigits(digits).slice(0, 8);
    if (d.length <= 5) return d;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
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

function asTrimmedOrNull(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t : null;
}

function buildAddressLineClient(input: {
    street?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    cep?: string | null;
    complement?: string | null;
}) {
    const parts: string[] = [];

    const street = asTrimmedOrNull(input.street);
    const number = asTrimmedOrNull(input.number);
    const neighborhood = asTrimmedOrNull(input.neighborhood);
    const city = asTrimmedOrNull(input.city);
    const state = asTrimmedOrNull(input.state);
    const cep = asTrimmedOrNull(input.cep);
    const complement = asTrimmedOrNull(input.complement);

    const streetLine = [street, number ? `, ${number}` : ''].join('').trim();
    if (streetLine) parts.push(streetLine);

    if (complement) parts.push(complement);
    if (neighborhood) parts.push(neighborhood);

    const cityState = [city, state].filter(Boolean).join(' - ');
    if (cityState) parts.push(cityState);

    if (cep) parts.push(`CEP ${cep}`);

    return parts.join(' • ') || '—';
}

const PERMISSION_LABELS: Partial<Record<keyof PermissionsUI, string>> = {
    canAccessDashboard: 'Dashboard',
    canAccessRides: 'Rolês',
    canAccessReports: 'Relatórios',
    canAccessCategories: 'Categorias',
    canAccessReviews: 'Avaliações',
    canAccessFaq: 'Dúvidas',
    canAccessCommunication: 'Comunicação',
    canAccessProducts: 'Produtos',
    canAccessMembers: 'Membros',
    canAccessFinance: 'Financeiro',
    canAccessSettings: 'Configurações',
};

function clonePerms(p: PermissionsUI): PermissionsUI {
    return {
        canAccessDashboard: !!p.canAccessDashboard,
        canAccessReports: !!p.canAccessReports,
        canAccessRides: !!p.canAccessRides,
        canAccessCategories: !!p.canAccessCategories,
        canAccessReviews: !!p.canAccessReviews,
        canAccessFaq: !!p.canAccessFaq,
        canAccessCommunication: !!p.canAccessCommunication,
        canAccessProducts: !!p.canAccessProducts,
        canAccessPartners: !!p.canAccessPartners,
        canAccessMembers: !!p.canAccessMembers,
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
    // =========================
    // EMPRESA (API REAL)
    // =========================
    const [company, setCompany] = React.useState<CompanyUI>({
        id: '',
        name: '',
        segment: 'BARBERSHOP',
        isActive: true,
    });

    const [companyLoading, setCompanyLoading] = React.useState(true);
    const [companySaving, setCompanySaving] = React.useState(false);
    const [companyError, setCompanyError] = React.useState<string | null>(null);

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

                let json: ApiResp<CompanyUI> | null = null;
                try {
                    json = (await res.json()) as ApiResp<CompanyUI>;
                } catch {
                    json = null;
                }

                if (!alive) return;

                if (!res.ok || !json || !json.ok) {
                    const code = json ? safeApiError(json) : 'internal_error';
                    setCompanyError(toCompanyMessage(code));
                    return;
                }

                setCompany({
                    id: json.data.id,
                    name: json.data.name,
                    segment: json.data.segment,
                    isActive: json.data.isActive,
                });
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

        return () => {
            alive = false;
            controller.abort();
        };
    }, []);

    // =========================
    // UNIDADES (API REAL)
    // =========================
    const [units, setUnits] = React.useState<UnitUI[]>([]);
    const [unitsLoading, setUnitsLoading] = React.useState(true);
    const [unitCreating, setUnitCreating] = React.useState(false);

    const [unitDetailsById, setUnitDetailsById] = React.useState<
        Record<string, UnitApi>
    >({});

    const [cardMachinesByUnitId, setCardMachinesByUnitId] = React.useState<
        Record<string, CardMachineUI[]>
    >({});

    const [togglingMachineById, setTogglingMachineById] = React.useState<
        Record<string, boolean>
    >({});

    const [newMachineByUnitId, setNewMachineByUnitId] = React.useState<
        Record<
            string,
            {
                name: string;
                debitFee: string;
                creditFees: Record<number, string>;
            }
        >
    >({});

    const [weeklyByUnitId, setWeeklyByUnitId] = React.useState<
        Record<string, Record<number, WeeklyDayUI>>
    >({});

    const [weeklySavingByUnitId, setWeeklySavingByUnitId] = React.useState<
        Record<string, boolean>
    >({});

    React.useEffect(() => {
        let alive = true;
        const controller = new AbortController();

        async function run() {
            setUnitsLoading(true);

            try {
                const res = await fetch('/api/admin/settings/units', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                });

                let json: ApiResp<UnitApi[]> | null = null;
                try {
                    json = (await res.json()) as ApiResp<UnitApi[]>;
                } catch {
                    json = null;
                }

                if (!alive) return;

                if (!res.ok || !json || !json.ok) {
                    const code = json ? safeApiError(json) : 'internal_error';
                    const msg = toUnitMessage(code);
                    toast.error(msg);
                    setUnits([]);
                    setUnitDetailsById({});
                    return;
                }

                const detailsMap = json.data.reduce<Record<string, UnitApi>>(
                    (acc, u) => {
                        acc[u.id] = u;
                        return acc;
                    },
                    {}
                );
                setUnitDetailsById(detailsMap);

                const mapped = json.data.map(normalizeUnitFromApi);
                setUnits(mapped);

                for (const u of mapped) {
                    fetch(`/api/admin/card-machines?unitId=${u.id}`)
                        .then((r) => r.json())
                        .then((json) => {
                            if (json?.ok) {
                                setCardMachinesByUnitId((prev) => ({
                                    ...prev,
                                    [u.id]: json.data,
                                }));
                            }
                        })
                        .catch(() => {});
                }

                const weeklyEntries = await Promise.all(
                    mapped.map(async (u) => {
                        try {
                            const weeklyRes = await fetch(
                                `/api/admin/settings/units/${u.id}/weekly`,
                                {
                                    method: 'GET',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    signal: controller.signal,
                                }
                            );

                            let weeklyJson: ApiResp<
                                UnitWeeklyApiItem[]
                            > | null = null;
                            try {
                                weeklyJson =
                                    (await weeklyRes.json()) as ApiResp<
                                        UnitWeeklyApiItem[]
                                    >;
                            } catch {
                                weeklyJson = null;
                            }

                            if (!alive) {
                                return [u.id, makeDefaultWeekly()] as const;
                            }

                            if (
                                !weeklyRes.ok ||
                                !weeklyJson ||
                                !weeklyJson.ok
                            ) {
                                return [u.id, makeDefaultWeekly()] as const;
                            }

                            return [
                                u.id,
                                normalizeWeeklyFromApi(weeklyJson.data),
                            ] as const;
                        } catch (err: any) {
                            if (err?.name === 'AbortError') {
                                return [u.id, makeDefaultWeekly()] as const;
                            }
                            return [u.id, makeDefaultWeekly()] as const;
                        }
                    })
                );

                if (!alive) return;

                setWeeklyByUnitId((prev) => ({
                    ...prev,
                    ...Object.fromEntries(weeklyEntries),
                }));
            } catch (err: any) {
                if (!alive) return;
                if (err?.name === 'AbortError') return;
                toast.error(
                    'Não foi possível carregar as unidades. Verifique sua conexão.'
                );
                setUnits([]);
                setUnitDetailsById({});
            } finally {
                if (!alive) return;
                setUnitsLoading(false);
            }
        }

        run();

        return () => {
            alive = false;
            controller.abort();
        };
    }, []);

    // =========================
    // ADMINS (API REAL)
    // =========================
    const [admins, setAdmins] = React.useState<AdminUI[]>([]);
    const [adminsLoading, setAdminsLoading] = React.useState(true);

    // Estado “editável inline” das permissões por admin
    const [pendingPermsByAdminId, setPendingPermsByAdminId] = React.useState<
        Record<string, PermissionsUI>
    >({});
    const [dirtyPermsByAdminId, setDirtyPermsByAdminId] = React.useState<
        Record<string, boolean>
    >({});
    const [savingPermsByAdminId, setSavingPermsByAdminId] = React.useState<
        Record<string, boolean>
    >({});

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

            // sincroniza os “pending” com os valores atuais do backend
            setPendingPermsByAdminId((prev) => {
                const next: Record<string, PermissionsUI> = { ...prev };
                for (const a of mapped) {
                    if (!a.isOwner) next[a.id] = clonePerms(a.permissions);
                }
                return next;
            });

            // limpa dirty quando recarrega do server (fail-safe)
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

        (async () => {
            try {
                setAdminsLoading(true);
                const res = await fetch('/api/admin/settings/admins', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                });

                let json: ApiResp<AdminApi[]> | null = null;
                try {
                    json = (await res.json()) as ApiResp<AdminApi[]>;
                } catch {
                    json = null;
                }

                if (!alive) return;

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
            } catch (err: any) {
                if (!alive) return;
                if (err?.name === 'AbortError') return;
                toast.error(
                    'Não foi possível carregar os administradores. Verifique sua conexão.'
                );
                setAdmins([]);
            } finally {
                if (!alive) return;
                setAdminsLoading(false);
            }
        })();

        return () => {
            alive = false;
            controller.abort();
        };
    }, []);

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

        // dirty só liga depois do primeiro clique (e continua ligado)
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

            // Atualiza o estado local sem precisar abrir modal nem nada
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

    // ====== forms (CREATE UNIT) ======
    const [newUnit, setNewUnit] = React.useState({
        name: '',
        phone: '',
        cep: '',
        number: '',
        complement: '',
        street: '',
        neighborhood: '',
        city: '',
        state: '',
        slotIntervalMinutes: 30, // 👈 NOVO (padrão 30 min)
        reminderLeadHours: 24,
        bookingWindowDays: 30,
    });

    const [cepStatus, setCepStatus] = React.useState<
        'idle' | 'loading' | 'success' | 'error'
    >('idle');
    const [cepError, setCepError] = React.useState<string | null>(null);
    const lastFetchedCepRef = React.useRef<string>('');
    const cepAbortRef = React.useRef<AbortController | null>(null);

    React.useEffect(() => {
        const cepDigits = onlyDigits(newUnit.cep).slice(0, 8);

        if (cepDigits.length < 8) {
            if (cepAbortRef.current) cepAbortRef.current.abort();
            setCepStatus('idle');
            setCepError(null);
            lastFetchedCepRef.current = '';

            setNewUnit((p) => ({
                ...p,
                street: '',
                neighborhood: '',
                city: '',
                state: '',
            }));
            return;
        }

        if (lastFetchedCepRef.current === cepDigits) return;

        (async () => {
            try {
                setCepStatus('loading');
                setCepError(null);

                if (cepAbortRef.current) cepAbortRef.current.abort();
                const controller = new AbortController();
                cepAbortRef.current = controller;

                const res = await fetch(
                    `https://viacep.com.br/ws/${cepDigits}/json/`,
                    {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                        signal: controller.signal,
                    }
                );

                const json = (await res.json()) as ViaCepResp;

                if (!res.ok) throw new Error('FETCH_FAILED');

                if ('erro' in json && json.erro) {
                    lastFetchedCepRef.current = '';
                    setCepStatus('error');
                    setCepError('CEP não encontrado.');

                    setNewUnit((p) => ({
                        ...p,
                        street: '',
                        neighborhood: '',
                        city: '',
                        state: '',
                    }));

                    toast.error('CEP inválido ou não encontrado.');
                    return;
                }

                lastFetchedCepRef.current = cepDigits;
                setCepStatus('success');
                setCepError(null);

                setNewUnit((p) => ({
                    ...p,
                    street: json.logradouro || '',
                    neighborhood: json.bairro || '',
                    city: json.localidade || '',
                    state: json.uf || '',
                }));
            } catch (err: any) {
                if (err?.name === 'AbortError') return;
                lastFetchedCepRef.current = '';
                setCepStatus('error');
                setCepError('Não foi possível buscar o CEP. Tente novamente.');
                toast.error('Não foi possível buscar o endereço pelo CEP.');
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [newUnit.cep]);

    // ====== EDIT UNIT MODAL ======
    const [editOpen, setEditOpen] = React.useState(false);
    const [editingUnitId, setEditingUnitId] = React.useState<string | null>(
        null
    );

    const [editUnitSaving, setEditUnitSaving] = React.useState(false);

    const [editUnit, setEditUnit] = React.useState({
        name: '',
        phone: '',
        cep: '',
        number: '',
        complement: '',
        street: '',
        neighborhood: '',
        city: '',
        state: '',
        slotIntervalMinutes: 30,
        reminderLeadHours: 24,
        bookingWindowDays: 30,
        isActive: true,
    });

    const [editCepStatus, setEditCepStatus] = React.useState<
        'idle' | 'loading' | 'success' | 'error'
    >('idle');
    const [editCepError, setEditCepError] = React.useState<string | null>(null);
    const editLastFetchedCepRef = React.useRef<string>('');
    const editCepAbortRef = React.useRef<AbortController | null>(null);

    async function ensureUnitDetails(unitId: string) {
        if (unitDetailsById[unitId]) return unitDetailsById[unitId];

        try {
            const res = await fetch(`/api/admin/settings/units/${unitId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            let json: ApiResp<UnitApi> | null = null;
            try {
                json = (await res.json()) as ApiResp<UnitApi>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                toast.error(toUnitMessage(code));
                return null;
            }

            setUnitDetailsById((prev) => ({ ...prev, [unitId]: json!.data }));
            return json.data;
        } catch {
            toast.error(
                'Não foi possível carregar a unidade. Verifique a conexão.'
            );
            return null;
        }
    }

    async function openEditUnit(unitId: string) {
        const details = await ensureUnitDetails(unitId);

        if (!details) {
            toast.error(
                'Não foi possível carregar os dados dessa unidade para edição.'
            );
            return;
        }

        const cepDigits = onlyDigits(details.cep || '').slice(0, 8);

        editLastFetchedCepRef.current = cepDigits || '';
        setEditCepStatus(cepDigits.length === 8 ? 'success' : 'idle');
        setEditCepError(null);

        setEditingUnitId(unitId);
        setEditUnit({
            name: details.name || '',
            phone: formatPhoneBR(details.phone || ''),
            cep: cepDigits,
            number: details.number || '',
            complement: details.complement || '',
            street: details.street || '',
            neighborhood: details.neighborhood || '',
            city: details.city || '',
            state: details.state || '',
            slotIntervalMinutes: Number(details.slotIntervalMinutes || 30),
            reminderLeadHours: Number(details.reminderLeadHours || 24),
            bookingWindowDays: Number(details.bookingWindowDays || 30),
            isActive: !!details.isActive,
        });
        setEditOpen(true);
    }

    React.useEffect(() => {
        if (!editOpen) return;

        const cepDigits = onlyDigits(editUnit.cep).slice(0, 8);

        if (cepDigits.length < 8) {
            if (editCepAbortRef.current) editCepAbortRef.current.abort();
            setEditCepStatus('idle');
            setEditCepError(null);
            editLastFetchedCepRef.current = '';

            setEditUnit((p) => ({
                ...p,
                street: '',
                neighborhood: '',
                city: '',
                state: '',
            }));
            return;
        }

        if (editLastFetchedCepRef.current === cepDigits) return;

        (async () => {
            try {
                setEditCepStatus('loading');
                setEditCepError(null);

                if (editCepAbortRef.current) editCepAbortRef.current.abort();
                const controller = new AbortController();
                editCepAbortRef.current = controller;

                const res = await fetch(
                    `https://viacep.com.br/ws/${cepDigits}/json/`,
                    {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                        signal: controller.signal,
                    }
                );

                const json = (await res.json()) as ViaCepResp;

                if (!res.ok) throw new Error('FETCH_FAILED');

                if ('erro' in json && json.erro) {
                    editLastFetchedCepRef.current = '';
                    setEditCepStatus('error');
                    setEditCepError('CEP não encontrado.');

                    setEditUnit((p) => ({
                        ...p,
                        street: '',
                        neighborhood: '',
                        city: '',
                        state: '',
                    }));

                    toast.error('CEP inválido ou não encontrado.');
                    return;
                }

                editLastFetchedCepRef.current = cepDigits;
                setEditCepStatus('success');
                setEditCepError(null);

                setEditUnit((p) => ({
                    ...p,
                    street: json.logradouro || '',
                    neighborhood: json.bairro || '',
                    city: json.localidade || '',
                    state: json.uf || '',
                }));
            } catch (err: any) {
                if (err?.name === 'AbortError') return;
                editLastFetchedCepRef.current = '';
                setEditCepStatus('error');
                setEditCepError(
                    'Não foi possível buscar o CEP. Tente novamente.'
                );
                toast.error('Não foi possível buscar o endereço pelo CEP.');
            }
        })();
    }, [editUnit.cep, editOpen]);

    function closeEditModal() {
        setEditOpen(false);
        setEditingUnitId(null);
        setEditUnitSaving(false);

        if (editCepAbortRef.current) editCepAbortRef.current.abort();
        setEditCepStatus('idle');
        setEditCepError(null);
        editLastFetchedCepRef.current = '';
    }

    async function handleSaveEditUnit(e: React.FormEvent) {
        e.preventDefault();

        if (!editingUnitId) return;

        const name = editUnit.name.trim();
        if (!name) {
            toast.error('Informe o nome da unidade.');
            return;
        }

        const phoneDigits = onlyDigits(editUnit.phone);
        if (editUnit.phone.trim() && phoneDigits.length < 10) {
            toast.error('Informe um telefone válido.');
            return;
        }

        const cepDigits = onlyDigits(editUnit.cep).slice(0, 8);
        if (editUnit.cep.trim() && cepDigits.length !== 8) {
            toast.error('Informe um CEP válido.');
            return;
        }

        setEditUnitSaving(true);
        try {
            const res = await fetch(
                `/api/admin/settings/units/${editingUnitId}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        phone: editUnit.phone.trim() || null,
                        cep: cepDigits || null,
                        street: editUnit.street.trim() || null,
                        number: editUnit.number.trim() || null,
                        complement: editUnit.complement.trim() || null,
                        neighborhood: editUnit.neighborhood.trim() || null,
                        city: editUnit.city.trim() || null,
                        state: editUnit.state.trim() || null,
                        slotIntervalMinutes: editUnit.slotIntervalMinutes,
                        reminderLeadHours: Math.max(
                            1,
                            Math.min(
                                168,
                                Number(editUnit.reminderLeadHours) || 24
                            )
                        ),
                        bookingWindowDays: Math.max(
                            1,
                            Math.min(
                                365,
                                Number(editUnit.bookingWindowDays) || 30
                            )
                        ),
                        isActive: !!editUnit.isActive,
                    }),
                }
            );

            let json: ApiResp<UnitApi> | null = null;
            try {
                json = (await res.json()) as ApiResp<UnitApi>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                toast.error(toUnitMessage(code));
                return;
            }

            const updated = json.data;

            setUnitDetailsById((prev) => ({
                ...prev,
                [updated.id]: updated,
            }));

            setUnits((prev) =>
                prev.map((u) =>
                    u.id === updated.id ? normalizeUnitFromApi(updated) : u
                )
            );

            toast.success('Unidade atualizada.');
            closeEditModal();
        } catch {
            toast.error(
                'Não foi possível salvar a unidade. Verifique sua conexão.'
            );
        } finally {
            setEditUnitSaving(false);
        }
    }

    // =========================
    // ADMIN (CREATE)
    // =========================
    const [newAdmin, setNewAdmin] = React.useState({
        name: '',
        email: '',
        phone: '',
        password: '',
    });

    const [newAdminPerms, setNewAdminPerms] = React.useState<PermissionsUI>({
        canAccessDashboard: true,
        canAccessReports: false,
        canAccessRides: true,
        canAccessCategories: false,
        canAccessReviews: false,
        canAccessFaq: false,
        canAccessCommunication: false,
        canAccessProducts: false,
        canAccessPartners: false,
        canAccessMembers: true,
        canAccessFinance: false,
        canAccessSettings: false,
    });

    const [adminCreating, setAdminCreating] = React.useState(false);

    function openDaysCount(unitId: string) {
        const w = weeklyByUnitId[unitId] || {};
        return Object.values(w).filter(
            (d) => d.isActive && d.startTime && d.endTime
        ).length;
    }

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
                    segment: company.segment,
                    isActive: company.isActive,
                }),
            });

            let json: ApiResp<CompanyUI> | null = null;
            try {
                json = (await res.json()) as ApiResp<CompanyUI>;
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

            setCompany({
                id: json.data.id,
                name: json.data.name,
                segment: json.data.segment,
                isActive: json.data.isActive,
            });

            toast.success('Empresa salva.');
        } catch {
            const msg = 'Não foi possível salvar. Verifique sua conexão.';
            setCompanyError(msg);
            toast.error(msg);
        } finally {
            setCompanySaving(false);
        }
    }

    async function handleCreateUnit(e: React.FormEvent) {
        e.preventDefault();

        const name = newUnit.name.trim();
        if (!name) {
            toast.error('Informe o nome da unidade.');
            return;
        }

        const phoneDigits = onlyDigits(newUnit.phone);
        if (newUnit.phone.trim() && phoneDigits.length < 10) {
            toast.error('Informe um telefone válido.');
            return;
        }

        const cepDigits = onlyDigits(newUnit.cep).slice(0, 8);
        if (newUnit.cep.trim() && cepDigits.length !== 8) {
            toast.error('Informe um CEP válido.');
            return;
        }

        setUnitCreating(true);
        try {
            const res = await fetch('/api/admin/settings/units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    phone: newUnit.phone.trim() || null,
                    cep: cepDigits || null,
                    street: newUnit.street.trim() || null,
                    number: newUnit.number.trim() || null,
                    complement: newUnit.complement.trim() || null,
                    neighborhood: newUnit.neighborhood.trim() || null,
                    city: newUnit.city.trim() || null,
                    state: newUnit.state.trim() || null,
                    slotIntervalMinutes: newUnit.slotIntervalMinutes,
                    reminderLeadHours: Math.max(
                        1,
                        Math.min(168, Number(newUnit.reminderLeadHours) || 24)
                    ),
                    bookingWindowDays: Math.max(
                        1,
                        Math.min(365, Number(newUnit.bookingWindowDays) || 30)
                    ),
                    address: buildAddressLineClient({
                        street: newUnit.street,
                        number: newUnit.number,
                        complement: newUnit.complement,
                        neighborhood: newUnit.neighborhood,
                        city: newUnit.city,
                        state: newUnit.state,
                        cep: formatCepBR(cepDigits),
                    }),
                }),
            });

            let json: ApiResp<UnitApi> | null = null;
            try {
                json = (await res.json()) as ApiResp<UnitApi>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                const msg = toUnitMessage(code);
                toast.error(msg);
                return;
            }

            setUnitDetailsById((prev) => ({
                ...prev,
                [json!.data.id]: json!.data,
            }));

            const created = normalizeUnitFromApi(json.data);

            setUnits((prev) => [created, ...prev]);
            setWeeklyByUnitId((prev) => ({
                ...prev,
                [created.id]: prev[created.id] || makeDefaultWeekly(),
            }));

            setNewUnit({
                name: '',
                phone: '',
                cep: '',
                number: '',
                complement: '',
                street: '',
                neighborhood: '',
                city: '',
                state: '',
                slotIntervalMinutes: 30,
                reminderLeadHours: 24,
                bookingWindowDays: 30,
            });
            setCepStatus('idle');
            setCepError(null);
            lastFetchedCepRef.current = '';

            toast.success('Unidade criada.');
        } catch {
            toast.error(
                'Não foi possível criar a unidade. Verifique sua conexão.'
            );
        } finally {
            setUnitCreating(false);
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

            // limpa form (senha some da tela rapidinho ✅)
            setNewAdmin({ name: '', email: '', phone: '', password: '' });
            setNewAdminPerms({
                canAccessDashboard: true,
                canAccessReports: false,
                canAccessRides: true,
                canAccessCategories: false,
                canAccessReviews: false,
                canAccessFaq: false,
                canAccessCommunication: false,
                canAccessProducts: false,
                canAccessPartners: false,
                canAccessMembers: true,
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

    async function handleSaveWeekly(unitId: string, e: React.FormEvent) {
        e.preventDefault();

        const weekly = weeklyByUnitId[unitId] ?? makeDefaultWeekly();

        for (let i = 0; i < 7; i++) {
            const d = weekly[i] ?? {
                isActive: false,
                startTime: '',
                endTime: '',
            };
            if (!d.isActive) continue;

            const st = String(d.startTime || '').trim();
            const et = String(d.endTime || '').trim();

            if (!st || !et) {
                toast.error(
                    `Informe horário completo em ${WEEKDAY_FULL[i] ?? `Dia ${i}`}.`
                );
                return;
            }

            if (st >= et) {
                toast.error(
                    `Horário inválido em ${WEEKDAY_FULL[i] ?? `Dia ${i}`}: "Das" deve ser menor que "Até".`
                );
                return;
            }
        }

        setWeeklySavingByUnitId((prev) => ({ ...prev, [unitId]: true }));

        try {
            const payload = {
                weekly: Array.from({ length: 7 }).map((_, weekday) => {
                    const d =
                        weekly[weekday] ??
                        ({
                            isActive: false,
                            startTime: '',
                            endTime: '',
                        } as WeeklyDayUI);

                    return {
                        weekday,
                        isActive: !!d.isActive,
                        startTime: String(d.startTime || '').trim() || null,
                        endTime: String(d.endTime || '').trim() || null,
                    };
                }),
            };

            const res = await fetch(
                `/api/admin/settings/units/${unitId}/weekly`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                }
            );

            let json: ApiResp<any> | null = null;
            try {
                json = (await res.json()) as ApiResp<any>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                toast.error(toUnitMessage(code));
                return;
            }

            toast.success('Padrão semanal salvo.');
        } catch {
            toast.error('Não foi possível salvar o padrão semanal.');
        } finally {
            setWeeklySavingByUnitId((prev) => ({ ...prev, [unitId]: false }));
        }
    }

    async function handleCreateMachine(unitId: string) {
        const form = newMachineByUnitId[unitId] ?? {
            name: '',
            debitFee: '',
            creditFees: {},
        };

        const name = form.name.trim();
        if (!name) {
            toast.error('Informe o nome da máquina.');
            return;
        }

        const debitFee =
            form.debitFee.trim() === ''
                ? 0
                : Number(form.debitFee.replace(',', '.'));

        const creditFees = Array.from({ length: 12 }, (_, index) => {
            const installments = index + 1;
            const raw = form.creditFees?.[installments] ?? '';
            const feePercent =
                raw.trim() === '' ? 0 : Number(raw.replace(',', '.'));

            return {
                installments,
                feePercent,
            };
        });

        if (!Number.isFinite(debitFee) || debitFee < 0) {
            toast.error('Informe uma taxa de débito válida.');
            return;
        }

        for (const item of creditFees) {
            if (!Number.isFinite(item.feePercent) || item.feePercent < 0) {
                toast.error(
                    `Informe uma taxa de crédito válida para ${item.installments}x.`
                );
                return;
            }
        }

        try {
            const res = await fetch('/api/admin/card-machines', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unitId,
                    name,
                    debitFee,
                    creditFees,
                }),
            });

            let json: any = null;
            try {
                json = await res.json();
            } catch {
                json = null;
            }

            if (!res.ok || !json?.ok) {
                if (json?.error === 'machine_name_already_exists') {
                    toast.error(
                        'Já existe uma máquina com esse nome nesta unidade.'
                    );
                    return;
                }

                toast.error('Não foi possível criar a máquina.');
                return;
            }

            setCardMachinesByUnitId((prev) => ({
                ...prev,
                [unitId]: [...(prev[unitId] || []), json.data],
            }));

            setNewMachineByUnitId((prev) => ({
                ...prev,
                [unitId]: {
                    name: '',
                    debitFee: '',
                    creditFees: {},
                },
            }));

            toast.success('Máquina cadastrada.');
        } catch {
            toast.error('Erro ao criar máquina.');
        }
    }

    async function toggleCardMachineActive(
        unitId: string,
        machineId: string,
        nextActive: boolean
    ) {
        const machine =
            (cardMachinesByUnitId[unitId] || []).find(
                (m) => m.id === machineId
            ) ?? null;

        if (!machine) {
            toast.error('Máquina não encontrada.');
            return;
        }

        setTogglingMachineById((prev) => ({
            ...prev,
            [machineId]: true,
        }));

        try {
            const res = await fetch(
                `/api/admin/card-machines/${machineId}/active`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        isActive: nextActive,
                    }),
                }
            );

            let json: any = null;
            try {
                json = await res.json();
            } catch {
                json = null;
            }

            if (!res.ok || !json?.ok) {
                toast.error(
                    nextActive
                        ? 'Não foi possível ativar a máquina.'
                        : 'Não foi possível inativar a máquina.'
                );
                return;
            }

            setCardMachinesByUnitId((prev) => ({
                ...prev,
                [unitId]: (prev[unitId] || []).map((m) =>
                    m.id === machineId ? { ...m, isActive: nextActive } : m
                ),
            }));

            toast.success(
                nextActive ? 'Máquina ativada.' : 'Máquina inativada.'
            );
        } catch {
            toast.error(
                nextActive
                    ? 'Erro ao ativar máquina.'
                    : 'Erro ao inativar máquina.'
            );
        } finally {
            setTogglingMachineById((prev) => ({
                ...prev,
                [machineId]: false,
            }));
        }
    }

    async function toggleAdminActive(adminId: string, nextActive: boolean) {
        const a = admins.find((x) => x.id === adminId) ?? null;
        if (!a) return;
        if (a.isOwner) {
            toast.error('Não é possível alterar o status do dono.');
            return;
        }

        // otimista visual
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
                // rollback
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
            // rollback
            setAdmins((prev) =>
                prev.map((x) =>
                    x.id === adminId ? { ...x, isActive: a.isActive } : x
                )
            );
        }
    }

    async function toggleUnitActive(unitId: string, nextActive: boolean) {
        const unit = units.find((u) => u.id === unitId);
        if (!unit) return;

        // otimista
        setUnits((prev) =>
            prev.map((u) =>
                u.id === unitId ? { ...u, isActive: nextActive } : u
            )
        );

        try {
            const res = await fetch(`/api/admin/settings/units/${unitId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    isActive: nextActive,
                }),
            });

            let json: ApiResp<UnitApi> | null = null;
            try {
                json = (await res.json()) as ApiResp<UnitApi>;
            } catch {
                json = null;
            }

            if (!res.ok || !json || !json.ok) {
                const code = json ? safeApiError(json) : 'internal_error';
                toast.error(toUnitMessage(code));

                // rollback
                setUnits((prev) =>
                    prev.map((u) =>
                        u.id === unitId ? { ...u, isActive: unit.isActive } : u
                    )
                );
                return;
            }

            toast.success(
                nextActive ? 'Unidade ativada.' : 'Unidade desativada.'
            );
        } catch {
            toast.error('Erro ao alterar status da unidade.');

            // rollback
            setUnits((prev) =>
                prev.map((u) =>
                    u.id === unitId ? { ...u, isActive: unit.isActive } : u
                )
            );
        }
    }

    const cepMasked = formatCepBR(newUnit.cep);
    const editCepMasked = formatCepBR(editUnit.cep);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* =========================
             * MODAL: EDITAR UNIDADE
             * ========================= */}
            <Dialog
                open={editOpen}
                onOpenChange={(v) => (v ? setEditOpen(true) : closeEditModal())}
            >
                <DialogContent
                    // Se o seu DialogContent suportar esses props (igual ao AppointmentForm), use:
                    variant="appointment"
                    overlayVariant="blurred"
                    showCloseButton
                    // fallback caso seu DS ignore/nao tenha variant:
                    className="sm:max-w-180"
                >
                    <DialogHeader>
                        <DialogTitle size="modal">Editar unidade</DialogTitle>
                        <DialogDescription size="modal">
                            Atualize as informações da unidade. O endereço é
                            preenchido pelo CEP.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveEditUnit} className="space-y-4">
                        {/* NOME */}
                        <div className="space-y-2">
                            <label className="text-label-medium-size text-content-primary">
                                Nome da unidade
                            </label>

                            <div className="relative">
                                <Building2
                                    className="absolute left-3 top-1/2 -translate-y-1/2 transform text-content-brand"
                                    size={20}
                                />
                                <Input
                                    placeholder="Nome"
                                    value={editUnit.name}
                                    onChange={(e) =>
                                        setEditUnit((p) => ({
                                            ...p,
                                            name: e.target.value,
                                        }))
                                    }
                                    className="pl-10 bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                />
                            </div>
                        </div>

                        {/* TELEFONE + CEP */}
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Telefone
                                </label>

                                <div className="relative">
                                    <Phone
                                        className="absolute left-3 top-1/2 -translate-y-1/2 transform text-content-brand"
                                        size={20}
                                    />
                                    <Input
                                        placeholder="(00) 00000-0000"
                                        inputMode="tel"
                                        value={editUnit.phone}
                                        onChange={(e) => {
                                            const next = formatPhoneBR(
                                                e.target.value
                                            );
                                            setEditUnit((p) => ({
                                                ...p,
                                                phone: next,
                                            }));
                                        }}
                                        className="pl-10 bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    CEP
                                </label>

                                <div className="relative">
                                    <MapPin
                                        className="absolute left-3 top-1/2 -translate-y-1/2 transform text-content-brand"
                                        size={20}
                                    />
                                    <Input
                                        placeholder="00000-000"
                                        inputMode="numeric"
                                        value={editCepMasked}
                                        onChange={(e) => {
                                            const cepDigits = onlyDigits(
                                                e.target.value
                                            ).slice(0, 8);

                                            if (
                                                cepDigits !==
                                                editLastFetchedCepRef.current
                                            ) {
                                                editLastFetchedCepRef.current =
                                                    '';
                                            }

                                            setEditUnit((p) => ({
                                                ...p,
                                                cep: cepDigits,
                                            }));
                                        }}
                                        className="pl-10 bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                    />
                                </div>

                                {editCepStatus === 'loading' ? (
                                    <p className="text-[11px] text-content-secondary flex items-center gap-2">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Buscando endereço…
                                    </p>
                                ) : editCepError ? (
                                    <p className="text-[11px] text-destructive">
                                        {editCepError}
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        {/* ENDEREÇO */}
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Endereço
                                </label>

                                <div className="relative">
                                    <MapPin
                                        className="absolute left-3 top-1/2 -translate-y-1/2 transform text-content-brand"
                                        size={20}
                                    />
                                    <Input
                                        placeholder="Endereço"
                                        value={editUnit.street}
                                        disabled
                                        className="pl-10 bg-background-tertiary border-border-primary text-content-primary disabled:opacity-60"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Número
                                </label>

                                <div className="relative">
                                    <Hash
                                        className="absolute left-3 top-1/2 -translate-y-1/2 transform text-content-brand"
                                        size={20}
                                    />
                                    <Input
                                        placeholder="Número"
                                        value={editUnit.number}
                                        onChange={(e) =>
                                            setEditUnit((p) => ({
                                                ...p,
                                                number: e.target.value,
                                            }))
                                        }
                                        className="pl-10 bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Complemento
                                </label>

                                <Input
                                    placeholder="Complemento"
                                    value={editUnit.complement}
                                    onChange={(e) =>
                                        setEditUnit((p) => ({
                                            ...p,
                                            complement: e.target.value,
                                        }))
                                    }
                                    className="bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Bairro
                                </label>
                                <Input
                                    placeholder="Bairro"
                                    value={editUnit.neighborhood}
                                    disabled
                                    className="bg-background-tertiary border-border-primary text-content-primary disabled:opacity-60"
                                />
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Cidade
                                </label>
                                <Input
                                    placeholder="Cidade"
                                    value={editUnit.city}
                                    disabled
                                    className="bg-background-tertiary border-border-primary text-content-primary disabled:opacity-60"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Estado
                                </label>
                                <Input
                                    placeholder="Estado"
                                    value={editUnit.state}
                                    disabled
                                    className="bg-background-tertiary border-border-primary text-content-primary disabled:opacity-60"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            {/* ⏱️ INTERVALO DA AGENDA */}
                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Intervalo da agenda
                                </label>

                                <Select
                                    value={String(editUnit.slotIntervalMinutes)}
                                    onValueChange={(value) =>
                                        setEditUnit((prev) => ({
                                            ...prev,
                                            slotIntervalMinutes: Number(value),
                                        }))
                                    }
                                >
                                    <SelectTrigger className="bg-background-tertiary border-border-primary text-content-primary">
                                        <SelectValue placeholder="Selecione o intervalo" />
                                    </SelectTrigger>

                                    <SelectContent>
                                        <SelectItem value="15">
                                            15 minutos
                                        </SelectItem>
                                        <SelectItem value="30">
                                            30 minutos
                                        </SelectItem>
                                        <SelectItem value="45">
                                            45 minutos
                                        </SelectItem>
                                        <SelectItem value="60">
                                            60 minutos
                                        </SelectItem>
                                    </SelectContent>
                                </Select>

                                <p className="text-[11px] text-content-secondary">
                                    Define de quanto em quanto tempo os horários
                                    serão exibidos na agenda.
                                </p>
                            </div>

                            {/* 🔔 ANTECEDÊNCIA DO LEMBRETE */}
                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Antecedência do lembrete
                                </label>

                                <Input
                                    type="number"
                                    min={1}
                                    max={168}
                                    step={1}
                                    placeholder="24"
                                    value={editUnit.reminderLeadHours}
                                    onChange={(e) =>
                                        setEditUnit((prev) => ({
                                            ...prev,
                                            reminderLeadHours: Number(
                                                e.target.value
                                            ),
                                        }))
                                    }
                                    className="bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                />

                                <p className="text-[11px] text-content-secondary">
                                    Define com quantas horas de antecedência o
                                    WhatsApp enviará o lembrete de confirmação.
                                </p>
                            </div>

                            {/* 📅 AGENDA ABERTA PARA CLIENTE */}
                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Agenda aberta para cliente
                                </label>

                                <Input
                                    type="number"
                                    min={1}
                                    max={365}
                                    step={1}
                                    placeholder="30"
                                    value={editUnit.bookingWindowDays}
                                    onChange={(e) =>
                                        setEditUnit((prev) => ({
                                            ...prev,
                                            bookingWindowDays: Number(
                                                e.target.value
                                            ),
                                        }))
                                    }
                                    className="bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                />

                                <p className="text-[11px] text-content-secondary">
                                    Define por quantos dias à frente o cliente
                                    poderá agendar no app e no WhatsApp.
                                </p>
                            </div>
                        </div>

                        <DialogFooter className="gap-2 sm:gap-3">
                            <Button
                                type="submit"
                                variant="edit2"
                                size="sm"
                                disabled={
                                    editUnitSaving ||
                                    !editUnit.name.trim() ||
                                    editCepStatus === 'loading'
                                }
                            >
                                {editUnitSaving && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Salvar
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={closeEditModal}
                                disabled={editUnitSaving}
                            >
                                Cancelar
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <header className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-title text-content-primary">
                        Configurações
                    </h1>
                    <p className="text-paragraph-medium text-content-secondary">
                        Gerencie unidades e controle quais administradores têm
                        acesso a cada módulo do painel.
                    </p>
                </div>
            </header>

            {/* =========================
             * EMPRESA
             * ========================= */}
            <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-paragraph-medium font-semibold text-content-primary">
                            Empresa
                        </h2>
                    </div>
                </div>

                <div className="grid gap-3">
                    <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3">
                        {companyLoading ? (
                            <div className="space-y-2">
                                <div className="h-10 w-full rounded-lg bg-background-secondary/60" />
                                <div className="h-9 w-40 rounded-lg bg-background-secondary/60 ml-auto" />
                                <p className="text-[11px] text-content-secondary">
                                    Carregando empresa…
                                </p>
                            </div>
                        ) : (
                            <form
                                onSubmit={handleSaveCompany}
                                className="space-y-3"
                            >
                                <div className="space-y-1">
                                    <IconInput
                                        icon={Building2}
                                        name="companyName"
                                        value={company.name}
                                        onChange={(e) => {
                                            setCompanyError(null);
                                            setCompany((prev) => ({
                                                ...prev,
                                                name: e.target.value,
                                            }));
                                        }}
                                        placeholder="Nome da empresa"
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
                </div>
            </section>

            {/* =========================
             * UNIDADES
             * ========================= */}
            <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-paragraph-medium font-semibold text-content-primary">
                            Unidades
                        </h2>
                    </div>
                </div>

                {/* CREATE */}
                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3">
                    <form onSubmit={handleCreateUnit} className="space-y-3">
                        {/* NOME + TELEFONE + CEP na mesma linha */}
                        <div className="grid gap-3 md:grid-cols-3">
                            <IconInput
                                icon={Building2}
                                placeholder="Nome"
                                value={newUnit.name}
                                onChange={(e) =>
                                    setNewUnit((p) => ({
                                        ...p,
                                        name: e.target.value,
                                    }))
                                }
                                className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                            />

                            <IconInput
                                icon={Phone}
                                placeholder="Telefone (00) 00000-0000"
                                inputMode="tel"
                                value={newUnit.phone}
                                onChange={(e) => {
                                    const next = formatPhoneBR(e.target.value);
                                    setNewUnit((p) => ({ ...p, phone: next }));
                                }}
                                className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                            />

                            <div className="space-y-1">
                                <IconInput
                                    icon={MapPin}
                                    placeholder="CEP"
                                    inputMode="numeric"
                                    value={cepMasked}
                                    onChange={(e) => {
                                        const cepDigits = onlyDigits(
                                            e.target.value
                                        ).slice(0, 8);

                                        if (
                                            cepDigits !==
                                            lastFetchedCepRef.current
                                        ) {
                                            lastFetchedCepRef.current = '';
                                        }

                                        setNewUnit((p) => ({
                                            ...p,
                                            cep: cepDigits,
                                        }));
                                    }}
                                    className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                />

                                {cepStatus === 'loading' ? (
                                    <p className="text-[11px] text-content-secondary flex items-center gap-2">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Buscando endereço…
                                    </p>
                                ) : cepError ? (
                                    <p className="text-[11px] text-destructive">
                                        {cepError}
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        {/* ENDEREÇO */}
                        <div className="grid gap-3 md:grid-cols-3">
                            <IconInput
                                icon={MapPin}
                                placeholder="Endereço"
                                value={newUnit.street}
                                disabled
                                disabledIcon
                                className="bg-background-secondary border-border-primary text-content-primary md:col-span-2 disabled:opacity-70"
                            />

                            <IconInput
                                icon={Hash}
                                placeholder="Número"
                                value={newUnit.number}
                                onChange={(e) =>
                                    setNewUnit((p) => ({
                                        ...p,
                                        number: e.target.value,
                                    }))
                                }
                                className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                            />

                            <IconInput
                                icon={ToggleRight}
                                placeholder="Complemento"
                                value={newUnit.complement}
                                onChange={(e) =>
                                    setNewUnit((p) => ({
                                        ...p,
                                        complement: e.target.value,
                                    }))
                                }
                                className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                            />

                            <IconInput
                                icon={MapPin}
                                placeholder="Bairro"
                                value={newUnit.neighborhood}
                                disabled
                                disabledIcon
                                className="bg-background-secondary border-border-primary text-content-primary md:col-span-2 disabled:opacity-70"
                            />

                            <IconInput
                                icon={MapPin}
                                placeholder="Cidade"
                                value={newUnit.city}
                                disabled
                                disabledIcon
                                className="bg-background-secondary border-border-primary text-content-primary md:col-span-2 disabled:opacity-70"
                            />

                            <IconInput
                                icon={MapPin}
                                placeholder="Estado"
                                value={newUnit.state}
                                disabled
                                disabledIcon
                                className="bg-background-secondary border-border-primary text-content-primary disabled:opacity-70"
                            />
                        </div>

                        <div className="grid gap-3 md:grid-cols-4">
                            {/* ⏱️ INTERVALO DE AGENDA */}
                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Intervalo da agenda
                                </label>

                                <Select
                                    value={String(newUnit.slotIntervalMinutes)}
                                    onValueChange={(value) =>
                                        setNewUnit((prev) => ({
                                            ...prev,
                                            slotIntervalMinutes: Number(value),
                                        }))
                                    }
                                >
                                    <SelectTrigger className="bg-background-secondary border-border-primary text-content-primary">
                                        <SelectValue placeholder="Selecione o intervalo" />
                                    </SelectTrigger>

                                    <SelectContent>
                                        <SelectItem value="15">
                                            15 minutos
                                        </SelectItem>
                                        <SelectItem value="30">
                                            30 minutos
                                        </SelectItem>
                                        <SelectItem value="45">
                                            45 minutos
                                        </SelectItem>
                                        <SelectItem value="60">
                                            60 minutos
                                        </SelectItem>
                                    </SelectContent>
                                </Select>

                                <p className="text-[11px] text-content-secondary">
                                    Define de quanto em quanto tempo os horários
                                    serão exibidos na agenda.
                                </p>
                            </div>

                            {/* 🔔 ANTECEDÊNCIA DO LEMBRETE */}
                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Antecedência do lembrete
                                </label>

                                <Input
                                    type="number"
                                    min={1}
                                    max={168}
                                    step={1}
                                    placeholder="24"
                                    value={newUnit.reminderLeadHours}
                                    onChange={(e) =>
                                        setNewUnit((prev) => ({
                                            ...prev,
                                            reminderLeadHours: Number(
                                                e.target.value
                                            ),
                                        }))
                                    }
                                    className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                />

                                <p className="text-[11px] text-content-secondary">
                                    Define com quantas horas de antecedência o
                                    WhatsApp enviará o lembrete de confirmação.
                                </p>
                            </div>

                            {/* 📅 AGENDA ABERTA PARA CLIENTE */}
                            <div className="space-y-2">
                                <label className="text-label-medium-size text-content-primary">
                                    Agenda aberta para cliente
                                </label>

                                <Input
                                    type="number"
                                    min={1}
                                    max={365}
                                    step={1}
                                    placeholder="30"
                                    value={newUnit.bookingWindowDays}
                                    onChange={(e) =>
                                        setNewUnit((prev) => ({
                                            ...prev,
                                            bookingWindowDays: Number(
                                                e.target.value
                                            ),
                                        }))
                                    }
                                    className="bg-background-secondary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                />

                                <p className="text-[11px] text-content-secondary">
                                    Define por quantos dias à frente o cliente
                                    poderá agendar no app e no WhatsApp.
                                </p>
                            </div>

                            <div className="flex items-end justify-end">
                                <Button
                                    type="submit"
                                    variant="edit2"
                                    size="sm"
                                    disabled={
                                        unitCreating ||
                                        !newUnit.name.trim() ||
                                        cepStatus === 'loading'
                                    }
                                >
                                    {unitCreating
                                        ? 'Criando…'
                                        : 'Criar unidade'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* LISTA */}
                {unitsLoading ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary p-5 space-y-2">
                        <div className="h-10 w-full rounded-lg bg-background-secondary/60" />
                        <div className="h-10 w-full rounded-lg bg-background-secondary/60" />
                        <p className="text-[11px] text-content-secondary">
                            Carregando unidades…
                        </p>
                    </div>
                ) : units.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary p-5">
                        <p className="text-paragraph-medium text-content-primary font-semibold">
                            Você ainda não tem nenhuma unidade cadastrada.
                        </p>
                        <p className="text-paragraph-small text-content-secondary mt-1">
                            Use o formulário acima para criar a primeira.
                        </p>
                    </div>
                ) : (
                    <Accordion type="single" collapsible className="space-y-2">
                        {units.map((unit) => {
                            const openCount = openDaysCount(unit.id);
                            const isSavingWeekly =
                                !!weeklySavingByUnitId[unit.id];

                            return (
                                <AccordionItem
                                    key={unit.id}
                                    value={unit.id}
                                    className="border border-border-primary rounded-xl bg-background-tertiary"
                                >
                                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                                        <AccordionTrigger className="flex flex-1 items-center gap-6 hover:no-underline px-0 py-0">
                                            <div className="flex flex-col text-left min-w-60 flex-1">
                                                <p className="text-paragraph-medium font-semibold text-content-primary">
                                                    {unit.name}
                                                </p>

                                                <p className="text-xs text-content-secondary truncate max-w-155">
                                                    Telefone:{' '}
                                                    <span className="text-content-primary">
                                                        {unit.phone || '—'}
                                                    </span>{' '}
                                                    • Endereço:{' '}
                                                    <span className="text-content-primary">
                                                        {unit.address || '—'}
                                                    </span>{' '}
                                                    • Status:{' '}
                                                    <span className="text-content-primary">
                                                        {unit.isActive
                                                            ? 'Ativa'
                                                            : 'Inativa'}
                                                    </span>
                                                </p>

                                                <p className="mt-1 text-[11px] text-content-secondary">
                                                    Criada em{' '}
                                                    {formatDateTimeBR(
                                                        unit.createdAt
                                                    )}
                                                </p>
                                            </div>

                                            <div className="hidden md:flex items-center gap-2">
                                                <Badge variant="outline">
                                                    {openCount === 0
                                                        ? 'Sem horário'
                                                        : openCount === 1
                                                          ? '1 dia com horário'
                                                          : `${openCount} dias com horário`}
                                                </Badge>

                                                <Badge variant="outline">
                                                    {unit.isActive
                                                        ? 'Unidade ativa'
                                                        : 'Unidade inativa'}
                                                </Badge>
                                            </div>
                                        </AccordionTrigger>

                                        <div className="pt-2 flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="edit2"
                                                size="sm"
                                                onClick={() =>
                                                    openEditUnit(unit.id)
                                                }
                                            >
                                                Editar
                                            </Button>

                                            <Button
                                                type="button"
                                                variant={
                                                    unit.isActive
                                                        ? 'destructive'
                                                        : 'active'
                                                }
                                                size="sm"
                                                onClick={() =>
                                                    toggleUnitActive(
                                                        unit.id,
                                                        !unit.isActive
                                                    )
                                                }
                                            >
                                                {unit.isActive
                                                    ? 'Desativar'
                                                    : 'Ativar'}
                                            </Button>
                                        </div>
                                    </div>

                                    <AccordionContent className="border-t border-border-primary px-4 py-4 space-y-4">
                                        <UnitAvailabilityCard
                                            unitId={unit.id}
                                            weekly={
                                                weeklyByUnitId[unit.id] ??
                                                makeDefaultWeekly()
                                            }
                                            setWeeklyByUnitIdAction={
                                                setWeeklyByUnitId
                                            }
                                            onSubmitWeeklyAction={(id, e) => {
                                                if (isSavingWeekly) return;
                                                return handleSaveWeekly(id, e);
                                            }}
                                            onCreateExceptionAction={() =>
                                                alert(
                                                    'UI only: criar exceção/folga'
                                                )
                                            }
                                        />

                                        <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-4">
                                            <div>
                                                <p className="text-label-small text-content-primary">
                                                    Máquinas de cartão
                                                </p>
                                                <p className="text-paragraph-small text-content-secondary mt-1">
                                                    Cadastre as máquinas
                                                    disponíveis nesta unidade,
                                                    defina a taxa de débito e as
                                                    taxas de crédito por
                                                    parcela.
                                                </p>
                                            </div>

                                            {(
                                                cardMachinesByUnitId[unit.id] ||
                                                []
                                            ).length === 0 ? (
                                                <div className="rounded-lg border border-border-primary bg-background-tertiary px-3 py-3">
                                                    <p className="text-paragraph-small text-content-secondary">
                                                        Nenhuma máquina
                                                        cadastrada nesta unidade
                                                        ainda.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {(
                                                        cardMachinesByUnitId[
                                                            unit.id
                                                        ] || []
                                                    ).map((machine) => {
                                                        const isToggling =
                                                            !!togglingMachineById[
                                                                machine.id
                                                            ];

                                                        return (
                                                            <div
                                                                key={machine.id}
                                                                className="rounded-lg border border-border-primary bg-background-tertiary px-3 py-3 flex items-center justify-between gap-3"
                                                            >
                                                                <div className="min-w-0">
                                                                    <p className="text-paragraph-small font-medium text-content-primary truncate">
                                                                        {
                                                                            machine.name
                                                                        }
                                                                    </p>
                                                                    <p className="text-paragraph-small text-content-secondary">
                                                                        Débito:{' '}
                                                                        {(
                                                                            machine.debitFee ??
                                                                            0
                                                                        ).toFixed(
                                                                            2
                                                                        )}
                                                                        % •
                                                                        Crédito:{' '}
                                                                        {(
                                                                            machine.creditFees ||
                                                                            []
                                                                        )
                                                                            .slice()
                                                                            .sort(
                                                                                (
                                                                                    a,
                                                                                    b
                                                                                ) =>
                                                                                    a.installments -
                                                                                    b.installments
                                                                            )
                                                                            .map(
                                                                                (
                                                                                    item
                                                                                ) =>
                                                                                    `${item.installments}x: ${(
                                                                                        item.feePercent ??
                                                                                        0
                                                                                    ).toFixed(
                                                                                        2
                                                                                    )}%`
                                                                            )
                                                                            .join(
                                                                                ' • '
                                                                            )}
                                                                    </p>
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant="outline">
                                                                        {machine.isActive
                                                                            ? 'Ativa'
                                                                            : 'Inativa'}
                                                                    </Badge>

                                                                    <Button
                                                                        type="button"
                                                                        variant={
                                                                            machine.isActive
                                                                                ? 'destructive'
                                                                                : 'active'
                                                                        }
                                                                        size="sm"
                                                                        disabled={
                                                                            isToggling
                                                                        }
                                                                        onClick={() =>
                                                                            toggleCardMachineActive(
                                                                                unit.id,
                                                                                machine.id,
                                                                                !machine.isActive
                                                                            )
                                                                        }
                                                                    >
                                                                        {isToggling
                                                                            ? machine.isActive
                                                                                ? 'Inativando...'
                                                                                : 'Ativando...'
                                                                            : machine.isActive
                                                                              ? 'Inativar'
                                                                              : 'Ativar'}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            <div className="grid gap-3">
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <Input
                                                        placeholder="Nome da máquina"
                                                        value={
                                                            newMachineByUnitId[
                                                                unit.id
                                                            ]?.name || ''
                                                        }
                                                        onChange={(e) =>
                                                            setNewMachineByUnitId(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [unit.id]: {
                                                                        ...(prev[
                                                                            unit
                                                                                .id
                                                                        ] || {
                                                                            name: '',
                                                                            debitFee:
                                                                                '',
                                                                            creditFees:
                                                                                {},
                                                                        }),
                                                                        name: e
                                                                            .target
                                                                            .value,
                                                                    },
                                                                })
                                                            )
                                                        }
                                                        className="bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                                    />

                                                    <Input
                                                        placeholder="Taxa débito %"
                                                        inputMode="decimal"
                                                        value={
                                                            newMachineByUnitId[
                                                                unit.id
                                                            ]?.debitFee || ''
                                                        }
                                                        onChange={(e) =>
                                                            setNewMachineByUnitId(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [unit.id]: {
                                                                        ...(prev[
                                                                            unit
                                                                                .id
                                                                        ] || {
                                                                            name: '',
                                                                            debitFee:
                                                                                '',
                                                                            creditFees:
                                                                                {},
                                                                        }),
                                                                        debitFee:
                                                                            e
                                                                                .target
                                                                                .value,
                                                                    },
                                                                })
                                                            )
                                                        }
                                                        className="bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                                    />
                                                </div>

                                                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                                                    {Array.from(
                                                        { length: 12 },
                                                        (_, index) => {
                                                            const installments =
                                                                index + 1;

                                                            return (
                                                                <Input
                                                                    key={
                                                                        installments
                                                                    }
                                                                    placeholder={`Crédito ${installments}x %`}
                                                                    inputMode="decimal"
                                                                    value={
                                                                        newMachineByUnitId[
                                                                            unit
                                                                                .id
                                                                        ]
                                                                            ?.creditFees?.[
                                                                            installments
                                                                        ] || ''
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) =>
                                                                        setNewMachineByUnitId(
                                                                            (
                                                                                prev
                                                                            ) => ({
                                                                                ...prev,
                                                                                [unit.id]:
                                                                                    {
                                                                                        ...(prev[
                                                                                            unit
                                                                                                .id
                                                                                        ] || {
                                                                                            name: '',
                                                                                            debitFee:
                                                                                                '',
                                                                                            creditFees:
                                                                                                {},
                                                                                        }),
                                                                                        creditFees:
                                                                                            {
                                                                                                ...(prev[
                                                                                                    unit
                                                                                                        .id
                                                                                                ]
                                                                                                    ?.creditFees ||
                                                                                                    {}),
                                                                                                [installments]:
                                                                                                    e
                                                                                                        .target
                                                                                                        .value,
                                                                                            },
                                                                                    },
                                                                            })
                                                                        )
                                                                    }
                                                                    className="bg-background-tertiary border-border-primary text-content-primary hover:border-border-secondary focus:border-border-brand focus-visible:ring-1 focus-visible:ring-border-brand focus-visible:ring-offset-0"
                                                                />
                                                            );
                                                        }
                                                    )}
                                                </div>

                                                <div className="flex justify-end">
                                                    <Button
                                                        type="button"
                                                        variant="edit2"
                                                        size="sm"
                                                        onClick={() =>
                                                            handleCreateMachine(
                                                                unit.id
                                                            )
                                                        }
                                                    >
                                                        Adicionar máquina
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                )}
            </section>

            {/* =========================
             * ADMINISTRADORES
             * ========================= */}
            <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-paragraph-medium font-semibold text-content-primary">
                            Administradores
                        </h2>
                    </div>
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
                                                                ).filter(
                                                                    (k) =>
                                                                        PERMISSION_LABELS[
                                                                            k as keyof PermissionsUI
                                                                        ]
                                                                ) as (keyof PermissionsUI)[]
                                                            ).map((k) => (
                                                                <PermissionBox
                                                                    key={k}
                                                                    label={
                                                                        PERMISSION_LABELS[
                                                                            k
                                                                        ]!
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
                                                            Verde = liberado,
                                                            vermelho =
                                                            bloqueado.
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
