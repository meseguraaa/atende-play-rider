import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAppJwt } from '@/lib/app-jwt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Role = 'CLIENT' | 'BARBER' | 'ADMIN';

type MobileTokenPayload = {
    sub: string;
    role?: Role;
    companyId: string;
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-company-id',
    };
}

function getHeaderCI(req: Request, key: string): string | null {
    const target = key.toLowerCase();

    for (const [k, v] of req.headers.entries()) {
        if (k.toLowerCase() === target) {
            const s = String(v ?? '').trim();
            return s.length ? s : null;
        }
    }

    return null;
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

    if (!token) throw new Error('missing_token');

    const payload = await verifyAppJwt(token);

    const sub =
        typeof (payload as any)?.sub === 'string'
            ? String((payload as any).sub).trim()
            : '';

    if (!sub) throw new Error('invalid_token');

    let companyId =
        typeof (payload as any)?.companyId === 'string'
            ? String((payload as any).companyId).trim()
            : '';

    if (!companyId) {
        const h = getHeaderCI(req, 'x-company-id');
        if (h) companyId = h;
    }

    if (!companyId) throw new Error('missing_company_id');

    const membership = await prisma.companyMember.findFirst({
        where: {
            userId: sub,
            companyId,
            isActive: true,
        },
        select: {
            id: true,
            role: true,
        },
    });

    if (!membership) throw new Error('forbidden_company');

    return { ...(payload as any), sub, companyId } as MobileTokenPayload;
}

function toIsoSafe(value: unknown) {
    const d = new Date(value as any);
    return Number.isFinite(d.getTime())
        ? d.toISOString()
        : new Date().toISOString();
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(),
    });
}

export async function GET(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {
    const headers = corsHeaders();

    try {
        const me = await requireMobileAuth(req);
        const companyId = me.companyId;

        if (me.role && me.role !== 'CLIENT') {
            return NextResponse.json(
                { ok: false, error: 'Sem permissão.' },
                { status: 403, headers }
            );
        }

        const headerCompanyId = getHeaderCI(req, 'x-company-id');
        if (headerCompanyId && headerCompanyId !== companyId) {
            return NextResponse.json(
                { ok: false, error: 'company_id_mismatch' },
                { status: 400, headers }
            );
        }

        const clientId = me.sub;
        const params = await context.params;
        const notificationId = String(params?.id ?? '').trim();

        if (!notificationId) {
            return NextResponse.json(
                { ok: false, error: 'missing_notification_id' },
                { status: 400, headers }
            );
        }

        const notification = await prisma.appNotification.findFirst({
            where: {
                id: notificationId,
                companyId,
                userId: clientId,
                type: 'PUSH_MESSAGE',
            },
            select: {
                id: true,
                title: true,
                message: true,
                isRead: true,
                readAt: true,
                createdAt: true,
            },
        });

        if (!notification) {
            return NextResponse.json(
                { ok: false, error: 'notification_not_found' },
                { status: 404, headers }
            );
        }

        if (!notification.isRead) {
            await prisma.appNotification.update({
                where: {
                    id: notification.id,
                },
                data: {
                    isRead: true,
                    readAt: new Date(),
                },
            });
        }

        const item = {
            id: notification.id,
            title: String(notification.title ?? '').trim() || 'Notificação',
            message: String(notification.message ?? '').trim(),
            date: toIsoSafe(notification.createdAt),
            isRead: true,
            type: 'PUSH_MESSAGE' as const,
        };

        const _debug =
            process.env.NODE_ENV === 'development'
                ? {
                      companyId,
                      clientId,
                      notificationId,
                  }
                : undefined;

        const res = NextResponse.json(
            {
                ok: true,
                item,
                _debug,
            },
            { status: 200, headers }
        );

        res.headers.set('x-company-id', companyId);
        return res;
    } catch (e: any) {
        const msg = String(e?.message ?? '');

        if (msg.includes('missing_token')) {
            return NextResponse.json(
                { ok: false, error: 'missing_token' },
                { status: 401, headers }
            );
        }

        if (msg.includes('missing_company_id')) {
            return NextResponse.json(
                { ok: false, error: 'missing_company_id' },
                { status: 401, headers }
            );
        }

        if (msg.includes('forbidden_company')) {
            return NextResponse.json(
                { ok: false, error: 'forbidden_company' },
                { status: 403, headers }
            );
        }

        if (
            msg.includes('Invalid token') ||
            msg.includes('JWT') ||
            msg.toLowerCase().includes('token') ||
            msg.includes('invalid_token')
        ) {
            return NextResponse.json(
                { ok: false, error: 'invalid_token' },
                { status: 401, headers }
            );
        }

        console.error('[mobile notifications detail] error:', e);

        return NextResponse.json(
            { ok: false, error: 'server_error' },
            { status: 500, headers }
        );
    }
}
