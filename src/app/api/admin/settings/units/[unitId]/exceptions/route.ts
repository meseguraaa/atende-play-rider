import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

type ExceptionMode = 'FULL_DAY' | 'INTERVALS';

type IntervalPayload = {
    startTime: string; // "HH:mm"
    endTime: string; // "HH:mm"
};

type Payload =
    | {
          date: string; // "YYYY-MM-DD"
          // formato antigo (compat)
          startTime?: string; // "HH:mm"
          endTime?: string; // "HH:mm"
          mode?: ExceptionMode;
          intervals?: IntervalPayload[];
      }
    | {
          date: string; // "YYYY-MM-DD"
          mode?: ExceptionMode;
          intervals?: IntervalPayload[];
          // compat opcional
          startTime?: string;
          endTime?: string;
      };

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function isValidDateOnly(v: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isValidHHmm(v: string) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
}

function timeToMinutes(hhmm: string) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Converte "YYYY-MM-DD" para Date em UTC (00:00:00Z).
 * Isso evita bug de timezone mudando o dia.
 */
function dateOnlyToUTC(dateStr: string) {
    return new Date(`${dateStr}T00:00:00.000Z`);
}

/** Pega yyyy-mm-dd a partir de Date (sempre em UTC) */
function dateToYYYYMMDD(d: Date) {
    return d.toISOString().slice(0, 10);
}

/**
 * Next 15/14: ctx.params pode vir como Promise (sync-dynamic-apis)
 * Tipagem compatível com os tipos gerados pelo Next em .next/dev/types
 */
type Ctx = {
    params: Promise<{ unitId: string }>;
};

function normalizeIntervalsFromBody(body: any): IntervalPayload[] | null {
    // 1) novo formato: intervals[]
    if (Array.isArray(body?.intervals)) {
        const list = body.intervals
            .map((it: any) => ({
                startTime: String(it?.startTime ?? '').trim(),
                endTime: String(it?.endTime ?? '').trim(),
            }))
            .filter((it: IntervalPayload) => it.startTime && it.endTime);

        return list.length ? list : null;
    }

    // 2) formato antigo: startTime/endTime
    const startTime = String(body?.startTime ?? '').trim();
    const endTime = String(body?.endTime ?? '').trim();
    if (startTime && endTime) {
        return [{ startTime, endTime }];
    }

    return null;
}

function validateAndSortIntervals(
    intervals: IntervalPayload[]
): { ok: true; intervals: IntervalPayload[] } | { ok: false; error: string } {
    if (!intervals.length) {
        return { ok: false, error: 'invalid_time_range' };
    }

    // valida formato e range básico
    for (const it of intervals) {
        if (!isValidHHmm(it.startTime) || !isValidHHmm(it.endTime)) {
            return { ok: false, error: 'invalid_time_format' };
        }

        const s = timeToMinutes(it.startTime);
        const e = timeToMinutes(it.endTime);
        if (e <= s) return { ok: false, error: 'invalid_time_range' };
    }

    // ordena
    const sorted = [...intervals].sort(
        (a, b) =>
            timeToMinutes(a.startTime) - timeToMinutes(b.startTime) ||
            timeToMinutes(a.endTime) - timeToMinutes(b.endTime)
    );

    // valida sobreposição
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const prevEnd = timeToMinutes(prev.endTime);
        const currStart = timeToMinutes(curr.startTime);

        if (currStart < prevEnd) {
            return { ok: false, error: 'intervals_overlap' };
        }
    }

    return { ok: true, intervals: sorted };
}

/**
 * GET /api/admin/settings/units/:unitId/exceptions
 * Lista exceções (pausas/bloqueios) da unidade.
 *
 * Retorno:
 * [
 *   {
 *     id: string,
 *     date: "YYYY-MM-DD",
 *     isClosed: boolean,
 *     mode: "FULL_DAY" | "INTERVALS",
 *     intervals: [{ id, startTime, endTime }]
 *   }
 * ]
 */
export async function GET(_req: Request, ctx: Ctx) {
    try {
        const admin = await requireAdminForModule('SETTINGS');

        const { unitId: rawUnitId } = await ctx.params;
        const unitId = String(rawUnitId ?? '').trim();
        if (!unitId) return jsonErr('unit_id_required', 400);

        // garante que a unidade pertence à company do admin
        const unit = await prisma.unit.findFirst({
            where: { id: unitId, companyId: admin.companyId },
            select: { id: true },
        });

        if (!unit) return jsonErr('unit_not_found', 404);

        const rows = await prisma.unitDailyAvailability.findMany({
            where: { unitId },
            orderBy: { date: 'desc' },
            select: {
                id: true,
                date: true,
                isClosed: true,
                intervals: {
                    orderBy: { startTime: 'asc' },
                    select: { id: true, startTime: true, endTime: true },
                },
            },
        });

        const data = rows.map((r) => {
            const intervals = r.intervals.map((i) => ({
                id: i.id,
                startTime: i.startTime,
                endTime: i.endTime,
            }));

            const mode: ExceptionMode = r.isClosed
                ? 'FULL_DAY'
                : intervals.length
                  ? 'INTERVALS'
                  : 'INTERVALS'; // fallback seguro (mantém contrato)

            return {
                id: r.id,
                date: dateToYYYYMMDD(r.date),
                isClosed: !!r.isClosed,
                mode,
                intervals,
            };
        });

        return jsonOk(data);
    } catch (err) {
        console.error(
            '[GET /api/admin/settings/units/:unitId/exceptions]',
            err
        );
        return jsonErr('internal_error', 500);
    }
}

/**
 * POST /api/admin/settings/units/:unitId/exceptions
 *
 * Cria uma exceção do tipo "BLOQUEIO/PAUSA" em um dia específico.
 * Suporta:
 * - FULL_DAY: fecha o dia inteiro (isClosed=true, sem intervalos)
 * - INTERVALS: fecha por intervalos (isClosed=false, com intervals[])
 *
 * Body (novo):
 * {
 *   "date": "2026-01-10",
 *   "mode": "FULL_DAY" | "INTERVALS",
 *   "intervals": [
 *     { "startTime": "12:00", "endTime": "14:00" },
 *     { "startTime": "16:00", "endTime": "16:30" }
 *   ]
 * }
 *
 * Body (compat antigo):
 * {
 *   "date": "2026-01-10",
 *   "startTime": "12:00",
 *   "endTime": "14:00"
 * }
 */
export async function POST(req: Request, ctx: Ctx) {
    try {
        const admin = await requireAdminForModule('SETTINGS');

        // 🔒 só owner cria exceção (por enquanto)
        if (!admin.isOwner) {
            return jsonErr('forbidden_owner_only', 403);
        }

        const { unitId: rawUnitId } = await ctx.params;
        const unitId = String(rawUnitId ?? '').trim();
        if (!unitId) return jsonErr('unit_id_required', 400);

        let body: Payload | null = null;
        try {
            body = (await req.json()) as Payload;
        } catch {
            return jsonErr('invalid_json', 400);
        }

        const date = String((body as any)?.date ?? '').trim();
        if (!date || !isValidDateOnly(date))
            return jsonErr('date_required', 400);

        const explicitMode = String((body as any)?.mode ?? '').trim() as
            | ExceptionMode
            | '';

        const rawIntervals = normalizeIntervalsFromBody(body);

        // Regra de mode:
        // - se veio mode explícito: respeita
        // - senão: se tem intervalos/horários -> INTERVALS (compat antigo)
        // - senão: FULL_DAY
        const mode: ExceptionMode =
            explicitMode === 'FULL_DAY' || explicitMode === 'INTERVALS'
                ? explicitMode
                : rawIntervals
                  ? 'INTERVALS'
                  : 'FULL_DAY';

        let validatedIntervals: IntervalPayload[] = [];

        if (mode === 'INTERVALS') {
            if (!rawIntervals) return jsonErr('invalid_time_format', 400);

            const validated = validateAndSortIntervals(rawIntervals);
            if (!validated.ok) {
                if (validated.error === 'intervals_overlap') {
                    return jsonErr('intervals_overlap', 400);
                }
                return jsonErr(validated.error, 400);
            }

            validatedIntervals = validated.intervals;
        } else {
            // FULL_DAY: ignora horários enviados, e limpa intervalos
            validatedIntervals = [];
        }

        // garante que a unidade pertence à company do admin
        const unit = await prisma.unit.findFirst({
            where: { id: unitId, companyId: admin.companyId },
            select: { id: true, companyId: true },
        });

        if (!unit) return jsonErr('unit_not_found', 404);

        const dayUTC = dateOnlyToUTC(date);

        const result = await prisma.$transaction(async (tx) => {
            // upsert do "dia"
            const daily = await tx.unitDailyAvailability.upsert({
                where: {
                    unitId_date: {
                        unitId: unitId,
                        date: dayUTC,
                    },
                },
                create: {
                    companyId: unit.companyId,
                    unitId: unitId,
                    date: dayUTC,
                    isClosed: mode === 'FULL_DAY',
                },
                update: {
                    isClosed: mode === 'FULL_DAY',
                },
                select: { id: true, unitId: true, date: true, isClosed: true },
            });

            // sempre reseta intervalos ao salvar exceção (fonte da verdade = payload atual)
            await tx.unitDailyTimeInterval.deleteMany({
                where: { dailyAvailabilityId: daily.id },
            });

            if (mode === 'INTERVALS') {
                await tx.unitDailyTimeInterval.createMany({
                    data: validatedIntervals.map((it) => ({
                        dailyAvailabilityId: daily.id,
                        startTime: it.startTime,
                        endTime: it.endTime,
                    })),
                });
            }

            const intervals = await tx.unitDailyTimeInterval.findMany({
                where: { dailyAvailabilityId: daily.id },
                orderBy: { startTime: 'asc' },
                select: { id: true, startTime: true, endTime: true },
            });

            return { daily, intervals };
        });

        return jsonOk(
            {
                dailyAvailability: {
                    id: result.daily.id,
                    unitId: result.daily.unitId,
                    date: dateToYYYYMMDD(result.daily.date),
                    isClosed: !!result.daily.isClosed,
                    mode: result.daily.isClosed
                        ? 'FULL_DAY'
                        : result.intervals.length
                          ? 'INTERVALS'
                          : mode,
                },
                intervals: result.intervals,
            },
            { status: 201 }
        );
    } catch (err: any) {
        console.error(
            '[POST /api/admin/settings/units/:unitId/exceptions]',
            err
        );
        return jsonErr('internal_error', 500);
    }
}
