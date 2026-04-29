// src/app/admin/client-levels/rules/ui-client.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type LevelKey = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';
type RuleType = 'HAS_ACTIVE_PLAN';

type UnitUI = {
    id: string;
    name: string;
    isActive: boolean;
};

type RuleUI = {
    id: string;
    type: RuleType;
    targetLevel: LevelKey;
    priority: number;
    isEnabled: boolean;
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
    ruleTypes: RuleType[];
    rules: RuleUI[];
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

function ruleTypeLabel(type: RuleType) {
    if (type === 'HAS_ACTIVE_PLAN') return 'Tem plano ativo';
    return type;
}

export default function AdminClientLevelsRulesClient({
    initialData,
    error,
    initialCreateMode,
}: {
    initialData: ApiPayload | null;
    error: string | null;
    initialCreateMode: boolean;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const sp = useSearchParams();

    const units = initialData?.units ?? [];
    const activeUnitId = initialData?.activeUnitId ?? '';
    const levels =
        initialData?.levels ??
        (['BRONZE', 'PRATA', 'OURO', 'DIAMANTE'] as LevelKey[]);
    const ruleTypes =
        initialData?.ruleTypes ?? (['HAS_ACTIVE_PLAN'] as RuleType[]);
    const rules = initialData?.rules ?? [];

    const hasRule = rules.length > 0;
    const hasOnlyOneUnit = units.length === 1;

    const activeUnit = React.useMemo(
        () => units.find((u) => u.id === activeUnitId) ?? null,
        [units, activeUnitId]
    );

    const [selectedUnitId, setSelectedUnitId] = React.useState(activeUnitId);
    const [isSaving, setIsSaving] = React.useState(false);

    const createParam = sp?.get('create');
    const isCreateMode = (initialCreateMode || createParam === '1') && !hasRule;

    React.useEffect(() => {
        setSelectedUnitId(activeUnitId);
    }, [activeUnitId]);

    function pushWithParams(params: Record<string, string | null | undefined>) {
        const next = new URLSearchParams(sp?.toString() ?? '');
        for (const [k, v] of Object.entries(params)) {
            if (!v) next.delete(k);
            else next.set(k, v);
        }
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
    }

    function onLoadUnit() {
        if (!selectedUnitId) return;
        pushWithParams({ unitId: selectedUnitId, create: null });
    }

    function onEnterCreate() {
        if (!activeUnitId) return;
        pushWithParams({ unitId: activeUnitId, create: '1' });
    }

    function onCancelCreate() {
        pushWithParams({ create: null });
    }

    async function submitIntent(fd: FormData) {
        try {
            setIsSaving(true);

            const res = await fetch('/api/admin/client-levels/rules', {
                method: 'POST',
                body: fd,
            });

            const json = (await res.json()) as
                | { ok: true; data: any }
                | { ok: false; error: string };

            if (!res.ok || !json.ok) {
                const msg = !json.ok ? json.error : 'Falha ao salvar.';
                toast.error(msg);
                return false;
            }

            return true;
        } catch (e: any) {
            toast.error(
                typeof e?.message === 'string' ? e.message : 'Falha ao salvar.'
            );
            return false;
        } finally {
            setIsSaving(false);
        }
    }

    async function onCreate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!activeUnitId) return;

        const fd = new FormData(e.currentTarget);
        fd.set('intent', 'create');
        fd.set('unitId', activeUnitId);

        const ok = await submitIntent(fd);
        if (!ok) return;

        toast.success('Regra criada.');
        onCancelCreate();
        router.refresh();
    }

    async function onUpdate(
        ruleId: string,
        e: React.FormEvent<HTMLFormElement>
    ) {
        e.preventDefault();
        if (!activeUnitId) return;

        const fd = new FormData(e.currentTarget);
        fd.set('intent', 'update');
        fd.set('unitId', activeUnitId);
        fd.set('ruleId', ruleId);

        const ok = await submitIntent(fd);
        if (!ok) return;

        toast.success('Regra atualizada.');
        router.refresh();
    }

    async function onDelete(ruleId: string) {
        if (!activeUnitId) return;

        const fd = new FormData();
        fd.set('intent', 'delete');
        fd.set('unitId', activeUnitId);
        fd.set('ruleId', ruleId);

        const ok = await submitIntent(fd);
        if (!ok) return;

        toast.success('Regra excluída.');
        router.refresh();
    }

    return (
        <div className="space-y-5 max-w-7xl mx-auto">
            <header className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-title text-content-primary">
                            Nível para planos
                        </h1>
                        <p className="text-paragraph-medium text-content-secondary">
                            Regras que podem “forçar” um nível,
                            independentemente das contagens do mês.
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
                    {hasOnlyOneUnit ? (
                        <div className="flex flex-col md:flex-row md:items-end gap-3">
                            <div className="w-full md:w-90">
                                <label className="text-[11px] text-content-secondary">
                                    Unidade
                                </label>
                                <div className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary flex items-center">
                                    {activeUnit?.name ?? activeUnitId}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 md:ml-auto">
                                {!hasRule && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="edit2"
                                        onClick={onEnterCreate}
                                        disabled={!activeUnitId}
                                    >
                                        Criar
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col md:flex-row gap-3 md:items-end">
                            <div className="w-full md:w-90">
                                <label className="text-[11px] text-content-secondary">
                                    Unidade
                                </label>
                                <select
                                    name="unitId"
                                    value={selectedUnitId || ''}
                                    onChange={(e) =>
                                        setSelectedUnitId(e.target.value)
                                    }
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

                                {!hasRule && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="edit2"
                                        onClick={onEnterCreate}
                                        disabled={!activeUnitId}
                                    >
                                        Criar
                                    </Button>
                                )}

                                {activeUnit ? (
                                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                                        {activeUnit.name}
                                    </Badge>
                                ) : null}
                            </div>
                        </div>
                    )}

                    {hasRule ? (
                        <p className="mt-2 text-[11px] text-content-secondary">
                            Esta unidade já possui 1 regra. Para remover, basta
                            excluir.
                        </p>
                    ) : (
                        <p className="mt-2 text-[11px] text-content-secondary">
                            Esta tela permite apenas 1 regra por unidade.
                        </p>
                    )}
                </section>
            </header>

            {isCreateMode ? (
                <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3">
                    <div>
                        <p className="text-label-small text-content-primary">
                            Nova regra
                        </p>
                        <p className="text-paragraph-small text-content-secondary">
                            Exemplo: “Tem plano ativo → Diamante”.
                        </p>
                    </div>

                    <form
                        className="grid gap-3 md:grid-cols-3 items-end"
                        method="POST"
                        action="/api/admin/client-levels/rules"
                        onSubmit={onCreate}
                    >
                        <input
                            type="hidden"
                            name="unitId"
                            value={activeUnitId}
                        />
                        <input type="hidden" name="intent" value="create" />

                        <div className="space-y-1">
                            <label className="text-[11px] text-content-secondary">
                                Tipo
                            </label>
                            <select
                                name="type"
                                defaultValue="HAS_ACTIVE_PLAN"
                                className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                            >
                                {ruleTypes.map((t) => (
                                    <option key={t} value={t}>
                                        {ruleTypeLabel(t)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] text-content-secondary">
                                Nível alvo
                            </label>
                            <select
                                name="targetLevel"
                                defaultValue="DIAMANTE"
                                className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                            >
                                {levels.map((lvl) => (
                                    <option key={lvl} value={lvl}>
                                        {levelLabel(lvl)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                            <Button
                                type="submit"
                                size="sm"
                                variant="edit2"
                                disabled={!activeUnitId || isSaving}
                            >
                                {isSaving ? 'Salvando...' : 'Salvar'}
                            </Button>

                            <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={onCancelCreate}
                                disabled={isSaving}
                            >
                                Cancelar
                            </Button>
                        </div>
                    </form>
                </section>
            ) : null}

            <section className="space-y-2">
                {!hasRule ? (
                    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
                        <p className="text-paragraph-small text-content-secondary text-center">
                            Nenhuma regra cadastrada.
                        </p>
                    </div>
                ) : (
                    rules.map((r) => (
                        <div
                            key={r.id}
                            className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-paragraph-medium-size font-semibold text-content-primary">
                                            {ruleTypeLabel(r.type)} →{' '}
                                            {levelLabel(r.targetLevel)}
                                        </p>

                                        {r.isEnabled ? (
                                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                                                Ativa
                                            </Badge>
                                        ) : (
                                            <Badge
                                                variant="outline"
                                                className="border-border-primary text-content-secondary"
                                            >
                                                Desativada
                                            </Badge>
                                        )}
                                    </div>

                                    <p className="text-[11px] text-content-secondary">
                                        Prioridade:{' '}
                                        <span className="text-content-primary font-semibold">
                                            {r.priority}
                                        </span>
                                        {' • '}Para desativar, exclua a regra.
                                    </p>
                                </div>
                            </div>

                            <form
                                className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end"
                                method="POST"
                                action="/api/admin/client-levels/rules"
                                onSubmit={(e) => onUpdate(r.id, e)}
                            >
                                <input
                                    type="hidden"
                                    name="unitId"
                                    value={activeUnitId}
                                />
                                <input
                                    type="hidden"
                                    name="intent"
                                    value="update"
                                />
                                <input
                                    type="hidden"
                                    name="ruleId"
                                    value={r.id}
                                />

                                <div className="space-y-1">
                                    <label className="text-[11px] text-content-secondary">
                                        Tipo
                                    </label>
                                    <select
                                        name="type"
                                        defaultValue={r.type}
                                        className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                                    >
                                        {ruleTypes.map((t) => (
                                            <option key={t} value={t}>
                                                {ruleTypeLabel(t)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[11px] text-content-secondary">
                                        Nível alvo
                                    </label>
                                    <select
                                        name="targetLevel"
                                        defaultValue={r.targetLevel}
                                        className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                                    >
                                        {levels.map((lvl) => (
                                            <option key={lvl} value={lvl}>
                                                {levelLabel(lvl)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center justify-end gap-2">
                                    <Button
                                        type="submit"
                                        size="sm"
                                        variant="edit2"
                                        disabled={!activeUnitId || isSaving}
                                    >
                                        {isSaving ? 'Salvando...' : 'Salvar'}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        className="border-border-primary hover:bg-muted/40"
                                        disabled={isSaving}
                                        onClick={() => onDelete(r.id)}
                                    >
                                        Excluir
                                    </Button>
                                </div>

                                {/* prioridade fica editável via hidden (mantém valor atual) */}
                                <input
                                    type="hidden"
                                    name="priority"
                                    value={String(r.priority)}
                                />
                            </form>
                        </div>
                    ))
                )}
            </section>
        </div>
    );
}
