-- CreateEnum
CREATE TYPE "CheckoutDiscountType" AS ENUM ('PERCENT', 'AMOUNT');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "discountTotalAmount" DECIMAL(10,2),
ADD COLUMN     "discountedItemsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hasDiscount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "productDiscountTotalAmount" DECIMAL(10,2),
ADD COLUMN     "serviceDiscountTotalAmount" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "discountAmount" DECIMAL(10,2),
ADD COLUMN     "discountPercent" DECIMAL(5,2),
ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "discountType" "CheckoutDiscountType",
ADD COLUMN     "finalTotalPrice" DECIMAL(10,2),
ADD COLUMN     "finalUnitPrice" DECIMAL(10,2),
ADD COLUMN     "hasManualDiscount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalTotalPrice" DECIMAL(10,2),
ADD COLUMN     "originalUnitPrice" DECIMAL(10,2);
