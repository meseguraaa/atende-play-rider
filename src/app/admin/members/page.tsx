// src/app/admin/members/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

import { AdminNewMemberDialog } from '@/components/admin/members/admin-new-member-dialog/admin-new-member-dialog';
import { AdminEditMemberDialog } from '@/components/admin/members/admin-edit-member-dialog/admin-edit-member-dialog';
import { AdminMemberStatusButton } from '@/components/admin/members/admin-member-status-button/admin-member-status-button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Membros',
};

const COMPANY_COOKIE_NAME = 'admin_company_context';

type MemberRow = {
    id: string;
    name: string;
    email: string;
    phone: string;
    image: string | null;
    createdAt: Date;
    birthday: Date | null;
    isActive: boolean;
    vehicle: {
        motorcycle: string;
        plate: string;
        cylinderCc: number | null;
    } | null;
};

type SortKey = 'name_asc' | 'name_desc' | 'createdAt_desc' | 'createdAt_asc';
type BirthdayFilter = 'all' | 'day' | 'week' | 'month';
type MemberStatusFilter = 'active' | 'inactive' | 'all';

function getSingleParam(v: string | string[] | undefined): string | undefined {
    if (v == null) return undefined;
    return Array.isArray(v) ? v[0] : v;
}

function normalizeSort(v: string | undefined): SortKey {
    if (v === 'name_desc') return 'name_desc';
    if (v === 'createdAt_desc') return 'createdAt_desc';
    if (v === 'createdAt_asc') return 'createdAt_asc';
    return 'name_asc';
}

function normalizeBirthday(v: string | undefined): BirthdayFilter {
    if (v === 'day') return 'day';
    if (v === 'week') return 'week';
    if (v === 'month') return 'month';
    return 'all';
}

function normalizeMemberStatus(v: string | undefined): MemberStatusFilter {
    if (v === 'inactive') return 'inactive';
    if (v === 'all') return 'all';
    return 'active';
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
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

    return {
        pages,
        firstPage: 1,
        lastPage: total,
        showLeftEllipsis: left > 2,
        showRightEllipsis: right < total - 1,
    };
}

async function requireCompanyIdFromContext(session: any) {
    const sCompanyId = String(session?.companyId ?? '').trim();
    if (sCompanyId) return sCompanyId;

    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
    if (cookieCompanyId) return cookieCompanyId;

    throw new Error('companyId ausente.');
}

function FiltersForm({
    q,
    sort,
    bday,
    status,
}: {
    q: string;
    sort: SortKey;
    bday: BirthdayFilter;
    status: MemberStatusFilter;
}) {
    return (
        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
            <form method="GET" className="space-y-4">
                <div className="flex flex-col md:flex-row gap-3 md:items-end">
                    <div className="w-full md:w-52">
                        <label className="text-[11px] text-content-secondary">
                            Buscar
                        </label>
                        <Input
                            name="q"
                            defaultValue={q}
                            placeholder="Nome, e-mail, telefone ou moto..."
                            className="h-10 bg-background-secondary border-border-primary"
                        />
                    </div>

                    <div className="w-full md:w-44">
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
                            <Link href="/admin/members">Limpar</Link>
                        </Button>
                    </div>
                </div>
            </form>
        </section>
    );
}

export default async function AdminMembersPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await requireAdminForModule('MEMBERS');
    const companyId = await requireCompanyIdFromContext(session);

    const resolvedSearchParams = await searchParams;

    const q = (getSingleParam(resolvedSearchParams.q) ?? '').trim();
    const sort = normalizeSort(getSingleParam(resolvedSearchParams.sort));
    const bday = normalizeBirthday(getSingleParam(resolvedSearchParams.bday));
    const status = normalizeMemberStatus(
        getSingleParam(resolvedSearchParams.status)
    );

    const PAGE_SIZE = 10;

    const pageParam = getSingleParam(resolvedSearchParams.page);
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
            {
                memberVehicles: {
                    some: {
                        companyId,
                        isActive: true,
                        OR: [
                            { model: { contains: q, mode: 'insensitive' } },
                            { plate: { contains: q.toUpperCase() } },
                        ],
                    },
                },
            },
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

    const users = await prisma.user.findMany({
        where: whereUser,
        orderBy,
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            image: true,
            createdAt: true,
            birthday: true,
            memberVehicles: {
                where: {
                    companyId,
                    isActive: true,
                },
                orderBy: [{ isMain: 'desc' }, { createdAt: 'desc' }],
                select: {
                    model: true,
                    plate: true,
                    cylinderCc: true,
                },
                take: 1,
            },
        },
    });

    const today = new Date();

    const birthdayFilteredUsers =
        bday === 'all'
            ? users
            : users.filter((u) =>
                  isBirthdayInFilter(u.birthday ?? null, bday, today)
              );

    const totalMembers = birthdayFilteredUsers.length;
    const totalPages = Math.max(1, Math.ceil(totalMembers / PAGE_SIZE));
    const page = clampInt(safeRequestedPage, 1, totalPages);

    const pagedUsers = birthdayFilteredUsers.slice(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE
    );

    const memberships = await prisma.companyMember.findMany({
        where: {
            companyId,
            userId: { in: pagedUsers.map((u) => u.id) },
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

    const rows: MemberRow[] = pagedUsers.map((u) => {
        const vehicle = u.memberVehicles[0] ?? null;

        return {
            id: u.id,
            name: u.name ?? 'Sem nome',
            email: u.email ?? '',
            phone: u.phone ?? '',
            image: u.image ?? null,
            createdAt: u.createdAt,
            birthday: u.birthday ?? null,
            isActive: isActiveByUserId.get(u.id) ?? true,
            vehicle: vehicle
                ? {
                      motorcycle: vehicle.model ?? '',
                      plate: vehicle.plate ?? '',
                      cylinderCc: vehicle.cylinderCc ?? null,
                  }
                : null,
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
                            Membros
                        </h1>
                        <p className="text-paragraph-medium text-content-secondary">
                            Visualize e gerencie os membros cadastrados.
                        </p>

                        <p className="text-xs text-content-secondary mt-1">
                            Mostrando{' '}
                            <span className="font-semibold text-content-primary">
                                {totalMembers === 0
                                    ? 0
                                    : (page - 1) * PAGE_SIZE + 1}
                            </span>{' '}
                            a{' '}
                            <span className="font-semibold text-content-primary">
                                {Math.min(page * PAGE_SIZE, totalMembers)}
                            </span>{' '}
                            de{' '}
                            <span className="font-semibold text-content-primary">
                                {totalMembers}
                            </span>
                            .
                        </p>
                    </div>

                    <AdminNewMemberDialog />
                </div>

                <FiltersForm q={q} sort={sort} bday={bday} status={status} />
            </header>

            {rows.length === 0 ? (
                <section className="rounded-xl border border-border-primary bg-background-tertiary p-6">
                    <p className="text-paragraph-medium text-content-primary">
                        Nenhum membro encontrado com esses filtros.
                    </p>
                    <p className="text-sm text-content-secondary mt-1">
                        Ajuste a busca ou limpe os filtros para ver todos os
                        membros.
                    </p>
                </section>
            ) : (
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
                                    <AccordionTrigger className="flex-1 px-0 py-0 hover:no-underline">
                                        <div className="flex items-center gap-6 w-full overflow-hidden">
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
                                                </div>

                                                <p className="text-xs text-content-secondary truncate">
                                                    {row.email || 'Sem e-mail'}
                                                </p>

                                                <p className="text-xs text-content-tertiary truncate">
                                                    {row.vehicle?.motorcycle
                                                        ? `${row.vehicle.motorcycle}${
                                                              row.vehicle.plate
                                                                  ? ` • ${row.vehicle.plate}`
                                                                  : ''
                                                          }${
                                                              row.vehicle
                                                                  .cylinderCc
                                                                  ? ` • ${row.vehicle.cylinderCc}cc`
                                                                  : ''
                                                          }`
                                                        : 'Moto não informada'}
                                                </p>
                                            </div>
                                        </div>
                                    </AccordionTrigger>

                                    <div className="ml-auto flex items-center justify-end gap-2 whitespace-nowrap">
                                        <AdminMemberStatusButton
                                            memberId={row.id}
                                            isActive={row.isActive}
                                        />

                                        <AdminEditMemberDialog
                                            member={{
                                                id: row.id,
                                                name: row.name,
                                                email: row.email,
                                                phone: row.phone ?? '',
                                                birthday: row.birthday,
                                                motorcycle:
                                                    row.vehicle?.motorcycle ??
                                                    '',
                                                plate: row.vehicle?.plate ?? '',
                                                cylinderCc:
                                                    row.vehicle?.cylinderCc ??
                                                    null,
                                            }}
                                        />
                                    </div>
                                </div>

                                <AccordionContent className="border-t border-border-primary px-4 py-4">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-2">
                                            <p className="text-label-small text-content-primary">
                                                Dados do membro
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
                                                                  {
                                                                      locale: ptBR,
                                                                  }
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
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-2">
                                            <p className="text-label-small text-content-primary">
                                                Dados da moto
                                            </p>

                                            <div className="space-y-2 text-paragraph-small">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-content-secondary shrink-0">
                                                        Moto:
                                                    </span>
                                                    <span className="text-content-primary font-medium flex-1 min-w-0 truncate">
                                                        {row.vehicle
                                                            ?.motorcycle || '—'}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <span className="text-content-secondary shrink-0">
                                                        Placa:
                                                    </span>
                                                    <span className="text-content-primary flex-1 min-w-0 truncate">
                                                        {row.vehicle?.plate ||
                                                            '—'}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <span className="text-content-secondary shrink-0">
                                                        Cilindrada:
                                                    </span>
                                                    <span className="text-content-primary flex-1 min-w-0 truncate">
                                                        {row.vehicle?.cylinderCc
                                                            ? `${row.vehicle.cylinderCc}cc`
                                                            : '—'}
                                                    </span>
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
            )}
        </div>
    );
}
