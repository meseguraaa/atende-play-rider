-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "cardInstallments" INTEGER;

-- CreateTable
CREATE TABLE "card_machine_credit_fees" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "cardMachineId" TEXT NOT NULL,
    "installments" INTEGER NOT NULL,
    "feePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_machine_credit_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_machine_credit_fees_companyId_idx" ON "card_machine_credit_fees"("companyId");

-- CreateIndex
CREATE INDEX "card_machine_credit_fees_unitId_idx" ON "card_machine_credit_fees"("unitId");

-- CreateIndex
CREATE INDEX "card_machine_credit_fees_cardMachineId_isActive_idx" ON "card_machine_credit_fees"("cardMachineId", "isActive");

-- CreateIndex
CREATE INDEX "card_machine_credit_fees_installments_idx" ON "card_machine_credit_fees"("installments");

-- CreateIndex
CREATE UNIQUE INDEX "card_machine_credit_fees_cardMachineId_installments_key" ON "card_machine_credit_fees"("cardMachineId", "installments");

-- CreateIndex
CREATE INDEX "appointments_cardInstallments_idx" ON "appointments"("cardInstallments");

-- AddForeignKey
ALTER TABLE "card_machine_credit_fees"
ADD CONSTRAINT "card_machine_credit_fees_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_machine_credit_fees"
ADD CONSTRAINT "card_machine_credit_fees_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "units"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_machine_credit_fees"
ADD CONSTRAINT "card_machine_credit_fees_cardMachineId_fkey"
FOREIGN KEY ("cardMachineId") REFERENCES "card_machines"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill das taxas atuais:
-- copia o antigo creditFeePercent de cada maquininha para 1x até 12x
INSERT INTO "card_machine_credit_fees" (
    "id",
    "companyId",
    "unitId",
    "cardMachineId",
    "installments",
    "feePercent",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    md5(cm."id" || '-' || gs::text),
    cm."companyId",
    cm."unitId",
    cm."id",
    gs,
    cm."creditFeePercent",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "card_machines" cm
CROSS JOIN generate_series(1, 12) AS gs
WHERE cm."creditFeePercent" IS NOT NULL;

-- Só depois do backfill a coluna antiga pode cair
ALTER TABLE "card_machines" DROP COLUMN "creditFeePercent";