-- CreateEnum
CREATE TYPE "FaqEventType" AS ENUM ('FAQ_MENU_ENTRY', 'FAQ_COMPANY_SELECTED', 'FAQ_CATEGORY_SELECTED', 'FAQ_QUESTION_SELECTED', 'FAQ_ANSWER_VIEWED', 'FAQ_BACK_TO_QUESTIONS', 'FAQ_BACK_TO_MENU', 'FAQ_SESSION_EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WhatsappSessionStage" ADD VALUE 'FAQ_CATEGORY';
ALTER TYPE "WhatsappSessionStage" ADD VALUE 'FAQ_QUESTION';
ALTER TYPE "WhatsappSessionStage" ADD VALUE 'FAQ_ANSWER';

-- AlterTable
ALTER TABLE "admin_access" ADD COLUMN     "canAccessFaq" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canAccessFaqReports" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "showInFaq" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "faq_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channelId" TEXT,
    "fromPhone" TEXT,
    "categoryId" TEXT,
    "faqItemId" TEXT,
    "whatsappSessionId" TEXT,
    "eventType" "FaqEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "faq_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "faq_items_companyId_isActive_idx" ON "faq_items"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "faq_items_categoryId_isActive_idx" ON "faq_items"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "faq_items_companyId_categoryId_isActive_idx" ON "faq_items"("companyId", "categoryId", "isActive");

-- CreateIndex
CREATE INDEX "faq_items_companyId_sortOrder_idx" ON "faq_items"("companyId", "sortOrder");

-- CreateIndex
CREATE INDEX "faq_events_companyId_createdAt_idx" ON "faq_events"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "faq_events_channelId_createdAt_idx" ON "faq_events"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "faq_events_categoryId_createdAt_idx" ON "faq_events"("categoryId", "createdAt");

-- CreateIndex
CREATE INDEX "faq_events_faqItemId_createdAt_idx" ON "faq_events"("faqItemId", "createdAt");

-- CreateIndex
CREATE INDEX "faq_events_whatsappSessionId_createdAt_idx" ON "faq_events"("whatsappSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "faq_events_eventType_createdAt_idx" ON "faq_events"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "categories_companyId_showInFaq_isActive_idx" ON "categories"("companyId", "showInFaq", "isActive");

-- AddForeignKey
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_events" ADD CONSTRAINT "faq_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_events" ADD CONSTRAINT "faq_events_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_events" ADD CONSTRAINT "faq_events_faqItemId_fkey" FOREIGN KEY ("faqItemId") REFERENCES "faq_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_events" ADD CONSTRAINT "faq_events_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "whatsapp_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_events" ADD CONSTRAINT "faq_events_whatsappSessionId_fkey" FOREIGN KEY ("whatsappSessionId") REFERENCES "whatsapp_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
