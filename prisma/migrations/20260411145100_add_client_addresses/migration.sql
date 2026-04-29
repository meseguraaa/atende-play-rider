-- CreateTable
CREATE TABLE "client_addresses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cep" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "reference" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_addresses_companyId_idx" ON "client_addresses"("companyId");

-- CreateIndex
CREATE INDEX "client_addresses_clientId_idx" ON "client_addresses"("clientId");

-- CreateIndex
CREATE INDEX "client_addresses_companyId_clientId_isActive_idx" ON "client_addresses"("companyId", "clientId", "isActive");

-- CreateIndex
CREATE INDEX "client_addresses_clientId_isDefault_idx" ON "client_addresses"("clientId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "client_addresses_companyId_clientId_label_key" ON "client_addresses"("companyId", "clientId", "label");

-- AddForeignKey
ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
