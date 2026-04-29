// src/app/plataform/page.tsx
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PlataformaRootPage() {
    redirect('/plataform/dashboard');
}
