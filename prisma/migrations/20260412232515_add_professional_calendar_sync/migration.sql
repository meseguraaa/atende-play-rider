/*
  Warnings:

  - A unique constraint covering the columns `[calendarSyncToken]` on the table `professionals` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "calendarSyncToken" TEXT,
ADD COLUMN     "calendarSyncTokenCreatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "professionals_calendarSyncToken_key" ON "professionals"("calendarSyncToken");
