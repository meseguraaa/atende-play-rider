// src/app/api/admin/client-levels/summary/route.ts
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

export async function GET() {
    try {
        const session = await requireAdminForModule('CLIENT_LEVELS');

        const companyId = await resolveCompanyIdFromSessionOrCookie(session);
        if (!companyId) {
            return jsonErr(
                'Contexto de empresa ausente (companyId). Selecione uma empresa antes de acessar.',
                400
            );
        }

        const cookieStore = await cookies();
        const unitCookie = normalizeUnitCookie(
            cookieStore.get(UNIT_COOKIE_NAME)?.value
        );

        const canSeeAllUnits = !!session?.canSeeAllUnits;
        const showAllUnits = canSeeAllUnits && unitCookie === UNIT_ALL_VALUE;

        const unitScope =
            showAllUnits || unitCookie === UNIT_ALL_VALUE
                ? undefined
                : unitCookie;

        const units = await prisma.unit.findMany({
            where: {
                companyId,
                ...(unitScope ? { id: unitScope } : {}),
            },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, isActive: true },
        });

        let effectiveUnitIds = units.map((u) => u.id);

        if (!canSeeAllUnits && unitCookie === UNIT_ALL_VALUE) {
            const activeFirst =
                units.find((u) => u.isActive)?.id ?? units[0]?.id;
            effectiveUnitIds = activeFirst ? [activeFirst] : [];
        }

        const [configs, rules] = await Promise.all([
            prisma.customerLevelConfig.findMany({
                where: {
                    companyId,
                    ...(effectiveUnitIds.length
                        ? { unitId: { in: effectiveUnitIds } }
                        : {}),
                },
                orderBy: [{ unitId: 'asc' }, { level: 'asc' }],
                select: {
                    id: true,
                    unitId: true,
                    level: true,
                    minAppointmentsDone: true,
                    minOrdersCompleted: true,
                },
            }),
            prisma.customerLevelRule.findMany({
                where: {
                    companyId,
                    ...(effectiveUnitIds.length
                        ? { unitId: { in: effectiveUnitIds } }
                        : {}),
                },
                orderBy: [
                    { unitId: 'asc' },
                    { priority: 'desc' },
                    { createdAt: 'asc' },
                ],
                select: {
                    id: true,
                    unitId: true,
                    type: true,
                    targetLevel: true,
                    priority: true,
                    isEnabled: true,
                },
            }),
        ]);

        const configsByUnit: Record<
            string,
            Partial<
                Record<
                    CustomerLevel,
                    { minAppointmentsDone: number; minOrdersCompleted: number }
                >
            >
        > = {};

        for (const c of configs) {
            const unitId = c.unitId;
            if (!configsByUnit[unitId]) configsByUnit[unitId] = {};
            configsByUnit[unitId]![String(c.level) as CustomerLevel] = {
                minAppointmentsDone: c.minAppointmentsDone,
                minOrdersCompleted: c.minOrdersCompleted,
            };
        }

        const rulesByUnit: Record<
            string,
            Array<{
                id: string;
                type: string;
                targetLevel: CustomerLevel;
                priority: number;
                isEnabled: boolean;
            }>
        > = {};

        for (const r of rules) {
            const unitId = r.unitId;
            if (!rulesByUnit[unitId]) rulesByUnit[unitId] = [];
            rulesByUnit[unitId]!.push({
                id: r.id,
                type: String(r.type),
                targetLevel: String(r.targetLevel) as CustomerLevel,
                priority: r.priority,
                isEnabled: r.isEnabled,
            });
        }

        return jsonOk({
            scope: {
                companyId,
                unitCookie,
                canSeeAllUnits,
                showAllUnits,
            },
            units,
            configsByUnit,
            rulesByUnit,
        });
    } catch (e: any) {
        // ✅ IMPORTANTÍSSIMO:
        // Se requireAdminForModule disparar redirect(), isso lança um erro especial.
        // Não podemos capturar e virar 500, senão quebra tudo (Fast Refresh, etc).
        if (isRedirectError(e)) {
            throw e;
        }

        const msg =
            typeof e?.message === 'string'
                ? e.message
                : 'Erro inesperado ao carregar níveis de cliente.';

        // Se o lib lançar algo do tipo "unauthorized/forbidden", mantém 403 mais amigável.
        const lowered = msg.toLowerCase();
        if (
            lowered.includes('unauthorized') ||
            lowered.includes('forbidden') ||
            lowered.includes('permiss') ||
            lowered.includes('acesso')
        ) {
            return jsonErr(msg, 403);
        }

        return jsonErr(msg, 500);
    }
}
