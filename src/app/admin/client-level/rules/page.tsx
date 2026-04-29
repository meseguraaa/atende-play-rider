// src/app/admin/client-levels/rules/page.tsx
import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { requireAdminForModule } from '@/lib/admin-permissions';

import AdminClientLevelsRulesClient from './ui-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Nível de Cliente | Regras',
};

type LevelKey = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';
type RuleType = 'HAS_ACTIVE_PLAN';

type UnitUI = {
    id: string;
    name: string;
    isActive: boolean;
};

type RuleUI = {
    id: string;
    type: RuleType;
    targetLevel: LevelKey;
    priority: number;
    isEnabled: boolean;
};

type ApiPayload = {
    scope: {
        companyId: string;
        canSeeAllUnits: boolean;
        unitCookie: string;
    };
    units: UnitUI[];
    activeUnitId: string;
    levels: LevelKey[];
    ruleTypes: RuleType[];
    rules: RuleUI[];
};

function getOriginFromHeaders(h: Headers) {
    const proto = h.get('x-forwarded-proto') ?? 'http';
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
    return `${proto}://${host}`;
}

export default async function AdminClientLevelsRulesPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    // ✅ gate de permissão (server)
    await requireAdminForModule('CLIENT_LEVELS');

    const sp = await searchParams;

    const unitIdRaw = sp.unitId;
    const unitId = Array.isArray(unitIdRaw) ? unitIdRaw[0] : unitIdRaw;

    const createRaw = sp.create;
    const create = Array.isArray(createRaw) ? createRaw[0] : createRaw;

    const h = await headers();

    const origin = getOriginFromHeaders(h);
    const url = new URL('/api/admin/client-levels/rules', origin);
    if (unitId) url.searchParams.set('unitId', unitId);

    // ✅ repassa cookies da request atual pra API (evita 307 -> /painel/login)
    const cookieHeader = h.get('cookie') ?? '';

    let data: ApiPayload | null = null;
    let error: string | null = null;

    try {
        const res = await fetch(url.toString(), {
            method: 'GET',
            cache: 'no-store',
            // 👇 evita seguir redirect pra página HTML de login e quebrar o json()
            redirect: 'manual',
            headers: {
                Accept: 'application/json',
                ...(cookieHeader ? { cookie: cookieHeader } : {}),
            },
        });

        // Se a API redirecionou (ex: sessão expirada)
        if (res.status >= 300 && res.status < 400) {
            error =
                'Sessão expirada ou acesso negado. Faça login novamente e tente de novo.';
        } else {
            const contentType = res.headers.get('content-type') ?? '';

            // se não veio JSON, não tenta parsear
            if (!contentType.includes('application/json')) {
                error = 'Resposta inválida do servidor (esperado JSON).';
            } else {
                const json = (await res.json()) as
                    | { ok: true; data: ApiPayload }
                    | { ok: false; error: string };

                if (!res.ok || !json.ok) {
                    error =
                        !json.ok && json.error
                            ? json.error
                            : 'Falha ao carregar dados.';
                } else {
                    data = json.data;
                }
            }
        }
    } catch (e: any) {
        error =
            typeof e?.message === 'string'
                ? e.message
                : 'Falha ao carregar dados.';
    }

    const isCreateMode = create === '1';

    return (
        <AdminClientLevelsRulesClient
            initialData={data}
            error={error}
            initialCreateMode={isCreateMode}
        />
    );
}
