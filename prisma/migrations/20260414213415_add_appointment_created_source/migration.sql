-- CreateEnum
CREATE TYPE "AppointmentCreatedSource" AS ENUM ('ADMIN_PANEL', 'PROFESSIONAL_PANEL', 'CLIENT_APP', 'CLIENT_WHATSAPP', 'PUBLIC_LINK', 'SYSTEM');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "createdByProfessionalId" TEXT,
ADD COLUMN     "createdByRole" "Role",
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "createdSource" "AppointmentCreatedSource",
ADD COLUMN     "createdViaWhatsappSessionId" TEXT;
