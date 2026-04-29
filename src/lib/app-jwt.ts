// src/lib/app-jwt.ts
import { jwtVerify, type JWTPayload, SignJWT } from 'jose';

export type AppJwtRole = 'CLIENT' | 'PROFESSIONAL' | 'ADMIN' | 'BARBER'; // tolera legado BARBER

export type AppJwtPayload = JWTPayload & {
    sub?: string;
    role?: AppJwtRole;
    companyId?: string;
    email?: string;
    name?: string | null;

    // ✅ mobile helper: se o perfil está completo (phone + birthday)
    profile_complete?: boolean;
};

function getJwtSecretKey() {
    const secret = process.env.APP_JWT_SECRET;
    if (!secret) {
        throw new Error('APP_JWT_SECRET não definido no .env');
    }
    return new TextEncoder().encode(secret);
}

export async function verifyAppJwt(token: string): Promise<AppJwtPayload> {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    return payload as AppJwtPayload;
}

/**
 * ✅ Assina um token para o app mobile (compat com verifyAppJwt).
 * - Algoritmo: HS256
 * - Expiração padrão: 30 dias
 */
export async function signAppJwt(
    payload: AppJwtPayload,
    opts?: { expiresIn?: string | number }
): Promise<string> {
    const expiresIn = opts?.expiresIn ?? '30d';

    const clean: AppJwtPayload = {
        ...payload,
        sub: payload?.sub ? String(payload.sub) : payload?.sub,
        role: payload?.role,
        companyId: payload?.companyId
            ? String(payload.companyId)
            : payload?.companyId,
        email: payload?.email ? String(payload.email) : payload?.email,
        name:
            payload?.name === null || payload?.name === undefined
                ? payload?.name
                : String(payload.name),

        // ✅ garante boolean quando vier (sem inventar valor)
        profile_complete:
            typeof payload?.profile_complete === 'boolean'
                ? payload.profile_complete
                : undefined,
    };

    return await new SignJWT(clean)
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(getJwtSecretKey());
}
