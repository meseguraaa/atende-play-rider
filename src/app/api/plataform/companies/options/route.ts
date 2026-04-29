// src/app/api/plataform/companies/options/route.ts
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

/**
 * GET /api/admin/companies/options
 * ✅ (AGORA) Rota de PLATAFORMA (AtendePlay)
 *
 * Lista enxuta de empresas para selects no painel da plataforma (ex: parceiros SELECTED).
 *
 * Retorno:
 * { ok:true, companies:[{id,name,isActive}], count }
 */
export async function GET() {
    // ✅ API: bloqueia com JSON (401/403), sem redirect
    const auth = await requirePlatformForModuleApi('COMPANIES');
    if (auth instanceof NextResponse) return auth;

    try {
        const companies = await prisma.company.findMany({
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            select: {
                id: true,
                name: true,
                isActive: true,
            },
        });

        return jsonOk(
            { companies, count: companies.length },
            { status: 200, headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (e) {
        console.error('[platform companies options] error:', e);
        return jsonErr('Erro ao listar empresas.', 500);
    }
}
