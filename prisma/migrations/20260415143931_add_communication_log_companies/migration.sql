-- CreateTable
CREATE TABLE "communication_log_companies" (
    "id" TEXT NOT NULL,
    "communicationLogId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_log_companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communication_log_companies_companyId_idx" ON "communication_log_companies"("companyId");

-- CreateIndex
CREATE INDEX "communication_log_companies_communicationLogId_idx" ON "communication_log_companies"("communicationLogId");

-- CreateIndex
CREATE UNIQUE INDEX "communication_log_companies_communicationLogId_companyId_key" ON "communication_log_companies"("communicationLogId", "companyId");

-- AddForeignKey
ALTER TABLE "communication_log_companies" ADD CONSTRAINT "communication_log_companies_communicationLogId_fkey" FOREIGN KEY ("communicationLogId") REFERENCES "communication_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_log_companies" ADD CONSTRAINT "communication_log_companies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
