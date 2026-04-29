-- AlterTable safely changing companies.segment from enum to text
ALTER TABLE "companies"
ADD COLUMN "segment_new" TEXT;

UPDATE "companies"
SET "segment_new" = "segment"::text;

ALTER TABLE "companies"
ALTER COLUMN "segment_new" SET NOT NULL;

ALTER TABLE "companies"
DROP COLUMN "segment";

ALTER TABLE "companies"
RENAME COLUMN "segment_new" TO "segment";

DROP TYPE "CompanySegment";

CREATE INDEX "companies_segment_idx" ON "companies"("segment");