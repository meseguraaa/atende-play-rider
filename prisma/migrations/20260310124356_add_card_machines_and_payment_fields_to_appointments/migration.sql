-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CREDIT', 'DEBIT', 'PIX', 'CASH');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "cardFeeAmount" DECIMAL(10,2),
ADD COLUMN     "cardFeePercentSnapshot" DECIMAL(5,2),
ADD COLUMN     "cardMachineId" TEXT,
ADD COLUMN     "cardMachineNameSnapshot" TEXT,
ADD COLUMN     "netReceivedAmount" DECIMAL(10,2),
ADD COLUMN     "paymentMethod" "PaymentMethod";

-- CreateTable
CREATE TABLE "card_machines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creditFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "debitFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_machines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_machines_companyId_idx" ON "card_machines"("companyId");

-- CreateIndex
CREATE INDEX "card_machines_unitId_isActive_idx" ON "card_machines"("unitId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "card_machines_unitId_name_key" ON "card_machines"("unitId", "name");

-- CreateIndex
CREATE INDEX "appointments_paymentMethod_idx" ON "appointments"("paymentMethod");

-- CreateIndex
CREATE INDEX "appointments_cardMachineId_idx" ON "appointments"("cardMachineId");

-- CreateIndex
CREATE INDEX "appointments_unitId_checkedOutAt_paymentMethod_idx" ON "appointments"("unitId", "checkedOutAt", "paymentMethod");

-- AddForeignKey
ALTER TABLE "card_machines" ADD CONSTRAINT "card_machines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_machines" ADD CONSTRAINT "card_machines_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cardMachineId_fkey" FOREIGN KEY ("cardMachineId") REFERENCES "card_machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
