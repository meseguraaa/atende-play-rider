// src/app/api/whatsapp/dev/link-channel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * DEV ONLY
 * Cria/atualiza o WhatsappChannel.
 *
 * Ex:
 * /api/whatsapp/dev/link-channel?phoneNumberId=922123987658817&companyId=SEU_COMPANY_ID&defaultUnitId=SEU_UNIT_ID&displayPhone=+55%2011%2098597-0667
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);

    const phoneNumberId = (searchParams.get('phoneNumberId') || '').trim();
    const companyId = (searchParams.get('companyId') || '').trim();
    const defaultUnitIdRaw = (searchParams.get('defaultUnitId') || '').trim();
    const displayPhone = (searchParams.get('displayPhone') || '').trim();

    if (!phoneNumberId) {
        return NextResponse.json(
            { ok: false, error: 'Missing phoneNumberId' },
            { status: 400 }
        );
    }
    if (!companyId) {
        return NextResponse.json(
            { ok: false, error: 'Missing companyId' },
            { status: 400 }
        );
    }

    // valida existência company e unit (se vier)
    const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true },
    });

    if (!company) {
        return NextResponse.json(
            { ok: false, error: 'companyId not found' },
            { status: 404 }
        );
    }

    let defaultUnitId: string | null = null;

    if (defaultUnitIdRaw) {
        const unit = await prisma.unit.findUnique({
            where: { id: defaultUnitIdRaw },
            select: { id: true, name: true, companyId: true },
        });

        if (!unit) {
            return NextResponse.json(
                { ok: false, error: 'defaultUnitId not found' },
                { status: 404 }
            );
        }

        if (unit.companyId !== companyId) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'defaultUnitId does not belong to companyId',
                },
                { status: 400 }
            );
        }

        defaultUnitId = unit.id;
    }

    const channel = await prisma.whatsappChannel.upsert({
        where: { phoneNumberId },
        create: {
            phoneNumberId,
            displayPhone: displayPhone || null,
            companyId,
            defaultUnitId,
            isActive: true,
        },
        update: {
            displayPhone: displayPhone || undefined,
            companyId,
            defaultUnitId,
            isActive: true,
        },
        select: {
            id: true,
            phoneNumberId: true,
            displayPhone: true,
            companyId: true,
            defaultUnitId: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return NextResponse.json({ ok: true, channel, company }, { status: 200 });
}
