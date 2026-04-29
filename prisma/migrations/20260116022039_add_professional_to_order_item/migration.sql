-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "professionalId" TEXT;

-- CreateIndex
CREATE INDEX "order_items_professionalId_idx" ON "order_items"("professionalId");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
