import { prisma } from '@/lib/prisma';
import { whatsappSendTemplate } from '@/lib/whatsapp-cloud';

function digitsOnly(value: string | null | undefined) {
    return String(value ?? '').replace(/\D/g, '');
}

function normalizeWhatsappPhone(value: string | null | undefined) {
    const digits = digitsOnly(value);

    if (!digits) return '';

    if (digits.startsWith('55')) {
        return digits;
    }

    return `55${digits}`;
}

function hasValidWhatsappPhone(value: string | null | undefined) {
    return digitsOnly(value).length >= 10;
}

function isTodayBirthday(date: Date | null | undefined) {
    if (!date) return false;

    const today = new Date();

    return (
        date.getUTCDate() === today.getUTCDate() &&
        date.getUTCMonth() === today.getUTCMonth()
    );
}

function getTodayUtcWindow() {
    const now = new Date();

    const start = new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            0,
            0,
            0,
            0
        )
    );

    const end = new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
            0,
            0,
            0,
            0
        )
    );

    return { start, end };
}

function formatCompanyNames(names: string[]) {
    const clean = Array.from(
        new Set(names.map((name) => String(name || '').trim()).filter(Boolean))
    );

    if (clean.length === 0) return 'nossa equipe';
    if (clean.length === 1) return clean[0];
    if (clean.length === 2) return `${clean[0]} e ${clean[1]}`;

    return `${clean.slice(0, -1).join(', ')} e ${clean[clean.length - 1]}`;
}

type BirthdayAudienceItem = {
    userId: string;
    clientName: string;
    phone: string;
    companyIds: string[];
    companyNames: string[];
};

export async function sendBirthdayMessages() {
    const companies = await prisma.companyCommunicationSettings.findMany({
        where: {
            birthdayMessageEnabled: true,
        },
        select: {
            companyId: true,
            company: {
                select: {
                    name: true,
                },
            },
        },
    });

    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    const audienceByPhone = new Map<string, BirthdayAudienceItem>();

    for (const company of companies) {
        const companyId = String(company.companyId);
        const companyName =
            String(company.company?.name ?? '').trim() || 'nossa equipe';

        const clients = await prisma.user.findMany({
            where: {
                isActive: true,
                companyMemberships: {
                    some: {
                        companyId,
                        role: 'CLIENT',
                        isActive: true,
                    },
                },
            },
            select: {
                id: true,
                name: true,
                phone: true,
                birthday: true,
            },
        });

        for (const client of clients) {
            if (!isTodayBirthday(client.birthday)) {
                totalSkipped += 1;
                continue;
            }

            if (!hasValidWhatsappPhone(client.phone)) {
                totalSkipped += 1;
                continue;
            }

            const phone = normalizeWhatsappPhone(client.phone);
            const clientName =
                String(client.name ?? 'Cliente').trim() || 'Cliente';

            const existing = audienceByPhone.get(phone);

            if (existing) {
                existing.companyIds.push(companyId);
                existing.companyNames.push(companyName);
                continue;
            }

            audienceByPhone.set(phone, {
                userId: client.id,
                clientName,
                phone,
                companyIds: [companyId],
                companyNames: [companyName],
            });
        }
    }

    const { start, end } = getTodayUtcWindow();

    for (const audience of audienceByPhone.values()) {
        const alreadySentToday = await prisma.communicationLog.findFirst({
            where: {
                channel: 'WHATSAPP',
                type: 'AUTOMATIC',
                automationType: 'BIRTHDAY',
                targetPhone: audience.phone,
                status: 'SENT',
                createdAt: {
                    gte: start,
                    lt: end,
                },
            },
            select: {
                id: true,
            },
        });

        if (alreadySentToday) {
            totalSkipped += 1;
            continue;
        }

        const companyNamesText = formatCompanyNames(audience.companyNames);

        const sendResult = await whatsappSendTemplate({
            to: audience.phone,
            templateName: 'birthday_message_atendeplay',
            languageCode: 'pt_BR',
            variables: [audience.clientName, companyNamesText],
        });

        const communicationLog = await prisma.communicationLog.create({
            data: {
                companyId: audience.companyIds[0],
                channel: 'WHATSAPP',
                type: 'AUTOMATIC',
                automationType: 'BIRTHDAY',
                content: 'birthday_message_atendeplay',
                targetPhone: audience.phone,
                status: sendResult.ok ? 'SENT' : 'FAILED',
                consumedCredit: false,
                sentAt: new Date(),
            },
            select: {
                id: true,
            },
        });

        await prisma.communicationLogCompany.createMany({
            data: Array.from(new Set(audience.companyIds)).map((companyId) => ({
                communicationLogId: communicationLog.id,
                companyId,
                billable: true,
            })),
        });

        if (sendResult.ok) {
            totalSent += 1;
        } else {
            totalFailed += 1;
        }
    }

    return {
        totalSent,
        totalFailed,
        totalSkipped,
    };
}
