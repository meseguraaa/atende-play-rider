// src/app/admin/reports/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';
import {
    BarChart3,
    CreditCard,
    MessageCircle,
    Package,
    Scissors,
    Users,
    Wallet,
    HelpCircle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Relatórios',
};

const COMPANY_COOKIE_NAME = 'admin_company_context';
const UNIT_COOKIE_NAME = 'admin_unit_context';
const UNIT_ALL_VALUE = 'all';

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

type AdminReportsPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminReportsPage({
    searchParams,
}: AdminReportsPageProps) {
    const session = await requireAdminForModule('DASHBOARD');

    const companyId = await requireCompanyIdFromContext(session);

    const cookieStore = await cookies();
    const selectedUnit =
        cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

    const sp = await searchParams;

    void companyId;
    void selectedUnit;
    void sp;

    return (
        <div className="space-y-6 max-w-7xl">
            <header className="flex flex-col gap-2">
                <h1 className="text-title text-content-primary">Relatórios</h1>

                <p className="text-paragraph-medium-size text-content-secondary">
                    Acompanhe os indicadores estratégicos do seu negócio com
                    relatórios visuais e comparativos.
                </p>
            </header>

            <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                <Link
                    href="/admin/report/appointments"
                    className="group rounded-xl border border-border-primary bg-background-tertiary p-4 transition-colors hover:bg-background-tertiary/70"
                >
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-primary bg-background-secondary text-content-primary">
                            <BarChart3 className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 space-y-1">
                            <p className="text-label-large text-content-primary">
                                Relatório de agendamentos
                            </p>

                            <p className="text-paragraph-small text-content-secondary">
                                Veja totais de agendamentos, concluídos,
                                cancelados, confirmados, origem dos agendamentos
                                e ranking de profissionais com comparativos
                                visuais.
                            </p>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/admin/report/checkout"
                    className="group rounded-xl border border-border-primary bg-background-tertiary p-4 transition-colors hover:bg-background-tertiary/70"
                >
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-primary bg-background-secondary text-content-primary">
                            <Wallet className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 space-y-1">
                            <p className="text-label-large text-content-primary">
                                Relatório de checkout
                            </p>

                            <p className="text-paragraph-small text-content-secondary">
                                Veja faturamento, serviços e produtos no
                                checkout, taxas de cancelamento, desempenho
                                financeiro e indicadores visuais do período.
                            </p>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/admin/report/clients"
                    className="group rounded-xl border border-border-primary bg-background-tertiary p-4 transition-colors hover:bg-background-tertiary/70"
                >
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-primary bg-background-secondary text-content-primary">
                            <Users className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 space-y-1">
                            <p className="text-label-large text-content-primary">
                                Relatório de clientes
                            </p>

                            <p className="text-paragraph-small text-content-secondary">
                                Veja total de clientes, recorrência, retenção,
                                ranking de clientes e indicadores de
                                relacionamento com comparativos visuais.
                            </p>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/admin/report/services"
                    className="group rounded-xl border border-border-primary bg-background-tertiary p-4 transition-colors hover:bg-background-tertiary/70"
                >
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-primary bg-background-secondary text-content-primary">
                            <Scissors className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 space-y-1">
                            <p className="text-label-large text-content-primary">
                                Relatório de serviços
                            </p>

                            <p className="text-paragraph-small text-content-secondary">
                                Veja volume de serviços, concluídos,
                                cancelamentos, taxa de cancelamento e rankings
                                dos serviços com comparativos visuais.
                            </p>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/admin/report/communication"
                    className="group rounded-xl border border-border-primary bg-background-tertiary p-4 transition-colors hover:bg-background-tertiary/70"
                >
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-primary bg-background-secondary text-content-primary">
                            <MessageCircle className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 space-y-1">
                            <p className="text-label-large text-content-primary">
                                Relatório de comunicação
                            </p>

                            <p className="text-paragraph-small text-content-secondary">
                                Veja volume de envios, desempenho por canal,
                                entregas, conversões e indicadores das
                                comunicações com os clientes.
                            </p>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/admin/report/plans"
                    className="group rounded-xl border border-border-primary bg-background-tertiary p-4 transition-colors hover:bg-background-tertiary/70"
                >
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-primary bg-background-secondary text-content-primary">
                            <CreditCard className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 space-y-1">
                            <p className="text-label-large text-content-primary">
                                Relatório de planos
                            </p>

                            <p className="text-paragraph-small text-content-secondary">
                                Veja planos ativos, uso de créditos, desempenho
                                dos planos e indicadores de adesão e utilização
                                no período.
                            </p>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/admin/report/products"
                    className="group rounded-xl border border-border-primary bg-background-tertiary p-4 transition-colors hover:bg-background-tertiary/70"
                >
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-primary bg-background-secondary text-content-primary">
                            <Package className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 space-y-1">
                            <p className="text-label-large text-content-primary">
                                Relatório de produtos
                            </p>

                            <p className="text-paragraph-small text-content-secondary">
                                Veja volume de vendas, faturamento, produtos com
                                maior saída e indicadores de desempenho dos
                                produtos no período.
                            </p>
                        </div>
                    </div>
                </Link>
                <Link
                    href="/admin/report/faq"
                    className="group rounded-xl border border-border-primary bg-background-tertiary p-4 transition-colors hover:bg-background-tertiary/70"
                >
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-primary bg-background-secondary text-content-primary">
                            <HelpCircle className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 space-y-1">
                            <p className="text-label-large text-content-primary">
                                Relatório de FAQ
                            </p>

                            <p className="text-paragraph-small text-content-secondary">
                                Analise o uso do FAQ, categorias mais acessadas,
                                perguntas mais visualizadas e comportamento dos
                                clientes no fluxo de dúvidas.
                            </p>
                        </div>
                    </div>
                </Link>
            </section>
        </div>
    );
}
