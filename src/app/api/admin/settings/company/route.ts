// src/app/api/admin/settings/company/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

type CompanyPayload = {
    name?: string;
    city?: string | null;
    state?: string | null;
};

function jsonOk(data: unknown, status = 200) {
    return NextResponse.json({ ok: true, data }, { status });
}

function jsonError(error: string, status = 400) {
    return NextResponse.json({ ok: false, error }, { status });
}

/**
 * GET /api/admin/settings/company
 * Retorna a empresa do admin logado.
 */
export async function GET() {
    try {
        const admin = await requireAdminForModule('SETTINGS');
        const companyId = admin.companyId;

        if (!companyId) return jsonError('missing_company', 403);

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: {
                id: true,
                name: true,
                city: true,
                state: true,
            },
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
 * Atualiza name/city/state da empresa atual.
 */
export async function PUT(req: Request) {
    try {
        const admin = await requireAdminForModule('SETTINGS');

        if (!admin.isOwner) {
            return jsonError('forbidden_owner_only', 403);
        }

        const companyId = admin.companyId;
        if (!companyId) return jsonError('missing_company', 403);

        let body: CompanyPayload = {};

        try {
            body = (await req.json()) as CompanyPayload;
        } catch {
            return jsonError('invalid_json', 400);
        }

        const name = String(body.name ?? '').trim();
        const city = String(body.city ?? '').trim() || null;
        const state = String(body.state ?? '').trim() || null;

        if (!name) return jsonError('company_name_required', 400);

        const updated = await prisma.company.update({
            where: { id: companyId },
            data: {
                name,
                city,
                state,
            },
            select: {
                id: true,
                name: true,
                city: true,
                state: true,
            },
        });

        return jsonOk(updated);
    } catch (err) {
        console.error('[PUT /api/admin/settings/company]', err);
        return jsonError('internal_error', 500);
    }
}
