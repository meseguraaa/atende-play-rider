// src/components/weekly-availability-client/weekly-availability-client.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { WeeklyAvailabilityForm } from '@/components/professional/weekly-availability-form/weekly-availability-form';
import type {
    WeeklyAvailabilityDayPayload,
    WeeklyAvailabilityState,
} from '@/components/professional/weekly-availability-form/weekly-availability-form';

type WeeklyAvailabilityClientProps = {
    initialValue: WeeklyAvailabilityState;
    slotIntervalMinutes?: 15 | 30 | 45 | 60;
    leftAction?: React.ReactNode;
};

type SaveWeeklyResponse =
    | { ok: true; data?: unknown }
    | { ok: false; error?: string };

export function WeeklyAvailabilityClient({
    initialValue,
    slotIntervalMinutes = 30,
    leftAction,
}: WeeklyAvailabilityClientProps) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);

    async function handleSave(payload: {
        days: WeeklyAvailabilityDayPayload[];
    }): Promise<void> {
        setIsSaving(true);

        try {
            const res = await fetch('/api/professional/availability/weekly', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const json = (await res.json()) as SaveWeeklyResponse;

            if (!res.ok || !json?.ok) {
                const msg =
                    (json && 'error' in json && json.error) ||
                    'Erro ao salvar disponibilidade.';
                toast.error(msg);
                return;
            }

            toast.success('Disponibilidade semanal salva com sucesso!');

            // ✅ garante atualizar server + client (além do revalidatePath do backend)
            router.refresh();
        } catch {
            toast.error('Falha ao salvar disponibilidade. Tente novamente.');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <WeeklyAvailabilityForm
            initialValue={initialValue}
            slotIntervalMinutes={slotIntervalMinutes}
            onSaveAction={handleSave}
            isSaving={isSaving}
            leftAction={leftAction}
        />
    );
}
