-- CreateEnum
CREATE TYPE "OrderItemType" AS ENUM ('PRODUCT', 'SERVICE', 'PLAN', 'CANCELLATION_FEE');

-- CreateEnum
CREATE TYPE "CancellationChargeStatus" AS ENUM ('PENDING', 'ATTACHED_TO_ORDER', 'PAID', 'CANCELED');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "descriptionSnapshot" TEXT,
ADD COLUMN     "feePercentageSnapshot" DECIMAL(5,2),
ADD COLUMN     "itemType" "OrderItemType" NOT NULL DEFAULT 'SERVICE',
ADD COLUMN     "sourceAppointmentId" TEXT;

-- CreateTable
CREATE TABLE "cancellation_charges" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "serviceId" TEXT,
    "professionalId" TEXT,
    "originalServicePrice" DECIMAL(10,2) NOT NULL,
    "cancelFeePercentageSnapshot" DECIMAL(5,2) NOT NULL,
    "cancelFeeValue" DECIMAL(10,2) NOT NULL,
    "professionalPercentageSnapshot" DECIMAL(5,2) NOT NULL,
    "professionalCommissionValue" DECIMAL(10,2) NOT NULL,
    "status" "CancellationChargeStatus" NOT NULL DEFAULT 'PENDING',
    "orderItemId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cancellation_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_charges_appointmentId_key" ON "cancellation_charges"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_charges_orderItemId_key" ON "cancellation_charges"("orderItemId");

-- CreateIndex
CREATE INDEX "cancellation_charges_companyId_status_idx" ON "cancellation_charges"("companyId", "status");

-- CreateIndex
CREATE INDEX "cancellation_charges_unitId_status_idx" ON "cancellation_charges"("unitId", "status");

-- CreateIndex
CREATE INDEX "cancellation_charges_clientId_status_idx" ON "cancellation_charges"("clientId", "status");

-- CreateIndex
CREATE INDEX "cancellation_charges_appointmentId_idx" ON "cancellation_charges"("appointmentId");

-- CreateIndex
CREATE INDEX "cancellation_charges_orderItemId_idx" ON "cancellation_charges"("orderItemId");

-- CreateIndex
CREATE INDEX "order_items_itemType_idx" ON "order_items"("itemType");

-- CreateIndex
CREATE INDEX "order_items_sourceAppointmentId_idx" ON "order_items"("sourceAppointmentId");

-- AddForeignKey
ALTER TABLE "cancellation_charges" ADD CONSTRAINT "cancellation_charges_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_charges" ADD CONSTRAINT "cancellation_charges_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_charges" ADD CONSTRAINT "cancellation_charges_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_charges" ADD CONSTRAINT "cancellation_charges_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_charges" ADD CONSTRAINT "cancellation_charges_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_charges" ADD CONSTRAINT "cancellation_charges_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_charges" ADD CONSTRAINT "cancellation_charges_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
