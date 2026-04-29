// src/app/api/mobile/reviews/route.ts
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type MobileTokenPayload = {
    sub: string;
    role?: 'CLIENT' | 'BARBER' | 'ADMIN';
    companyId: string; // ✅ multi-tenant obrigatório
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

function getJwtSecretKey() {
    const secret = process.env.APP_JWT_SECRET;
    if (!secret) throw new Error('APP_JWT_SECRET não definido no .env');
    return new TextEncoder().encode(secret);
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) throw new Error('Token ausente');

    const { payload } = await jwtVerify(token, getJwtSecretKey());

    const sub = String((payload as any)?.sub || '').trim();
    if (!sub) throw new Error('Token inválido');

    const companyId =
        typeof (payload as any)?.companyId === 'string'
            ? String((payload as any).companyId).trim()
            : '';
    if (!companyId) throw new Error('companyId ausente no token');

    return {
        sub,
        role: (payload as any).role,
        companyId,
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

const schema = z.object({
    appointmentId: z.string().min(1, 'Atendimento é obrigatório'),
    rating: z.number().int().min(1).max(5),
    comment: z
        .string()
        .max(1000, 'Comentário muito longo')
        .optional()
        .nullable(),
    tagIds: z.array(z.string()).max(3).optional().default([]),
    isAnonymousForProfessional: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
    const headers = corsHeaders();

    try {
        const payload = await requireMobileAuth(req);

        // ✅ avaliação só CLIENT
        if (payload.role && payload.role !== 'CLIENT') {
            return NextResponse.json(
                { ok: false, error: 'Sem permissão.' },
                { status: 403, headers }
            );
        }

        const userId = payload.sub;
        const companyId = payload.companyId;

        const body = await req.json().catch(() => null);
        const parsed = schema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { ok: false, error: 'Dados inválidos ao criar avaliação.' },
                { status: 400, headers }
            );
        }

        const {
            appointmentId,
            rating,
            comment,
            tagIds,
            isAnonymousForProfessional,
        } = parsed.data;

        // ✅ tenant-safe: appointment tem que ser do mesmo companyId
        // ✅ valida: DONE, do cliente, tem professional, e ainda não tem review
        const appointment = await prisma.appointment.findFirst({
            where: {
                id: appointmentId,
                companyId,
                clientId: userId,
                status: 'DONE',
                professionalId: { not: null }, // ✅ era barberId
                review: { is: null },
            },
            select: {
                id: true,
                professionalId: true, // ✅ era barberId
            },
        });

        if (!appointment) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Atendimento não encontrado ou inválido para avaliação (precisa estar concluído).',
                },
                { status: 404, headers }
            );
        }

        // garante no máximo 3 tags únicas
        const uniqueTagIds = Array.from(new Set(tagIds ?? [])).slice(0, 3);

        await prisma.$transaction(async (tx) => {
            // ✅ cria review (tenant-safe)
            const review = await tx.appointmentReview.create({
                data: {
                    companyId,
                    appointmentId: appointment.id,
                    clientId: userId,
                    professionalId: appointment.professionalId!, // ✅ aqui é a correção principal
                    rating,
                    comment: comment ?? undefined,
                    isAnonymousForProfessional,
                },
                select: { id: true },
            });

            if (uniqueTagIds.length > 0) {
                // ✅ tenant-safe: tags precisam ser do mesmo companyId e ativas
                const validTags = await tx.reviewTag.findMany({
                    where: {
                        companyId,
                        id: { in: uniqueTagIds },
                        isActive: true,
                    },
                    select: { id: true },
                });

                if (validTags.length > 0) {
                    // ✅ PIVOT: normalmente só reviewId/tagId mesmo
                    await tx.appointmentReviewTag.createMany({
                        data: validTags.map((tag) => ({
                            reviewId: review.id,
                            tagId: tag.id,
                        })),
                        skipDuplicates: true,
                    });
                }
            }

            // ✅ depois de avaliar, marca a pendência (tenant-safe)
            await tx.appointment.updateMany({
                where: { id: appointment.id, companyId },
                data: { reviewModalShown: true },
            });
        });

        const res = NextResponse.json({ ok: true }, { headers });
        res.headers.set('x-company-id', companyId);
        return res;
    } catch (err: any) {
        const msg = String(err?.message ?? 'Erro ao salvar sua avaliação.');
        const lower = msg.toLowerCase();

        const isAuth =
            lower.includes('token') ||
            lower.includes('jwt') ||
            lower.includes('signature') ||
            lower.includes('companyid');

        return NextResponse.json(
            {
                ok: false,
                error: isAuth ? 'Não autorizado' : 'Erro ao salvar avaliação',
            },
            { status: isAuth ? 401 : 500, headers }
        );
    }
}
