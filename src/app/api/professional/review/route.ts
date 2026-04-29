// src/app/api/professional/review/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { prisma } from '@/lib/prisma';

function jsonOk(data: unknown, status = 200) {
    return NextResponse.json({ ok: true, data }, { status });
}

function jsonErr(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function parseMonthParam(month?: string | null) {
    // Esperado: yyyy-MM
    if (!month) return null;
    const m = String(month).trim();
    if (!/^\d{4}-\d{2}$/.test(m)) return null;

    const [yStr, moStr] = m.split('-');
    const year = Number(yStr);
    const monthIndex = Number(moStr) - 1; // 0..11

    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
    if (year < 2000 || year > 2100) return null;
    if (monthIndex < 0 || monthIndex > 11) return null;

    return new Date(year, monthIndex, 1);
}

function startOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date) {
    // último ms do mês
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatMonthLabel(date: Date) {
    const raw = new Intl.DateTimeFormat('pt-BR', {
        month: 'long',
        year: 'numeric',
    }).format(date);

    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

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

type ProfessionalSessionLike = {
    companyId?: string;
    professionalId?: string;
};

// ✅ Não importa diretamente pra não quebrar TS se o arquivo ainda não existir
function getRequireProfessionalSession():
    | (() => Promise<ProfessionalSessionLike>)
    | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('@/lib/professional-permissions') as any;

        const fn =
            mod?.requireProfessionalSession ??
            mod?.default ??
            mod?.requireProfessional;

        if (typeof fn === 'function') {
            return fn as () => Promise<ProfessionalSessionLike>;
        }

        return null;
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest) {
    try {
        const requireProfessionalSession = getRequireProfessionalSession();
        if (!requireProfessionalSession) {
            return jsonErr(
                'Helper de sessão do profissional não encontrado. Crie/ajuste "@/lib/professional-permissions" exportando requireProfessionalSession() com { companyId, professionalId }.',
                500
            );
        }

        const session = await requireProfessionalSession();

        const companyId = session?.companyId;
        const professionalId = session?.professionalId;

        if (!companyId) return jsonErr('Sessão sem companyId.', 401);
        if (!professionalId) return jsonErr('Sessão sem professionalId.', 401);

        const monthParam = request.nextUrl.searchParams.get('month');
        const referenceDate = parseMonthParam(monthParam) ?? new Date();

        const monthStart = startOfMonth(referenceDate);
        const monthEnd = endOfMonth(referenceDate);

        const monthLabel = formatMonthLabel(referenceDate);

        const [reviewsMonth, allRatingsOverall] = await Promise.all([
            prisma.appointmentReview.findMany({
                where: {
                    companyId,
                    professionalId,
                    createdAt: {
                        gte: monthStart,
                        lte: monthEnd,
                    },
                },
                include: {
                    client: true,
                    appointment: {
                        include: {
                            service: true,
                        },
                    },
                    tags: {
                        include: {
                            tag: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
            }),

            prisma.appointmentReview.findMany({
                where: {
                    companyId,
                    professionalId,
                },
                select: {
                    rating: true,
                },
            }),
        ]);

        // ================================
        // Normaliza reviews para UI
        // ================================
        const reviewsUI: ReviewUI[] = reviewsMonth.map((rev) => {
            const clientName = rev.isAnonymousForProfessional
                ? 'Cliente (anônimo)'
                : (rev.client?.name ?? 'Cliente');

            const serviceName = rev.appointment?.service?.name ?? 'Atendimento';

            const tags = (rev.tags ?? [])
                .map((t) => t.tag?.label)
                .filter(Boolean) as string[];

            return {
                id: rev.id,
                rating: rev.rating,
                comment: rev.comment ?? null,
                isAnonymousForProfessional: rev.isAnonymousForProfessional,
                clientName,
                serviceName,
                createdAt: rev.createdAt.toISOString(),
                tags,
            };
        });

        // ================================
        // Stats do mês
        // ================================
        const totalReviewsMonth = reviewsMonth.length;
        const averageRatingMonth =
            totalReviewsMonth > 0
                ? reviewsMonth.reduce((acc, r) => acc + r.rating, 0) /
                  totalReviewsMonth
                : 0;

        // ================================
        // Stats geral (histórico)
        // ================================
        const totalReviewsOverall = allRatingsOverall.length;
        const averageRatingOverall =
            totalReviewsOverall > 0
                ? allRatingsOverall.reduce((acc, r) => acc + r.rating, 0) /
                  totalReviewsOverall
                : 0;

        // ================================
        // Tags positivas / negativas (mês)
        // ================================
        const positiveTagMap = new Map<string, number>();
        const negativeTagMap = new Map<string, number>();

        for (const review of reviewsMonth) {
            const isPositive = review.rating >= 3;
            const isNegative = review.rating <= 2;

            for (const rt of review.tags ?? []) {
                const label = rt.tag?.label;
                if (!label) continue;

                if (isPositive) {
                    positiveTagMap.set(
                        label,
                        (positiveTagMap.get(label) ?? 0) + 1
                    );
                }
                if (isNegative) {
                    negativeTagMap.set(
                        label,
                        (negativeTagMap.get(label) ?? 0) + 1
                    );
                }
            }
        }

        const topPositiveTags = Array.from(positiveTagMap.entries())
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.label.localeCompare(b.label);
            })
            .slice(0, 8);

        const topNegativeTags = Array.from(negativeTagMap.entries())
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.label.localeCompare(b.label);
            })
            .slice(0, 8);

        // ================================
        // Feedbacks positivos / negativos (mês)
        // ================================
        const positiveReviews = reviewsUI.filter((r) => r.rating >= 3);
        const negativeReviews = reviewsUI.filter((r) => r.rating <= 2);

        const recentPositiveReviews = [...positiveReviews]
            .sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
            )
            .slice(0, 5);

        const recentNegativeReviews = [...negativeReviews]
            .sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
            )
            .slice(0, 5);

        return jsonOk({
            month: {
                value: `${referenceDate.getFullYear()}-${String(
                    referenceDate.getMonth() + 1
                ).padStart(2, '0')}`,
                label: monthLabel,
                start: monthStart.toISOString(),
                end: monthEnd.toISOString(),
            },

            stats: {
                totalReviewsMonth,
                averageRatingMonth,
                totalReviewsOverall,
                averageRatingOverall,
            },

            topPositiveTags,
            topNegativeTags,

            recentPositiveReviews,
            recentNegativeReviews,

            reviews: reviewsUI,
        });
    } catch (err) {
        console.error('GET /api/professional/review error:', err);
        return jsonErr('Erro inesperado ao carregar avaliações.', 500);
    }
}
