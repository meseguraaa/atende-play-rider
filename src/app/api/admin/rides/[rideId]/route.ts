// src/app/api/admin/rides/[rideId]/route.ts
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

type Params = {
    params: Promise<{
        rideId: string;
    }>;
};

export async function PATCH(request: Request, { params }: Params) {
    try {
        const session = await requireAdminForModule('RIDES' as any);

        const companyId = session.companyId;
        if (!companyId) {
            return jsonErr('Empresa não encontrada na sessão.', 401);
        }

        const { rideId } = await params;
        const id = normalizeString(rideId);

        if (!id) {
            return jsonErr('rideId é obrigatório.');
        }

        const body = await request.json().catch(() => null);
        if (!body) return jsonErr('Body inválido.');

        const action = normalizeString(body.action).toLowerCase();

        const ride = await prisma.ride.findFirst({
            where: {
                id,
                companyId,
            },
            select: {
                id: true,
                status: true,
            },
        });

        if (!ride) {
            return jsonErr('Rolê não encontrado.', 404);
        }

        if (action === 'update') {
            if (ride.status !== 'DRAFT') {
                return jsonErr(
                    'Somente rolês em rascunho podem ser editados.',
                    409
                );
            }

            const title = normalizeString(body.title);
            const destination = normalizeString(body.destination);
            const startsAtRaw = normalizeString(body.startsAt);
            const endsAtRaw = normalizeString(body.endsAt);

            if (!title) return jsonErr('Título é obrigatório.');
            if (!destination) return jsonErr('Destino é obrigatório.');
            if (!startsAtRaw) return jsonErr('Data de início é obrigatória.');

            const startsAt = new Date(startsAtRaw);
            const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;

            if (Number.isNaN(startsAt.getTime())) {
                return jsonErr('Data de início inválida.');
            }

            if (endsAt && Number.isNaN(endsAt.getTime())) {
                return jsonErr('Data de fim inválida.');
            }

            if (endsAt && endsAt <= startsAt) {
                return jsonErr('A data de fim precisa ser depois do início.');
            }

            const meetingPoints = Array.isArray(body.meetingPoints)
                ? body.meetingPoints
                      .map((point: any) => ({
                          name: normalizeString(point?.name),
                          address: normalizeString(point?.address),
                      }))
                      .filter((point: any) => point.name || point.address)
                : [];

            if (meetingPoints.length === 0) {
                return jsonErr('Informe pelo menos um ponto de encontro.');
            }

            const images = Array.isArray(body.images)
                ? body.images
                      .map((image: any) => ({
                          imageUrl: normalizeString(image?.imageUrl),
                          imageKey: normalizeString(image?.imageKey) || null,
                          imageMime: normalizeString(image?.imageMime) || null,
                          imageSize:
                              image?.imageSize == null
                                  ? null
                                  : Number(image.imageSize),
                      }))
                      .filter((image: any) => image.imageUrl)
                : [];

            const updated = await prisma.$transaction(async (tx) => {
                await tx.rideMeetingPoint.deleteMany({
                    where: {
                        rideId: id,
                    },
                });

                await tx.rideImage.deleteMany({
                    where: {
                        rideId: id,
                    },
                });

                const rideUpdated = await tx.ride.update({
                    where: { id },
                    data: {
                        title,
                        destination,
                        startsAt,
                        endsAt,
                        description: normalizeString(body.description) || null,
                        observation: normalizeString(body.observation) || null,
                        meetingPoints: {
                            create: meetingPoints.map(
                                (point: any, index: number) => ({
                                    name: point.name,
                                    address: point.address || null,
                                    order: index,
                                })
                            ),
                        },
                        images: {
                            create: images.map((image: any, index: number) => ({
                                imageUrl: image.imageUrl,
                                imageKey: image.imageKey,
                                imageMime: image.imageMime,
                                imageSize: image.imageSize,
                                order: index,
                            })),
                        },
                    },
                    select: {
                        id: true,
                        status: true,
                        title: true,
                        destination: true,
                    },
                });

                return rideUpdated;
            });

            return NextResponse.json({
                ok: true,
                data: updated,
            });
        }

        if (action === 'publish') {
            if (ride.status !== 'DRAFT') {
                return jsonErr(
                    'Somente rolês em rascunho podem ser publicados.',
                    409
                );
            }

            const updated = await prisma.ride.update({
                where: { id },
                data: {
                    status: 'PUBLISHED',
                    publishedAt: new Date(),
                    canceledAt: null,
                },
                select: {
                    id: true,
                    status: true,
                    publishedAt: true,
                },
            });

            return NextResponse.json({
                ok: true,
                data: updated,
            });
        }

        if (action === 'cancel') {
            if (ride.status === 'CANCELED') {
                return jsonErr('Este rolê já está cancelado.', 409);
            }

            if (ride.status === 'FINISHED') {
                return jsonErr('Rolê finalizado não pode ser cancelado.', 409);
            }

            const updated = await prisma.ride.update({
                where: { id },
                data: {
                    status: 'CANCELED',
                    canceledAt: new Date(),
                },
                select: {
                    id: true,
                    status: true,
                    canceledAt: true,
                },
            });

            return NextResponse.json({
                ok: true,
                data: updated,
            });
        }

        if (action === 'finish') {
            if (ride.status !== 'PUBLISHED') {
                return jsonErr(
                    'Somente rolês publicados podem ser finalizados.',
                    409
                );
            }

            const updated = await prisma.ride.update({
                where: { id },
                data: {
                    status: 'FINISHED',
                    finishedAt: new Date(),
                },
                select: {
                    id: true,
                    status: true,
                    finishedAt: true,
                },
            });

            return NextResponse.json({
                ok: true,
                data: updated,
            });
        }

        return jsonErr('Ação inválida.');
    } catch (error: any) {
        return jsonErr(error?.message ?? 'Erro interno.', 500);
    }
}
