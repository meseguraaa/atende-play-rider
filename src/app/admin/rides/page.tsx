// src/app/admin/rides/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';
import AdminRidesClient from './admin-rides-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Rolês',
};

type AdminRidesPageProps = {
    searchParams: Promise<{
        unit?: string;
    }>;
};

export default async function AdminRidesPage({
    searchParams,
}: AdminRidesPageProps) {
    const session = await requireAdminForModule('RIDES' as any);

    const companyId = session.companyId;
    if (!companyId) redirect('/admin');

    const rawSessionUnitId = String(session.unitId ?? '').trim();
    const { unit: unitParam } = await searchParams;

    const units = await prisma.unit.findMany({
        where: {
            companyId,
            isActive: true,
            ...(rawSessionUnitId ? { id: rawSessionUnitId } : {}),
        },
        select: {
            id: true,
            name: true,
        },
        orderBy: {
            name: 'asc',
        },
    });

    const requestedUnitId =
        unitParam && unitParam !== 'all' ? String(unitParam).trim() : null;

    const requestedUnitIsAccessible = requestedUnitId
        ? units.some((u) => u.id === requestedUnitId)
        : false;

    const activeUnitId = requestedUnitIsAccessible
        ? requestedUnitId
        : units.length > 0
          ? units[0].id
          : null;

    if (activeUnitId && requestedUnitId !== activeUnitId) {
        redirect(`/admin/rides?unit=${activeUnitId}`);
    }

    const activeUnit = activeUnitId
        ? (units.find((u) => u.id === activeUnitId) ?? null)
        : null;

    const scopeLabel = activeUnit?.name ?? 'grupo selecionado';

    const ridesPrisma = await prisma.ride.findMany({
        where: {
            companyId,
            ...(activeUnitId ? { unitId: activeUnitId } : {}),
        },
        orderBy: {
            startsAt: 'desc',
        },
        include: {
            unit: {
                select: {
                    id: true,
                    name: true,
                },
            },
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

    return (
        <AdminRidesClient
            scopeLabel={scopeLabel}
            activeUnitId={activeUnitId}
            units={units}
            rides={rides}
        />
    );
}
