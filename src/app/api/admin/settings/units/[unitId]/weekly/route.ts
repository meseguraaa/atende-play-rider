// src/app/api/admin/settings/units/[unitId]/weekly/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

type WeeklyDayPayload = {
    weekday: number; // 0..6
    isActive: boolean;

    // Para o seu UI atual (1 intervalo por dia)
    startTime: string | null; // "HH:MM" ou null
    endTime: string | null; // "HH:MM" ou null
};

type WeeklyPayload = {
    weekly: WeeklyDayPayload[];
};

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function isValidWeekday(n: unknown): n is number {
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 6;
}

function isValidTimeStr(v: unknown): v is string {
    if (typeof v !== 'string') return false;
    // "HH:MM" 00..23 / 00..59
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v.trim());
}

function normalizeTimeOrNull(v: unknown): string | null {
    if (v == null) return null;
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (!t) return null;
    return isValidTimeStr(t) ? t : null;
}

function normalizeWeeklyInput(
    input: WeeklyPayload | null
): WeeklyDayPayload[] | null {
    if (!input || typeof input !== 'object') return null;
    if (!Array.isArray((input as any).weekly)) return null;

    const weekly = (input as any).weekly as any[];

    const out: WeeklyDayPayload[] = [];
    for (const row of weekly) {
        const weekday = Number(row?.weekday);
        if (!isValidWeekday(weekday)) return null;

        const isActive = !!row?.isActive;
        const startTime = normalizeTimeOrNull(row?.startTime);
        const endTime = normalizeTimeOrNull(row?.endTime);

        // Se ativo, precisa de start+end válidos
        if (isActive) {
            if (!startTime || !endTime) return null;
            if (startTime >= endTime) return null;
        }

        out.push({
            weekday,
            isActive,
            startTime: isActive ? startTime : null,
            endTime: isActive ? endTime : null,
        });
    }

    // Opcional: permitir enviar só alguns dias. A rota atual atualiza os dias enviados.
    return out;
}

type Ctx = { params: Promise<{ unitId: string }> };

/**
 * GET /api/admin/settings/units/:unitId/weekly
 * Retorna os 7 dias (0..6) com 0 ou 1 intervalo (se houver).
 */
export async function GET(_req: Request, ctx: Ctx) {
    try {
        const admin = await requireAdminForModule('SETTINGS');
        const { unitId } = await ctx.params;

        if (!unitId) return jsonErr('unit_id_required', 400);

        // garante que unit pertence à company do admin
        const unit = await prisma.unit.findFirst({
            where: { id: unitId, companyId: admin.companyId },
            select: { id: true },
        });

        if (!unit) return jsonErr('unit_not_found', 404);

        const rows = await prisma.unitWeeklyAvailability.findMany({
            where: { unitId },
            include: {
                intervals: {
                    orderBy: { startTime: 'asc' },
                    select: { startTime: true, endTime: true },
                },
            },
        });

        const byWeekday = rows.reduce<Record<number, (typeof rows)[number]>>(
            (acc, r) => {
                acc[r.weekday] = r;
                return acc;
            },
            {}
        );

        const weekly = Array.from({ length: 7 }).map((_, i) => {
            const row = byWeekday[i];
            const first = row?.intervals?.[0] ?? null;

            return {
                weekday: i,
                isActive: row ? !!row.isActive : false,
                startTime: first?.startTime ?? null,
                endTime: first?.endTime ?? null,
            };
        });

        return jsonOk(weekly);
    } catch (err) {
        console.error('[GET /api/admin/settings/units/:unitId/weekly]', err);
        return jsonErr('internal_error', 500);
    }
}

/**
 * PUT /api/admin/settings/units/:unitId/weekly
 * Salva disponibilidade semanal da unidade.
 *
 * Body:
 * {
 *   weekly: [
 *     { weekday: 1, isActive: true, startTime: "09:00", endTime: "18:00" },
 *     { weekday: 0, isActive: false, startTime: null, endTime: null },
 *     ...
 *   ]
 * }
 *
 * Regras:
 * - precisa módulo SETTINGS
 * - somente owner pode salvar
 */
export async function PUT(req: Request, ctx: Ctx) {
    try {
        const admin = await requireAdminForModule('SETTINGS');
        if (!admin.isOwner) return jsonErr('forbidden_owner_only', 403);

        const { unitId } = await ctx.params;
        if (!unitId) return jsonErr('unit_id_required', 400);

        // garante que unit pertence à company do admin
        const unit = await prisma.unit.findFirst({
            where: { id: unitId, companyId: admin.companyId },
            select: { id: true, companyId: true },
        });

        if (!unit) return jsonErr('unit_not_found', 404);

        let body: WeeklyPayload | null = null;
        try {
            body = (await req.json()) as WeeklyPayload;
        } catch {
            return jsonErr('invalid_json', 400);
        }

        const weekly = normalizeWeeklyInput(body);
        if (!weekly) return jsonErr('invalid_weekly_payload', 400);

        // Atualiza só os dias enviados (se quiser exigir os 7 dias, eu ajusto)
        await prisma.$transaction(async (tx) => {
            for (const day of weekly) {
                // upsert do "pai"
                const upserted = await tx.unitWeeklyAvailability.upsert({
                    where: {
                        unitId_weekday: { unitId, weekday: day.weekday },
                    },
                    create: {
                        companyId: admin.companyId,
                        unitId,
                        weekday: day.weekday,
                        isActive: day.isActive,
                    },
                    update: {
                        isActive: day.isActive,
                    },
                    select: { id: true },
                });

                // Regras de intervalos:
                // - se inativo: remove intervalos
                // - se ativo: 1 intervalo (start/end)
                await tx.unitWeeklyTimeInterval.deleteMany({
                    where: { weeklyAvailabilityId: upserted.id },
                });

                if (day.isActive && day.startTime && day.endTime) {
                    await tx.unitWeeklyTimeInterval.create({
                        data: {
                            weeklyAvailabilityId: upserted.id,
                            startTime: day.startTime,
                            endTime: day.endTime,
                        },
                    });
                }
            }
        });

        // devolve o estado atualizado (7 dias)
        const rows = await prisma.unitWeeklyAvailability.findMany({
            where: { unitId },
            include: {
                intervals: {
                    orderBy: { startTime: 'asc' },
                    select: { startTime: true, endTime: true },
                },
            },
        });

        const byWeekday = rows.reduce<Record<number, (typeof rows)[number]>>(
            (acc, r) => {
                acc[r.weekday] = r;
                return acc;
            },
            {}
        );

        const resultWeekly = Array.from({ length: 7 }).map((_, i) => {
            const row = byWeekday[i];
            const first = row?.intervals?.[0] ?? null;
            return {
                weekday: i,
                isActive: row ? !!row.isActive : false,
                startTime: first?.startTime ?? null,
                endTime: first?.endTime ?? null,
            };
        });

        return jsonOk(resultWeekly);
    } catch (err) {
        console.error('[PUT /api/admin/settings/units/:unitId/weekly]', err);
        return jsonErr('internal_error', 500);
    }
}
