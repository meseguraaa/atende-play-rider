import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const session = await requireAdminForModule('MEMBERS');

    const { id: userId } = await context.params;

    const companyId = session?.companyId;

    if (!companyId || !userId) {
        return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const membership = await prisma.companyMember.findFirst({
        where: {
            companyId,
            userId,
            role: 'CLIENT',
        },
    });

    if (!membership) {
        return NextResponse.json(
            { error: 'Membro não encontrado' },
            { status: 404 }
        );
    }

    const updated = await prisma.companyMember.update({
        where: { id: membership.id },
        data: {
            isActive: !membership.isActive,
        },
    });

    return NextResponse.json({
        ok: true,
        isActive: updated.isActive,
    });
}
