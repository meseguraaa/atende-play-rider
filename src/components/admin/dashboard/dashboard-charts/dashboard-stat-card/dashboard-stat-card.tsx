import { ReactNode } from 'react';

type DashboardStatCardProps = {
    children: ReactNode;
};

export function DashboardStatCard({ children }: DashboardStatCardProps) {
    return (
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
            {children}
        </div>
    );
}
