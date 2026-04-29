import { prisma } from '@/lib/prisma';
import { endOfDay, startOfDay } from 'date-fns';

// força essa página a ser dinâmica (sem cache estático)
export const dynamic = 'force-dynamic';

type HomeProps = {
    searchParams?: Promise<{
        date?: string;
    }>;
};

function parseDateParam(dateParam?: string): Date {
    if (!dateParam) return new Date();

    const [year, month, day] = dateParam.split('-').map(Number);
    if (!year || !month || !day) return new Date();

    return new Date(year, month - 1, day);
}

export default async function Home({ searchParams }: HomeProps) {
    const resolvedSearchParams = await searchParams;

    const baseDate = parseDateParam(resolvedSearchParams?.date);

    const dayStart = startOfDay(baseDate);
    const dayEnd = endOfDay(baseDate);

    const appointments = await prisma.appointment.findMany({
        where: {
            scheduleAt: {
                gte: dayStart,
                lte: dayEnd,
            },
        },
        orderBy: {
            scheduleAt: 'asc',
        },
        select: {
            id: true,
            scheduleAt: true,
            clientName: true,
            description: true,
        },
    });

    const dateLabel = baseDate.toLocaleDateString('pt-BR');

    return (
        <main className="mx-auto w-full max-w-5xl p-6">
            <h1 className="text-xl font-semibold">Agendamentos do dia</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Data:{' '}
                <span className="font-medium text-foreground">{dateLabel}</span>{' '}
                • {appointments.length} agendamento(s)
            </p>

            {appointments.length === 0 ? (
                <div className="mt-6 rounded-lg border p-4 text-sm text-muted-foreground">
                    Nenhum agendamento encontrado para este dia.
                </div>
            ) : (
                <ul className="mt-6 space-y-3">
                    {appointments.map((a) => {
                        const time = a.scheduleAt.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                        });

                        return (
                            <li key={a.id} className="rounded-lg border p-4">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <div className="font-medium">
                                        {a.clientName?.trim() || 'Cliente'}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        {time}
                                    </div>
                                </div>

                                {a.description?.trim() ? (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {a.description}
                                    </p>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
        </main>
    );
}
