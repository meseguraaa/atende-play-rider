// src/app/professional/layout.tsx
import { ReactNode } from 'react';

import { ProfessionalNav } from '@/components/professional/professional-nav';

export const dynamic = 'force-dynamic';

export default function ProfessionalLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background-primary">
            <ProfessionalNav />

            <main className="pl-14">
                <div className="w-full max-w-7xl mx-auto px-4 py-6">
                    {children}
                </div>
            </main>
        </div>
    );
}
