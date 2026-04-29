import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { CustomerLevel } from '@prisma/client';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SendCampaignCard } from '@/components/admin/communication/send-campaign-card/send-campaign-card';
import { BirthdayMessageCard } from '@/components/admin/communication/birthday-message-card/birthday-message-card';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Comunicação',
};

const UNIT_COOKIE_NAME = 'admin_unit_context';
const UNIT_ALL_VALUE = 'all';

const LEVEL_RANK: Record<CustomerLevel, number> = {
    BRONZE: 1,
    PRATA: 2,
    OURO: 3,
    DIAMANTE: 4,
};

type LevelFilter = 'all' | CustomerLevel;
type ClientStatusFilter = 'active' | 'inactive' | 'all';
type PlanFilter = 'all' | 'with_active_plan' | 'without_active_plan';
type LastVisitFilter = 'all' | 'lt_30' | 'gt_30' | 'gt_60' | 'never';
type FrequencyFilter =
    | 'all'
    | 'very_frequent'
    | 'recurring'
    | 'sporadic'
    | 'no_history';

function getSingleParam(v: string | string[] | undefined): string | undefined {
    if (v == null) return undefined;
    return Array.isArray(v) ? v[0] : v;
}

function normalizeLevel(v: string | undefined): LevelFilter {
    if (v === 'BRONZE') return 'BRONZE';
    if (v === 'PRATA') return 'PRATA';
    if (v === 'OURO') return 'OURO';
    if (v === 'DIAMANTE') return 'DIAMANTE';
    return 'all';
}

function normalizeClientStatus(v: string | undefined): ClientStatusFilter {
    if (v === 'inactive') return 'inactive';
    if (v === 'all') return 'all';
    return 'active';
}

function normalizePlanFilter(v: string | undefined): PlanFilter {
    if (v === 'with_active_plan') return 'with_active_plan';
    if (v === 'without_active_plan') return 'without_active_plan';
    return 'all';
}

function normalizeLastVisit(v: string | undefined): LastVisitFilter {
    if (v === 'lt_30') return 'lt_30';
    if (v === 'gt_30') return 'gt_30';
    if (v === 'gt_60') return 'gt_60';
    if (v === 'never') return 'never';
    return 'all';
}

function normalizeFrequency(v: string | undefined): FrequencyFilter {
    if (v === 'very_frequent') return 'very_frequent';
    if (v === 'recurring') return 'recurring';
    if (v === 'sporadic') return 'sporadic';
    if (v === 'no_history') return 'no_history';
    return 'all';
}

function normalizeMinSpent(v: string | undefined): number {
    const n = Number(String(v ?? '').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

function pickHighestLevel(levels: CustomerLevel[]): CustomerLevel {
    let best: CustomerLevel = 'BRONZE';
    for (const l of levels) {
        if (LEVEL_RANK[l] > LEVEL_RANK[best]) best = l;
    }
    return best;
}

function digitsOnly(value: string | null | undefined) {
    return String(value ?? '').replace(/\D/g, '');
}

function hasValidWhatsappPhone(value: string | null | undefined) {
    const digits = digitsOnly(value);
    return digits.length >= 10;
}

function buildFrequencyKey(doneDates: Date[]): Exclude<FrequencyFilter, 'all'> {
    if (doneDates.length === 0) return 'no_history';
    if (doneDates.length === 1) return 'sporadic';

    const sorted = [...doneDates].sort((a, b) => a.getTime() - b.getTime());

    const diffs: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
        const diffMs = sorted[i].getTime() - sorted[i - 1].getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        diffs.push(diffDays);
    }

    if (diffs.length === 0) return 'sporadic';

    const avgDays = diffs.reduce((acc, d) => acc + d, 0) / diffs.length;

    if (avgDays <= 10) return 'very_frequent';
    if (avgDays <= 25) return 'recurring';
    return 'sporadic';
}

function matchesLastVisitFilter(
    lastDoneDate: Date | null,
    filter: LastVisitFilter,
    now: Date
) {
    if (filter === 'all') return true;
    if (filter === 'never') return !lastDoneDate;
    if (!lastDoneDate) return false;

    const diffMs = now.getTime() - lastDoneDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (filter === 'lt_30') return diffDays < 30;
    if (filter === 'gt_30') return diffDays > 30;
    if (filter === 'gt_60') return diffDays > 60;

    return true;
}

function matchesFrequencyFilter(
    frequency: Exclude<FrequencyFilter, 'all'>,
    filter: FrequencyFilter
) {
    if (filter === 'all') return true;
    return frequency === filter;
}

async function requireCompanyIdFromContext(session: any) {
    const companyId = String(session?.companyId ?? '').trim();

    if (!companyId) {
        throw new Error('companyId não encontrado na sessão.');
    }

    return companyId;
}

function FiltersForm({
    level,
    status,
    plan,
    lastVisit,
    frequency,
    minSpent,
}: {
    level: LevelFilter;
    status: ClientStatusFilter;
    plan: PlanFilter;
    lastVisit: LastVisitFilter;
    frequency: FrequencyFilter;
    minSpent: number;
}) {
    return (
        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
            <form method="GET" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    <div>
                        <label className="text-[11px] text-content-secondary">
                            Nível do cliente
                        </label>
                        <select
                            name="level"
                            defaultValue={level}
                            className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                        >
                            <option value="all">Todos</option>
                            <option value="BRONZE">Bronze</option>
                            <option value="PRATA">Prata</option>
                            <option value="OURO">Ouro</option>
                            <option value="DIAMANTE">Diamante</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-[11px] text-content-secondary">
                            Status
                        </label>
                        <select
                            name="status"
                            defaultValue={status}
                            className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                        >
                            <option value="active">Ativos</option>
                            <option value="inactive">Inativos</option>
                            <option value="all">Ativos/Inativos</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-[11px] text-content-secondary">
                            Planos
                        </label>
                        <select
                            name="plan"
                            defaultValue={plan}
                            className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                        >
                            <option value="all">Todos</option>
                            <option value="with_active_plan">
                                Com plano ativo
                            </option>
                            <option value="without_active_plan">
                                Sem plano ativo
                            </option>
                        </select>
                    </div>

                    <div>
                        <label className="text-[11px] text-content-secondary">
                            Último atendimento
                        </label>
                        <select
                            name="lastVisit"
                            defaultValue={lastVisit}
                            className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                        >
                            <option value="all">Todos</option>
                            <option value="lt_30">
                                Atendidos há menos de 30 dias
                            </option>
                            <option value="gt_30">
                                Atendidos há mais de 30 dias
                            </option>
                            <option value="gt_60">
                                Atendidos há mais de 60 dias
                            </option>
                            <option value="never">Nunca atendidos</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-[11px] text-content-secondary">
                            Frequência
                        </label>
                        <select
                            name="frequency"
                            defaultValue={frequency}
                            className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                        >
                            <option value="all">Todas</option>
                            <option value="very_frequent">
                                Muito frequente
                            </option>
                            <option value="recurring">Recorrente</option>
                            <option value="sporadic">Esporádico</option>
                            <option value="no_history">Sem histórico</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-[11px] text-content-secondary">
                            Gastaram mais de (R$)
                        </label>
                        <Input
                            name="minSpent"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={minSpent > 0 ? String(minSpent) : ''}
                            placeholder="Ex: 300"
                            className="h-10 bg-background-secondary border-border-primary"
                        />
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button type="submit" variant="edit2" size="sm">
                        Aplicar filtros
                    </Button>
                    <Button asChild variant="outline" size="sm">
                        <Link href="/admin/communication">Limpar</Link>
                    </Button>
                </div>
            </form>
        </section>
    );
}

export default async function AdminCommunicationPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await requireAdminForModule('COMMUNICATION');
    const companyId = await requireCompanyIdFromContext(session);

    const resolvedSearchParams = await searchParams;

    const level = normalizeLevel(getSingleParam(resolvedSearchParams.level));
    const status = normalizeClientStatus(
        getSingleParam(resolvedSearchParams.status)
    );
    const plan = normalizePlanFilter(getSingleParam(resolvedSearchParams.plan));
    const lastVisit = normalizeLastVisit(
        getSingleParam(resolvedSearchParams.lastVisit)
    );
    const frequency = normalizeFrequency(
        getSingleParam(resolvedSearchParams.frequency)
    );
    const minSpent = normalizeMinSpent(
        getSingleParam(resolvedSearchParams.minSpent)
    );

    const settings = await prisma.companyCommunicationSettings.findUnique({
        where: { companyId },
        select: {
            whatsappCredits: true,
            birthdayMessageEnabled: true,
            birthdayMessageContent: true,
            freeWhatsappUsedAt: true,
        },
    });

    const cookieStore = await cookies();
    const selectedUnit =
        cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

    const now = new Date();
    const startOfMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );

    const freeAvailable =
        !settings?.freeWhatsappUsedAt ||
        settings.freeWhatsappUsedAt < startOfMonth;

    const membershipWhere: any = {
        companyId,
        role: 'CLIENT',
        ...(status === 'active'
            ? { isActive: true }
            : status === 'inactive'
              ? { isActive: false }
              : {}),
    };

    const whereUser: any = {
        companyMemberships: {
            some: membershipWhere,
        },
    };

    const candidateUsers = await prisma.user.findMany({
        where: whereUser,
        orderBy: { name: 'asc' },
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
        },
    });

    const candidateIds = candidateUsers.map((u) => u.id);

    let eligibleCount = 0;
    let eligibleWithPhoneCount = 0;

    if (candidateIds.length > 0) {
        const memberships = await prisma.companyMember.findMany({
            where: {
                companyId,
                userId: { in: candidateIds },
                role: 'CLIENT',
            },
            select: {
                userId: true,
                isActive: true,
            },
        });

        const isActiveByUserId = new Map<string, boolean>();
        for (const m of memberships) {
            isActiveByUserId.set(m.userId, m.isActive);
        }

        const levelStates = await prisma.customerLevelState.findMany({
            where: {
                companyId,
                userId: { in: candidateIds },
                ...(selectedUnit !== UNIT_ALL_VALUE
                    ? { unitId: selectedUnit }
                    : {}),
            },
            select: {
                userId: true,
                levelCurrent: true,
            },
        });

        const levelByUserId = new Map<string, CustomerLevel>();

        if (selectedUnit !== UNIT_ALL_VALUE) {
            for (const st of levelStates) {
                levelByUserId.set(st.userId, st.levelCurrent);
            }
        } else {
            const levelsPerUser = new Map<string, CustomerLevel[]>();

            for (const st of levelStates) {
                const arr = levelsPerUser.get(st.userId) ?? [];
                arr.push(st.levelCurrent);
                levelsPerUser.set(st.userId, arr);
            }

            for (const [userId, levels] of levelsPerUser.entries()) {
                levelByUserId.set(userId, pickHighestLevel(levels));
            }
        }

        const appointments = await prisma.appointment.findMany({
            where: {
                companyId,
                clientId: { in: candidateIds },
                ...(selectedUnit !== UNIT_ALL_VALUE
                    ? { unitId: selectedUnit }
                    : {}),
            },
            select: {
                clientId: true,
                status: true,
                scheduleAt: true,
                servicePriceAtTheTime: true,
                clientPlanId: true,
            },
        });

        const clientPlans = await prisma.clientPlan.findMany({
            where: {
                companyId,
                clientId: { in: candidateIds },
            },
            select: {
                clientId: true,
                status: true,
                expiresAt: true,
                planPriceSnapshot: true,
            },
        });

        const completedOrders = await prisma.order.findMany({
            where: {
                companyId,
                clientId: { in: candidateIds },
                status: 'COMPLETED',
                ...(selectedUnit !== UNIT_ALL_VALUE
                    ? { unitId: selectedUnit }
                    : {}),
            },
            select: {
                clientId: true,
                totalAmount: true,
            },
        });

        const appointmentsByClientId = new Map<
            string,
            {
                status: string;
                scheduleAt: Date;
                servicePriceAtTheTime: any;
                clientPlanId: string | null;
            }[]
        >();

        for (const apt of appointments) {
            const arr = appointmentsByClientId.get(apt.clientId) ?? [];
            arr.push({
                status: apt.status,
                scheduleAt: apt.scheduleAt,
                servicePriceAtTheTime: apt.servicePriceAtTheTime,
                clientPlanId: apt.clientPlanId ?? null,
            });
            appointmentsByClientId.set(apt.clientId, arr);
        }

        const plansByClientId = new Map<
            string,
            {
                status: string;
                expiresAt: Date;
                planPriceSnapshot: any;
            }[]
        >();

        for (const cp of clientPlans) {
            const arr = plansByClientId.get(cp.clientId) ?? [];
            arr.push({
                status: cp.status,
                expiresAt: cp.expiresAt,
                planPriceSnapshot: cp.planPriceSnapshot,
            });
            plansByClientId.set(cp.clientId, arr);
        }

        const ordersByClientId = new Map<string, number>();
        for (const order of completedOrders) {
            const current = ordersByClientId.get(order.clientId ?? '') ?? 0;
            ordersByClientId.set(
                order.clientId ?? '',
                current + Number(order.totalAmount ?? 0)
            );
        }

        const filteredUsers = candidateUsers.filter((user) => {
            const userLevel = levelByUserId.get(user.id) ?? 'BRONZE';
            if (level !== 'all' && userLevel !== level) return false;

            const userPlans = plansByClientId.get(user.id) ?? [];
            const hasActivePlan = userPlans.some(
                (cp) => cp.status === 'ACTIVE' && cp.expiresAt >= now
            );

            if (plan === 'with_active_plan' && !hasActivePlan) return false;
            if (plan === 'without_active_plan' && hasActivePlan) return false;

            const userAppointments = appointmentsByClientId.get(user.id) ?? [];
            const doneAppointments = userAppointments.filter(
                (apt) => apt.status === 'DONE'
            );

            const doneDates = doneAppointments.map((apt) => apt.scheduleAt);
            const lastDoneDate =
                doneDates.length > 0
                    ? new Date(Math.max(...doneDates.map((d) => d.getTime())))
                    : null;

            if (!matchesLastVisitFilter(lastDoneDate, lastVisit, now)) {
                return false;
            }

            const frequencyKey = buildFrequencyKey(doneDates);
            if (!matchesFrequencyFilter(frequencyKey, frequency)) {
                return false;
            }

            const totalFromAppointments = doneAppointments.reduce(
                (sum, apt) => {
                    if (apt.clientPlanId) return sum;
                    return sum + Number(apt.servicePriceAtTheTime ?? 0);
                },
                0
            );

            const totalFromPlans = userPlans.reduce((sum, cp) => {
                return sum + Number(cp.planPriceSnapshot ?? 0);
            }, 0);

            const totalFromOrders = ordersByClientId.get(user.id) ?? 0;

            const totalSpent =
                totalFromAppointments + totalFromPlans + totalFromOrders;

            if (minSpent > 0 && totalSpent < minSpent) return false;

            return true;
        });

        eligibleCount = filteredUsers.length;
        eligibleWithPhoneCount = filteredUsers.filter((user) =>
            hasValidWhatsappPhone(user.phone)
        ).length;
    }

    const hasAudience = eligibleWithPhoneCount > 0;
    const balanceNow = Number(settings?.whatsappCredits ?? 0);

    // 1 por campanha
    const estimatedConsumptionLabel = !hasAudience
        ? 'Nenhum envio elegível'
        : freeAvailable
          ? '1 grátis'
          : '1 crédito';

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <header className="space-y-1">
                <h1 className="text-title text-content-primary">Comunicação</h1>
                <p className="text-paragraph-medium text-content-secondary">
                    Segmente seus clientes e prepare campanhas de envio manual
                    via WhatsApp.
                </p>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-2">
                    <p className="text-label-small text-content-secondary">
                        WhatsApp
                    </p>
                    <p className="text-lg font-semibold text-content-primary">
                        Ativo
                    </p>
                    <p className="text-xs text-content-secondary">
                        1 mensagem grátis por mês disponível para a empresa
                    </p>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-2">
                    <p className="text-label-small text-content-secondary">
                        Créditos disponíveis
                    </p>
                    <p className="text-lg font-semibold text-content-primary">
                        {balanceNow}
                    </p>
                    <p className="text-xs text-content-secondary">
                        Créditos extras prontos para campanhas
                    </p>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-2">
                    <p className="text-label-small text-content-secondary">
                        Mensagem grátis do mês
                    </p>
                    <p
                        className={`text-lg font-semibold ${
                            freeAvailable ? 'text-green-600' : 'text-red-600'
                        }`}
                    >
                        {freeAvailable ? 'Disponível' : 'Já utilizada'}
                    </p>
                    <p className="text-xs text-content-secondary">
                        Renovação automática mensal
                    </p>
                </div>
            </section>

            <BirthdayMessageCard
                enabled={Boolean(settings?.birthdayMessageEnabled)}
            />

            <FiltersForm
                level={level}
                status={status}
                plan={plan}
                lastVisit={lastVisit}
                frequency={frequency}
                minSpent={minSpent}
            />

            <SendCampaignCard
                eligibleCount={eligibleCount}
                eligibleWithPhoneCount={eligibleWithPhoneCount}
                estimatedConsumptionLabel={estimatedConsumptionLabel}
                balanceNow={balanceNow}
                freeAvailable={freeAvailable}
                filters={{
                    q: '',
                    level,
                    status,
                    plan,
                    lastVisit,
                    frequency,
                    minSpent,
                    unitId: selectedUnit,
                }}
            />
        </div>
    );
}
