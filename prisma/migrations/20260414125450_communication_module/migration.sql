-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('WHATSAPP', 'PUSH');

-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "CommunicationAutomationType" AS ENUM ('BIRTHDAY');

-- CreateTable
CREATE TABLE "company_communication_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappCredits" INTEGER NOT NULL DEFAULT 0,
    "birthdayMessageEnabled" BOOLEAN NOT NULL DEFAULT false,
    "birthdayMessageContent" TEXT,
    "freeWhatsappUsedAt" TIMESTAMP(3),
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_communication_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "type" "CommunicationType" NOT NULL,
    "automationType" "CommunicationAutomationType",
    "content" TEXT NOT NULL,
    "targetPhone" TEXT,
    "status" TEXT NOT NULL,
    "consumedCredit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_communication_settings_companyId_key" ON "company_communication_settings"("companyId");

-- CreateIndex
CREATE INDEX "company_communication_settings_companyId_idx" ON "company_communication_settings"("companyId");

-- CreateIndex
CREATE INDEX "communication_logs_companyId_createdAt_idx" ON "communication_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "communication_logs_channel_createdAt_idx" ON "communication_logs"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "communication_logs_type_createdAt_idx" ON "communication_logs"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "company_communication_settings" ADD CONSTRAINT "company_communication_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
