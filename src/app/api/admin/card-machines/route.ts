// src/app/api/admin/card-machines/route.ts

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { requireAdminForModule } from '@/lib/admin-permissions';

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: string };

type CreditFeeInput = {
    installments: number;
    feePercent: number;
};

function normalizeString(v: unknown) {
    return String(v ?? '').trim();
}

function parsePercent(v: unknown): number | null {
    const s = normalizeString(v).replace(',', '.');
    if (!s) return 0;

    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return null;

    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseCreditFees(v: unknown): CreditFeeInput[] | null {
    if (!Array.isArray(v)) return null;

    const normalized: CreditFeeInput[] = [];

    for (const item of v) {
        if (!item || typeof item !== 'object') return null;

        const installments = Number((item as any).installments);
        const feePercent = parsePercent((item as any).feePercent);

        if (
            !Number.isInteger(installments) ||
            installments < 1 ||
            installments > 12
        ) {
            return null;
        }

        if (feePercent === null) {
            return null;
        }

        normalized.push({
            installments,
            feePercent,
        });
    }

    const uniqueInstallments = new Set<number>();
    for (const item of normalized) {
        if (uniqueInstallments.has(item.installments)) {
            return null;
        }
        uniqueInstallments.add(item.installments);
    }

    const byInstallments = new Map<number, number>();
    for (const item of normalized) {
        byInstallments.set(item.installments, item.feePercent);
    }

    return Array.from({ length: 12 }, (_, index) => {
        const installments = index + 1;
        return {
            installments,
            feePercent: byInstallments.get(installments) ?? 0,
        };
    });
}

function serializeMachine(machine: {
    id: string;
    unitId: string;
    name: string;
    debitFeePercent: unknown;
    isActive: boolean;
    creditFees: Array<{
        installments: number;
        feePercent: unknown;
    }>;
}) {
    return {
        id: machine.id,
        unitId: machine.unitId,
        name: machine.name,
        debitFee: Number(machine.debitFeePercent),
        creditFees: [...(machine.creditFees || [])]
            .sort((a, b) => a.installments - b.installments)
            .map((item) => ({
                installments: item.installments,
                feePercent: Number(item.feePercent),
            })),
        isActive: machine.isActive,
    };
}

export async function POST(req: Request) {
    try {
        const session = await requireAdminForModule('SETTINGS');

        const companyId = session.companyId;
        if (!companyId) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'company_not_found' },
                { status: 401 }
            );
        }

        const body = await req.json().catch(() => null);

        if (!body || typeof body !== 'object') {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'invalid_json' },
                { status: 400 }
            );
        }

        const unitId = normalizeString((body as any).unitId);
        const name = normalizeString((body as any).name);

        const debitFeePercent = parsePercent((body as any).debitFee);
        const creditFees = parseCreditFees((body as any).creditFees);

        if (!unitId) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'unit_required' },
                { status: 400 }
            );
        }

        if (!name) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'machine_name_required' },
                { status: 400 }
            );
        }

        if (debitFeePercent === null) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'invalid_debit_fee' },
                { status: 400 }
            );
        }

        if (creditFees === null) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'invalid_credit_fees' },
                { status: 400 }
            );
        }

        const unit = await prisma.unit.findFirst({
            where: {
                id: unitId,
                companyId,
            },
            select: { id: true, companyId: true },
        });

        if (!unit) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'unit_not_found' },
                { status: 404 }
            );
        }

        const machine = await prisma.cardMachine.create({
            data: {
                companyId,
                unitId,
                name,
                debitFeePercent,
                isActive: true,
                creditFees: {
                    create: creditFees.map((item) => ({
                        companyId,
                        unitId,
                        installments: item.installments,
                        feePercent: item.feePercent,
                        isActive: true,
                    })),
                },
            },
            select: {
                id: true,
                name: true,
                unitId: true,
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
            data: serializeMachine(machine),
        });
    } catch (err: any) {
        console.error('[CARD_MACHINE_CREATE]', err);

        if (err?.code === 'P2002') {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'machine_name_already_exists' },
                { status: 400 }
            );
        }

        return NextResponse.json<ApiErr>(
            { ok: false, error: 'internal_error' },
            { status: 500 }
        );
    }
}

export async function GET(req: Request) {
    try {
        const session = await requireAdminForModule('SETTINGS');

        const companyId = session.companyId;
        if (!companyId) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'company_not_found' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(req.url);
        const unitId = normalizeString(searchParams.get('unitId'));

        if (!unitId) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'unit_required' },
                { status: 400 }
            );
        }

        const machines = await prisma.cardMachine.findMany({
            where: {
                companyId,
                unitId,
            },
            orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
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
            ApiOk<
                Array<{
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
            >
        >({
            ok: true,
            data: machines.map(serializeMachine),
        });
    } catch (err) {
        console.error('[CARD_MACHINE_LIST]', err);

        return NextResponse.json<ApiErr>(
            { ok: false, error: 'internal_error' },
            { status: 500 }
        );
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await requireAdminForModule('SETTINGS');

        const companyId = session.companyId;
        if (!companyId) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'company_not_found' },
                { status: 401 }
            );
        }

        const body = await req.json().catch(() => null);

        if (!body || typeof body !== 'object') {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'invalid_json' },
                { status: 400 }
            );
        }

        const machineId = normalizeString((body as any).machineId);
        const isActiveRaw = (body as any).isActive;

        if (!machineId) {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'machine_id_required' },
                { status: 400 }
            );
        }

        if (typeof isActiveRaw !== 'boolean') {
            return NextResponse.json<ApiErr>(
                { ok: false, error: 'is_active_required' },
                { status: 400 }
            );
        }

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

        const machine = await prisma.cardMachine.update({
            where: { id: existing.id },
            data: {
                isActive: isActiveRaw,
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
            data: serializeMachine(machine),
        });
    } catch (err) {
        console.error('[CARD_MACHINE_UPDATE]', err);

        return NextResponse.json<ApiErr>(
            { ok: false, error: 'internal_error' },
            { status: 500 }
        );
    }
}
