// src/app/admin/clients/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CustomerLevel } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
    PaginationEllipsis,
} from '@/components/ui/pagination';

import { WhatsAppLogo } from '@/components/icons/whatsapp-logo';
import { AdminNewClientDialog } from '@/components/admin/clients/admin-new-client-dialog/admin-new-client-dialog';
import { AdminEditClientDialog } from '@/components/admin/clients/admin-edit-client-dialog/admin-edit-client-dialog';
import { AdminClientStatusButton } from '@/components/admin/clients/admin-client-status-button/admin-client-status-button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Clientes',
};

const COMPANY_COOKIE_NAME = 'admin_company_context';
const UNIT_COOKIE_NAME = 'admin_unit_context';
const UNIT_ALL_VALUE = 'all';

const LEVEL_RANK: Record<CustomerLevel, number> = {
    BRONZE: 1,
    PRATA: 2,
    OURO: 3,
    DIAMANTE: 4,
};

type LevelFilter = 'all' | CustomerLevel;
function normalizeLevel(v: string | undefined): LevelFilter {
    if (v === 'BRONZE') return 'BRONZE';
    if (v === 'PRATA') return 'PRATA';
    if (v === 'OURO') return 'OURO';
    if (v === 'DIAMANTE') return 'DIAMANTE';
    return 'all';
}

function levelLabel(level: CustomerLevel) {
    switch (level) {
        case 'BRONZE':
            return 'Bronze';
        case 'PRATA':
            return 'Prata';
        case 'OURO':
            return 'Ouro';
        case 'DIAMANTE':
            return 'Diamante';
    }
}

function levelBadgeClass(level: CustomerLevel) {
    switch (level) {
        case 'BRONZE':
            return 'bg-amber-500/10 text-amber-700 border-amber-500/30';
        case 'PRATA':
            return 'bg-slate-500/10 text-slate-200 border-slate-500/30';
        case 'OURO':
            return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30';
        case 'DIAMANTE':
            return 'bg-sky-500/10 text-sky-700 border-sky-500/30';
    }
}

function pickHighestLevel(levels: CustomerLevel[]): CustomerLevel {
    let best: CustomerLevel = 'BRONZE';
    for (const l of levels) {
        if (LEVEL_RANK[l] > LEVEL_RANK[best]) best = l;
    }
    return best;
}

function buildFrequencyLabel(doneDates: Date[]): string {
    if (doneDates.length === 0) return 'Sem histórico';
    if (doneDates.length === 1) return 'Poucas visitas';

    const sorted = [...doneDates].sort((a, b) => a.getTime() - b.getTime());

    const diffs: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
        const diffMs = sorted[i].getTime() - sorted[i - 1].getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        diffs.push(diffDays);
    }

    if (diffs.length === 0) return 'Poucas visitas';

    const avgDays = diffs.reduce((acc, d) => acc + d, 0) / diffs.length;

    if (avgDays <= 10) return 'Muito frequente';
    if (avgDays <= 25) return `A cada ~${Math.round(avgDays)} dias`;
    return 'Visita esporádica';
}

function buildWhatsappMessage({
    clientName,
    companyName,
}: {
    clientName: string;
    companyName: string;
}) {
    return `Olá ${clientName}! Tudo bem? Aqui é da ${companyName}. Estamos entrando em contato para dizer que estamos à disposição para o que você precisar. Se quiser agendar um horário ou tirar alguma dúvida, é só responder essa mensagem. Será um prazer atendê-lo(a)!`;
}

type LastCheckedOutAppointmentItem = {
    id: string;
    serviceName: string;
    checkedOutAt: Date;
};

type ClientRow = {
    id: string;
    name: string;
    email: string;
    phone: string;
    image: string | null;
    createdAt: Date;
    birthday: Date | null;
    isActive: boolean;

    customerLevel: CustomerLevel;

    totalAppointments: number;
    doneCount: number;
    canceledCount: number;
    canceledWithFeeCount: number;
    totalCancelFee: number;
    totalPlans: number;
    hasActivePlan: boolean;
    frequencyLabel: string;
    lastDoneDate: Date | null;
    totalSpent: number;
    lastCheckedOutAppointments: LastCheckedOutAppointmentItem[];

    addresses: {
        id: string;
        label: string | null;
        street: string | null;
        number: string | null;
        city: string | null;
        state: string | null;
        isDefault: boolean;
    }[];

    whatsappUrl: string | null;
};

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function buildPageHref(
    searchParams: Record<string, string | string[] | undefined>,
    nextPage: number
) {
    const sp = new URLSearchParams();

    for (const [key, value] of Object.entries(searchParams)) {
        if (value == null) continue;

        if (Array.isArray(value)) {
            for (const v of value) sp.append(key, v);
        } else {
            sp.set(key, value);
        }
    }

    sp.set('page', String(nextPage));
    return `?${sp.toString()}`;
}

function getPageRange(current: number, total: number) {
    const delta = 2;
    const left = Math.max(1, current - delta);
    const right = Math.min(total, current + delta);

    const pages: number[] = [];
    for (let i = left; i <= right; i++) pages.push(i);

    const showLeftEllipsis = left > 2;
    const showRightEllipsis = right < total - 1;

    const firstPage = 1;
    const lastPage = total;

    return {
        pages,
        firstPage,
        lastPage,
        showLeftEllipsis,
        showRightEllipsis,
    };
}

function getSingleParam(v: string | string[] | undefined): string | undefined {
    if (v == null) return undefined;
    return Array.isArray(v) ? v[0] : v;
}

type SortKey = 'name_asc' | 'name_desc' | 'createdAt_desc' | 'createdAt_asc';
function normalizeSort(v: string | undefined): SortKey {
    if (v === 'name_desc') return 'name_desc';
    if (v === 'createdAt_desc') return 'createdAt_desc';
    if (v === 'createdAt_asc') return 'createdAt_asc';
    return 'name_asc';
}

type BirthdayFilter = 'all' | 'day' | 'week' | 'month';
function normalizeBirthday(v: string | undefined): BirthdayFilter {
    if (v === 'day') return 'day';
    if (v === 'week') return 'week';
    if (v === 'month') return 'month';
    return 'all';
}

type ClientStatusFilter = 'active' | 'inactive' | 'all';
function normalizeClientStatus(v: string | undefined): ClientStatusFilter {
    if (v === 'inactive') return 'inactive';
    if (v === 'all') return 'all';
    return 'active';
}

function sameMonthDay(a: Date, b: Date) {
    return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isBirthdayInFilter(
    birthday: Date | null,
    filter: BirthdayFilter,
    now: Date
) {
    if (!birthday) return false;
    if (filter === 'all') return true;

    if (filter === 'day') {
        return sameMonthDay(birthday, now);
    }

    if (filter === 'month') {
        return birthday.getMonth() === now.getMonth();
    }

    for (let i = 0; i < 7; i++) {
        const d = addDays(now, i);
        if (sameMonthDay(birthday, d)) return true;
    }
    return false;
}

async function requireCompanyIdFromContext(session: any) {
    const sCompanyId = String(session?.companyId ?? '').trim();
    if (sCompanyId) return sCompanyId;

    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
    if (cookieCompanyId) return cookieCompanyId;

    const userId = String(session?.userId ?? '').trim();
    if (userId) {
        const membership = await prisma.companyMember.findFirst({
            where: { userId, isActive: true },
            orderBy: { createdAt: 'asc' },
            select: { companyId: true },
        });
        if (membership?.companyId) return membership.companyId;
    }

    throw new Error(
        `companyId ausente (session.companyId, cookie "${COMPANY_COOKIE_NAME}" e sem fallback por membership).`
    );
}

function FiltersForm({
    q,
    sort,
    bday,
    level,
    status,
}: {
    q: string;
    sort: SortKey;
    bday: BirthdayFilter;
    level: LevelFilter;
    status: ClientStatusFilter;
}) {
    return (
        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
            <form method="GET" className="space-y-4">
                <div className="flex flex-col md:flex-row gap-3 md:items-end">
                    <div className="w-full md:w-40">
                        <label className="text-[11px] text-content-secondary">
                            Buscar
                        </label>
                        <Input
                            name="q"
                            defaultValue={q}
                            placeholder="Nome, e-mail ou telefone..."
                            className="h-10 bg-background-secondary border-border-primary"
                        />
                    </div>

                    <div className="w-full md:w-40">
                        <label className="text-[11px] text-content-secondary">
                            Ordenar por
                        </label>
                        <select
                            name="sort"
                            defaultValue={sort}
                            className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                        >
                            <option value="name_asc">Nome (A-Z)</option>
                            <option value="name_desc">Nome (Z-A)</option>
                            <option value="createdAt_desc">
                                Cadastro (mais novos)
                            </option>
                            <option value="createdAt_asc">
                                Cadastro (mais antigos)
                            </option>
                        </select>
                    </div>

                    <div className="w-full md:w-40">
                        <label className="text-[11px] text-content-secondary">
                            Aniversário
                        </label>
                        <select
                            name="bday"
                            defaultValue={bday}
                            className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                        >
                            <option value="all">Todos</option>
                            <option value="day">Do dia</option>
                            <option value="week">Da semana</option>
                            <option value="month">Do mês</option>
                        </select>
                    </div>

                    <div className="w-full md:w-40">
                        <label className="text-[11px] text-content-secondary">
                            Nível
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

                    <div className="w-full md:w-40">
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

                    <div className="flex gap-2">
                        <Button type="submit" variant="edit2" size="sm">
                            Filtrar
                        </Button>
                        <Button asChild variant="outline" size="sm">
                            <Link href="/admin/client">Limpar</Link>
                        </Button>
                    </div>
                </div>
            </form>
        </section>
    );
}

export default async function AdminClientsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await requireAdminForModule('CLIENTS');
    const companyId = await requireCompanyIdFromContext(session);

    const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
    });

    const companyName = company?.name?.trim() || 'nossa equipe';

    const resolvedSearchParams = await searchParams;

    const qRaw = getSingleParam(resolvedSearchParams.q);
    const q = (qRaw ?? '').trim();

    const sort = normalizeSort(getSingleParam(resolvedSearchParams.sort));
    const level = normalizeLevel(getSingleParam(resolvedSearchParams.level));
    const bday = normalizeBirthday(getSingleParam(resolvedSearchParams.bday));
    const status = normalizeClientStatus(
        getSingleParam(resolvedSearchParams.status)
    );

    const PAGE_SIZE = 10;

    const pageParamRaw = resolvedSearchParams?.page;
    const pageParam = Array.isArray(pageParamRaw)
        ? pageParamRaw[0]
        : pageParamRaw;

    const requestedPage = Number(pageParam ?? '1');
    const safeRequestedPage = Number.isFinite(requestedPage)
        ? requestedPage
        : 1;

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

    if (q.length > 0) {
        whereUser.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
        ];
    }

    const orderBy =
        sort === 'name_desc'
            ? ({ name: 'desc' } as const)
            : sort === 'createdAt_desc'
              ? ({ createdAt: 'desc' } as const)
              : sort === 'createdAt_asc'
                ? ({ createdAt: 'asc' } as const)
                : ({ name: 'asc' } as const);

    const allCandidates = await prisma.user.findMany({
        where: whereUser,
        orderBy,
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true,
            birthday: true,
            image: true,
        },
    });

    const today = new Date();

    const bdayFilteredCandidates =
        bday === 'all'
            ? allCandidates
            : allCandidates.filter((u) =>
                  isBirthdayInFilter(u.birthday ?? null, bday, today)
              );

    const cookieStore = await cookies();
    const selectedUnit =
        cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

    const candidateIds = bdayFilteredCandidates.map((u) => u.id);

    if (candidateIds.length === 0) {
        return (
            <div className="max-w-7xl mx-auto space-y-6">
                <header className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-title text-content-primary">
                            Clientes
                        </h1>
                        <p className="text-paragraph-medium text-content-secondary">
                            Nenhum cliente encontrado com esses filtros.
                        </p>
                        <p className="text-xs text-content-secondary mt-1">
                            Escopo de unidades:{' '}
                            {session?.canSeeAllUnits
                                ? 'todas as unidades'
                                : 'unidade atual'}
                        </p>
                    </div>

                    <AdminNewClientDialog />
                </header>

                <FiltersForm
                    q={q}
                    sort={sort}
                    bday={bday}
                    level={level}
                    status={status}
                />
            </div>
        );
    }

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
            unitId: true,
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

    const candidatesWithLevel = bdayFilteredCandidates.map((u) => ({
        ...u,
        customerLevel: levelByUserId.get(u.id) ?? 'BRONZE',
    }));

    const fullyFilteredCandidates =
        level === 'all'
            ? candidatesWithLevel
            : candidatesWithLevel.filter((u) => u.customerLevel === level);

    const totalClients = fullyFilteredCandidates.length;
    const totalPages = Math.max(1, Math.ceil(totalClients / PAGE_SIZE));
    const page = clampInt(safeRequestedPage, 1, totalPages);

    const pagedUsers = fullyFilteredCandidates.slice(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE
    );

    if (totalClients === 0) {
        return (
            <div className="max-w-7xl mx-auto space-y-6">
                <header className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-title text-content-primary">
                            Clientes
                        </h1>
                        <p className="text-paragraph-medium text-content-secondary">
                            Nenhum cliente encontrado com esses filtros.
                        </p>
                        <p className="text-xs text-content-secondary mt-1">
                            Escopo de unidades:{' '}
                            {session?.canSeeAllUnits
                                ? 'todas as unidades'
                                : 'unidade atual'}
                        </p>
                    </div>

                    <AdminNewClientDialog />
                </header>

                <FiltersForm
                    q={q}
                    sort={sort}
                    bday={bday}
                    level={level}
                    status={status}
                />
            </div>
        );
    }

    const clientIds = pagedUsers.map((u) => u.id);

    const clientAddresses = await prisma.clientAddress.findMany({
        where: {
            companyId,
            clientId: { in: clientIds },
            isActive: true,
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: {
            id: true,
            clientId: true,
            label: true,
            street: true,
            number: true,
            city: true,
            state: true,
            isDefault: true,
        },
    });

    const addressesByClientId = new Map<
        string,
        {
            id: string;
            label: string | null;
            street: string | null;
            number: string | null;
            city: string | null;
            state: string | null;
            isDefault: boolean;
        }[]
    >();

    for (const address of clientAddresses) {
        const current = addressesByClientId.get(address.clientId) ?? [];
        current.push({
            id: address.id,
            label: address.label,
            street: address.street,
            number: address.number,
            city: address.city,
            state: address.state,
            isDefault: address.isDefault,
        });
        addressesByClientId.set(address.clientId, current);
    }

    const services = await prisma.service.findMany({
        where: { companyId },
    });

    const servicePriceById = new Map<string, number>(
        services.map((s) => [s.id, Number((s as any).price)])
    );

    const appointments = await prisma.appointment.findMany({
        where: { companyId, clientId: { in: clientIds } },
        orderBy: { scheduleAt: 'asc' },
    });

    const clientPlans = await prisma.clientPlan.findMany({
        where: { companyId, clientId: { in: clientIds } },
        include: { plan: true },
        orderBy: { startsAt: 'asc' },
    });

    const productOrders = await prisma.order.findMany({
        where: {
            companyId,
            clientId: { in: clientIds },
            status: 'COMPLETED',
            items: { some: { productId: { not: null } } },
        },
        include: { items: true },
    });

    const rows: ClientRow[] = pagedUsers.map((user) => {
        const userAppointments = appointments.filter(
            (apt) => apt.clientId === user.id
        );

        const totalAppointments = userAppointments.length;

        const doneAppointments = userAppointments.filter(
            (apt) => apt.status === 'DONE'
        );
        const canceledAppointments = userAppointments.filter(
            (apt) => apt.status === 'CANCELED'
        );

        const checkedOutAppointments = doneAppointments
            .filter((apt) => apt.checkedOutAt)
            .sort((a, b) => {
                const aTime = a.checkedOutAt
                    ? new Date(a.checkedOutAt).getTime()
                    : 0;
                const bTime = b.checkedOutAt
                    ? new Date(b.checkedOutAt).getTime()
                    : 0;
                return bTime - aTime;
            })
            .slice(0, 5);

        const lastCheckedOutAppointments = checkedOutAppointments.map(
            (apt) => ({
                id: apt.id,
                serviceName: (apt.description ?? '').trim() || 'Serviço',
                checkedOutAt: apt.checkedOutAt as Date,
            })
        );

        const canceledWithFee = canceledAppointments.filter(
            (apt) => (apt as any).cancelFeeApplied
        );

        const canceledWithFeeCount = canceledWithFee.length;

        const totalCancelFee = canceledWithFee.reduce((sum, apt) => {
            const fee = (apt as any).cancelFeeValue
                ? Number((apt as any).cancelFeeValue)
                : 0;
            return sum + fee;
        }, 0);

        const userClientPlans = clientPlans.filter(
            (cp) => cp.clientId === user.id
        );

        const totalPlans = userClientPlans.length;

        const activePlan = userClientPlans.find((cp) => {
            const hasCredits =
                (cp as any).usedBookings < (cp as any).plan.totalBookings;
            const isActive = (cp as any).status === 'ACTIVE';
            const isWithinValidity = (cp as any).endDate >= today;
            return isActive && isWithinValidity && hasCredits;
        });

        const doneDates = doneAppointments.map(
            (apt) => (apt as any).scheduleAt as Date
        );

        const frequencyLabel = buildFrequencyLabel(doneDates);

        const lastDoneDate =
            doneDates.length > 0
                ? new Date(Math.max(...doneDates.map((d) => d.getTime())))
                : null;

        const totalFromAppointments = doneAppointments.reduce((sum, apt) => {
            if ((apt as any).clientPlanId) return sum;

            const snapshot = (apt as any).servicePriceAtTheTime as
                | number
                | bigint
                | null
                | undefined;

            if (snapshot != null) return sum + Number(snapshot);

            const price =
                (apt as any).serviceId &&
                servicePriceById.get((apt as any).serviceId as string);

            return sum + (Number(price) || 0);
        }, 0);

        const totalFromPlans = userClientPlans.reduce(
            (sum, cp) => sum + Number((cp as any).plan.price),
            0
        );

        const userProductOrders = productOrders.filter(
            (order) => (order as any).clientId === user.id
        );

        const totalFromProducts = userProductOrders.reduce(
            (sum, order) => sum + Number((order as any).totalAmount),
            0
        );

        const totalSpent =
            totalFromAppointments + totalFromPlans + totalFromProducts;

        const rawPhone = (user.phone ?? '') as string;
        const phoneDigits = String(rawPhone).replace(/\D/g, '');

        const baseName = user.name ?? 'cliente';
        const whatsappMessage = buildWhatsappMessage({
            clientName: baseName,
            companyName,
        });

        const whatsappUrl =
            phoneDigits.length > 0
                ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
                      whatsappMessage
                  )}`
                : null;

        return {
            id: user.id,
            name: user.name ?? 'Cliente sem nome',
            email: user.email ?? '',
            phone: rawPhone,
            createdAt: user.createdAt,
            birthday: user.birthday ?? null,
            image: user.image ?? null,
            isActive: isActiveByUserId.get(user.id) ?? true,
            customerLevel: (user as any).customerLevel ?? 'BRONZE',
            totalAppointments,
            doneCount: doneAppointments.length,
            canceledCount: canceledAppointments.length,
            canceledWithFeeCount,
            totalCancelFee,
            totalPlans,
            hasActivePlan: !!activePlan,
            frequencyLabel,
            lastDoneDate,
            totalSpent,
            lastCheckedOutAppointments,
            addresses: addressesByClientId.get(user.id) ?? [],
            whatsappUrl,
        };
    });

    const { pages, showLeftEllipsis, showRightEllipsis, firstPage, lastPage } =
        getPageRange(page, totalPages);

    return (
        <div className="space-y-5 max-w-7xl mx-auto">
            <header className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-title text-content-primary">
                            Clientes
                        </h1>
                        <p className="text-paragraph-medium text-content-secondary">
                            Visualize e gerencie os clientes, histórico de
                            atendimentos, planos e níveis.
                        </p>

                        <p className="text-xs text-content-secondary mt-1">
                            Mostrando{' '}
                            <span className="font-semibold text-content-primary">
                                {(page - 1) * PAGE_SIZE + 1}
                            </span>{' '}
                            a{' '}
                            <span className="font-semibold text-content-primary">
                                {Math.min(page * PAGE_SIZE, totalClients)}
                            </span>{' '}
                            de{' '}
                            <span className="font-semibold text-content-primary">
                                {totalClients}
                            </span>
                            .{' '}
                            <span className="ml-2">
                                Escopo de unidades:{' '}
                                {session?.canSeeAllUnits
                                    ? 'todas as unidades'
                                    : 'unidade atual'}
                            </span>
                        </p>
                    </div>

                    <AdminNewClientDialog />
                </div>

                <FiltersForm
                    q={q}
                    sort={sort}
                    bday={bday}
                    level={level}
                    status={status}
                />
            </header>

            <section className="space-y-4">
                <Accordion type="single" collapsible className="space-y-2">
                    {rows.map((row) => (
                        <AccordionItem
                            key={row.id}
                            value={row.id}
                            className={`border border-border-primary rounded-xl bg-background-tertiary ${
                                row.isActive ? '' : 'opacity-60'
                            }`}
                        >
                            <div className="flex items-center gap-6 px-4 py-3 w-full">
                                <AccordionTrigger className="flex-1 min-w-0 px-0 py-0 hover:no-underline grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_32px] items-center gap-6">
                                    <div className="min-w-0 flex items-center gap-3 text-left">
                                        <div className="h-10 w-10 rounded-lg overflow-hidden bg-background-secondary border border-border-primary flex items-center justify-center shrink-0">
                                            {row.image ? (
                                                <img
                                                    src={row.image}
                                                    alt={row.name}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <span className="text-xs font-medium text-content-secondary">
                                                    {row.name
                                                        .split(' ')
                                                        .map((n) => n[0])
                                                        .join('')
                                                        .slice(0, 2)
                                                        .toUpperCase()}
                                                </span>
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <p className="text-paragraph-medium-size font-semibold text-content-primary truncate">
                                                    {row.name}
                                                </p>

                                                <Badge
                                                    variant="outline"
                                                    className={`text-xs shrink-0 ${
                                                        row.isActive
                                                            ? 'border-green-600/40 text-green-600'
                                                            : 'border-red-600/40 text-red-600'
                                                    }`}
                                                >
                                                    {row.isActive
                                                        ? 'Ativo'
                                                        : 'Inativo'}
                                                </Badge>

                                                {row.hasActivePlan && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-xs border-green-600/40 text-green-600 shrink-0"
                                                    >
                                                        Plano ativo
                                                    </Badge>
                                                )}
                                            </div>

                                            <p className="text-xs text-content-secondary truncate">
                                                {row.email || 'Sem e-mail'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="hidden sm:flex flex-col text-left min-w-0">
                                        <span className="text-[11px] text-content-secondary">
                                            Nível
                                        </span>
                                        <div className="min-w-0">
                                            <Badge
                                                variant="outline"
                                                className={`text-xs ${levelBadgeClass(
                                                    row.customerLevel
                                                )}`}
                                            >
                                                {levelLabel(row.customerLevel)}
                                            </Badge>
                                        </div>
                                    </div>

                                    <div className="hidden md:flex flex-col text-left min-w-0">
                                        <span className="text-[11px] text-content-secondary">
                                            Telefone
                                        </span>
                                        <span className="text-xs text-content-primary truncate">
                                            {row.phone || '—'}
                                        </span>
                                    </div>

                                    <div className="hidden sm:flex flex-col text-left min-w-0">
                                        <span className="text-[11px] text-content-secondary">
                                            Último agendamento
                                        </span>
                                        <span className="text-xs text-content-primary truncate">
                                            {row.lastDoneDate
                                                ? format(
                                                      row.lastDoneDate,
                                                      'dd/MM/yyyy HH:mm',
                                                      { locale: ptBR }
                                                  )
                                                : 'Sem atendimento'}
                                        </span>
                                    </div>
                                </AccordionTrigger>

                                <div className="ml-auto flex items-center justify-end gap-2 whitespace-nowrap">
                                    <AdminClientStatusButton
                                        clientId={row.id}
                                        isActive={row.isActive}
                                    />

                                    <AdminEditClientDialog
                                        client={{
                                            id: row.id,
                                            name: row.name,
                                            email: row.email,
                                            phone: row.phone ?? '',
                                            birthday: row.birthday,
                                            addresses: row.addresses,
                                        }}
                                    />

                                    {row.whatsappUrl && (
                                        <a
                                            href={row.whatsappUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            title="Enviar mensagem no WhatsApp"
                                            className="inline-flex items-center justify-center size-9"
                                        >
                                            <WhatsAppLogo className="h-7 w-7" />
                                            <span className="sr-only">
                                                WhatsApp
                                            </span>
                                        </a>
                                    )}
                                </div>
                            </div>

                            <AccordionContent className="border-t border-border-primary px-4 py-4">
                                <div className="grid gap-4 md:grid-cols-4">
                                    <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-2">
                                        <p className="text-label-small text-content-primary">
                                            Dados do cliente
                                        </p>

                                        <div className="space-y-2 text-paragraph-small">
                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Nome:
                                                </span>
                                                <span className="text-content-primary font-medium flex-1 min-w-0 truncate">
                                                    {row.name}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Status:
                                                </span>
                                                <span className="flex-1 min-w-0 truncate">
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-xs ${
                                                            row.isActive
                                                                ? 'border-green-600/40 text-green-600'
                                                                : 'border-red-600/40 text-red-600'
                                                        }`}
                                                    >
                                                        {row.isActive
                                                            ? 'Ativo'
                                                            : 'Inativo'}
                                                    </Badge>
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Nível:
                                                </span>
                                                <span className="flex-1 min-w-0 truncate">
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-xs ${levelBadgeClass(
                                                            row.customerLevel
                                                        )}`}
                                                    >
                                                        {levelLabel(
                                                            row.customerLevel
                                                        )}
                                                    </Badge>
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    E-mail:
                                                </span>
                                                <span className="text-content-primary flex-1 min-w-0 truncate">
                                                    {row.email || '—'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Telefone:
                                                </span>
                                                <span className="text-content-primary flex-1 min-w-0 truncate">
                                                    {row.phone || '—'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Nascimento:
                                                </span>
                                                <span className="text-content-primary flex-1 min-w-0 truncate">
                                                    {row.birthday
                                                        ? format(
                                                              row.birthday,
                                                              'dd/MM/yyyy',
                                                              { locale: ptBR }
                                                          )
                                                        : 'Não informado'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Cadastrado em:
                                                </span>
                                                <span className="text-content-primary flex-1 min-w-0 truncate">
                                                    {format(
                                                        row.createdAt,
                                                        'dd/MM/yyyy HH:mm',
                                                        { locale: ptBR }
                                                    )}
                                                </span>
                                            </div>

                                            {row.addresses.length > 0 && (
                                                <div className="pt-2 space-y-2 border-t border-border-primary/60">
                                                    <span className="text-content-secondary text-xs">
                                                        Endereços:
                                                    </span>

                                                    <div className="space-y-2">
                                                        {row.addresses.map(
                                                            (
                                                                address,
                                                                index
                                                            ) => (
                                                                <div
                                                                    key={
                                                                        address.id
                                                                    }
                                                                    className="rounded-lg border border-border-primary bg-background-tertiary px-3 py-2"
                                                                >
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="text-content-primary font-medium text-xs">
                                                                            {address.label ||
                                                                                `Endereço ${
                                                                                    index +
                                                                                    1
                                                                                }`}
                                                                        </span>

                                                                        {address.isDefault && (
                                                                            <Badge
                                                                                variant="outline"
                                                                                className="text-[10px] border-green-600/40 text-green-600"
                                                                            >
                                                                                Principal
                                                                            </Badge>
                                                                        )}
                                                                    </div>

                                                                    <p className="text-xs text-content-secondary mt-1 wrap-break-word">
                                                                        {[
                                                                            address.street,
                                                                            address.number,
                                                                            address.city,
                                                                            address.state,
                                                                        ]
                                                                            .filter(
                                                                                Boolean
                                                                            )
                                                                            .join(
                                                                                ', '
                                                                            ) ||
                                                                            'Endereço sem detalhes'}
                                                                    </p>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-2">
                                        <p className="text-label-small text-content-primary">
                                            Atendimentos
                                        </p>

                                        <div className="space-y-2 text-paragraph-small">
                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Agendamentos:
                                                </span>
                                                <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                                                    {row.totalAppointments}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Concluídos:
                                                </span>
                                                <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                                                    {row.doneCount}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Cancelados:
                                                </span>
                                                <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                                                    {row.canceledCount}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Canc. c/ taxa:
                                                </span>
                                                <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                                                    {row.canceledWithFeeCount}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Frequência:
                                                </span>
                                                <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                                                    {row.frequencyLabel}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                                        <p className="text-label-small text-content-primary">
                                            Últimos serviços
                                        </p>

                                        <div className="space-y-3 text-paragraph-small">
                                            {row.lastCheckedOutAppointments
                                                .length > 0 ? (
                                                row.lastCheckedOutAppointments.map(
                                                    (item) => (
                                                        <div
                                                            key={item.id}
                                                            className="space-y-1 border-b border-border-primary/60 pb-2 last:border-b-0 last:pb-0"
                                                        >
                                                            <p className="text-content-primary font-medium truncate">
                                                                {
                                                                    item.serviceName
                                                                }
                                                            </p>
                                                            <p className="text-xs text-content-secondary">
                                                                {format(
                                                                    item.checkedOutAt,
                                                                    'dd/MM/yyyy HH:mm',
                                                                    {
                                                                        locale: ptBR,
                                                                    }
                                                                )}
                                                            </p>
                                                        </div>
                                                    )
                                                )
                                            ) : (
                                                <p className="text-content-secondary text-sm">
                                                    Nenhum agendamento
                                                    concluído.
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                                        <p className="text-label-small text-content-primary">
                                            Financeiro
                                        </p>

                                        <div className="space-y-2 text-paragraph-small">
                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Total gasto:
                                                </span>
                                                <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                                                    {row.totalSpent.toLocaleString(
                                                        'pt-BR',
                                                        {
                                                            style: 'currency',
                                                            currency: 'BRL',
                                                            minimumFractionDigits: 2,
                                                        }
                                                    )}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Planos adquiridos:
                                                </span>
                                                <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                                                    {row.totalPlans}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Taxas de cancelamento:
                                                </span>
                                                <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                                                    {row.totalCancelFee.toLocaleString(
                                                        'pt-BR',
                                                        {
                                                            style: 'currency',
                                                            currency: 'BRL',
                                                            minimumFractionDigits: 2,
                                                        }
                                                    )}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-content-secondary shrink-0">
                                                    Status do plano:
                                                </span>
                                                <span className="flex-1 min-w-0" />
                                                {row.hasActivePlan ? (
                                                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                                                        Cliente de plano ativo
                                                    </Badge>
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className="border-border-primary text-content-secondary"
                                                    >
                                                        Sem plano ativo
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>

                {totalPages > 1 && (
                    <div className="pt-4 flex justify-center">
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href={buildPageHref(
                                            resolvedSearchParams,
                                            Math.max(1, page - 1)
                                        )}
                                        aria-disabled={page === 1}
                                        className={
                                            page === 1
                                                ? 'pointer-events-none opacity-50'
                                                : ''
                                        }
                                    />
                                </PaginationItem>

                                {page > 3 && (
                                    <PaginationItem>
                                        <PaginationLink
                                            href={buildPageHref(
                                                resolvedSearchParams,
                                                firstPage
                                            )}
                                        >
                                            {firstPage}
                                        </PaginationLink>
                                    </PaginationItem>
                                )}

                                {showLeftEllipsis && (
                                    <PaginationItem>
                                        <PaginationEllipsis />
                                    </PaginationItem>
                                )}

                                {pages.map((p) => (
                                    <PaginationItem key={p}>
                                        <PaginationLink
                                            href={buildPageHref(
                                                resolvedSearchParams,
                                                p
                                            )}
                                            isActive={p === page}
                                        >
                                            {p}
                                        </PaginationLink>
                                    </PaginationItem>
                                ))}

                                {showRightEllipsis && (
                                    <PaginationItem>
                                        <PaginationEllipsis />
                                    </PaginationItem>
                                )}

                                {page < totalPages - 2 && (
                                    <PaginationItem>
                                        <PaginationLink
                                            href={buildPageHref(
                                                resolvedSearchParams,
                                                lastPage
                                            )}
                                        >
                                            {lastPage}
                                        </PaginationLink>
                                    </PaginationItem>
                                )}

                                <PaginationItem>
                                    <PaginationNext
                                        href={buildPageHref(
                                            resolvedSearchParams,
                                            Math.min(totalPages, page + 1)
                                        )}
                                        aria-disabled={page === totalPages}
                                        className={
                                            page === totalPages
                                                ? 'pointer-events-none opacity-50'
                                                : ''
                                        }
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                )}
            </section>
        </div>
    );
}
