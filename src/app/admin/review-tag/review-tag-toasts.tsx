// src/app/admin/review-tag/review-tag-toasts.tsx
'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

type Props = {
    success?: string;
    error?: string;
};

export default function ReviewTagToasts({ success, error }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const sp = useSearchParams();

    // ✅ evita toast duplicado em dev (React StrictMode roda effects 2x)
    const lastKeyRef = React.useRef<string>('');

    React.useEffect(() => {
        if (!success && !error) return;

        const key = `${pathname}::${sp.toString()}::${success ?? ''}::${error ?? ''}`;
        if (lastKeyRef.current === key) return;
        lastKeyRef.current = key;

        if (success) toast.success(success);
        if (error) toast.error(error);

        // limpa querystring pra não repetir toast ao recarregar/voltar
        const next = new URLSearchParams(sp.toString());
        next.delete('success');
        next.delete('error');

        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [success, error, pathname]);

    return null;
}
