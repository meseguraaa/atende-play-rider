-- CreateEnum
CREATE TYPE "PartnerVisibilityMode" AS ENUM ('ALL', 'SELECTED');

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "logoKey" TEXT,
    "discountPct" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "rules" TEXT,
    "ctaUrl" TEXT NOT NULL,
    "ctaLabel" TEXT NOT NULL DEFAULT 'Ativar cashback e ir pra loja',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "visibilityMode" "PartnerVisibilityMode" NOT NULL DEFAULT 'ALL',
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_visibilities" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_visibilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partners_isActive_sortOrder_idx" ON "partners"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "partners_visibilityMode_idx" ON "partners"("visibilityMode");

-- CreateIndex
CREATE INDEX "partner_visibilities_companyId_isEnabled_idx" ON "partner_visibilities"("companyId", "isEnabled");

-- CreateIndex
CREATE INDEX "partner_visibilities_partnerId_isEnabled_idx" ON "partner_visibilities"("partnerId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "partner_visibilities_partnerId_companyId_key" ON "partner_visibilities"("partnerId", "companyId");

-- AddForeignKey
ALTER TABLE "partner_visibilities" ADD CONSTRAINT "partner_visibilities_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_visibilities" ADD CONSTRAINT "partner_visibilities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
