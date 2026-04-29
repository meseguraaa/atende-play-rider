-- AlterTable
ALTER TABLE "push_devices" ADD COLUMN     "projectSlug" TEXT;

-- CreateIndex
CREATE INDEX "push_devices_projectSlug_idx" ON "push_devices"("projectSlug");
