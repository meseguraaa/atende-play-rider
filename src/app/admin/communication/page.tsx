// src/app/admin/communication/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Comunicação',
};

type MemberStatusFilter = 'active' | 'inactive' | 'all';

function getSingleParam(v: string | string[] | undefined): string | undefined {
    if (v == null) return undefined;
    return Array.isArray(v) ? v[0] : v;
}

function normalizeStatus(v: string | undefined): MemberStatusFilter {
    if (v === 'inactive') return 'inactive';
    if (v === 'all') return 'all';
    return 'active';
}

async function requireCompanyIdFromContext(session: any) {
    const companyId = String(session?.companyId ?? '').trim();

    if (!companyId) {
        throw new Error('companyId não encontrado na sessão.');
    }

    return companyId;
}

function FiltersForm({ q, status }: { q: string; status: MemberStatusFilter }) {
    return (
        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
            <form
                method="GET"
                className="flex flex-col gap-3 md:flex-row md:items-end"
            >
                <div className="flex-1">
                    <label className="text-[11px] text-content-secondary">
                        Buscar membro
                    </label>
                    <Input
                        name="q"
                        defaultValue={q}
                        placeholder="Nome, e-mail ou telefone"
                        className="h-10 bg-background-secondary border-border-primary"
                    />
                </div>

                <div className="w-full md:w-52">
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
                        Aplicar
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

    const q = String(getSingleParam(resolvedSearchParams.q) ?? '').trim();
    const status = normalizeStatus(getSingleParam(resolvedSearchParams.status));

    const settings = await prisma.companyCommunicationSettings.findUnique({
        where: { companyId },
        select: {
            pushEnabled: true,
        },
    });

    const membershipWhere = {
        companyId,
        role: 'CLIENT' as const,
        ...(status === 'active'
            ? { isActive: true }
            : status === 'inactive'
              ? { isActive: false }
              : {}),
    };

    const userWhere = {
        companyMemberships: {
            some: membershipWhere,
        },
        ...(q
            ? {
                  OR: [
                      { name: { contains: q, mode: 'insensitive' as const } },
                      { email: { contains: q, mode: 'insensitive' as const } },
                      { phone: { contains: q, mode: 'insensitive' as const } },
                  ],
              }
            : {}),
    };

    const [eligibleMembers, totalMembers, activePushDevices] =
        await Promise.all([
            prisma.user.findMany({
                where: userWhere,
                orderBy: { name: 'asc' },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    pushDevices: {
                        where: { isActive: true },
                        select: { id: true },
                        take: 1,
                    },
                },
            }),

            prisma.companyMember.count({
                where: {
                    companyId,
                    role: 'CLIENT',
                },
            }),

            prisma.pushDevice.count({
                where: {
                    isActive: true,
                    user: {
                        companyMemberships: {
                            some: {
                                companyId,
                                role: 'CLIENT',
                            },
                        },
                    },
                },
            }),
        ]);

    const eligibleCount = eligibleMembers.length;
    const eligibleWithPushCount = eligibleMembers.filter(
        (member) => member.pushDevices.length > 0
    ).length;

    const pushEnabled = settings?.pushEnabled ?? true;
    const hasAudience = pushEnabled && eligibleWithPushCount > 0;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <header className="space-y-1">
                <h1 className="text-title text-content-primary">Comunicação</h1>
                <p className="text-paragraph-medium text-content-secondary">
                    Envie comunicados via push para os membros do aplicativo.
                </p>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-2">
                    <p className="text-label-small text-content-secondary">
                        Push
                    </p>
                    <p
                        className={`text-lg font-semibold ${
                            pushEnabled ? 'text-green-600' : 'text-red-600'
                        }`}
                    >
                        {pushEnabled ? 'Ativo' : 'Inativo'}
                    </p>
                    <p className="text-xs text-content-secondary">
                        Canal de comunicação com o app dos membros.
                    </p>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-2">
                    <p className="text-label-small text-content-secondary">
                        Membros cadastrados
                    </p>
                    <p className="text-lg font-semibold text-content-primary">
                        {totalMembers}
                    </p>
                    <p className="text-xs text-content-secondary">
                        Total de membros vinculados à empresa.
                    </p>
                </div>

                <div className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-2">
                    <p className="text-label-small text-content-secondary">
                        Dispositivos push ativos
                    </p>
                    <p className="text-lg font-semibold text-content-primary">
                        {activePushDevices}
                    </p>
                    <p className="text-xs text-content-secondary">
                        Dispositivos aptos a receber notificações.
                    </p>
                </div>
            </section>

            <FiltersForm q={q} status={status} />

            <section className="rounded-xl border border-border-primary bg-background-tertiary p-5 space-y-4">
                <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-content-primary">
                        Envio manual por push
                    </h2>
                    <p className="text-sm text-content-secondary">
                        Público filtrado: {eligibleCount} membro
                        {eligibleCount === 1 ? '' : 's'} encontrado
                        {eligibleCount === 1 ? '' : 's'}. Com push ativo:{' '}
                        {eligibleWithPushCount}.
                    </p>
                </div>

                {!pushEnabled ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        O envio por push está desativado nas configurações de
                        comunicação da empresa.
                    </div>
                ) : !hasAudience ? (
                    <div className="rounded-lg border border-border-primary bg-background-secondary p-3 text-sm text-content-secondary">
                        Nenhum membro elegível com dispositivo push ativo para
                        os filtros atuais.
                    </div>
                ) : (
                    <div className="rounded-lg border border-border-primary bg-background-secondary p-4 space-y-3">
                        <p className="text-sm text-content-primary">
                            A base para envio está pronta. O próximo ajuste deve
                            conectar este card à ação/API de disparo push.
                        </p>

                        <Button disabled variant="edit2">
                            Enviar push
                        </Button>
                    </div>
                )}
            </section>
        </div>
    );
}
