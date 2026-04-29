// src/app/admin/services/page.tsx
import type { Metadata } from 'next';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

import { ServiceNewDialog } from '@/components/admin/services/service-new-dialog';
import { ServicesResponsiveList } from '@/components/admin/services/services-responsive-list/services-responsive-list';
import type { ServiceRowItem } from '@/components/admin/services/service-row';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Serviços',
};

type SessionWithAdminContext = {
    companyId?: string;
    unitId?: string | null;
};

export default async function AdminServicesPage() {
    const session = (await requireAdminForModule(
        'SERVICES'
    )) as unknown as SessionWithAdminContext;

    const companyId = session.companyId?.trim();
    const unitId =
        typeof session.unitId === 'string' ? session.unitId.trim() : null;

    if (!companyId) {
        return (
            <div className="space-y-8 max-w-7xl">
                <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-title text-content-primary">
                            Serviços
                        </h1>
                        <p className="text-paragraph-medium text-content-secondary">
                            Gerencie os serviços, duração, comissões e regras de
                            cancelamento.
                        </p>

                        <div className="mt-3 md:hidden">
                            <ServiceNewDialog />
                        </div>
                    </div>

                    <div className="hidden md:block">
                        <ServiceNewDialog />
                    </div>
                </header>

                <section className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                    <p className="text-paragraph-small text-content-secondary text-center">
                        Sessão sem <b>companyId</b>. Este painel é multi-tenant:
                        vincule o admin a uma empresa.
                    </p>
                </section>
            </div>
        );
    }

    const services = await prisma.service.findMany({
        where: {
            companyId,
            ...(unitId ? { unitId } : {}),
        },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        select: {
            id: true,
            unitId: true,
            companyId: true,
            name: true,
            price: true,
            durationMinutes: true,
            isActive: true,
            professionalPercentage: true,
            cancelLimitHours: true,
            cancelFeePercentage: true,
        },
    });

    const rows: ServiceRowItem[] = services.map((s) => {
        const priceNum = Number(s.price.toString());
        const pctNum = Number(s.professionalPercentage.toString());
        const feePctNum =
            s.cancelFeePercentage === null
                ? null
                : Number(s.cancelFeePercentage.toString());

        return {
            id: s.id,
            unitId: s.unitId ?? null,
            companyId: s.companyId ?? null,
            name: s.name,
            description: null,
            priceInCents: Number.isFinite(priceNum)
                ? Math.round(priceNum * 100)
                : null,
            durationInMinutes:
                typeof s.durationMinutes === 'number'
                    ? s.durationMinutes
                    : null,
            barberPercentage: Number.isFinite(pctNum) ? pctNum : null,
            cancelLimitHours: s.cancelLimitHours ?? null,
            cancelFeePercentage:
                feePctNum !== null && Number.isFinite(feePctNum)
                    ? feePctNum
                    : null,
            isActive: Boolean(s.isActive),
        };
    });

    const activeRows = rows.filter((r) => r.isActive);
    const inactiveRows = rows.filter((r) => !r.isActive);

    return (
        <div className="space-y-8 max-w-7xl">
            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <h1 className="text-title text-content-primary">
                        Serviços
                    </h1>
                    <p className="text-paragraph-medium text-content-secondary">
                        Gerencie os serviços, duração, comissões e regras de
                        cancelamento.
                    </p>

                    <div className="mt-3 md:hidden">
                        <ServiceNewDialog />
                    </div>
                </div>

                <div className="hidden md:block">
                    <ServiceNewDialog />
                </div>
            </header>

            <section className="space-y-4">
                <h2 className="text-paragraph-medium text-content-primary">
                    Serviços ativos
                </h2>

                {activeRows.length === 0 ? (
                    <p className="text-paragraph-small text-content-secondary px-2">
                        Nenhum serviço ativo no momento.
                    </p>
                ) : (
                    <ServicesResponsiveList services={activeRows} />
                )}
            </section>

            <section className="space-y-3">
                <h2 className="text-paragraph-medium text-content-primary">
                    Serviços inativos
                </h2>

                {inactiveRows.length === 0 ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhum serviço inativo no momento.
                        </p>
                    </div>
                ) : (
                    <ServicesResponsiveList services={inactiveRows} />
                )}
            </section>
        </div>
    );
}
