// src/app/admin/client-levels/config/ui-client.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type LevelKey = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';

type UnitUI = {
    id: string;
    name: string;
    isActive: boolean;
};

type LevelConfig = {
    minAppointmentsDone: number;
    minOrdersCompleted: number;
};

type ApiPayload = {
    scope: {
        companyId: string;
        canSeeAllUnits: boolean;
        unitCookie: string;
    };
    units: UnitUI[];
    activeUnitId: string;
    levels: LevelKey[];
    configByLevel: Partial<Record<LevelKey, LevelConfig>>;
};

function levelLabel(level: LevelKey) {
    switch (level) {
        case 'BRONZE':
            return 'Bronze';
        case 'PRATA':
            return 'Prata';
        case 'OURO':
            return 'Ouro';
        case 'DIAMANTE':
            return 'Diamante';
    }
}

export default function AdminClientLevelsConfigClient({
    initialData,
    error,
}: {
    initialData: ApiPayload | null;
    error: string | null;
}) {
    const router = useRouter();
    const pathname = usePathname();

    const units = initialData?.units ?? [];
    const activeUnitId = initialData?.activeUnitId ?? '';
    const levels =
        initialData?.levels ??
        (['BRONZE', 'PRATA', 'OURO', 'DIAMANTE'] as LevelKey[]);
    const configByLevel = initialData?.configByLevel ?? {};

    const activeUnit = React.useMemo(
        () => units.find((u) => u.id === activeUnitId) ?? null,
        [units, activeUnitId]
    );

    const [selectedUnitId, setSelectedUnitId] = React.useState(activeUnitId);
    const [isSaving, setIsSaving] = React.useState(false);

    React.useEffect(() => {
        setSelectedUnitId(activeUnitId);
    }, [activeUnitId]);

    function onChangeUnit(next: string) {
        setSelectedUnitId(next);
    }

    function onLoadUnit() {
        if (!selectedUnitId) return;

        // ✅ evita depender de /client-level vs /client-levels:
        // mantém a rota atual e só troca o unitId na querystring.
        router.push(`${pathname}?unitId=${encodeURIComponent(selectedUnitId)}`);
    }

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!activeUnitId) return;

        try {
            setIsSaving(true);

            const fd = new FormData(e.currentTarget);

            const res = await fetch('/api/admin/client-levels/config', {
                method: 'POST',
                body: fd,
            });

            const json = (await res.json()) as
                | { ok: true; data: { saved: true; unitId: string } }
                | { ok: false; error: string };

            if (!res.ok || !json.ok) {
                const msg = !json.ok ? json.error : 'Falha ao salvar.';
                toast.error(msg);
                return;
            }

            toast.success('Configurações salvas.');
            router.refresh();
        } catch (err: any) {
            toast.error(
                typeof err?.message === 'string'
                    ? err.message
                    : 'Falha ao salvar.'
            );
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="space-y-5 max-w-7xl mx-auto">
            <header className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-title text-content-primary">
                            Configurações por nível
                        </h1>
                        <p className="text-paragraph-medium text-content-secondary">
                            Defina os mínimos mensais para cada nível:
                            atendimentos{' '}
                            <span className="font-semibold">concluídos</span> e
                            pedidos{' '}
                            <span className="font-semibold">entregues</span>.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button asChild variant="outline">
                            <Link href="/admin/client-level">Voltar</Link>
                        </Button>
                    </div>
                </div>

                {error ? (
                    <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
                        <p className="text-paragraph-small text-content-secondary">
                            Não foi possível carregar os dados.
                        </p>
                        <p className="mt-1 text-[11px] text-content-tertiary">
                            {error}
                        </p>
                    </section>
                ) : null}

                <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
                    <div className="flex flex-col md:flex-row gap-3 md:items-end">
                        <div className="w-full md:w-90">
                            <label className="text-[11px] text-content-secondary">
                                Unidade
                            </label>
                            <select
                                name="unitId"
                                value={selectedUnitId || ''}
                                onChange={(e) => onChangeUnit(e.target.value)}
                                className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                                disabled={units.length === 0}
                            >
                                {units.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="edit2"
                                onClick={onLoadUnit}
                                disabled={!selectedUnitId}
                            >
                                Carregar
                            </Button>

                            {activeUnit ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                                    {activeUnit.name}
                                </Badge>
                            ) : null}
                        </div>
                    </div>
                </section>
            </header>

            <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
                <form
                    className="space-y-4"
                    method="POST"
                    action="/api/admin/client-levels/config"
                    onSubmit={onSubmit}
                >
                    <input type="hidden" name="unitId" value={activeUnitId} />

                    <div className="grid gap-3 md:grid-cols-2">
                        {levels.map((lvl) => {
                            const c = configByLevel[lvl];
                            const done = c?.minAppointmentsDone ?? 0;
                            const completed = c?.minOrdersCompleted ?? 0;

                            return (
                                <div
                                    key={lvl}
                                    className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-paragraph-medium-size font-semibold text-content-primary">
                                            {levelLabel(lvl)}
                                        </p>

                                        {c ? (
                                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                                                Configurado
                                            </Badge>
                                        ) : (
                                            <Badge
                                                variant="outline"
                                                className="border-border-primary text-content-secondary"
                                            >
                                                Novo
                                            </Badge>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[11px] text-content-secondary">
                                                Mínimo de agendamentos
                                                concluídos
                                            </label>
                                            <Input
                                                name={`minAppointmentsDone_${lvl}`}
                                                defaultValue={String(done)}
                                                inputMode="numeric"
                                                className="h-10 bg-background-tertiary border-border-primary"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[11px] text-content-secondary">
                                                Mínimo de pedidos entregues
                                            </label>
                                            <Input
                                                name={`minOrdersCompleted_${lvl}`}
                                                defaultValue={String(completed)}
                                                inputMode="numeric"
                                                className="h-10 bg-background-tertiary border-border-primary"
                                            />
                                        </div>
                                    </div>

                                    <p className="text-[11px] text-content-secondary">
                                        Dica: coloque 0 para “sem exigência”
                                        naquele critério.
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                        <Button
                            type="submit"
                            size="sm"
                            variant="edit2"
                            disabled={!activeUnitId || isSaving}
                        >
                            {isSaving ? 'Salvando...' : 'Salvar configurações'}
                        </Button>

                        <Button
                            asChild
                            type="button"
                            size="sm"
                            variant="destructive"
                        >
                            <Link href="/admin/client-level">Cancelar</Link>
                        </Button>
                    </div>
                </form>
            </section>
        </div>
    );
}
