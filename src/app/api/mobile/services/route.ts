// src/app/api/mobile/services/route.ts
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

type MobileTokenPayload = {
    sub: string;
    role?: 'CLIENT' | 'BARBER' | 'ADMIN';
    companyId: string;
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

function getJwtSecretKey() {
    const secret = process.env.APP_JWT_SECRET;
    if (!secret) throw new Error('APP_JWT_SECRET não definido no .env');
    return new TextEncoder().encode(secret);
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) throw new Error('Token ausente');

    const { payload } = await jwtVerify(token, getJwtSecretKey());

    const sub = String((payload as any)?.sub || '').trim();
    if (!sub) throw new Error('Token inválido');

    const companyId =
        typeof (payload as any)?.companyId === 'string'
            ? String((payload as any).companyId).trim()
            : '';

    if (!companyId) throw new Error('companyId ausente no token');

    return {
        sub,
        role: (payload as any).role,
        companyId,
    };
}

function toNumber(v: any): number {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v?.toNumber === 'function') return v.toNumber();

    try {
        const s = typeof v?.toString === 'function' ? String(v.toString()) : '';
        const n = Number(s.replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
    } catch {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }
}

function moneyBRLFromDecimal(v: any): string {
    const n = toNumber(v);
    try {
        return n.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });
    } catch {
        return `R$ ${n.toFixed(2)}`.replace('.', ',');
    }
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
    try {
        const auth = await requireMobileAuth(req);
        const companyId = auth.companyId;

        const url = new URL(req.url);
        const unitId = String(url.searchParams.get('unitId') || '').trim();

        const professionalId =
            String(url.searchParams.get('professionalId') || '').trim() ||
            String(url.searchParams.get('barberId') || '').trim();

        const categoryId = String(
            url.searchParams.get('categoryId') || ''
        ).trim();

        if (!unitId) {
            return NextResponse.json(
                { error: 'unitId é obrigatório' },
                { status: 400, headers: corsHeaders() }
            );
        }

        const unit = await prisma.unit.findFirst({
            where: { id: unitId, companyId, isActive: true },
            select: { id: true },
        });

        if (!unit) {
            return NextResponse.json(
                { error: 'Unidade inválida' },
                { status: 404, headers: corsHeaders() }
            );
        }

        // =========================================================
        // ✅ MODO NOVO: Unit -> Professional -> Category -> Service
        // =========================================================
        if (professionalId) {
            const prof = await prisma.professional.findFirst({
                where: { id: professionalId, companyId, isActive: true },
                select: { id: true },
            });

            if (!prof) {
                return NextResponse.json(
                    { error: 'Profissional inválido' },
                    { status: 404, headers: corsHeaders() }
                );
            }

            const profUnit = await prisma.professionalUnit.findFirst({
                where: {
                    companyId: companyId as any,
                    unitId,
                    professionalId,
                    isActive: true,
                } as any,
                select: { id: true },
            });

            if (!profUnit) {
                return NextResponse.json(
                    { ok: true, services: [] },
                    { status: 200, headers: corsHeaders() }
                );
            }

            const serviceLinks = await prisma.serviceProfessional.findMany({
                where: {
                    companyId: companyId as any,
                    professionalId,
                    service: { companyId, isActive: true } as any,
                } as any,
                select: { serviceId: true },
            });

            let serviceIds = Array.from(
                new Set(serviceLinks.map((s) => s.serviceId))
            )
                .filter(Boolean)
                .map((x) => String(x));

            if (serviceIds.length === 0) {
                return NextResponse.json(
                    { ok: true, services: [] },
                    { status: 200, headers: corsHeaders() }
                );
            }

            // ✅ NOVO: filtra pelos serviços vinculados à categoria
            if (categoryId) {
                const category = await prisma.category.findFirst({
                    where: {
                        id: categoryId,
                        companyId,
                        isActive: true,
                        showInServices: true,
                    },
                    select: { id: true },
                });

                if (!category) {
                    return NextResponse.json(
                        { ok: true, services: [] },
                        { status: 200, headers: corsHeaders() }
                    );
                }

                const categoryLinks = await prisma.serviceCategory.findMany({
                    where: {
                        categoryId,
                        serviceId: { in: serviceIds },
                        service: {
                            companyId,
                            isActive: true,
                        } as any,
                    },
                    select: { serviceId: true },
                });

                serviceIds = Array.from(
                    new Set(categoryLinks.map((s) => s.serviceId))
                )
                    .filter(Boolean)
                    .map((x) => String(x));

                if (serviceIds.length === 0) {
                    return NextResponse.json(
                        { ok: true, services: [] },
                        { status: 200, headers: corsHeaders() }
                    );
                }
            }

            const services = await prisma.service.findMany({
                where: {
                    companyId,
                    id: { in: serviceIds },
                    isActive: true,
                    unitId,
                },
                orderBy: { name: 'asc' },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    durationMinutes: true,
                    price: true,
                    cancelFeePercentage: true,
                    cancelLimitHours: true,
                },
            });

            const payload = services.map((s) => ({
                id: s.id,
                name: s.name,
                description: s.description ?? null,
                durationMinutes: s.durationMinutes ?? 0,
                priceLabel: moneyBRLFromDecimal(s.price),
                price: toNumber(s.price),
                cancelFeePercentage:
                    s.cancelFeePercentage == null
                        ? null
                        : toNumber(s.cancelFeePercentage),
                cancelLimitHours: s.cancelLimitHours ?? null,
            }));

            return NextResponse.json(
                { ok: true, services: payload },
                { status: 200, headers: corsHeaders() }
            );
        }

        // =========================================================
        // ✅ COMPAT: sem professionalId (lista serviços da unidade toda)
        // =========================================================

        const unitProfessionals = await prisma.professionalUnit.findMany({
            where: {
                companyId: companyId as any,
                unitId,
                isActive: true,
                professional: { companyId, isActive: true } as any,
            } as any,
            select: { professionalId: true },
        });

        const professionalIds = Array.from(
            new Set(unitProfessionals.map((b) => b.professionalId))
        )
            .filter(Boolean)
            .map((x) => String(x));

        if (professionalIds.length === 0) {
            return NextResponse.json(
                { ok: true, services: [] },
                { status: 200, headers: corsHeaders() }
            );
        }

        const serviceLinks = await prisma.serviceProfessional.findMany({
            where: {
                companyId: companyId as any,
                professionalId: { in: professionalIds },
                service: { companyId, isActive: true } as any,
            } as any,
            select: { serviceId: true },
        });

        let serviceIds = Array.from(
            new Set(serviceLinks.map((s) => s.serviceId))
        )
            .filter(Boolean)
            .map((x) => String(x));

        if (serviceIds.length === 0) {
            return NextResponse.json(
                { ok: true, services: [] },
                { status: 200, headers: corsHeaders() }
            );
        }

        // ✅ compat também aceita categoryId, caso queira reaproveitar
        if (categoryId) {
            const category = await prisma.category.findFirst({
                where: {
                    id: categoryId,
                    companyId,
                    isActive: true,
                    showInServices: true,
                },
                select: { id: true },
            });

            if (!category) {
                return NextResponse.json(
                    { ok: true, services: [] },
                    { status: 200, headers: corsHeaders() }
                );
            }

            const categoryLinks = await prisma.serviceCategory.findMany({
                where: {
                    categoryId,
                    serviceId: { in: serviceIds },
                    service: {
                        companyId,
                        isActive: true,
                    } as any,
                },
                select: { serviceId: true },
            });

            serviceIds = Array.from(
                new Set(categoryLinks.map((s) => s.serviceId))
            )
                .filter(Boolean)
                .map((x) => String(x));

            if (serviceIds.length === 0) {
                return NextResponse.json(
                    { ok: true, services: [] },
                    { status: 200, headers: corsHeaders() }
                );
            }
        }

        const services = await prisma.service.findMany({
            where: {
                companyId,
                id: { in: serviceIds },
                isActive: true,
                unitId,
            },
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                description: true,
                durationMinutes: true,
                price: true,
                cancelFeePercentage: true,
                cancelLimitHours: true,
            },
        });

        const payload = services.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description ?? null,
            durationMinutes: s.durationMinutes ?? 0,
            priceLabel: moneyBRLFromDecimal(s.price),
            price: toNumber(s.price),
            cancelFeePercentage:
                s.cancelFeePercentage == null
                    ? null
                    : toNumber(s.cancelFeePercentage),
            cancelLimitHours: s.cancelLimitHours ?? null,
        }));

        return NextResponse.json(
            { ok: true, services: payload },
            { status: 200, headers: corsHeaders() }
        );
    } catch (err: any) {
        const msg = String(err?.message ?? 'Não autorizado');
        const lower = msg.toLowerCase();

        if (
            lower.includes('token') ||
            lower.includes('jwt') ||
            lower.includes('signature') ||
            lower.includes('companyid')
        ) {
            return NextResponse.json(
                { error: 'Não autorizado' },
                { status: 401, headers: corsHeaders() }
            );
        }

        console.error('[mobile/services] error:', err);
        return NextResponse.json(
            { error: 'Erro ao listar serviços' },
            { status: 500, headers: corsHeaders() }
        );
    }
}
