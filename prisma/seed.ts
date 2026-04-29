// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const COMPANY_SLUG = 'atendeplayrider';
    const COMPANY_NAME = 'AtendePlay Rider';
    const UNIT_NAME = 'Grupo AtendePlay Rider';

    const ADMIN_EMAIL = 'admin@atendeplay.com.br';
    const PLATFORM_EMAIL = 'plataform@atendeplay.com.br';

    const PASSWORD = 'Mesegura@2468';
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const existingCompany = await prisma.company.findFirst({
        where: { slug: COMPANY_SLUG },
    });

    const company =
        existingCompany ??
        (await prisma.company.create({
            data: {
                name: COMPANY_NAME,
                slug: COMPANY_SLUG,
                segment: 'RIDER',
                isActive: true,
            },
        }));

    const existingUnit = await prisma.unit.findFirst({
        where: {
            companyId: company.id,
            name: UNIT_NAME,
        },
    });

    const unit =
        existingUnit ??
        (await prisma.unit.create({
            data: {
                companyId: company.id,
                name: UNIT_NAME,
                isActive: true,
            },
        }));

    const adminUser = await prisma.user.upsert({
        where: { email: ADMIN_EMAIL },
        update: {
            role: 'ADMIN',
            isOwner: true,
            isActive: true,
            passwordHash,
            name: 'Admin',
        },
        create: {
            email: ADMIN_EMAIL,
            name: 'Admin',
            role: 'ADMIN',
            isOwner: true,
            isActive: true,
            passwordHash,
        },
    });

    await prisma.companyMember.upsert({
        where: {
            companyId_userId: {
                companyId: company.id,
                userId: adminUser.id,
            },
        },
        update: {
            role: 'OWNER',
            isActive: true,
            lastUnitId: unit.id,
        },
        create: {
            companyId: company.id,
            userId: adminUser.id,
            role: 'OWNER',
            isActive: true,
            lastUnitId: unit.id,
        },
    });

    await prisma.adminAccess.upsert({
        where: {
            companyId_userId: {
                companyId: company.id,
                userId: adminUser.id,
            },
        },
        update: {
            unitId: unit.id,

            canAccessDashboard: true,
            canAccessReports: true,
            canAccessRides: true,
            canAccessCategories: true,
            canAccessReviews: true,
            canAccessProducts: true,
            canAccessPartners: false,
            canAccessMembers: true,
            canAccessFinance: true,
            canAccessSettings: true,
            canAccessCommunication: true,
            canAccessFaq: true,
            canAccessFaqReports: true,
        },
        create: {
            companyId: company.id,
            userId: adminUser.id,
            unitId: unit.id,

            canAccessDashboard: true,
            canAccessReports: true,
            canAccessRides: true,
            canAccessCategories: true,
            canAccessReviews: true,
            canAccessProducts: true,
            canAccessPartners: false,
            canAccessMembers: true,
            canAccessFinance: true,
            canAccessSettings: true,
            canAccessCommunication: true,
            canAccessFaq: true,
            canAccessFaqReports: true,
        },
    });

    const platformUser = await prisma.user.upsert({
        where: { email: PLATFORM_EMAIL },
        update: {
            role: 'PLATFORM_OWNER',
            isOwner: false,
            isActive: true,
            passwordHash,
            name: 'Platform Owner',
        },
        create: {
            email: PLATFORM_EMAIL,
            name: 'Platform Owner',
            role: 'PLATFORM_OWNER',
            isOwner: false,
            isActive: true,
            passwordHash,
        },
    });

    console.log('🌱 Seed Rider concluída!');
    console.log(`Company: ${company.name} (${company.slug ?? '-'})`);
    console.log(`Unit: ${unit.name}`);
    console.log(`ADMIN: ${ADMIN_EMAIL} / ${PASSWORD}`);
    console.log(`PLATFORM: ${platformUser.email} / ${PASSWORD}`);
}

main()
    .catch((e) => {
        console.error('❌ Seed falhou:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
