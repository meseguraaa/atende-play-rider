// src/lib/nextauth.ts
/**
 * Este projeto (no momento) NÃO tem `next-auth` e `@next-auth/prisma-adapter`
 * instalados, então este arquivo vira um stub para não quebrar imports.
 *
 * Quando você for realmente usar NextAuth:
 * - instale as deps
 * - substitua este arquivo por uma config real
 */

export type NextAuthOptionsLike = {
    adapter?: unknown;
    session?: { strategy?: 'jwt' | 'database' };
    debug?: boolean;
    providers?: unknown[];
    secret?: string;
    callbacks?: {
        jwt?: (args: { token: unknown; user?: unknown }) => Promise<unknown>;
        session?: (args: { session: any; token: any }) => Promise<any>;
        signIn?: (args: { user: unknown }) => Promise<boolean>;
    };
};

export const nextAuthOptions: NextAuthOptionsLike = {
    // placeholder neutro
    session: { strategy: 'jwt' },
    debug: process.env.NODE_ENV === 'development',
    providers: [],
};
