// src/app/api/auth/[...nextauth]/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function notAvailable() {
    return NextResponse.json(
        {
            ok: false,
            error: 'nextauth_not_installed',
            message:
                'NextAuth não está instalado/configurado neste projeto. Remova esta rota ou instale next-auth para habilitar.',
        },
        { status: 501 }
    );
}

export const GET = notAvailable;
export const POST = notAvailable;
