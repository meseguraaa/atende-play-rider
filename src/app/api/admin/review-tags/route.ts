// src/app/api/admin/review-tags/route.ts
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ ok: true, data } as const, init);
}

function jsonErr(error: string, status = 400) {
    return NextResponse.json({ ok: false, error } as const, { status });
}

function normalizeLabel(label: unknown): string {
    return String(label ?? '')
        .trim()
        .replace(/\s+/g, ' ');
}

export async function GET(req: Request) {
    const session = await requireAdminForModule('REVIEWS');

    // 🔒 hard lock multi-tenant
    const companyId = session.companyId;
    if (!companyId) return jsonErr('Empresa não encontrada na sessão.', 401);

    const url = new URL(req.url);
    const isActiveParam = url.searchParams.get('isActive');

    let isActiveFilter: boolean | undefined;
    if (isActiveParam === 'true') isActiveFilter = true;
    if (isActiveParam === 'false') isActiveFilter = false;

    const tags = await prisma.reviewTag.findMany({
        where: {
            companyId,
            ...(typeof isActiveFilter === 'boolean'
                ? { isActive: isActiveFilter }
                : {}),
        },
        orderBy: { label: 'asc' },
        select: {
            id: true,
            companyId: true,
            label: true,
            isActive: true,
            isNegative: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return jsonOk(tags);
}

export async function POST(req: Request) {
    const session = await requireAdminForModule('REVIEWS');

    // 🔒 hard lock multi-tenant
    const companyId = session.companyId;
    if (!companyId) return jsonErr('Empresa não encontrada na sessão.', 401);

    let body: any;
    try {
        body = await req.json();
    } catch {
        return jsonErr('Body inválido (JSON).');
    }

    const label = normalizeLabel(body?.label);
    const isNegative = Boolean(body?.isNegative ?? false);

    if (!label) return jsonErr('Informe o texto da tag.');
    if (label.length < 2)
        return jsonErr('A tag precisa ter pelo menos 2 letras.');
    if (label.length > 80)
        return jsonErr('A tag pode ter no máximo 80 caracteres.');

    try {
        const created = await prisma.reviewTag.create({
            data: {
                companyId,
                label,
                isNegative,
                isActive: true,
            },
            select: {
                id: true,
                companyId: true,
                label: true,
                isActive: true,
                isNegative: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return jsonOk(created, { status: 201 });
    } catch (err: any) {
        // Unique constraint (companyId + label)
        const code = err?.code as string | undefined;
        if (code === 'P2002') {
            return jsonErr('Já existe uma tag com esse texto.', 409);
        }

        return jsonErr('Não foi possível criar a tag.', 500);
    }
}
