// src/app/api/admin/review-tags/[tagId]/route.ts
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

type PatchBody = Partial<{
    label: string;
    isActive: boolean;
    isNegative: boolean;
}>;

export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ tagId: string }> }
) {
    const session = await requireAdminForModule('REVIEWS');

    // 🔒 hard lock multi-tenant
    const companyId = session.companyId;
    if (!companyId) return jsonErr('Empresa não encontrada na sessão.', 401);

    const { tagId } = await ctx.params;
    if (!tagId) return jsonErr('tagId ausente na rota.', 400);

    let body: PatchBody;
    try {
        body = (await req.json()) as PatchBody;
    } catch {
        return jsonErr('Body inválido (JSON).');
    }

    const hasAnyField =
        typeof body?.label !== 'undefined' ||
        typeof body?.isActive !== 'undefined' ||
        typeof body?.isNegative !== 'undefined';

    if (!hasAnyField) {
        return jsonErr(
            'Nada para atualizar. Envie ao menos um campo: label, isActive, isNegative.'
        );
    }

    const dataToUpdate: Record<string, any> = {};

    if (typeof body.label !== 'undefined') {
        const label = normalizeLabel(body.label);
        if (!label) return jsonErr('Informe o texto da tag.');
        if (label.length < 2)
            return jsonErr('A tag precisa ter pelo menos 2 letras.');
        if (label.length > 80)
            return jsonErr('A tag pode ter no máximo 80 caracteres.');
        dataToUpdate.label = label;
    }

    if (typeof body.isActive !== 'undefined') {
        dataToUpdate.isActive = Boolean(body.isActive);
    }

    if (typeof body.isNegative !== 'undefined') {
        dataToUpdate.isNegative = Boolean(body.isNegative);
    }

    // garante que a tag existe e pertence à empresa
    const existing = await prisma.reviewTag.findFirst({
        where: { id: tagId, companyId },
        select: { id: true },
    });

    if (!existing) return jsonErr('Tag não encontrada.', 404);

    try {
        const updated = await prisma.reviewTag.update({
            where: { id: tagId },
            data: dataToUpdate,
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

        return jsonOk(updated);
    } catch (err: any) {
        // Unique constraint (companyId + label)
        const code = err?.code as string | undefined;
        if (code === 'P2002') {
            return jsonErr('Já existe uma tag com esse texto.', 409);
        }

        return jsonErr('Não foi possível atualizar a tag.', 500);
    }
}
