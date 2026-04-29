-- CreateTable
CREATE TABLE "admin_unit_access" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_unit_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_unit_access_companyId_idx" ON "admin_unit_access"("companyId");

-- CreateIndex
CREATE INDEX "admin_unit_access_userId_idx" ON "admin_unit_access"("userId");

-- CreateIndex
CREATE INDEX "admin_unit_access_unitId_idx" ON "admin_unit_access"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_unit_access_companyId_userId_unitId_key" ON "admin_unit_access"("companyId", "userId", "unitId");

-- AddForeignKey
ALTER TABLE "admin_unit_access" ADD CONSTRAINT "admin_unit_access_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_unit_access" ADD CONSTRAINT "admin_unit_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_unit_access" ADD CONSTRAINT "admin_unit_access_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
