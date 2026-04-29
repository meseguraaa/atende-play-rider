// src/app/admin/setting/page.tsx
import type { Metadata } from 'next';

import { requireAdminForModule } from '@/lib/admin-permissions';
import AdminSettingsClient from './admin-settings-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin | Configurações',
};

export default async function AdminSettingsPage() {
    await requireAdminForModule('SETTINGS');

    return <AdminSettingsClient />;
}
