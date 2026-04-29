// src/app/professional/review/page.tsx
import type { Metadata } from 'next';
import { headers, cookies } from 'next/headers';

import { MonthPicker } from '@/components/month-picker';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Profissional | Avaliações',
};

type ReviewUI = {
    id: string;
    rating: number;
    comment: string | null;
    isAnonymousForProfessional: boolean;
    clientName: string;
    serviceName: string;
    createdAt: string; // ISO
    tags: string[];
};

type ProfessionalReviewApiResponse =
    | {
          ok: true;
          data: {
              month: {
                  value: string; // yyyy-MM
                  label: string;
                  start: string;
                  end: string;
              };
              stats: {
                  totalReviewsMonth: number;
                  averageRatingMonth: number;
                  totalReviewsOverall: number;
                  averageRatingOverall: number;
              };
              topPositiveTags: { label: string; count: number }[];
              topNegativeTags: { label: string; count: number }[];
              recentPositiveReviews: ReviewUI[];
              recentNegativeReviews: ReviewUI[];
              reviews: ReviewUI[];
          };
      }
    | {
          ok: false;
          error: string;
      };

type ProfessionalReviewPageProps = {
    searchParams: Promise<{
        month?: string; // yyyy-MM
    }>;
};

async function buildCookieHeader() {
    const store = await cookies();
    const all = store.getAll() as Array<{ name: string; value: string }>;
    return all.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function getBaseUrl() {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? 'http';
    if (!host) return '';
    return `${proto}://${host}`;
}

async function fetchProfessionalReviews(month?: string) {
    const baseUrl = await getBaseUrl();

    const sp = new URLSearchParams();
    if (month) sp.set('month', month);

    const url = `${baseUrl}/api/professional/review${
        sp.toString() ? `?${sp.toString()}` : ''
    }`;

    const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
            cookie: await buildCookieHeader(),
        },
    });

    const json = (await res.json()) as ProfessionalReviewApiResponse;
    return json;
}

export default async function ProfessionalReviewPage({
    searchParams,
}: ProfessionalReviewPageProps) {
    const resolved = await searchParams;
    const month = resolved.month;

    const response = await fetchProfessionalReviews(month);

    if (!response.ok) {
        return (
            <div className="max-w-7xl space-y-6">
                <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-title text-content-primary">
                            Minhas avaliações
                        </h1>
                        <p className="text-paragraph-medium-size text-content-secondary">
                            Veja como os clientes avaliaram seus atendimentos.
                        </p>
                    </div>

                    <div className="md:self-start">
                        <MonthPicker />
                    </div>
                </header>

                <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
                    <p className="text-paragraph-medium text-content-secondary">
                        {response.error}
                    </p>
                </section>
            </div>
        );
    }

    const {
        month: monthInfo,
        stats,
        topPositiveTags,
        topNegativeTags,
        recentPositiveReviews,
        recentNegativeReviews,
    } = response.data;

    const totalReviewsMonth = stats.totalReviewsMonth;
    const totalReviewsOverall = stats.totalReviewsOverall;

    const averageRatingMonthDisplay =
        totalReviewsMonth > 0 ? stats.averageRatingMonth.toFixed(2) : '—';

    const averageRatingOverallDisplay =
        totalReviewsOverall > 0 ? stats.averageRatingOverall.toFixed(2) : '—';

    return (
        <div className="max-w-7xl space-y-6">
            {/* HEADER */}
            <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-title text-content-primary">
                        Minhas avaliações
                    </h1>
                    <p className="text-paragraph-medium-size text-content-secondary">
                        Veja como os clientes avaliaram seus atendimentos.
                    </p>

                    <p className="text-paragraph-small text-content-secondary">
                        Mês selecionado:{' '}
                        <span className="font-semibold text-content-primary">
                            {monthInfo.label}
                        </span>
                    </p>

                    <p className="mt-1 text-paragraph-small text-content-tertiary">
                        Algumas avaliações podem ter o nome do cliente oculto,
                        isso acontece quando ele opta por avaliação anônima.
                    </p>
                </div>

                <div className="md:self-start">
                    <MonthPicker />
                </div>
            </header>

            {/* BLOCO PRINCIPAL DE AVALIAÇÕES */}
            <section className="space-y-4 rounded-xl border border-border-primary bg-background-tertiary p-4">
                {/* RESUMO GERAL DO MÊS + HISTÓRICO */}
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-label-small text-content-secondary">
                            Suas avaliações
                        </p>

                        <p className="text-title text-content-primary">
                            Nota média no mês:{' '}
                            <span className="text-title font-semibold">
                                {averageRatingMonthDisplay}
                            </span>
                            {totalReviewsMonth > 0 && (
                                <span className="ml-2 align-middle text-xl text-yellow-500">
                                    {'★'.repeat(
                                        Math.round(stats.averageRatingMonth)
                                    )}
                                </span>
                            )}
                        </p>

                        <p className="text-paragraph-small text-content-secondary">
                            Nota média geral (histórico):{' '}
                            <span className="font-semibold text-content-primary">
                                {averageRatingOverallDisplay}
                            </span>{' '}
                            {totalReviewsOverall > 0 && (
                                <span className="text-content-tertiary">
                                    ({totalReviewsOverall} avaliações)
                                </span>
                            )}
                        </p>

                        <p className="text-paragraph-small text-content-secondary">
                            Total de avaliações no mês:{' '}
                            <span className="font-semibold text-content-primary">
                                {totalReviewsMonth}
                            </span>
                        </p>
                    </div>
                </div>

                {totalReviewsMonth === 0 ? (
                    <p className="text-paragraph-small text-content-secondary">
                        Você ainda não possui avaliações registradas neste mês.
                    </p>
                ) : (
                    <>
                        {/* MOTIVOS POSITIVOS / NEGATIVOS MAIS CITADOS */}
                        <div className="grid gap-4 border-t border-border-primary/60 pt-4 md:grid-cols-2">
                            {/* POSITIVOS */}
                            <div className="space-y-2">
                                <p className="text-label-small text-content-primary">
                                    Motivos positivos mais citados (no mês)
                                </p>

                                {topPositiveTags.length === 0 ? (
                                    <p className="text-paragraph-small text-content-secondary">
                                        Ainda não há motivos positivos
                                        suficientes neste mês.
                                    </p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {topPositiveTags.map((tag) => (
                                            <span
                                                key={tag.label}
                                                className="flex items-center gap-1 rounded-full border border-emerald-500/60 bg-emerald-500/5 px-3 py-1 text-[11px] text-emerald-500"
                                            >
                                                <span>{tag.label}</span>
                                                <span className="text-emerald-600">
                                                    · {tag.count}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* NEGATIVOS */}
                            <div className="space-y-2">
                                <p className="text-label-small text-content-primary">
                                    Motivos negativos mais citados (no mês)
                                </p>

                                {topNegativeTags.length === 0 ? (
                                    <p className="text-paragraph-small text-content-secondary">
                                        Nenhum motivo negativo se destacou neste
                                        mês. ✨
                                    </p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {topNegativeTags.map((tag) => (
                                            <span
                                                key={tag.label}
                                                className="flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/5 px-3 py-1 text-[11px] text-destructive"
                                            >
                                                <span>{tag.label}</span>
                                                <span className="text-destructive">
                                                    · {tag.count}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* FEEDBACKS POSITIVOS X NEGATIVOS (LADO A LADO) */}
                        <div className="grid gap-4 border-t border-border-primary/60 pt-4 md:grid-cols-2">
                            {/* FEEDBACKS POSITIVOS */}
                            <div className="space-y-2">
                                <p className="text-label-small text-content-primary">
                                    Feedbacks positivos recentes (3–5 estrelas)
                                </p>

                                {recentPositiveReviews.length === 0 ? (
                                    <p className="text-paragraph-small text-content-secondary">
                                        Ainda não há feedbacks positivos
                                        registrados neste mês.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {recentPositiveReviews.map((rev) => (
                                            <div
                                                key={rev.id}
                                                className="space-y-1 rounded-xl border border-border-primary bg-background-secondary px-3 py-2 text-[11px]"
                                            >
                                                <p className="text-content-primary">
                                                    {rev.clientName} ·{' '}
                                                    <span className="text-content-secondary">
                                                        {rev.serviceName}
                                                    </span>{' '}
                                                    ·{' '}
                                                    <span className="text-yellow-500">
                                                        {rev.rating}★
                                                    </span>
                                                </p>

                                                {rev.tags.length > 0 && (
                                                    <p className="text-content-secondary">
                                                        Motivos:{' '}
                                                        {rev.tags.join(', ')}
                                                    </p>
                                                )}

                                                {rev.comment ? (
                                                    <p className="text-content-secondary">
                                                        Comentário:{' '}
                                                        {rev.comment}
                                                    </p>
                                                ) : (
                                                    <p className="text-content-tertiary">
                                                        Sem comentário.
                                                    </p>
                                                )}

                                                <p className="text-content-tertiary">
                                                    Registrado em:{' '}
                                                    {new Date(
                                                        rev.createdAt
                                                    ).toLocaleString('pt-BR', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* FEEDBACKS NEGATIVOS */}
                            <div className="space-y-2">
                                <p className="text-label-small text-content-primary">
                                    Feedbacks negativos recentes (1–2 estrelas)
                                </p>

                                {recentNegativeReviews.length === 0 ? (
                                    <p className="text-paragraph-small text-content-secondary">
                                        Nenhum feedback negativo registrado
                                        neste mês. 🧡
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {recentNegativeReviews.map((rev) => (
                                            <div
                                                key={rev.id}
                                                className="space-y-1 rounded-xl border border-border-primary bg-background-secondary px-3 py-2 text-[11px]"
                                            >
                                                <p className="text-content-primary">
                                                    {rev.clientName} ·{' '}
                                                    <span className="text-content-secondary">
                                                        {rev.serviceName}
                                                    </span>{' '}
                                                    ·{' '}
                                                    <span className="text-yellow-500">
                                                        {rev.rating}★
                                                    </span>
                                                </p>

                                                {rev.tags.length > 0 && (
                                                    <p className="text-content-secondary">
                                                        Motivos:{' '}
                                                        {rev.tags.join(', ')}
                                                    </p>
                                                )}

                                                {rev.comment ? (
                                                    <p className="text-content-secondary">
                                                        Comentário:{' '}
                                                        {rev.comment}
                                                    </p>
                                                ) : (
                                                    <p className="text-content-tertiary">
                                                        Sem comentário.
                                                    </p>
                                                )}

                                                <p className="text-content-tertiary">
                                                    Registrado em:{' '}
                                                    {new Date(
                                                        rev.createdAt
                                                    ).toLocaleString('pt-BR', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <p className="text-paragraph-small text-content-tertiary">
                            Depois a gente liga isso em{' '}
                            <span className="text-content-secondary">
                                AppointmentReview
                            </span>{' '}
                            e tags. Por enquanto é UI.
                        </p>
                    </>
                )}
            </section>
        </div>
    );
}
