// src/lib/professional-permissions.ts
import { prisma } from '@/lib/prisma';
import { getCurrentPainelUser } from '@/lib/painel-session';

export type ProfessionalSession = {
    companyId: string;
    professionalId: string;
    userId: string;

    /**
     * ✅ Opcional: unidade “default” (quando existe vínculo em ProfessionalUnit).
     * Não é obrigatório para não quebrar fluxos já existentes.
     */
    unitId?: string;

    name?: string | null;
    email?: string;
};

/**
 * ✅ Server helper (igual ao padrão do admin):
 * - Usa getCurrentPainelUser() (JWT/cookie do painel)
 * - Valida role PROFESSIONAL
 * - Garante vínculo real do usuário com Professional (companyId + userId)
 *
 * Importante:
 * - NÃO dá redirect aqui (pra não quebrar usos em /api).
 * - Em caso de falha, retorna strings vazias e a route decide 401.
 */
export async function requireProfessionalSession(): Promise<ProfessionalSession> {
    const session = await getCurrentPainelUser();

    if (!session) {
        return { companyId: '', professionalId: '', userId: '', unitId: '' };
    }

    // precisa ser PROFESSIONAL
    if ((session as any).role !== 'PROFESSIONAL') {
        return { companyId: '', professionalId: '', userId: '', unitId: '' };
    }

    const userId = String((session as any).sub || '').trim();
    const companyId = String((session as any).companyId || '').trim();

    if (!userId || !companyId) {
        return { companyId: '', professionalId: '', userId: '', unitId: '' };
    }

    // busca o professional vinculado a esse userId + companyId
    const professional = await prisma.professional.findFirst({
        where: {
            userId,
            companyId,
            isActive: true,
        },
        select: {
            id: true,
            name: true,
            email: true,
        },
    });

    if (!professional?.id) {
        return { companyId: '', professionalId: '', userId, unitId: '' };
    }

    /**
     * ✅ Unidade "default" (se existir vínculo em ProfessionalUnit)
     * - Não muda comportamento existente (só adiciona dado)
     * - Útil para telas que precisem filtrar por unidade sem exigir parâmetro
     */
    const professionalUnit = await prisma.professionalUnit.findFirst({
        where: {
            companyId,
            professionalId: professional.id,
            isActive: true,
        },
        select: {
            unitId: true,
        },
        orderBy: {
            updatedAt: 'desc',
        },
    });

    return {
        companyId,
        professionalId: professional.id,
        userId,
        unitId: professionalUnit?.unitId ?? '',
        name: professional.name ?? null,
        email: professional.email,
    };
}
