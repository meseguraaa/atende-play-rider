import { prisma } from '@/lib/prisma';

type ConsumeWhatsappCampaignCreditResult =
    | {
          ok: true;
          mode: 'FREE_MONTHLY_CAMPAIGN' | 'CREDIT';
          remainingCredits: number;
      }
    | {
          ok: false;
          reason: 'NO_CREDITS';
          remainingCredits: number;
      };

type ConsumeWhatsappMessageCreditResult =
    | {
          ok: true;
          mode: 'CREDIT';
          remainingCredits: number;
      }
    | {
          ok: false;
          reason: 'NO_CREDITS';
          remainingCredits: number;
      };

function getMonthWindow(date = new Date()) {
    const start = new Date(date);
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    return { start, end };
}

function isInsideCurrentMonth(
    value: Date | null | undefined,
    now = new Date()
) {
    if (!value) return false;
    const { start, end } = getMonthWindow(now);
    return value >= start && value < end;
}

/**
 * Garante que a empresa tenha registro de configuração de comunicação.
 */
export async function ensureCompanyCommunicationSettings(companyId: string) {
    const normalizedCompanyId = String(companyId ?? '').trim();
    if (!normalizedCompanyId) {
        throw new Error('companyId é obrigatório.');
    }

    return prisma.companyCommunicationSettings.upsert({
        where: { companyId: normalizedCompanyId },
        create: {
            companyId: normalizedCompanyId,
            whatsappCredits: 0,
            birthdayMessageEnabled: false,
        },
        update: {},
        select: {
            id: true,
            companyId: true,
            whatsappCredits: true,
            birthdayMessageEnabled: true,
            freeWhatsappUsedAt: true,
        },
    });
}

/**
 * CAMPANHA MANUAL
 *
 * Regras:
 * 1) Toda empresa tem 1 campanha grátis por mês.
 * 2) Depois disso, cada campanha consome 1 crédito.
 * 3) Não depende da quantidade de clientes atingidos.
 */
export async function consumeWhatsappCampaignCredit(
    companyId: string
): Promise<ConsumeWhatsappCampaignCreditResult> {
    const normalizedCompanyId = String(companyId ?? '').trim();
    if (!normalizedCompanyId) {
        throw new Error('companyId é obrigatório.');
    }

    const now = new Date();

    return prisma.$transaction(async (tx) => {
        const settings = await tx.companyCommunicationSettings.upsert({
            where: { companyId: normalizedCompanyId },
            create: {
                companyId: normalizedCompanyId,
                whatsappCredits: 0,
                birthdayMessageEnabled: false,
            },
            update: {},
            select: {
                whatsappCredits: true,
                freeWhatsappUsedAt: true,
            },
        });

        const alreadyUsedFreeThisMonth = isInsideCurrentMonth(
            settings.freeWhatsappUsedAt,
            now
        );

        if (!alreadyUsedFreeThisMonth) {
            await tx.companyCommunicationSettings.update({
                where: { companyId: normalizedCompanyId },
                data: {
                    freeWhatsappUsedAt: now,
                },
                select: { id: true },
            });

            return {
                ok: true,
                mode: 'FREE_MONTHLY_CAMPAIGN',
                remainingCredits: Math.max(
                    0,
                    Number(settings.whatsappCredits ?? 0)
                ),
            };
        }

        const currentCredits = Math.max(
            0,
            Number(settings.whatsappCredits ?? 0)
        );

        if (currentCredits <= 0) {
            return {
                ok: false,
                reason: 'NO_CREDITS',
                remainingCredits: 0,
            };
        }

        const updated = await tx.companyCommunicationSettings.update({
            where: { companyId: normalizedCompanyId },
            data: {
                whatsappCredits: {
                    decrement: 1,
                },
            },
            select: {
                whatsappCredits: true,
            },
        });

        return {
            ok: true,
            mode: 'CREDIT',
            remainingCredits: Math.max(0, Number(updated.whatsappCredits ?? 0)),
        };
    });
}

/**
 * MENSAGEM INDIVIDUAL
 *
 * Regras:
 * 1) Usado para automações como aniversário.
 * 2) Sempre consome 1 crédito por mensagem enviada.
 * 3) Não usa a grátis mensal.
 */
export async function consumeWhatsappMessageCredit(
    companyId: string
): Promise<ConsumeWhatsappMessageCreditResult> {
    const normalizedCompanyId = String(companyId ?? '').trim();
    if (!normalizedCompanyId) {
        throw new Error('companyId é obrigatório.');
    }

    return prisma.$transaction(async (tx) => {
        const settings = await tx.companyCommunicationSettings.upsert({
            where: { companyId: normalizedCompanyId },
            create: {
                companyId: normalizedCompanyId,
                whatsappCredits: 0,
                birthdayMessageEnabled: false,
            },
            update: {},
            select: {
                whatsappCredits: true,
            },
        });

        const currentCredits = Math.max(
            0,
            Number(settings.whatsappCredits ?? 0)
        );

        if (currentCredits <= 0) {
            return {
                ok: false,
                reason: 'NO_CREDITS',
                remainingCredits: 0,
            };
        }

        const updated = await tx.companyCommunicationSettings.update({
            where: { companyId: normalizedCompanyId },
            data: {
                whatsappCredits: {
                    decrement: 1,
                },
            },
            select: {
                whatsappCredits: true,
            },
        });

        return {
            ok: true,
            mode: 'CREDIT',
            remainingCredits: Math.max(0, Number(updated.whatsappCredits ?? 0)),
        };
    });
}

/**
 * Consulta simples, sem consumir nada.
 */
export async function getWhatsappMessageCreditStatus(companyId: string) {
    const normalizedCompanyId = String(companyId ?? '').trim();
    if (!normalizedCompanyId) {
        throw new Error('companyId é obrigatório.');
    }

    const settings =
        await ensureCompanyCommunicationSettings(normalizedCompanyId);
    const now = new Date();

    return {
        companyId: normalizedCompanyId,
        whatsappCredits: Math.max(0, Number(settings.whatsappCredits ?? 0)),
        birthdayMessageEnabled: Boolean(settings.birthdayMessageEnabled),
        freeMonthlyCampaignAvailable: !isInsideCurrentMonth(
            settings.freeWhatsappUsedAt,
            now
        ),
        freeWhatsappUsedAt: settings.freeWhatsappUsedAt ?? null,
    };
}
