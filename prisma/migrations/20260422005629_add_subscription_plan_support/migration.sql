-- AlterEnum
ALTER TYPE "AppointmentPlanUsageType" ADD VALUE 'SUBSCRIPTION_CREDIT';

-- AlterEnum
ALTER TYPE "PlanType" ADD VALUE 'SUBSCRIPTION';

-- AlterTable
ALTER TABLE "client_plans" ADD COLUMN     "renewedFromClientPlanId" TEXT;

-- CreateIndex
CREATE INDEX "client_plans_renewedFromClientPlanId_idx" ON "client_plans"("renewedFromClientPlanId");
