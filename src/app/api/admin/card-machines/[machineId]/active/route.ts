import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: string };

type Ctx = {
    params: Promise<{
        machineId: string;
    }>;
};

function normalizeString(v: unknown) {
    return String(v ?? '').trim();
}

export async function PATCH(req: Request, ctx: Ctx) {
    try {
        const session = await requireAdminForModule('SETTINGS');

        const companyId = session.companyId;
        if (!companyId) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'company_not_found' },
                { status: 401 }
            );
        }

        const { machineId: machineIdRaw } = await ctx.params;
        const machineId = normalizeString(machineIdRaw);

        if (!machineId) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'machine_not_found' },
                { status: 400 }
            );
        }

        const body = await req.json().catch(() => null);

        if (!body || typeof body !== 'object') {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'invalid_json' },
                { status: 400 }
            );
        }

        if (typeof (body as any).isActive !== 'boolean') {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'invalid_is_active' },
                { status: 400 }
            );
        }

        const isActive = (body as any).isActive as boolean;

        const existing = await prisma.cardMachine.findFirst({
            where: {
                id: machineId,
                companyId,
            },
            select: {
                id: true,
                unitId: true,
                name: true,
                debitFeePercent: true,
                isActive: true,
                creditFees: {
                    select: {
                        installments: true,
                        feePercent: true,
                    },
                    orderBy: {
                        installments: 'asc',
                    },
                },
            },
        });

        if (!existing) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'machine_not_found' },
                { status: 404 }
            );
        }

        const updated = await prisma.cardMachine.update({
            where: {
                id: existing.id,
            },
            data: {
                isActive,
            },
            select: {
                id: true,
                unitId: true,
                name: true,
                debitFeePercent: true,
                isActive: true,
                creditFees: {
                    select: {
                        installments: true,
                        feePercent: true,
                    },
                    orderBy: {
                        installments: 'asc',
                    },
                },
            },
        });

        return NextResponse.json<
            ApiOk<{
                id: string;
                unitId: string;
                name: string;
                debitFee: number;
                creditFees: Array<{
                    installments: number;
                    feePercent: number;
                }>;
                isActive: boolean;
            }>
        >({
            ok: true,
            data: {
                id: updated.id,
                unitId: updated.unitId,
                name: updated.name,
                debitFee: Number(updated.debitFeePercent),
                creditFees: updated.creditFees.map((item) => ({
                    installments: item.installments,
                    feePercent: Number(item.feePercent),
                })),
                isActive: updated.isActive,
            },
        });
    } catch (err) {
        console.error('[CARD_MACHINE_TOGGLE_ACTIVE]', err);

        return NextResponse.json<ApiErr>(
            { ok: false, error: 'internal_error' },
            { status: 500 }
        );
    }
}
