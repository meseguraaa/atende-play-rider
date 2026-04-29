// src/lib/auth.ts
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export type PainelLoginRole =
    | 'ADMIN'
    | 'PROFESSIONAL'
    | 'PLATFORM_OWNER'
    | 'PLATFORM_STAFF';

export type AuthenticatedUser = {
    id: string;
    name: string | null;
    email: string;
    role: PainelLoginRole;
};

export class AuthError extends Error {
    code: 'credenciais' | 'permissao';
    constructor(code: 'credenciais' | 'permissao', message?: string) {
        super(
            message ??
                (code === 'credenciais'
                    ? 'Credenciais inválidas.'
                    : 'Sem permissão.')
        );
        this.name = 'AuthError';
        this.code = code;
    }
}

function safeTimingEqual(a: Buffer, b: Buffer) {
    // timingSafeEqual exige mesmo tamanho
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/**
 * Suporta dois formatos:
 * - bcrypt (ex: "$2a$..." / "$2b$...")
 * - scrypt (formato do seu POST de admin): "scrypt:<saltB64>:<hashB64>"
 */
async function verifyPassword(
    password: string,
    passwordHash: string
): Promise<boolean> {
    const hash = String(passwordHash || '').trim();
    if (!hash) return false;

    // bcrypt
    if (
        hash.startsWith('$2a$') ||
        hash.startsWith('$2b$') ||
        hash.startsWith('$2y$')
    ) {
        return await bcrypt.compare(password, hash);
    }

    // scrypt:<saltB64>:<hashB64>
    if (hash.startsWith('scrypt:')) {
        const parts = hash.split(':');
        if (parts.length !== 3) return false;

        const saltB64 = parts[1];
        const derivedB64 = parts[2];

        let salt: Buffer;
        let derivedFromDb: Buffer;

        try {
            salt = Buffer.from(saltB64, 'base64');
            derivedFromDb = Buffer.from(derivedB64, 'base64');
        } catch {
            return false;
        }

        // Seu create usa 64 bytes
        const derived = crypto.scryptSync(password, salt, derivedFromDb.length);
        return safeTimingEqual(Buffer.from(derived), derivedFromDb);
    }

    // formato desconhecido
    return false;
}

/**
 * Autentica e decide o "role do painel":
 * - ADMIN: se user.role === "ADMIN"
 * - PLATFORM_*: se user.role === "PLATFORM_OWNER" | "PLATFORM_STAFF"
 * - PROFESSIONAL: se existir Professional ativo (em qualquer company) com userId ou email
 *
 * Observação: o vínculo com a company do TENANT é validado na criação da sessão (painel-session),
 * usando o subdomínio (slug) do host.
 */
export async function loginWithCredentialsWithPrisma(
    prisma: PrismaClient,
    email: string,
    password: string
): Promise<AuthenticatedUser> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            passwordHash: true,
        },
    });

    if (!user || !user.passwordHash || !user.isActive) {
        throw new AuthError('credenciais');
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new AuthError('credenciais');

    const role = String(user.role || '')
        .trim()
        .toUpperCase();

    // ✅ PLATFORM (painel): não depende de CompanyMember/AdminAccess
    if (role === 'PLATFORM_OWNER' || role === 'PLATFORM_STAFF') {
        return {
            id: user.id,
            name: user.name ?? null,
            email: user.email,
            role: role as PainelLoginRole,
        };
    }

    // ADMIN (painel)
    if (role === 'ADMIN') {
        return {
            id: user.id,
            name: user.name ?? null,
            email: user.email,
            role: 'ADMIN',
        };
    }

    // PROFESSIONAL (painel): precisa existir um Professional ativo em alguma empresa
    const prof = await prisma.professional.findFirst({
        where: {
            isActive: true,
            OR: [{ userId: user.id }, { email: user.email }],
        },
        select: { id: true },
    });

    if (prof?.id) {
        return {
            id: user.id,
            name: user.name ?? null,
            email: user.email,
            role: 'PROFESSIONAL',
        };
    }

    throw new AuthError('permissao');
}

/**
 * Wrapper simples
 */
export async function loginWithCredentials(email: string, password: string) {
    const { prisma } = await import('@/lib/prisma');
    return loginWithCredentialsWithPrisma(prisma as any, email, password);
}
