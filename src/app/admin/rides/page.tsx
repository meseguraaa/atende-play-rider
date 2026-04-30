// src/app/admin/rides/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';
import AdminRidesClient from './admin-rides-members';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Rolês',
};

export default async function AdminRidesPage() {
    const session = await requireAdminForModule('RIDES' as any);

    const companyId = session.companyId;
    if (!companyId) redirect('/admin');

    const scopeLabel = 'Grupo AtendePlay Rider';

    const ridesPrisma = await prisma.ride.findMany({
        where: {
            companyId,
        },
        orderBy: {
            startsAt: 'desc',
        },
        include: {
            meetingPoints: {
                orderBy: {
                    order: 'asc',
                },
            },
            images: {
                orderBy: {
                    order: 'asc',
                },
            },
            participants: {
                select: {
                    id: true,
                    status: true,
                    arrivedHomeAt: true,
                },
            },
        },
    });

    const rides = ridesPrisma.map((ride) => {
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
            unit: null,
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
            meetingPoints: ride.meetingPoints.map((point) => ({
                id: point.id,
                name: point.name,
                address: point.address,
                order: point.order,
            })),
            images: ride.images.map((image) => ({
                id: image.id,
                imageUrl: image.imageUrl,
                imageKey: image.imageKey,
                imageMime: image.imageMime,
                imageSize: image.imageSize,
                order: image.order,
            })),
            confirmedCount,
            arrivedHomeCount,
        };
    });

    return <AdminRidesClient scopeLabel={scopeLabel} rides={rides} />;
}
