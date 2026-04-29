-- CreateEnum
CREATE TYPE "AppointmentConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "confirmationCanceledAt" TIMESTAMP(3),
ADD COLUMN     "confirmationStatus" "AppointmentConfirmationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "appointments_confirmationStatus_idx" ON "appointments"("confirmationStatus");

-- CreateIndex
CREATE INDEX "appointments_reminderSentAt_idx" ON "appointments"("reminderSentAt");
