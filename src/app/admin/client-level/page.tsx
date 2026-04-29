// src/app/admin/client-levels/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Níveis de Cliente',
};

type LevelKey = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE';
const LEVELS: LevelKey[] = ['BRONZE', 'PRATA', 'OURO', 'DIAMANTE'];

type LevelConfig = {
    minAppointmentsDone: number;
    minOrdersCompleted: number;
};

type UnitUI = {
    id: string;
    name: string;
    isActive: boolean;
};

type RuleUI = {
    id: string;
    type: string;
    targetLevel: LevelKey;
    priority: number;
    isEnabled: boolean;
};

type SummaryApiResponse =
    | {
          ok: true;
          data: {
              scope: {
                  companyId: string;
                  unitCookie: string;
                  canSeeAllUnits: boolean;
                  showAllUnits: boolean;
              };
              units: UnitUI[];
              configsByUnit: Record<
                  string,
                  Partial<Record<LevelKey, LevelConfig>>
              >;
              rulesByUnit: Record<string, RuleUI[]>;
          };
      }
    | {
          ok: false;
          error: string;
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

function ruleTypeLabel(type: string) {
    if (type === 'HAS_ACTIVE_PLAN') return 'Tem plano ativo';
    return type;
}

/**
 * Resolve a base URL segura para chamadas server-side do ADMIN.
 *
 * Em produção, tenants (ex: atendeplay.atendeplay.com.br) podem não estar cobertos
 * pelo certificado SSL usado pela infra, causando:
 * ERR_TLS_CERT_ALTNAME_INVALID
 *
 * Preferimos:
 * - PAINEL_BASE_URL (recomendado) ex: https://painel.atendeplay.com.br
 * - fallback: força painel quando estiver em *.atendeplay.com.br
 */
function resolveAdminBaseUrl(h: Headers): string {
    const envBase = (process.env.PAINEL_BASE_URL || '').trim();
    if (envBase) return envBase.replace(/\/+$/, '');

    const forwardedHost = (h.get('x-forwarded-host') ?? '').trim();
    const host = (forwardedHost || h.get('host') || '').trim();

    if (
        host.endsWith('.atendeplay.com.br') &&
        host !== 'painel.atendeplay.com.br'
    ) {
        return 'https://painel.atendeplay.com.br';
    }

    const proto = (h.get('x-forwarded-proto') ?? 'https').trim() || 'https';
    return host ? `${proto}://${host}` : 'https://painel.atendeplay.com.br';
}

async function fetchClientLevelsSummary(): Promise<SummaryApiResponse> {
    const h = await headers();
    const baseUrl = resolveAdminBaseUrl(h);

    const url = `${baseUrl}/api/admin/client-levels/summary`;

    // ✅ server-side fetch NÃO envia cookies automaticamente pra uma rota interna.
    // então precisamos repassar manualmente.
    const cookieStore = await cookies();

    const res = await fetch(url, {
        method: 'GET',
        headers: {
            cookie: cookieStore.toString(),
        },
        cache: 'no-store',
    });

    try {
        return (await res.json()) as SummaryApiResponse;
    } catch {
        return { ok: false, error: 'Falha ao ler resposta da API.' };
    }
}

export default async function AdminClientLevelsPage() {
    // ✅ gate + usa session.canSeeAllUnits no texto do topo
    const session = await requireAdminForModule('CLIENT_LEVELS');

    const summary = await fetchClientLevelsSummary();

    const units: UnitUI[] = summary.ok ? summary.data.units : [];
    const configsByUnit = summary.ok ? summary.data.configsByUnit : {};
    const rulesByUnit = summary.ok ? summary.data.rulesByUnit : {};

    const hasApiError = !summary.ok;

    return (
        <div className="space-y-5 max-w-7xl mx-auto">
            <header className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-title text-content-primary">
                            Níveis de Cliente
                        </h1>
                        <p className="text-paragraph-medium text-content-secondary">
                            Configure por unidade os requisitos de cada nível e
                            regras especiais para clientes com planos.
                        </p>

                        <p className="mt-1 text-paragraph-small text-content-tertiary">
                            Escopo atual:{' '}
                            <span className="text-content-secondary">
                                {session.canSeeAllUnits
                                    ? 'todas as unidades'
                                    : 'unidade atual'}
                            </span>
                        </p>
                    </div>
                </div>

                {hasApiError && (
                    <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
                        <p className="text-paragraph-small text-content-secondary">
                            Não foi possível carregar os dados.
                        </p>
                        <p className="mt-1 text-[11px] text-content-tertiary">
                            {summary.error}
                        </p>
                    </section>
                )}
            </header>

            {units.length === 0 ? (
                <section className="rounded-xl border border-border-primary bg-background-tertiary p-6">
                    <p className="text-paragraph-medium text-content-secondary">
                        Nenhuma unidade encontrada para o contexto atual.
                    </p>
                    <div className="mt-3">
                        <Button asChild variant="outline">
                            <Link href="/admin/setting">
                                Ir para Configurações
                            </Link>
                        </Button>
                    </div>
                </section>
            ) : (
                <section className="space-y-4">
                    {units.map((u) => {
                        const unitConfig =
                            configsByUnit[u.id] ??
                            ({} as Partial<Record<LevelKey, LevelConfig>>);

                        const unitRules = rulesByUnit[u.id] ?? [];

                        const hasAnyConfig = Object.keys(unitConfig).length > 0;
                        const hasAnyRule = unitRules.length > 0;

                        return (
                            <div
                                key={u.id}
                                className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-paragraph-medium-size font-semibold text-content-primary">
                                                {u.name}
                                            </p>

                                            {u.isActive ? (
                                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                                                    Ativa
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="outline"
                                                    className="border-border-primary text-content-secondary"
                                                >
                                                    Inativa
                                                </Badge>
                                            )}

                                            {!hasAnyConfig && (
                                                <Badge
                                                    variant="outline"
                                                    className="border-border-primary text-content-secondary"
                                                >
                                                    Sem configurações
                                                </Badge>
                                            )}
                                            {!hasAnyRule && (
                                                <Badge
                                                    variant="outline"
                                                    className="border-border-primary text-content-secondary"
                                                >
                                                    Sem regras
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="edit2"
                                        >
                                            <Link
                                                href={`/admin/client-level/config?unitId=${u.id}`}
                                            >
                                                Configuração por nível
                                            </Link>
                                        </Button>
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="edit2"
                                        >
                                            <Link
                                                href={`/admin/client-level/rules?unitId=${u.id}`}
                                            >
                                                Nível para planos
                                            </Link>
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <p className="text-label-small text-content-primary">
                                            Configurações por nível
                                        </p>
                                        <p className="text-[11px] text-content-secondary">
                                            Mínimos do mês: atendimentos
                                            concluídos e pedidos entregues.
                                        </p>
                                    </div>

                                    <div className="grid gap-2 md:grid-cols-2">
                                        {LEVELS.map((lvl) => {
                                            const c = unitConfig[lvl];

                                            return (
                                                <div
                                                    key={lvl}
                                                    className="rounded-xl border border-border-primary bg-background-tertiary p-3 flex items-center justify-between gap-3"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-paragraph-medium-size font-semibold text-content-primary">
                                                            {levelLabel(lvl)}
                                                        </p>
                                                        {c ? (
                                                            <p className="text-xs text-content-secondary">
                                                                Concluído:{' '}
                                                                <span className="text-content-primary font-semibold">
                                                                    {
                                                                        c.minAppointmentsDone
                                                                    }
                                                                </span>{' '}
                                                                • COMPLETED:{' '}
                                                                <span className="text-content-primary font-semibold">
                                                                    {
                                                                        c.minOrdersCompleted
                                                                    }
                                                                </span>
                                                            </p>
                                                        ) : (
                                                            <p className="text-xs text-content-secondary">
                                                                Ainda não
                                                                configurado para
                                                                este nível.
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="shrink-0">
                                                        {c ? (
                                                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                                                                OK
                                                            </Badge>
                                                        ) : (
                                                            <Badge
                                                                variant="outline"
                                                                className="border-border-primary text-content-secondary"
                                                            >
                                                                —
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {!hasAnyConfig && (
                                        <div className="pt-2">
                                            <p className="text-paragraph-small text-content-secondary">
                                                Ainda não há configurações
                                                cadastradas para essa unidade.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <p className="text-label-small text-content-primary">
                                            Nível para planos
                                        </p>
                                    </div>

                                    {unitRules.length === 0 ? (
                                        <p className="text-paragraph-small text-content-secondary">
                                            Nenhuma regra especial cadastrada.
                                        </p>
                                    ) : (
                                        <div className="space-y-2">
                                            {unitRules.map((r) => (
                                                <div
                                                    key={r.id}
                                                    className="rounded-xl border border-border-primary bg-background-tertiary p-3 flex items-start justify-between gap-3"
                                                >
                                                    <div className="min-w-0 space-y-1">
                                                        <p className="text-paragraph-small text-content-primary font-medium">
                                                            {ruleTypeLabel(
                                                                String(r.type)
                                                            )}
                                                            {' → '}
                                                            <span className="font-semibold">
                                                                {levelLabel(
                                                                    r.targetLevel
                                                                )}
                                                            </span>
                                                        </p>

                                                        <p className="text-[11px] text-content-secondary">
                                                            Prioridade:{' '}
                                                            <span className="text-content-primary font-semibold">
                                                                {r.priority}
                                                            </span>
                                                            {' • '}Status:{' '}
                                                            <span className="text-content-primary font-semibold">
                                                                {r.isEnabled
                                                                    ? 'Ativa'
                                                                    : 'Desativada'}
                                                            </span>
                                                        </p>
                                                    </div>

                                                    <div className="shrink-0 flex items-center gap-2">
                                                        <Button
                                                            asChild
                                                            variant="outline"
                                                        >
                                                            <Link
                                                                href={`/admin/client-levels/rules?unitId=${u.id}`}
                                                            >
                                                                Editar
                                                            </Link>
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </section>
            )}
        </div>
    );
}
