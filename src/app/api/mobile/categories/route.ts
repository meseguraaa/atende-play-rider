// src/app/api/mobile/categories/route.ts
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

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(),
    });
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

        if (!unitId) {
            return NextResponse.json(
                { error: 'unitId é obrigatório' },
                { status: 400, headers: corsHeaders() }
            );
        }

        if (!professionalId) {
            return NextResponse.json(
                { error: 'professionalId é obrigatório' },
                { status: 400, headers: corsHeaders() }
            );
        }

        const unit = await prisma.unit.findFirst({
            where: {
                id: unitId,
                companyId,
                isActive: true,
            },
            select: { id: true },
        });

        if (!unit) {
            return NextResponse.json(
                { error: 'Unidade inválida' },
                { status: 404, headers: corsHeaders() }
            );
        }

        const professional = await prisma.professional.findFirst({
            where: {
                id: professionalId,
                companyId,
                isActive: true,
            },
            select: { id: true },
        });

        if (!professional) {
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
                { ok: true, categories: [] },
                { status: 200, headers: corsHeaders() }
            );
        }

        // 1) busca os serviços ativos que o profissional executa nessa unidade
        const serviceLinks = await prisma.serviceProfessional.findMany({
            where: {
                companyId: companyId as any,
                professionalId,
                service: {
                    companyId,
                    isActive: true,
                    unitId,
                } as any,
            } as any,
            select: { serviceId: true },
        });

        const serviceIds = Array.from(
            new Set(serviceLinks.map((s) => s.serviceId))
        )
            .filter(Boolean)
            .map((x) => String(x));

        if (serviceIds.length === 0) {
            return NextResponse.json(
                { ok: true, categories: [] },
                { status: 200, headers: corsHeaders() }
            );
        }

        // 2) busca categorias ativas de serviços vinculadas a esses serviços
        const categoryLinks = await prisma.serviceCategory.findMany({
            where: {
                serviceId: { in: serviceIds },
                category: {
                    companyId,
                    isActive: true,
                    showInServices: true,
                } as any,
            },
            select: {
                serviceId: true,
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        const uniqueMap = new Map<
            string,
            { id: string; name: string; serviceIds: string[] }
        >();

        for (const row of categoryLinks) {
            const c = row.category;
            if (!c?.id) continue;

            const id = String(c.id);
            const serviceId = String(row.serviceId ?? '').trim();

            if (!uniqueMap.has(id)) {
                uniqueMap.set(id, {
                    id,
                    name: String(c.name ?? '').trim(),
                    serviceIds: serviceId ? [serviceId] : [],
                });
                continue;
            }

            if (serviceId) {
                const current = uniqueMap.get(id)!;
                if (!current.serviceIds.includes(serviceId)) {
                    current.serviceIds.push(serviceId);
                }
            }
        }

        const categories = Array.from(uniqueMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name, 'pt-BR')
        );

        return NextResponse.json(
            { ok: true, categories },
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

        console.error('[mobile/categories] error:', err);

        return NextResponse.json(
            { error: 'Erro ao listar categorias' },
            { status: 500, headers: corsHeaders() }
        );
    }
}
