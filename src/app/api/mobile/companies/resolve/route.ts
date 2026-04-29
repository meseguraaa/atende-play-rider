// src/app/api/mobile/companies/resolve/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/* ---------------------------------------------------------
 * Helpers
 * --------------------------------------------------------- */
function jsonErr(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function jsonOk(data: unknown, status = 200) {
    return NextResponse.json({ ok: true, data }, { status });
}

function normalizeString(v: unknown): string {
    return String(v ?? '').trim();
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

function readKey(url: URL): string {
    // aceita variações
    const raw =
        url.searchParams.get('key') ??
        url.searchParams.get('slug') ??
        url.searchParams.get('tenant') ??
        url.searchParams.get('companyId') ??
        url.searchParams.get('company_id') ??
        '';
    return normalizeString(raw);
}

/* ---------------------------------------------------------
 * OPTIONS
 * --------------------------------------------------------- */
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/* ---------------------------------------------------------
 * GET /api/mobile/companies/resolve?key=...
 * - key pode ser companyId OU slug
 * - retorna empresa ativa (ou erro)
 * --------------------------------------------------------- */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const key = readKey(url);

        if (!key) {
            return NextResponse.json(
                { ok: false, error: 'Informe key/slug/companyId' },
                { status: 400, headers: corsHeaders() }
            );
        }

        const company = await prisma.company.findFirst({
            where: {
                OR: [{ id: key }, { slug: key }],
            },
            select: {
                id: true,
                name: true,
                slug: true,
                segment: true,
                isActive: true,
            },
        });

        if (!company) {
            return NextResponse.json(
                { ok: false, error: 'Empresa não encontrada' },
                { status: 404, headers: corsHeaders() }
            );
        }

        if (!company.isActive) {
            return NextResponse.json(
                { ok: false, error: 'Empresa inativa' },
                { status: 403, headers: corsHeaders() }
            );
        }

        return NextResponse.json(
            {
                ok: true,
                data: {
                    companyId: company.id,
                    name: company.name,
                    slug: company.slug,
                    segment: company.segment,
                },
            },
            { status: 200, headers: corsHeaders() }
        );
    } catch (err) {
        console.error('[mobile companies/resolve]', err);
        return NextResponse.json(
            { ok: false, error: 'Erro inesperado' },
            { status: 500, headers: corsHeaders() }
        );
    }
}
