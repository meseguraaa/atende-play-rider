// src/app/platform/layout.tsx
import { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { getCurrentPainelUser } from '@/lib/painel-session';
import { requirePlatformForModule } from '@/lib/plataform-permissions';
import { PlataformNav } from '@/components/plataform/plataform-nav';

export const dynamic = 'force-dynamic';

export default async function PlatformLayout({
    children,
}: {
    children: ReactNode;
}) {
    const session = await getCurrentPainelUser();

    if (!session) {
        redirect('/painel/login?error=credenciais');
    }

    if (!String((session as any).role || '').startsWith('PLATFORM')) {
        redirect('/painel/login?error=permissao');
    }

    await requirePlatformForModule('DASHBOARD');

    return (
        <div className="min-h-screen bg-background-primary">
            <PlataformNav />

            <main className="pl-14">
                <div className="w-full max-w-7xl mx-auto px-4 py-6">
                    {children}
                </div>
            </main>
        </div>
    );
}
