// src/app/api/admin/checkout/professionals/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

type ProfessionalsListResponse =
    | {
          ok: true;
          data: {
              professionals: Array<{
                  id: string;
                  name: string;
                  isActive: boolean;
                  unitId: string | null;
              }>;
              count: number;
              unitScope: 'filtered' | 'all';
          };
      }
    | { ok: false; error: string };

// ✅ Helpers tipados corretamente (mantém ok como literal true/false)
function jsonErr(
    message: string,
    status = 400
): NextResponse<ProfessionalsListResponse> {
    return NextResponse.json({ ok: false, error: message } as const, {
        status,
    });
}

function jsonOk(
    data: Extract<ProfessionalsListResponse, { ok: true }>['data'],
    status = 200
): NextResponse<ProfessionalsListResponse> {
    return NextResponse.json({ ok: true, data } as const, { status });
}

/**
 * GET /api/admin/checkout/professionals?unit=...
 *
 * ✅ Lista profissionais (ativos e inativos), respeitando:
 * - tenant safe (companyId)
 * - escopo de unidade conforme permissões (canSeeAllUnits + adminUnitAccess)
 * - unit=all (ou ausência) => todas as unidades permitidas
 *
 * ⚠️ IMPORTANTE:
 * Seu schema NÃO tem professional.unitId.
 * O vínculo é via relação professional.units (tabela pivô).
 */
export async function GET(
    request: Request
): Promise<NextResponse<ProfessionalsListResponse>> {
    try {
        const session = await requireAdminForModule('CHECKOUT');

        const companyId = session.companyId;
        if (!companyId)
            return jsonErr('Empresa não encontrada na sessão.', 401);

        const userId = session.id; // AdminSession usa `id`
        if (!userId) return jsonErr('Usuário não encontrado na sessão.', 401);

        const canSeeAllUnits = session.canSeeAllUnits;

        const url = new URL(request.url);
        const unitParamRaw = url.searchParams.get('unit'); // "all" | unitId | null
        const unitParam = normalizeString(unitParamRaw);

        // ==========================
        // 1) Resolve escopo de unidade (mesma regra do /api/admin/checkout)
        // ==========================
        let allowedUnitIds: string[] | null = null;

        if (canSeeAllUnits) {
            if (!unitParam || unitParam === 'all') {
                allowedUnitIds = null; // todas
            } else {
                const unit = await prisma.unit.findFirst({
                    where: { id: unitParam, companyId, isActive: true },
                    select: { id: true },
                });
                if (!unit) return jsonErr('Unidade inválida ou inativa.', 404);
                allowedUnitIds = [unit.id];
            }
        } else {
            const accesses = await prisma.adminUnitAccess.findMany({
                where: { companyId, userId },
                select: { unitId: true },
            });

            const ids = accesses.map((a) => a.unitId);

            if (ids.length === 0) {
                return jsonErr('Sem acesso a unidades.', 403);
            }

            if (unitParam && unitParam !== 'all') {
                if (!ids.includes(unitParam)) {
                    return jsonErr('Sem acesso a esta unidade.', 403);
                }
                allowedUnitIds = [unitParam];
            } else {
                allowedUnitIds = ids;
            }
        }

        // ==========================
        // 2) Monta where por relação (professional.units)
        // ==========================
        const whereUnits =
            allowedUnitIds && allowedUnitIds.length > 0
                ? {
                      units: {
                          some: {
                              unitId: { in: allowedUnitIds },
                          },
                      },
                  }
                : {}; // todas (quando allowedUnitIds=null)

        // ==========================
        // 3) Lista profissionais no escopo
        // ==========================
        const professionals = await prisma.professional.findMany({
            where: {
                companyId,
                ...whereUnits,
            },
            orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
            select: {
                id: true,
                name: true,
                isActive: true,
                units: {
                    select: {
                        unitId: true,
                    },
                },
            },
        });

        const forcedUnitId =
            allowedUnitIds && allowedUnitIds.length === 1
                ? allowedUnitIds[0]
                : null;

        return jsonOk({
            professionals: professionals.map((p) => ({
                id: p.id,
                name: p.name,
                isActive: p.isActive,
                // compat com a UI: best-effort
                unitId: forcedUnitId ?? p.units?.[0]?.unitId ?? null,
            })),
            count: professionals.length,
            unitScope: allowedUnitIds ? 'filtered' : 'all',
        });
    } catch (err: any) {
        return jsonErr(err?.message ?? 'Erro interno.', 500);
    }
}
