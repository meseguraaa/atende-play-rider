// src/app/api/admin/client-levels/rules/route.ts
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
type CustomerLevelRuleType = 'HAS_ACTIVE_PLAN';

const LEVELS: CustomerLevel[] = ['BRONZE', 'PRATA', 'OURO', 'DIAMANTE'];
const RULE_TYPES: CustomerLevelRuleType[] = ['HAS_ACTIVE_PLAN'];

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

function safeRuleType(value: unknown): CustomerLevelRuleType {
    const v = String(value ?? '').trim();
    return v === 'HAS_ACTIVE_PLAN' ? 'HAS_ACTIVE_PLAN' : 'HAS_ACTIVE_PLAN';
}

function safeLevel(value: unknown): CustomerLevel {
    const v = String(value ?? '').trim() as CustomerLevel;
    if (LEVELS.includes(v)) return v;
    return 'BRONZE';
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

    const requestedUnitId = String(params.requestedUnitId ?? '').trim();

    let units = await prisma.unit.findMany({
        where: { companyId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, isActive: true },
    });

    if (!canSeeAllUnits) {
        if (unitCookie === UNIT_ALL_VALUE) {
            const fallback = units.find((u) => u.isActive)?.id ?? units[0]?.id;
            if (!fallback) {
                return {
                    ok: false as const,
                    status: 400,
                    error: 'Nenhuma unidade encontrada para o contexto atual.',
                };
            }

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

    const activeUnitId = (() => {
        if (requestedUnitId && requestedUnitId !== UNIT_ALL_VALUE) {
            const ok = units.some((u) => u.id === requestedUnitId);
            if (ok) return requestedUnitId;
        }

        if (unitCookie && unitCookie !== UNIT_ALL_VALUE) {
            const ok = units.some((u) => u.id === unitCookie);
            if (ok) return unitCookie;
        }

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

        const rules = await prisma.customerLevelRule.findMany({
            where: { companyId: ctx.companyId, unitId: ctx.activeUnitId },
            orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
            select: {
                id: true,
                type: true,
                targetLevel: true,
                priority: true,
                isEnabled: true,
            },
        });

        return jsonOk({
            scope: {
                companyId: ctx.companyId,
                canSeeAllUnits: ctx.canSeeAllUnits,
                unitCookie: ctx.unitCookie,
            },
            units: ctx.units,
            activeUnitId: ctx.activeUnitId,
            levels: LEVELS,
            ruleTypes: RULE_TYPES,
            rules: rules.map((r) => ({
                id: r.id,
                type: String(r.type) as CustomerLevelRuleType,
                targetLevel: String(r.targetLevel) as CustomerLevel,
                priority: r.priority,
                isEnabled: r.isEnabled,
            })),
        });
    } catch (e: any) {
        if (isRedirectError(e)) throw e;

        const msg =
            typeof e?.message === 'string'
                ? e.message
                : 'Erro inesperado ao carregar regras.';
        return jsonErr(msg, 500);
    }
}

export async function POST(req: Request) {
    try {
        const formData = await req.formData();

        const intent = String(formGet(formData, 'intent') ?? '').trim(); // create | update | delete
        const unitId = String(formGet(formData, 'unitId') ?? '').trim();

        const ctx = await getUnitContext({ requestedUnitId: unitId });
        if (!ctx.ok) return jsonErr(ctx.error, ctx.status);

        const activeUnitId = ctx.activeUnitId;

        if (intent === 'create') {
            const existingCount = await prisma.customerLevelRule.count({
                where: { companyId: ctx.companyId, unitId: activeUnitId },
            });

            if (existingCount > 0) {
                return jsonErr(
                    'Esta unidade já possui uma regra. Exclua para criar outra.',
                    400
                );
            }

            const type = safeRuleType(formGet(formData, 'type'));
            const targetLevel = safeLevel(formGet(formData, 'targetLevel'));
            const priority = toNonNegativeInt(
                formGet(formData, 'priority'),
                100
            );

            const created = await prisma.customerLevelRule.create({
                data: {
                    companyId: ctx.companyId,
                    unitId: activeUnitId,
                    type: type as any,
                    targetLevel: targetLevel as any,
                    priority,
                    isEnabled: true,
                },
                select: { id: true },
            });

            return jsonOk({
                saved: true,
                intent: 'create',
                ruleId: created.id,
            });
        }

        if (intent === 'update') {
            const ruleId = String(formGet(formData, 'ruleId') ?? '').trim();
            if (!ruleId) return jsonErr('ruleId é obrigatório.', 400);

            const type = safeRuleType(formGet(formData, 'type'));
            const targetLevel = safeLevel(formGet(formData, 'targetLevel'));
            const priority = toNonNegativeInt(
                formGet(formData, 'priority'),
                100
            );

            // ✅ garante escopo (companyId + unitId)
            await prisma.customerLevelRule.updateMany({
                where: {
                    id: ruleId,
                    companyId: ctx.companyId,
                    unitId: activeUnitId,
                },
                data: {
                    type: type as any,
                    targetLevel: targetLevel as any,
                    priority,
                },
            });

            return jsonOk({ saved: true, intent: 'update', ruleId });
        }

        if (intent === 'delete') {
            const ruleId = String(formGet(formData, 'ruleId') ?? '').trim();
            if (!ruleId) return jsonErr('ruleId é obrigatório.', 400);

            await prisma.customerLevelRule.deleteMany({
                where: {
                    id: ruleId,
                    companyId: ctx.companyId,
                    unitId: activeUnitId,
                },
            });

            return jsonOk({ saved: true, intent: 'delete', ruleId });
        }

        return jsonErr('Intent inválida. Use create, update ou delete.', 400);
    } catch (e: any) {
        if (isRedirectError(e)) throw e;

        const msg =
            typeof e?.message === 'string'
                ? e.message
                : 'Erro inesperado ao salvar regras.';
        return jsonErr(msg, 500);
    }
}
