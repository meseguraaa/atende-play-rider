// src/app/admin/client-levels/config/page.tsx
import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { requireAdminForModule } from '@/lib/admin-permissions';

import AdminClientLevelsConfigClient from './ui-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Nível de Cliente | Configurações',
};

type LevelKey = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';

type UnitUI = {
    id: string;
    name: string;
    isActive: boolean;
};

type LevelConfig = {
    minAppointmentsDone: number;
    minOrdersCompleted: number;
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
    configByLevel: Partial<Record<LevelKey, LevelConfig>>;
};

async function getOriginFromHeaders() {
    const h = await headers();

    const proto = h.get('x-forwarded-proto') ?? 'http';
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';

    return `${proto}://${host}`;
}

export default async function AdminClientLevelsConfigPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    // ✅ gate de permissão
    await requireAdminForModule('CLIENT_LEVELS');

    const sp = await searchParams;
    const unitIdRaw = sp.unitId;
    const unitId = Array.isArray(unitIdRaw) ? unitIdRaw[0] : unitIdRaw;

    const origin = await getOriginFromHeaders();
    const url = new URL('/api/admin/client-levels/config', origin);
    if (unitId) url.searchParams.set('unitId', unitId);

    let data: ApiPayload | null = null;
    let error: string | null = null;

    try {
        // ✅ MUITO IMPORTANTE:
        // repassa cookies do request atual, senão o route handler vai achar que está deslogado
        const h = await headers();
        const cookieHeader = h.get('cookie') ?? '';

        const res = await fetch(url.toString(), {
            method: 'GET',
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
                cookie: cookieHeader,
            },
        });

        // Se caiu em redirect (ex: /painel/login), não tenta parsear JSON
        if (res.status >= 300 && res.status < 400) {
            error =
                'Sessão não reconhecida na API (redirect). Verifique cookies/autenticação.';
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
    } catch (e: any) {
        error =
            typeof e?.message === 'string'
                ? e.message
                : 'Falha ao carregar dados.';
    }

    return <AdminClientLevelsConfigClient error={error} initialData={data} />;
}
