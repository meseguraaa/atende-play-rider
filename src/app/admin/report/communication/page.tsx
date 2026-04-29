// src/app/admin/report/communication/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import {
    ArrowLeft,
    Send,
    XCircle,
    Percent,
    MessageCircle,
    Bell,
    Eye,
} from 'lucide-react';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';
import { MonthPicker } from '@/components/month-picker';
import { CommunicationStatusChart } from '@/components/admin/reports/communication-status-chart/communication-status-chart';
import { PushStatusChart } from '@/components/admin/reports/communication-push-chart/communication-push-chart';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Relatório de Comunicação',
};

const COMPANY_COOKIE_NAME = 'admin_company_context';

type SummaryCardProps = {
    title: string;
    value: string;
    description: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type MonthlyRow = {
    label: string;
    sent: number;
    failed: number;
    opened?: number;
    sortKey: number;
};

function SummaryCard({
    title,
    value,
    description,
    icon: Icon,
}: SummaryCardProps) {
    return (
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-4">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-primary bg-brand-primary/10 text-brand-primary">
                    <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 space-y-1">
                    <p className="text-label-small text-content-secondary">
                        {title}
                    </p>

                    <p className="text-title text-content-primary">{value}</p>

                    <p className="text-paragraph-small text-content-secondary">
                        {description}
                    </p>
                </div>
            </div>
        </div>
    );
}

function getSingleParam(v: string | string[] | undefined) {
    if (v == null) return undefined;
    return Array.isArray(v) ? v[0] : v;
}

function formatNumberBR(value: number) {
    return new Intl.NumberFormat('pt-BR').format(value);
}

function formatPercentBR(value: number) {
    return `${value.toFixed(1).replace('.', ',')}%`;
}

function formatMonthLabel(date: Date) {
    return new Intl.DateTimeFormat('pt-BR', {
        month: 'short',
    }).format(date);
}

async function requireCompanyIdFromContext(session: any) {
    const sCompanyId = String(session?.companyId ?? '').trim();
    if (sCompanyId) return sCompanyId;

    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
    if (cookieCompanyId) return cookieCompanyId;

    throw new Error('companyId ausente.');
}

function buildMonthlyRows(params: {
    sentItems: Array<{ createdAt: Date }>;
    failedItems: Array<{ createdAt: Date }>;
    openedItems?: Array<{ readAt: Date | null }>;
}) {
    const map = new Map<string, MonthlyRow>();

    const ensureRow = (date: Date) => {
        const d = new Date(date);
        const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;

        if (!map.has(key)) {
            const monthDate = new Date(
                Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
            );

            map.set(key, {
                label: formatMonthLabel(monthDate),
                sent: 0,
                failed: 0,
                opened: 0,
                sortKey: monthDate.getTime(),
            });
        }

        return map.get(key)!;
    };

    for (const item of params.sentItems) {
        const row = ensureRow(item.createdAt);
        row.sent += 1;
    }

    for (const item of params.failedItems) {
        const row = ensureRow(item.createdAt);
        row.failed += 1;
    }

    for (const item of params.openedItems ?? []) {
        if (!item.readAt) continue;
        const row = ensureRow(item.readAt);
        row.opened = (row.opened ?? 0) + 1;
    }

    return Array.from(map.values()).sort((a, b) => a.sortKey - b.sortKey);
}

export default async function AdminCommunicationReportPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await requireAdminForModule('DASHBOARD');
    const companyId = await requireCompanyIdFromContext(session);

    const resolvedSearchParams = await searchParams;

    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(
        now.getUTCMonth() + 1
    ).padStart(2, '0')}`;

    const month = getSingleParam(resolvedSearchParams.month) ?? currentMonth;

    const [y, m] = month.split('-').map(Number);

    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));

    const whatsappBaseWhere = {
        companyId,
        channel: 'WHATSAPP' as const,
        type: 'AUTOMATIC' as const,
        automationType: 'BIRTHDAY' as const,
        createdAt: {
            gte: start,
            lt: end,
        },
    };

    const pushBaseWhere = {
        companyId,
        channel: 'PUSH' as const,
        createdAt: {
            gte: start,
            lt: end,
        },
    };

    const [
        totalProcessedWhatsapp,
        sentMessagesWhatsapp,
        failedMessagesWhatsapp,
        whatsappSentRaw,
        whatsappFailedRaw,

        totalProcessedPush,
        sentMessagesPush,
        failedMessagesPush,
        pushSentRaw,
        pushFailedRaw,
        openedPushNotifications,
        pushOpenedRaw,
    ] = await Promise.all([
        prisma.communicationLog.count({
            where: whatsappBaseWhere,
        }),

        prisma.communicationLog.count({
            where: {
                ...whatsappBaseWhere,
                status: 'SENT',
            },
        }),

        prisma.communicationLog.count({
            where: {
                ...whatsappBaseWhere,
                status: 'FAILED',
            },
        }),

        prisma.communicationLog.findMany({
            where: {
                ...whatsappBaseWhere,
                status: 'SENT',
            },
            select: {
                createdAt: true,
            },
        }),

        prisma.communicationLog.findMany({
            where: {
                ...whatsappBaseWhere,
                status: 'FAILED',
            },
            select: {
                createdAt: true,
            },
        }),

        prisma.communicationLog.count({
            where: pushBaseWhere,
        }),

        prisma.communicationLog.count({
            where: {
                ...pushBaseWhere,
                status: 'SENT',
            },
        }),

        prisma.communicationLog.count({
            where: {
                ...pushBaseWhere,
                status: 'FAILED',
            },
        }),

        prisma.communicationLog.findMany({
            where: {
                ...pushBaseWhere,
                status: 'SENT',
            },
            select: {
                createdAt: true,
            },
        }),

        prisma.communicationLog.findMany({
            where: {
                ...pushBaseWhere,
                status: 'FAILED',
            },
            select: {
                createdAt: true,
            },
        }),

        prisma.appNotification.count({
            where: {
                companyId,
                readAt: {
                    gte: start,
                    lt: end,
                },
                communicationLog: {
                    is: {
                        companyId,
                        channel: 'PUSH',
                    },
                },
            },
        }),

        prisma.appNotification.findMany({
            where: {
                companyId,
                readAt: {
                    gte: start,
                    lt: end,
                },
                communicationLog: {
                    is: {
                        companyId,
                        channel: 'PUSH',
                    },
                },
            },
            select: {
                readAt: true,
            },
        }),
    ]);

    const successRateWhatsapp =
        totalProcessedWhatsapp > 0
            ? (sentMessagesWhatsapp / totalProcessedWhatsapp) * 100
            : 0;

    const successRatePush =
        totalProcessedPush > 0
            ? (sentMessagesPush / totalProcessedPush) * 100
            : 0;

    const openRatePush =
        sentMessagesPush > 0
            ? (openedPushNotifications / sentMessagesPush) * 100
            : 0;

    const monthlyDataWhatsapp = buildMonthlyRows({
        sentItems: whatsappSentRaw,
        failedItems: whatsappFailedRaw,
    });

    const monthlyDataPush = buildMonthlyRows({
        sentItems: pushSentRaw,
        failedItems: pushFailedRaw,
        openedItems: pushOpenedRaw,
    });

    return (
        <div className="space-y-6 max-w-7xl">
            <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <Link
                        href="/admin/report"
                        className="inline-flex items-center gap-2 text-paragraph-small text-content-secondary transition-colors hover:text-content-primary"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Voltar para relatórios
                    </Link>

                    <h1 className="text-title text-content-primary mt-2">
                        Relatório de comunicação
                    </h1>

                    <p className="text-paragraph-small text-content-secondary">
                        Analise o desempenho das comunicações via WhatsApp e
                        Push no mês selecionado.
                    </p>
                </div>

                <div>
                    <MonthPicker />
                </div>
            </header>

            <section className="space-y-4">
                <div className="space-y-1">
                    <h2 className="text-paragraph-medium text-content-primary">
                        WhatsApp
                    </h2>

                    <p className="text-paragraph-small text-content-secondary">
                        Métricas dos disparos automáticos de aniversário via
                        WhatsApp no mês selecionado.
                    </p>
                </div>

                <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        title="Total processado"
                        value={formatNumberBR(totalProcessedWhatsapp)}
                        description="Total de tentativas de envio no mês."
                        icon={MessageCircle}
                    />

                    <SummaryCard
                        title="Mensagens enviadas"
                        value={formatNumberBR(sentMessagesWhatsapp)}
                        description="Mensagens enviadas com sucesso no mês."
                        icon={Send}
                    />

                    <SummaryCard
                        title="Mensagens com falha"
                        value={formatNumberBR(failedMessagesWhatsapp)}
                        description="Tentativas de envio que falharam no mês."
                        icon={XCircle}
                    />

                    <SummaryCard
                        title="Taxa de sucesso"
                        value={formatPercentBR(successRateWhatsapp)}
                        description="Percentual de sucesso no mês."
                        icon={Percent}
                    />
                </section>

                <section className="grid gap-4 grid-cols-1 xl:grid-cols-2">
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5">
                        <div className="space-y-2">
                            <h3 className="text-paragraph-medium text-content-primary">
                                Envio de aniversários
                            </h3>

                            <p className="text-paragraph-small text-content-secondary">
                                Visão mensal dos disparos automáticos de
                                aniversário via WhatsApp.
                            </p>
                        </div>

                        <div className="mt-4">
                            {monthlyDataWhatsapp.length === 0 ? (
                                <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                    <p className="text-paragraph-small text-content-secondary">
                                        Nenhum envio no período.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {monthlyDataWhatsapp.map((item) => (
                                        <div
                                            key={`whatsapp-${item.label}-${item.sortKey}`}
                                            className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-label-medium-size text-content-primary">
                                                    {item.label}
                                                </span>

                                                <span className="text-label-medium-size text-content-primary">
                                                    {formatNumberBR(item.sent)}
                                                </span>
                                            </div>

                                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-content-secondary">
                                                <span>
                                                    Enviadas:{' '}
                                                    {formatNumberBR(item.sent)}
                                                </span>
                                                <span>
                                                    Falhas:{' '}
                                                    {formatNumberBR(
                                                        item.failed
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <CommunicationStatusChart
                        sent={sentMessagesWhatsapp}
                        failed={failedMessagesWhatsapp}
                    />
                </section>
            </section>

            <section className="space-y-4">
                <div className="space-y-1">
                    <h2 className="text-paragraph-medium text-content-primary">
                        Push
                    </h2>

                    <p className="text-paragraph-small text-content-secondary">
                        Métricas dos envios e das aberturas de push no mês
                        selecionado.
                    </p>
                </div>

                <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                    <SummaryCard
                        title="Total processado"
                        value={formatNumberBR(totalProcessedPush)}
                        description="Total de tentativas de envio push no mês."
                        icon={Bell}
                    />

                    <SummaryCard
                        title="Push enviados"
                        value={formatNumberBR(sentMessagesPush)}
                        description="Notificações push enviadas com sucesso no mês."
                        icon={Send}
                    />

                    <SummaryCard
                        title="Push com falha"
                        value={formatNumberBR(failedMessagesPush)}
                        description="Tentativas de envio push que falharam no mês."
                        icon={XCircle}
                    />

                    <SummaryCard
                        title="Taxa de sucesso"
                        value={formatPercentBR(successRatePush)}
                        description="Percentual de sucesso dos pushs no mês."
                        icon={Percent}
                    />

                    <SummaryCard
                        title="Push abertos"
                        value={formatNumberBR(openedPushNotifications)}
                        description="Notificações abertas no app durante o mês."
                        icon={Eye}
                    />

                    <SummaryCard
                        title="Taxa de abertura"
                        value={formatPercentBR(openRatePush)}
                        description="Percentual de abertura sobre os pushs enviados no mês."
                        icon={Percent}
                    />
                </section>

                <section className="grid gap-4 grid-cols-1 xl:grid-cols-2">
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-5">
                        <div className="space-y-2">
                            <h3 className="text-paragraph-medium text-content-primary">
                                Envios via Push
                            </h3>

                            <p className="text-paragraph-small text-content-secondary">
                                Visão mensal dos pushs enviados, falhados e
                                abertos.
                            </p>
                        </div>

                        <div className="mt-4">
                            {monthlyDataPush.length === 0 ? (
                                <div className="flex min-h-55 items-center justify-center rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 text-center">
                                    <p className="text-paragraph-small text-content-secondary">
                                        Nenhum envio no período.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {monthlyDataPush.map((item) => (
                                        <div
                                            key={`push-${item.label}-${item.sortKey}`}
                                            className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-label-medium-size text-content-primary">
                                                    {item.label}
                                                </span>

                                                <span className="text-label-medium-size text-content-primary">
                                                    {formatNumberBR(item.sent)}
                                                </span>
                                            </div>

                                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-content-secondary">
                                                <span>
                                                    Enviados:{' '}
                                                    {formatNumberBR(item.sent)}
                                                </span>
                                                <span>
                                                    Falhas:{' '}
                                                    {formatNumberBR(
                                                        item.failed
                                                    )}
                                                </span>
                                                <span>
                                                    Abertos:{' '}
                                                    {formatNumberBR(
                                                        item.opened ?? 0
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <PushStatusChart
                        sent={sentMessagesPush}
                        failed={failedMessagesPush}
                        opened={openedPushNotifications}
                    />
                </section>
            </section>
        </div>
    );
}
