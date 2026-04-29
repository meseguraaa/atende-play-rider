-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WhatsappSessionStage" ADD VALUE 'SIGNUP_OFFER';
ALTER TYPE "WhatsappSessionStage" ADD VALUE 'SIGNUP_CHOOSE_COMPANY';
ALTER TYPE "WhatsappSessionStage" ADD VALUE 'SIGNUP_ASK_NAME';
ALTER TYPE "WhatsappSessionStage" ADD VALUE 'SIGNUP_ASK_EMAIL';
ALTER TYPE "WhatsappSessionStage" ADD VALUE 'SIGNUP_CONFIRM_PHONE';
ALTER TYPE "WhatsappSessionStage" ADD VALUE 'SIGNUP_ASK_PHONE';
ALTER TYPE "WhatsappSessionStage" ADD VALUE 'SIGNUP_ASK_BIRTHDATE';
ALTER TYPE "WhatsappSessionStage" ADD VALUE 'SIGNUP_REVIEW';
