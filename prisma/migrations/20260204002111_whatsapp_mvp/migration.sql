-- CreateEnum
CREATE TYPE "WhatsappSessionStage" AS ENUM ('MENU', 'IDENTIFY_BY_PHONE', 'CHOOSE_COMPANY', 'ASK_EMAIL', 'REGISTER_NAME', 'CONFIRM_PHONE', 'REGISTER_BIRTHDATE', 'ASK_UNIT', 'ASK_SERVICE', 'ASK_PROFESSIONAL', 'ASK_DAY', 'ASK_TIME', 'CONFIRM_APPOINTMENT', 'CANCEL_SELECT_APPOINTMENT', 'CANCEL_CONFIRM', 'RESCHEDULE_SELECT_APPOINTMENT', 'RESCHEDULE_CHANGE_WHAT', 'RESCHEDULE_PICK_UNIT', 'RESCHEDULE_PICK_SERVICE', 'RESCHEDULE_PICK_PROFESSIONAL', 'RESCHEDULE_PICK_DAY', 'RESCHEDULE_PICK_TIME', 'RESCHEDULE_CONFIRM', 'DONE');

-- CreateTable
CREATE TABLE "whatsapp_channels" (
    "id" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhone" TEXT,
    "companyId" TEXT NOT NULL,
    "defaultUnitId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_sessions" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "stage" "WhatsappSessionStage" NOT NULL DEFAULT 'MENU',
    "payload" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unitId" TEXT,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_channels_phoneNumberId_key" ON "whatsapp_channels"("phoneNumberId");

-- CreateIndex
CREATE INDEX "whatsapp_channels_companyId_isActive_idx" ON "whatsapp_channels"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "whatsapp_channels_defaultUnitId_idx" ON "whatsapp_channels"("defaultUnitId");

-- CreateIndex
CREATE INDEX "whatsapp_sessions_companyId_fromPhone_idx" ON "whatsapp_sessions"("companyId", "fromPhone");

-- CreateIndex
CREATE INDEX "whatsapp_sessions_expiresAt_idx" ON "whatsapp_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "whatsapp_sessions_unitId_idx" ON "whatsapp_sessions"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessions_channelId_fromPhone_key" ON "whatsapp_sessions"("channelId", "fromPhone");

-- AddForeignKey
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_defaultUnitId_fkey" FOREIGN KEY ("defaultUnitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "whatsapp_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
