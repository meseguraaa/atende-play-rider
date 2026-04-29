// src/jobs/customer-levels/run-monthly-customer-levels.ts
import { prisma } from '@/lib/prisma';

type Period = {
    periodKey: string; // ex: "2026-01"
    start: Date;
    end: Date; // exclusivo
    effectiveFrom: Date; // início do mês atual
};

// Usa UTC pra evitar “mês quebrando” por timezone do servidor.
function getPreviousMonthPeriodUTC(now = new Date()): Period {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth(); // 0..11

    // mês atual em UTC
    const startCurrentMonth = new Date(Date.UTC(y, m, 1, 0, 0, 0));
    // mês anterior
    const startPrevMonth = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));

    const prevY = startPrevMonth.getUTCFullYear();
    const prevM = startPrevMonth.getUTCMonth() + 1; // 1..12
    const periodKey = `${prevY}-${String(prevM).padStart(2, '0')}`;

    return {
        periodKey,
        start: startPrevMonth,
        end: startCurrentMonth,
        effectiveFrom: startCurrentMonth,
    };
}

type LevelConfigRow = {
    unitId: string;
    level: 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';
    minAppointmentsDone: number;
};

function pickLevel(
    count: number,
    configs: LevelConfigRow[]
): LevelConfigRow['level'] {
    if (!configs.length) return 'BRONZE';

    // garante ordenação crescente por threshold
    const sorted = [...configs].sort(
        (a, b) => a.minAppointmentsDone - b.minAppointmentsDone
    );

    let chosen: LevelConfigRow['level'] = 'BRONZE';
    for (const cfg of sorted) {
        if (count >= cfg.minAppointmentsDone) chosen = cfg.level;
    }
    return chosen;
}

export async function runMonthlyCustomerLevelsJob(opts?: {
    now?: Date;
    onlyCompanyId?: string;
    mode?: 'upsert' | 'skip';
}) {
    const { now, onlyCompanyId, mode } = opts ?? {};
    const runMode: 'upsert' | 'skip' = mode ?? 'upsert';

    const period = getPreviousMonthPeriodUTC(now);

    console.log('[customer-levels] starting', {
        periodKey: period.periodKey,
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        onlyCompanyId: onlyCompanyId ?? null,
        mode: runMode,
    });

    const companies = await prisma.company.findMany({
        where: {
            isActive: true,
            ...(onlyCompanyId ? { id: onlyCompanyId } : {}),
        },
        select: { id: true },
    });

    let totalCompanies = 0;
    let totalUsers = 0;
    let totalStateUpdates = 0;
    let totalPeriodUpserts = 0;

    for (const c of companies) {
        totalCompanies++;

        // 1) contar checkouts de AGENDAMENTO (Appointment.checkedOutAt) no mês anterior, por usuário
        const counts = await prisma.appointment.groupBy({
            by: ['clientId'],
            where: {
                companyId: c.id,
                checkedOutAt: {
                    gte: period.start,
                    lt: period.end,
                },
            },
            _count: { _all: true },
        });

        if (!counts.length) continue;

        // 2) buscar units da empresa (para replicar state/period em todas)
        const units = await prisma.unit.findMany({
            where: { companyId: c.id, isActive: true },
            select: { id: true },
        });

        if (!units.length) continue;

        // 3) buscar configs de thresholds por unit (iremos usar as configs da unit
        // e como você confirmou "replica em todas as units", vamos escolher uma unit
        // como base (a primeira ativa). Depois replicamos o earnedLevel igual em todas.
        const baseUnitId = units[0].id;

        const configs = await prisma.customerLevelConfig.findMany({
            where: { companyId: c.id, unitId: baseUnitId },
            select: { unitId: true, level: true, minAppointmentsDone: true },
        });

        const configsTyped: LevelConfigRow[] = configs.map((x) => ({
            unitId: x.unitId,
            level: x.level as LevelConfigRow['level'],
            minAppointmentsDone: x.minAppointmentsDone ?? 0,
        }));

        // Se estiver em modo "skip", removemos users que já têm period calculado na baseUnit
        // (como você replica em todas as units, isso já é um bom proxy).
        let countsToProcess = counts;

        if (runMode === 'skip') {
            const existing = await prisma.customerLevelPeriod.findMany({
                where: {
                    companyId: c.id,
                    unitId: baseUnitId,
                    periodKey: period.periodKey,
                    userId: { in: counts.map((x) => x.clientId) },
                },
                select: { userId: true },
            });

            const doneSet = new Set(existing.map((e) => e.userId));
            countsToProcess = counts.filter((x) => !doneSet.has(x.clientId));
        }

        if (!countsToProcess.length) continue;

        for (const row of countsToProcess) {
            totalUsers++;

            const userId = row.clientId;
            const apptCount = row._count._all;

            const earnedLevel = pickLevel(apptCount, configsTyped);

            // 4) replicar em todas as units: period + state
            await prisma.$transaction(
                units.map((u) =>
                    prisma.customerLevelPeriod.upsert({
                        where: {
                            unitId_userId_periodKey: {
                                unitId: u.id,
                                userId,
                                periodKey: period.periodKey,
                            },
                        },
                        create: {
                            companyId: c.id,
                            unitId: u.id,
                            userId,
                            periodKey: period.periodKey,
                            appointmentsDone: apptCount,
                            ordersCompleted: 0,
                            earnedLevel: earnedLevel as any,
                            computedAt: new Date(),
                        },
                        update: {
                            appointmentsDone: apptCount,
                            earnedLevel: earnedLevel as any,
                            computedAt: new Date(),
                        },
                    })
                )
            );
            totalPeriodUpserts += units.length;

            await prisma.$transaction(
                units.map((u) =>
                    prisma.customerLevelState.upsert({
                        where: {
                            unitId_userId: { unitId: u.id, userId },
                        },
                        create: {
                            companyId: c.id,
                            unitId: u.id,
                            userId,
                            levelCurrent: earnedLevel as any,
                            levelEarnedLastPeriod: earnedLevel as any,
                            levelEffectiveFrom: period.effectiveFrom,
                        },
                        update: {
                            levelCurrent: earnedLevel as any,
                            levelEarnedLastPeriod: earnedLevel as any,
                            levelEffectiveFrom: period.effectiveFrom,
                        },
                    })
                )
            );
            totalStateUpdates += units.length;
        }
    }

    console.log('[customer-levels] done', {
        totalCompanies,
        totalUsers,
        totalPeriodUpserts,
        totalStateUpdates,
    });

    return {
        ok: true,
        periodKey: period.periodKey,
        totalCompanies,
        totalUsers,
        totalPeriodUpserts,
        totalStateUpdates,
    };
}

// Permite rodar manualmente via node/tsx
if (require.main === module) {
    runMonthlyCustomerLevelsJob()
        .then((r) => {
            console.log('[customer-levels] success', r);
            process.exit(0);
        })
        .catch((err) => {
            console.error('[customer-levels] failed', err);
            process.exit(1);
        });
}
