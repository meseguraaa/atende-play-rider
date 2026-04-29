-- CreateEnum
CREATE TYPE "AppointmentLocationType" AS ENUM ('UNIT', 'CLIENT_ADDRESS');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "clientAddressId" TEXT,
ADD COLUMN     "locationType" "AppointmentLocationType" NOT NULL DEFAULT 'UNIT';

-- CreateIndex
CREATE INDEX "appointments_locationType_idx" ON "appointments"("locationType");

-- CreateIndex
CREATE INDEX "appointments_clientAddressId_idx" ON "appointments"("clientAddressId");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientAddressId_fkey" FOREIGN KEY ("clientAddressId") REFERENCES "client_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
