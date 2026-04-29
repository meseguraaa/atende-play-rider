// src/app/api/plataform/dashboard/summary/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePlatformForModuleApi } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function jsonOk<T extends Record<string, unknown>>(
    data: T,
    init?: ResponseInit
) {
    return NextResponse.json({ ok: true, ...data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function normalizeCompanyId(v: string | null): string | null {
    const s = String(v ?? '').trim();
    if (!s || s === 'all') return null;
    return s;
}

/**
 * GET /api/plataform/dashboard/summary?companyId=all|<id>
 *
 * Retorna métricas do dashboard da PLATAFORMA:
 * - Pode filtrar por companyId
 * - "all" (ou vazio) retorna visão global
 */
export async function GET(req: Request) {
    // ✅ API: bloqueia com JSON (401/403), sem redirect
    const auth = await requirePlatformForModuleApi('DASHBOARD');
    if (auth instanceof NextResponse) return auth;

    try {
        const { searchParams } = new URL(req.url);
        const companyId = normalizeCompanyId(searchParams.get('companyId'));

        const whereCompany = companyId ? { companyId } : undefined;

        // ---------------------------------------------------------
        // Box 1: Empresas + Unidades (ativas/inativas)
        // Empresas: sempre global (não faz sentido filtrar por company)
        // ---------------------------------------------------------
        const [companiesActive, companiesInactive] = await Promise.all([
            prisma.company.count({ where: { isActive: true } }),
            prisma.company.count({ where: { isActive: false } }),
        ]);

        const [unitsActive, unitsInactive] = await Promise.all([
            prisma.unit.count({
                where: { ...(whereCompany ?? {}), isActive: true },
            }),
            prisma.unit.count({
                where: { ...(whereCompany ?? {}), isActive: false },
            }),
        ]);

        // ---------------------------------------------------------
        // Box 2: Profissionais (ativos/inativos)
        // ---------------------------------------------------------
        const [professionalsActive, professionalsInactive] = await Promise.all([
            prisma.professional.count({
                where: { ...(whereCompany ?? {}), isActive: true },
            }),
            prisma.professional.count({
                where: { ...(whereCompany ?? {}), isActive: false },
            }),
        ]);

        // ---------------------------------------------------------
        // Box 3: Agendamentos + Checkouts
        // ---------------------------------------------------------
        const [appointmentsCount, checkoutsCount] = await Promise.all([
            prisma.appointment.count({
                where: { ...(whereCompany ?? {}) },
            }),
            prisma.order.count({
                where: { ...(whereCompany ?? {}) },
            }),
        ]);

        // ---------------------------------------------------------
        // Box 4: Serviços (quantidade total)
        // Obs: se quiser separar ativos/inativos, dá pra estender depois
        // ---------------------------------------------------------
        const servicesCount = await prisma.service.count({
            where: { ...(whereCompany ?? {}) },
        });

        // ---------------------------------------------------------
        // Box 5: Produtos
        // - ativos/inativos
        // - vendidos: soma de ProductSale.quantity
        // - sem estoque: stockQuantity <= 0
        // ---------------------------------------------------------
        const [productsActive, productsInactive, productsOutOfStock] =
            await Promise.all([
                prisma.product.count({
                    where: { ...(whereCompany ?? {}), isActive: true },
                }),
                prisma.product.count({
                    where: { ...(whereCompany ?? {}), isActive: false },
                }),
                prisma.product.count({
                    where: {
                        ...(whereCompany ?? {}),
                        stockQuantity: { lte: 0 },
                    },
                }),
            ]);

        const soldAgg = await prisma.productSale.aggregate({
            _sum: { quantity: true },
            where: companyId ? { companyId } : undefined,
        });

        const productsSoldQty = soldAgg._sum.quantity ?? 0;

        return jsonOk(
            {
                scope: companyId ? { companyId } : { global: true },
                box1: {
                    companiesActive,
                    companiesInactive,
                    unitsActive,
                    unitsInactive,
                },
                box2: {
                    professionalsActive,
                    professionalsInactive,
                },
                box3: {
                    appointmentsCount,
                    checkoutsCount,
                },
                box4: {
                    servicesCount,
                },
                box5: {
                    productsActive,
                    productsInactive,
                    productsSoldQty,
                    productsOutOfStock,
                },
            },
            { status: 200, headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (e) {
        console.error('[platform dashboard summary] error:', e);
        return jsonErr('Erro ao carregar o resumo do dashboard.', 500);
    }
}
