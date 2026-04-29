// src/app/admin/admin-permission-toast.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

type ToastKind = 'error' | 'success' | 'info';

export default function AdminPermissionToast() {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();

    const errorCode = searchParams?.get('error') || null;
    const shouldShow = useMemo(() => errorCode === 'permissao', [errorCode]);

    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<ToastKind>('error');
    const [message, setMessage] = useState('Sem permissão.');

    useEffect(() => {
        if (!shouldShow) return;

        setKind('error');
        setMessage('Sem permissão.');
        setOpen(true);

        // ✅ remove só o param "error" e preserva os demais
        const params = new URLSearchParams(searchParams?.toString() || '');
        params.delete('error');

        const nextUrl = `${pathname || '/admin/dashboard'}${
            params.toString() ? `?${params.toString()}` : ''
        }`;

        // replace imediato (sem timeout) evita “piscar” e evita repetição em refresh
        router.replace(nextUrl);

        const t2 = setTimeout(() => setOpen(false), 2600);

        return () => {
            clearTimeout(t2);
        };
    }, [shouldShow, router, pathname, searchParams]);

    if (!open) return null;

    return (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
            <div
                className={cn(
                    'pointer-events-none w-full max-w-md rounded-xl border px-4 py-3 shadow-sm',
                    'bg-background-primary',
                    kind === 'error' && 'border-destructive/40'
                )}
            >
                <div className="flex items-start gap-3">
                    <span
                        className={cn(
                            'mt-0.5 inline-flex h-2.5 w-2.5 rounded-full',
                            kind === 'error' && 'bg-destructive'
                        )}
                    />
                    <div className="min-w-0">
                        <p className="text-paragraph-small text-content-primary">
                            {message}
                        </p>
                        <p className="mt-0.5 text-[11px] text-content-secondary">
                            Você não tem acesso a essa área.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
