/*
  Warnings:

  - You are about to drop the column `endDate` on the `client_plans` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `client_plans` table. All the data in the column will be lost.
  - You are about to drop the column `usedBookings` on the `client_plans` table. All the data in the column will be lost.
  - You are about to drop the column `commissionPercent` on the `plans` table. All the data in the column will be lost.
  - You are about to drop the column `durationDays` on the `plans` table. All the data in the column will be lost.
  - You are about to drop the column `totalBookings` on the `plans` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[paidOrderId]` on the table `client_plans` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `expiresAt` to the `client_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `planNameSnapshot` to the `client_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `planPriceSnapshot` to the `client_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `planTypeSnapshot` to the `client_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startsAt` to the `client_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `validityDaysSnapshot` to the `client_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `creditsIncluded` to the `plan_services` table without a default value. This is not possible if the table is not empty.
  - Added the required column `durationMinutesSnapshot` to the `plan_services` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serviceNameSnapshot` to the `plan_services` table without a default value. This is not possible if the table is not empty.
  - Added the required column `servicePriceSnapshot` to the `plan_services` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AppointmentPlanUsageType" AS ENUM ('NONE', 'PLAN_CREDIT');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('GENERAL', 'CUSTOM');

-- AlterEnum
ALTER TYPE "ClientPlanStatus" ADD VALUE 'COMPLETED';

-- DropIndex
DROP INDEX "plans_companyId_idx";

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "clientPlanServiceBalanceId" TEXT,
ADD COLUMN     "planUsageType" "AppointmentPlanUsageType" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "client_plans" DROP COLUMN "endDate",
DROP COLUMN "startDate",
DROP COLUMN "usedBookings",
ADD COLUMN     "activationNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "isPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paidOrderId" TEXT,
ADD COLUMN     "planNameSnapshot" TEXT NOT NULL,
ADD COLUMN     "planPriceSnapshot" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "planTypeSnapshot" "PlanType" NOT NULL,
ADD COLUMN     "startsAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "validityDaysSnapshot" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "commissionBasePrice" DECIMAL(10,2),
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "professionalCommissionAmount" DECIMAL(10,2),
ADD COLUMN     "professionalPercentageAtTime" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "plan_services" ADD COLUMN     "creditsIncluded" INTEGER NOT NULL,
ADD COLUMN     "durationMinutesSnapshot" INTEGER NOT NULL,
ADD COLUMN     "professionalPercentage" DECIMAL(5,2) NOT NULL DEFAULT 50.0,
ADD COLUMN     "serviceNameSnapshot" TEXT NOT NULL,
ADD COLUMN     "servicePriceSnapshot" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "plans" DROP COLUMN "commissionPercent",
DROP COLUMN "durationDays",
DROP COLUMN "totalBookings",
ADD COLUMN     "allowedEndTime" TEXT,
ADD COLUMN     "allowedStartTime" TEXT,
ADD COLUMN     "allowedWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "customForClientId" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "type" "PlanType" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "validityDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "plan_professionals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_credit_orders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_credit_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_plan_service_balances" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientPlanId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceNameSnapshot" TEXT NOT NULL,
    "servicePriceSnapshot" DECIMAL(10,2) NOT NULL,
    "durationMinutesSnapshot" INTEGER NOT NULL,
    "professionalPercentageSnapshot" DECIMAL(5,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "creditsTotal" INTEGER NOT NULL,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "creditsRemaining" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_plan_service_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_professionals_companyId_idx" ON "plan_professionals"("companyId");

-- CreateIndex
CREATE INDEX "plan_professionals_professionalId_idx" ON "plan_professionals"("professionalId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_professionals_planId_professionalId_key" ON "plan_professionals"("planId", "professionalId");

-- CreateIndex
CREATE INDEX "plan_credit_orders_companyId_idx" ON "plan_credit_orders"("companyId");

-- CreateIndex
CREATE INDEX "plan_credit_orders_planId_serviceId_idx" ON "plan_credit_orders"("planId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_credit_orders_planId_position_key" ON "plan_credit_orders"("planId", "position");

-- CreateIndex
CREATE INDEX "client_plan_service_balances_companyId_idx" ON "client_plan_service_balances"("companyId");

-- CreateIndex
CREATE INDEX "client_plan_service_balances_clientPlanId_sortOrder_idx" ON "client_plan_service_balances"("clientPlanId", "sortOrder");

-- CreateIndex
CREATE INDEX "client_plan_service_balances_serviceId_idx" ON "client_plan_service_balances"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "client_plan_service_balances_clientPlanId_serviceId_key" ON "client_plan_service_balances"("clientPlanId", "serviceId");

-- CreateIndex
CREATE INDEX "appointments_clientPlanServiceBalanceId_idx" ON "appointments"("clientPlanServiceBalanceId");

-- CreateIndex
CREATE INDEX "appointments_planUsageType_idx" ON "appointments"("planUsageType");

-- CreateIndex
CREATE INDEX "client_plans_companyId_clientId_status_idx" ON "client_plans"("companyId", "clientId", "status");

-- CreateIndex
CREATE INDEX "client_plans_clientId_expiresAt_idx" ON "client_plans"("clientId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "client_plans_paidOrderId_key" ON "client_plans"("paidOrderId");

-- CreateIndex
CREATE INDEX "order_items_planId_idx" ON "order_items"("planId");

-- CreateIndex
CREATE INDEX "plan_services_planId_sortOrder_idx" ON "plan_services"("planId", "sortOrder");

-- CreateIndex
CREATE INDEX "plans_companyId_type_isActive_idx" ON "plans"("companyId", "type", "isActive");

-- CreateIndex
CREATE INDEX "plans_customForClientId_idx" ON "plans"("customForClientId");

-- CreateIndex
CREATE INDEX "plans_companyId_sortOrder_idx" ON "plans"("companyId", "sortOrder");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_customForClientId_fkey" FOREIGN KEY ("customForClientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_professionals" ADD CONSTRAINT "plan_professionals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_professionals" ADD CONSTRAINT "plan_professionals_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_professionals" ADD CONSTRAINT "plan_professionals_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_credit_orders" ADD CONSTRAINT "plan_credit_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_credit_orders" ADD CONSTRAINT "plan_credit_orders_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_credit_orders" ADD CONSTRAINT "plan_credit_orders_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_plan_service_balances" ADD CONSTRAINT "client_plan_service_balances_clientPlanId_fkey" FOREIGN KEY ("clientPlanId") REFERENCES "client_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_plan_service_balances" ADD CONSTRAINT "client_plan_service_balances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_plan_service_balances" ADD CONSTRAINT "client_plan_service_balances_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientPlanServiceBalanceId_fkey" FOREIGN KEY ("clientPlanServiceBalanceId") REFERENCES "client_plan_service_balances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
