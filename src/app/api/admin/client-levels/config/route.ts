// src/app/api/admin/client-levels/config/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

const UNIT_COOKIE_NAME = 'admin_unit_context';
const UNIT_ALL_VALUE = 'all';

// Contexto de empresa (fallback)
const COMPANY_COOKIE_NAME = 'admin_company_context';
const COMPANY_COOKIE_FALLBACK = 'companyId';

type CustomerLevel = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';
const LEVELS: CustomerLevel[] = ['BRONZE', 'PRATA', 'OURO', 'DIAMANTE'];

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function normalizeUnitCookie(raw: string | undefined | null) {
    const v = String(raw ?? '').trim();
    return v || UNIT_ALL_VALUE;
}

async function resolveCompanyIdFromSessionOrCookie(session: any) {
    const fromSession = String(session?.companyId ?? '').trim();
    if (fromSession) return fromSession;

    const cookieStore = await cookies();
    const fromCookie =
        cookieStore.get(COMPANY_COOKIE_NAME)?.value ??
        cookieStore.get(COMPANY_COOKIE_FALLBACK)?.value ??
        '';

    const normalized = String(fromCookie).trim();
    if (normalized) return normalized;

    return '';
}

function toNonNegativeInt(value: unknown, fallback = 0) {
    const n = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
    return Math.max(0, n);
}

/**
 * ✅ TS FIX:
 * Em alguns setups, o tipo `FormData` no ambiente server não expõe `.get()`
 * (normalmente por falta da lib "dom" no tsconfig).
 * Aqui chamamos `.get()` via `any` para destravar build, mantendo runtime correto.
 */
function formGet(formData: unknown, key: string): unknown {
    const anyForm = formData as any;
    if (anyForm && typeof anyForm.get === 'function') return anyForm.get(key);
    return undefined;
}

async function getUnitContext(params: { requestedUnitId?: string | null }) {
    const session = await requireAdminForModule('CLIENT_LEVELS');

    const companyId = await resolveCompanyIdFromSessionOrCookie(session);
    if (!companyId) {
        return {
            ok: false as const,
            status: 400,
            error: 'Contexto de empresa ausente (companyId).',
        };
    }

    const cookieStore = await cookies();
    const unitCookie = normalizeUnitCookie(
        cookieStore.get(UNIT_COOKIE_NAME)?.value
    );

    const canSeeAllUnits = !!session?.canSeeAllUnits;

    // Se veio unitId por query/form, respeita (desde que permitido)
    const requestedUnitId = String(params.requestedUnitId ?? '').trim();

    // ✅ lista de unidades disponíveis para o usuário nesta tela
    // - se pode ver todas: lista todas da empresa (ativas e inativas, igual summary)
    // - se NÃO pode: limitamos à unidade do cookie (se válida)
    let units = await prisma.unit.findMany({
        where: { companyId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, isActive: true },
    });

    if (!canSeeAllUnits) {
        // se não pode ver tudo, "all" não faz sentido aqui
        if (unitCookie === UNIT_ALL_VALUE) {
            // fallback: pega a primeira ativa (ou primeira) pra não quebrar UI
            const fallback = units.find((u) => u.isActive)?.id ?? units[0]?.id;
            if (!fallback) {
                return {
                    ok: false as const,
                    status: 400,
                    error: 'Nenhuma unidade encontrada para o contexto atual.',
                };
            }

            // filtra UI para só esta unidade
            units = units.filter((u) => u.id === fallback);

            return {
                ok: true as const,
                companyId,
                canSeeAllUnits,
                unitCookie,
                units,
                activeUnitId: fallback,
            };
        }

        // cookie != all: filtra só aquela unidade (se existir)
        const exists = units.some((u) => u.id === unitCookie);
        if (!exists) {
            return {
                ok: false as const,
                status: 400,
                error: 'Unidade do contexto (cookie) inválida para esta empresa.',
            };
        }

        units = units.filter((u) => u.id === unitCookie);

        return {
            ok: true as const,
            companyId,
            canSeeAllUnits,
            unitCookie,
            units,
            activeUnitId: unitCookie,
        };
    }

    // ✅ Pode ver todas: decide activeUnitId
    const activeUnitId = (() => {
        if (requestedUnitId && requestedUnitId !== UNIT_ALL_VALUE) {
            // valida se pertence à empresa
            const ok = units.some((u) => u.id === requestedUnitId);
            if (ok) return requestedUnitId;
        }

        // se cookie tem uma unidade válida, usa
        if (unitCookie && unitCookie !== UNIT_ALL_VALUE) {
            const ok = units.some((u) => u.id === unitCookie);
            if (ok) return unitCookie;
        }

        // fallback: primeira ativa ou primeira
        return units.find((u) => u.isActive)?.id ?? units[0]?.id ?? null;
    })();

    if (!activeUnitId) {
        return {
            ok: false as const,
            status: 400,
            error: 'Nenhuma unidade encontrada para o contexto atual.',
        };
    }

    return {
        ok: true as const,
        companyId,
        canSeeAllUnits,
        unitCookie,
        units,
        activeUnitId,
    };
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const unitId = searchParams.get('unitId');

        const ctx = await getUnitContext({ requestedUnitId: unitId });
        if (!ctx.ok) return jsonErr(ctx.error, ctx.status);

        const configs = await prisma.customerLevelConfig.findMany({
            where: { companyId: ctx.companyId, unitId: ctx.activeUnitId },
            orderBy: { level: 'asc' },
            select: {
                id: true,
                level: true,
                minAppointmentsDone: true,
                minOrdersCompleted: true,
            },
        });

        const configByLevel: Partial<
            Record<
                CustomerLevel,
                { minAppointmentsDone: number; minOrdersCompleted: number }
            >
        > = {};

        for (const c of configs) {
            configByLevel[String(c.level) as CustomerLevel] = {
                minAppointmentsDone: c.minAppointmentsDone,
                minOrdersCompleted: c.minOrdersCompleted,
            };
        }

        return jsonOk({
            scope: {
                companyId: ctx.companyId,
                canSeeAllUnits: ctx.canSeeAllUnits,
                unitCookie: ctx.unitCookie,
            },
            units: ctx.units,
            activeUnitId: ctx.activeUnitId,
            levels: LEVELS,
            configByLevel,
        });
    } catch (e: any) {
        if (isRedirectError(e)) throw e;

        const msg =
            typeof e?.message === 'string'
                ? e.message
                : 'Erro inesperado ao carregar configurações.';
        return jsonErr(msg, 500);
    }
}

export async function POST(req: Request) {
    try {
        const formData = await req.formData();

        const unitId = String(formGet(formData, 'unitId') ?? '').trim();

        const ctx = await getUnitContext({ requestedUnitId: unitId });
        if (!ctx.ok) return jsonErr(ctx.error, ctx.status);

        // Segurança: garante que o activeUnitId é o que vamos salvar
        const activeUnitId = ctx.activeUnitId;

        // monta payload por nível
        const rows = LEVELS.map((lvl) => {
            const done = toNonNegativeInt(
                formGet(formData, `minAppointmentsDone_${lvl}`),
                0
            );
            const completed = toNonNegativeInt(
                formGet(formData, `minOrdersCompleted_${lvl}`),
                0
            );

            return {
                level: lvl,
                minAppointmentsDone: done,
                minOrdersCompleted: completed,
            };
        });

        // upsert em transação
        await prisma.$transaction(
            rows.map((r) =>
                prisma.customerLevelConfig.upsert({
                    where: {
                        unitId_level: {
                            unitId: activeUnitId,
                            level: r.level as any,
                        },
                    },
                    create: {
                        companyId: ctx.companyId,
                        unitId: activeUnitId,
                        level: r.level as any,
                        minAppointmentsDone: r.minAppointmentsDone,
                        minOrdersCompleted: r.minOrdersCompleted,
                    },
                    update: {
                        minAppointmentsDone: r.minAppointmentsDone,
                        minOrdersCompleted: r.minOrdersCompleted,
                    },
                    select: { id: true },
                })
            )
        );

        return jsonOk({ saved: true, unitId: activeUnitId });
    } catch (e: any) {
        if (isRedirectError(e)) throw e;

        const msg =
            typeof e?.message === 'string'
                ? e.message
                : 'Erro inesperado ao salvar configurações.';
        return jsonErr(msg, 500);
    }
}
