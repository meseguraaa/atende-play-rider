// src/app/professional/availability/page.tsx
import type { Metadata } from 'next';

import { prisma } from '@/lib/prisma';
import { requireProfessionalSession } from '@/lib/professional-permissions';

import type { WeeklyAvailabilityState } from '@/components/professional/weekly-availability-form/weekly-availability-form';

import { DailyExceptionModal } from '@/components/professional/daily-exception-modal/daily-exception-modal';
import { DailyExceptionsList } from '@/components/professional/daily-exceptions-list/daily-exceptions-list';
import { WeeklyAvailabilityClient } from '@/components/professional/weekly-availability-client/weekly-availability-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Profissional | Disponibilidade',
};

function normalizeSlotIntervalMinutes(v: unknown): 15 | 30 | 45 | 60 {
    const n = Number(v);
    if (n === 15 || n === 30 || n === 45 || n === 60) return n;
    return 30;
}

function getDefaultEndTime(slotIntervalMinutes: 15 | 30 | 45 | 60) {
    if (slotIntervalMinutes === 15) return '23:45';
    if (slotIntervalMinutes === 30) return '23:30';
    if (slotIntervalMinutes === 45) return '23:15';
    return '23:00';
}

function createDefaultWeeklyState(
    slotIntervalMinutes: 15 | 30 | 45 | 60
): WeeklyAvailabilityState {
    const endTime = getDefaultEndTime(slotIntervalMinutes);

    return {
        0: { active: false, startTime: '00:00', endTime }, // domingo off
        1: { active: true, startTime: '00:00', endTime }, // segunda
        2: { active: true, startTime: '00:00', endTime }, // terça
        3: { active: true, startTime: '00:00', endTime }, // quarta
        4: { active: true, startTime: '00:00', endTime }, // quinta
        5: { active: true, startTime: '00:00', endTime }, // sexta
        6: { active: true, startTime: '00:00', endTime }, // sábado
    };
}

async function getProfessionalScopeOrThrow() {
    const session = await requireProfessionalSession();

    const companyId = String(session.companyId || '').trim();
    const professionalId = String(session.professionalId || '').trim();
    const unitId = String(session.unitId || '').trim();

    if (!companyId) throw new Error('missing_company');
    if (!professionalId) throw new Error('missing_professional');
    if (!unitId) throw new Error('missing_active_unit');

    // 🔒 Hard lock: valida vínculo e unidade ativa dentro da company
    const active = await prisma.professionalUnit.findFirst({
        where: {
            companyId,
            professionalId,
            unitId,
            isActive: true,
            unit: { isActive: true },
        },
        select: {
            id: true,
            unit: {
                select: {
                    slotIntervalMinutes: true,
                },
            },
        },
    });

    if (!active) throw new Error('missing_active_unit');

    return {
        companyId,
        professionalId,
        unitId,
        slotIntervalMinutes: normalizeSlotIntervalMinutes(
            active.unit?.slotIntervalMinutes
        ),
    };
}

export default async function ProfessionalAvailabilityPage() {
    const scope = await getProfessionalScopeOrThrow();

    // Padrão inicial (mesmo padrão do form)
    const initialState: WeeklyAvailabilityState = createDefaultWeeklyState(
        scope.slotIntervalMinutes
    );

    // Busca o padrão semanal salvo (tenant/unit lock)
    const weeklyAvailabilities =
        await prisma.professionalWeeklyAvailability.findMany({
            where: {
                companyId: scope.companyId,
                professionalId: scope.professionalId,
                unitId: scope.unitId,
            },
            include: { intervals: true },
            orderBy: { weekday: 'asc' },
        });

    // Aplica o que vier do banco por cima do default
    for (const item of weeklyAvailabilities) {
        const weekday = item.weekday;
        if (typeof weekday !== 'number' || weekday < 0 || weekday > 6) continue;

        const key = weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6;

        initialState[key].active = !!item.isActive;

        const interval = item.intervals?.[0];
        if (interval?.startTime && interval?.endTime) {
            initialState[key].startTime = String(interval.startTime);
            initialState[key].endTime = String(interval.endTime);
        }
    }

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-title text-content-primary">
                        Disponibilidade
                    </h1>
                    <p className="text-paragraph-medium-size text-content-secondary">
                        Defina seus horários disponíveis para receber
                        agendamentos e crie exceções em dias específicos.
                    </p>
                </div>
            </header>

            <section className="space-y-6">
                <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-4 space-y-3">
                    <WeeklyAvailabilityClient
                        initialValue={initialState}
                        slotIntervalMinutes={scope.slotIntervalMinutes}
                        leftAction={
                            <DailyExceptionModal
                                professionalId={scope.professionalId}
                            />
                        }
                    />
                </div>

                <DailyExceptionsList professionalId={scope.professionalId} />
            </section>
        </div>
    );
}
