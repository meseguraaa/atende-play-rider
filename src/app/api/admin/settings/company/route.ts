// src/app/api/admin/settings/company/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

type CompanyPayload = {
    name?: string;
    segment?: 'BARBERSHOP' | 'AESTHETIC';
    isActive?: boolean;
};

function normalizeSegment(v: unknown): 'BARBERSHOP' | 'AESTHETIC' {
    return String(v) === 'AESTHETIC' ? 'AESTHETIC' : 'BARBERSHOP';
}

function jsonOk(data: unknown, status = 200) {
    return NextResponse.json({ ok: true, data }, { status });
}

function jsonError(error: string, status = 400) {
    return NextResponse.json({ ok: false, error }, { status });
}

/**
 * GET /api/admin/settings/company
 * Retorna a empresa do admin logado (companyId vindo do cookie/sessão do painel)
 */
export async function GET() {
    try {
        const admin = await requireAdminForModule('SETTINGS');
        const companyId = admin.companyId;

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, name: true, segment: true, isActive: true },
        });

        if (!company) return jsonError('company_not_found', 404);

        return jsonOk(company);
    } catch (err) {
        console.error('[GET /api/admin/settings/company]', err);
        return jsonError('internal_error', 500);
    }
}

/**
 * PUT /api/admin/settings/company
 * Atualiza name/segment/isActive da empresa atual
 * Regras:
 * - precisa ter módulo SETTINGS
 * - somente owner pode editar
 */
export async function PUT(req: Request) {
    try {
        const admin = await requireAdminForModule('SETTINGS');

        if (!admin.isOwner) {
            return jsonError('forbidden_owner_only', 403);
        }

        const companyId = admin.companyId;

        let body: CompanyPayload = {};
        try {
            body = (await req.json()) as CompanyPayload;
        } catch {
            return jsonError('invalid_json', 400);
        }

        const name = String(body.name ?? '').trim();
        const segment = normalizeSegment(body.segment);
        const isActive =
            typeof body.isActive === 'boolean' ? body.isActive : undefined;

        if (!name) return jsonError('company_name_required', 400);

        const updated = await prisma.company.update({
            where: { id: companyId },
            data: {
                name,
                segment,
                ...(typeof isActive === 'boolean' ? { isActive } : {}),
            },
            select: { id: true, name: true, segment: true, isActive: true },
        });

        return jsonOk(updated);
    } catch (err) {
        console.error('[PUT /api/admin/settings/company]', err);
        return jsonError('internal_error', 500);
    }
}
