// src/app/admin/dashboard/page.tsx
import type { Metadata } from 'next';

import { requireAdminForModule } from '@/lib/admin-permissions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Dashboard',
};

export default async function AdminDashboardPage() {
    await requireAdminForModule('DASHBOARD');

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-title text-content-primary">Dashboard</h1>
                <p className="text-paragraph-medium-size text-content-secondary">
                    Esta área será reformulada para o AtendePlay Rider.
                </p>
            </div>

            <section className="rounded-xl border border-border-primary bg-background-tertiary p-6">
                <p className="text-paragraph-medium text-content-secondary">
                    Dashboard limpo. Próximo passo: definir quais indicadores
                    fazem sentido para grupos, rolês, membros e parceiros.
                </p>
            </section>
        </div>
    );
}
