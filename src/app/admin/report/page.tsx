// src/app/admin/reports/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';

import { requireAdminForModule } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';
import {
    BarChart3,
    CreditCard,
    MessageCircle,
    Package,
    Scissors,
    Users,
    Wallet,
    HelpCircle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Relatórios',
};

const COMPANY_COOKIE_NAME = 'admin_company_context';
const UNIT_COOKIE_NAME = 'admin_unit_context';
const UNIT_ALL_VALUE = 'all';

async function requireCompanyIdFromContext(session: any) {
    const sCompanyId = String(session?.companyId ?? '').trim();
    if (sCompanyId) return sCompanyId;

    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
    if (cookieCompanyId) return cookieCompanyId;

    const userId = String(session?.userId ?? '').trim();
    if (userId) {
        const membership = await prisma.companyMember.findFirst({
            where: { userId, isActive: true },
            orderBy: { createdAt: 'asc' },
            select: { companyId: true },
        });

        if (membership?.companyId) return membership.companyId;
    }

    throw new Error(
        `companyId ausente (session.companyId, cookie "${COMPANY_COOKIE_NAME}" e sem fallback por membership).`
    );
}

type AdminReportsPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminReportsPage({
    searchParams,
}: AdminReportsPageProps) {
    const session = await requireAdminForModule('DASHBOARD');

    const companyId = await requireCompanyIdFromContext(session);

    const cookieStore = await cookies();
    const selectedUnit =
        cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

    const sp = await searchParams;

    void companyId;
    void selectedUnit;
    void sp;

    return (
        <div className="space-y-6 max-w-7xl">
            <header className="flex flex-col gap-2">
                <h1 className="text-title text-content-primary">Relatórios</h1>

                <p className="text-paragraph-medium-size text-content-secondary">
                    Acompanhe os indicadores estratégicos do seu grupo com
                    relatórios visuais.
                </p>
            </header>
        </div>
    );
}
