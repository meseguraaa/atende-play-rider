// src/app/api/admin/rides/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

function jsonErr(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeString(value: unknown): string {
    return String(value ?? '').trim();
}

function normalizeNullableString(value: unknown): string | null {
    const normalized = normalizeString(value);
    return normalized ? normalized : null;
}

function normalizeArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function normalizeDate(value: unknown): Date | null {
    const raw = normalizeString(value);
    if (!raw) return null;

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;

    return date;
}

type MeetingPointInput = {
    name?: unknown;
    address?: unknown;
};

type ImageInput = {
    imageUrl?: unknown;
    imageKey?: unknown;
    imageMime?: unknown;
    imageSize?: unknown;
};

function normalizeMeetingPoints(value: unknown) {
    return normalizeArray(value)
        .map((item) => item as MeetingPointInput)
        .map((item, index) => ({
            name: normalizeString(item?.name),
            address: normalizeNullableString(item?.address),
            order: index,
        }))
        .filter((item) => item.name || item.address);
}

function normalizeImages(value: unknown) {
    return normalizeArray(value)
        .map((item) => item as ImageInput)
        .map((item, index) => {
            const imageUrl = normalizeString(item?.imageUrl);
            const rawSize = Number(item?.imageSize);

            return {
                imageUrl,
                imageKey: normalizeNullableString(item?.imageKey),
                imageMime: normalizeNullableString(item?.imageMime),
                imageSize: Number.isFinite(rawSize)
                    ? Math.max(0, rawSize)
                    : null,
                order: index,
            };
        })
        .filter((item) => item.imageUrl);
}

export async function GET() {
    try {
        const session = await requireAdminForModule('RIDES' as any);

        const companyId = session.companyId;
        if (!companyId) {
            return jsonErr('Empresa não encontrada na sessão.', 401);
        }

        const rides = await prisma.ride.findMany({
            where: {
                companyId,
            },
            orderBy: {
                startsAt: 'desc',
            },
            include: {
                meetingPoints: {
                    orderBy: { order: 'asc' },
                },
                images: {
                    orderBy: { order: 'asc' },
                },
                participants: {
                    select: {
                        id: true,
                        status: true,
                        arrivedHomeAt: true,
                    },
                },
                unit: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        const data = rides.map((ride) => {
            const confirmedCount = ride.participants.filter(
                (participant) => participant.status === 'GOING'
            ).length;

            const arrivedHomeCount = ride.participants.filter(
                (participant) =>
                    participant.status === 'GOING' &&
                    Boolean(participant.arrivedHomeAt)
            ).length;

            return {
                id: ride.id,
                companyId: ride.companyId,
                unitId: ride.unitId,
                unit: ride.unit,
                title: ride.title,
                destination: ride.destination,
                description: ride.description,
                observation: ride.observation,
                startsAt: ride.startsAt,
                endsAt: ride.endsAt,
                status: ride.status,
                publishedAt: ride.publishedAt,
                canceledAt: ride.canceledAt,
                finishedAt: ride.finishedAt,
                meetingPoints: ride.meetingPoints,
                images: ride.images,
                confirmedCount,
                arrivedHomeCount,
            };
        });

        return NextResponse.json({ ok: true, data });
    } catch (error: any) {
        return jsonErr(error?.message ?? 'Erro interno.', 500);
    }
}

export async function POST(request: Request) {
    try {
        const session = await requireAdminForModule('RIDES' as any);

        const companyId = session.companyId;
        if (!companyId) {
            return jsonErr('Empresa não encontrada na sessão.', 401);
        }

        const userId = session.id;
        if (!userId) {
            return jsonErr('Usuário não encontrado na sessão.', 401);
        }

        const body = await request.json().catch(() => null);
        if (!body) return jsonErr('Body inválido.');

        const title = normalizeString(body.title);
        const destination = normalizeString(body.destination);
        const description = normalizeNullableString(body.description);
        const observation = normalizeNullableString(body.observation);
        const requestedUnitId = normalizeNullableString(body.unitId);
        const sessionUnitId = normalizeNullableString(session.unitId);

        const unitId = sessionUnitId || requestedUnitId;

        const startsAt = normalizeDate(body.startsAt);
        const endsAt = normalizeDate(body.endsAt);

        const meetingPoints = normalizeMeetingPoints(body.meetingPoints);
        const images = normalizeImages(body.images);

        if (!title) return jsonErr('Título é obrigatório.');
        if (!destination) return jsonErr('Destino é obrigatório.');
        if (!startsAt)
            return jsonErr('Data e hora de início são obrigatórias.');

        if (endsAt && endsAt <= startsAt) {
            return jsonErr('Data e hora de fim precisam ser depois do início.');
        }

        if (meetingPoints.length === 0) {
            return jsonErr('Informe pelo menos um ponto de encontro.');
        }

        let validUnitId: string | null = null;

        if (unitId) {
            const unit = await prisma.unit.findFirst({
                where: {
                    id: unitId,
                    companyId,
                    isActive: true,
                },
                select: {
                    id: true,
                },
            });

            if (!unit) return jsonErr('Unidade inválida ou inativa.', 404);

            if (
                sessionUnitId &&
                requestedUnitId &&
                sessionUnitId !== requestedUnitId
            ) {
                return jsonErr('Unidade inválida para o contexto atual.', 403);
            }

            validUnitId = unit.id;
        }

        const ride = await prisma.ride.create({
            data: {
                companyId,
                unitId: validUnitId,
                title,
                destination,
                description,
                observation,
                startsAt,
                endsAt,
                status: 'DRAFT',
                createdByUserId: userId,

                meetingPoints: {
                    create: meetingPoints,
                },

                images: {
                    create: images,
                },
            },
            select: {
                id: true,
            },
        });

        return NextResponse.json(
            {
                ok: true,
                id: ride.id,
            },
            { status: 201 }
        );
    } catch (error: any) {
        return jsonErr(error?.message ?? 'Erro interno.', 500);
    }
}
