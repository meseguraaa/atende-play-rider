/*
  Migration ajustada manualmente para remover Unit e restos antigos do projeto base.
*/

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELED', 'FINISHED');

-- CreateEnum
CREATE TYPE "RideParticipantStatus" AS ENUM ('GOING', 'NOT_GOING');

-- RenameTable
ALTER TABLE "User" RENAME TO "users";

-- RenameIndex
ALTER INDEX IF EXISTS "User_email_key" RENAME TO "users_email_key";

-- AlterEnum
BEGIN;
CREATE TYPE "WhatsappSessionStage_new" AS ENUM ('MENU', 'IDENTIFY_BY_PHONE', 'CHOOSE_COMPANY', 'ASK_EMAIL', 'REGISTER_NAME', 'CONFIRM_PHONE', 'REGISTER_BIRTHDATE', 'FAQ_CATEGORY', 'FAQ_QUESTION', 'FAQ_ANSWER', 'DONE', 'SIGNUP_OFFER', 'SIGNUP_CHOOSE_COMPANY', 'SIGNUP_ASK_NAME', 'SIGNUP_ASK_EMAIL', 'SIGNUP_CONFIRM_PHONE', 'SIGNUP_ASK_PHONE', 'SIGNUP_ASK_BIRTHDATE', 'SIGNUP_REVIEW');
ALTER TABLE "public"."whatsapp_sessions" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "whatsapp_sessions" ALTER COLUMN "stage" TYPE "WhatsappSessionStage_new" USING ("stage"::text::"WhatsappSessionStage_new");
ALTER TYPE "WhatsappSessionStage" RENAME TO "WhatsappSessionStage_old";
ALTER TYPE "WhatsappSessionStage_new" RENAME TO "WhatsappSessionStage";
DROP TYPE "public"."WhatsappSessionStage_old";
ALTER TABLE "whatsapp_sessions" ALTER COLUMN "stage" SET DEFAULT 'MENU';
COMMIT;

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "admin_access" DROP CONSTRAINT "admin_access_unitId_fkey";

-- DropForeignKey
ALTER TABLE "admin_access" DROP CONSTRAINT "admin_access_userId_fkey";

-- DropForeignKey
ALTER TABLE "admin_unit_access" DROP CONSTRAINT "admin_unit_access_companyId_fkey";

-- DropForeignKey
ALTER TABLE "admin_unit_access" DROP CONSTRAINT "admin_unit_access_unitId_fkey";

-- DropForeignKey
ALTER TABLE "admin_unit_access" DROP CONSTRAINT "admin_unit_access_userId_fkey";

-- DropForeignKey
ALTER TABLE "analytics_events" DROP CONSTRAINT "analytics_events_unitId_fkey";

-- DropForeignKey
ALTER TABLE "analytics_events" DROP CONSTRAINT "analytics_events_userId_fkey";

-- DropForeignKey
ALTER TABLE "app_notifications" DROP CONSTRAINT "app_notifications_userId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_review_tags" DROP CONSTRAINT "appointment_review_tags_reviewId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_review_tags" DROP CONSTRAINT "appointment_review_tags_tagId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_reviews" DROP CONSTRAINT "appointment_reviews_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_reviews" DROP CONSTRAINT "appointment_reviews_clientId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_reviews" DROP CONSTRAINT "appointment_reviews_companyId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_reviews" DROP CONSTRAINT "appointment_reviews_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_cancelledByProfessionalId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_cancelledByUserId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_cardMachineId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_checkedOutByUserId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_clientAddressId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_clientId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_clientPlanId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_clientPlanServiceBalanceId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_companyId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_concludedByProfessionalId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_concludedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_unitId_fkey";

-- DropForeignKey
ALTER TABLE "cancellation_charges" DROP CONSTRAINT "cancellation_charges_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "cancellation_charges" DROP CONSTRAINT "cancellation_charges_clientId_fkey";

-- DropForeignKey
ALTER TABLE "cancellation_charges" DROP CONSTRAINT "cancellation_charges_companyId_fkey";

-- DropForeignKey
ALTER TABLE "cancellation_charges" DROP CONSTRAINT "cancellation_charges_orderItemId_fkey";

-- DropForeignKey
ALTER TABLE "cancellation_charges" DROP CONSTRAINT "cancellation_charges_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "cancellation_charges" DROP CONSTRAINT "cancellation_charges_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "cancellation_charges" DROP CONSTRAINT "cancellation_charges_unitId_fkey";

-- DropForeignKey
ALTER TABLE "card_machine_credit_fees" DROP CONSTRAINT "card_machine_credit_fees_unitId_fkey";

-- DropForeignKey
ALTER TABLE "card_machines" DROP CONSTRAINT "card_machines_unitId_fkey";

-- DropForeignKey
ALTER TABLE "client_addresses" DROP CONSTRAINT "client_addresses_clientId_fkey";

-- DropForeignKey
ALTER TABLE "client_plan_service_balances" DROP CONSTRAINT "client_plan_service_balances_clientPlanId_fkey";

-- DropForeignKey
ALTER TABLE "client_plan_service_balances" DROP CONSTRAINT "client_plan_service_balances_companyId_fkey";

-- DropForeignKey
ALTER TABLE "client_plan_service_balances" DROP CONSTRAINT "client_plan_service_balances_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "client_plans" DROP CONSTRAINT "client_plans_clientId_fkey";

-- DropForeignKey
ALTER TABLE "client_plans" DROP CONSTRAINT "client_plans_companyId_fkey";

-- DropForeignKey
ALTER TABLE "client_plans" DROP CONSTRAINT "client_plans_planId_fkey";

-- DropForeignKey
ALTER TABLE "company_members" DROP CONSTRAINT "company_members_lastUnitId_fkey";

-- DropForeignKey
ALTER TABLE "company_members" DROP CONSTRAINT "company_members_userId_fkey";

-- DropForeignKey
ALTER TABLE "customer_level_configs" DROP CONSTRAINT "customer_level_configs_companyId_fkey";

-- DropForeignKey
ALTER TABLE "customer_level_configs" DROP CONSTRAINT "customer_level_configs_unitId_fkey";

-- DropForeignKey
ALTER TABLE "customer_level_periods" DROP CONSTRAINT "customer_level_periods_companyId_fkey";

-- DropForeignKey
ALTER TABLE "customer_level_periods" DROP CONSTRAINT "customer_level_periods_unitId_fkey";

-- DropForeignKey
ALTER TABLE "customer_level_periods" DROP CONSTRAINT "customer_level_periods_userId_fkey";

-- DropForeignKey
ALTER TABLE "customer_level_rules" DROP CONSTRAINT "customer_level_rules_companyId_fkey";

-- DropForeignKey
ALTER TABLE "customer_level_rules" DROP CONSTRAINT "customer_level_rules_unitId_fkey";

-- DropForeignKey
ALTER TABLE "customer_level_states" DROP CONSTRAINT "customer_level_states_companyId_fkey";

-- DropForeignKey
ALTER TABLE "customer_level_states" DROP CONSTRAINT "customer_level_states_unitId_fkey";

-- DropForeignKey
ALTER TABLE "customer_level_states" DROP CONSTRAINT "customer_level_states_userId_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_unitId_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_planId_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_clientId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_unitId_fkey";

-- DropForeignKey
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "password_reset_tokens_userId_fkey";

-- DropForeignKey
ALTER TABLE "plan_credit_orders" DROP CONSTRAINT "plan_credit_orders_companyId_fkey";

-- DropForeignKey
ALTER TABLE "plan_credit_orders" DROP CONSTRAINT "plan_credit_orders_planId_fkey";

-- DropForeignKey
ALTER TABLE "plan_credit_orders" DROP CONSTRAINT "plan_credit_orders_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "plan_professionals" DROP CONSTRAINT "plan_professionals_companyId_fkey";

-- DropForeignKey
ALTER TABLE "plan_professionals" DROP CONSTRAINT "plan_professionals_planId_fkey";

-- DropForeignKey
ALTER TABLE "plan_professionals" DROP CONSTRAINT "plan_professionals_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "plan_services" DROP CONSTRAINT "plan_services_companyId_fkey";

-- DropForeignKey
ALTER TABLE "plan_services" DROP CONSTRAINT "plan_services_planId_fkey";

-- DropForeignKey
ALTER TABLE "plan_services" DROP CONSTRAINT "plan_services_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "plans" DROP CONSTRAINT "plans_companyId_fkey";

-- DropForeignKey
ALTER TABLE "plans" DROP CONSTRAINT "plans_customForClientId_fkey";

-- DropForeignKey
ALTER TABLE "product_prices_by_level" DROP CONSTRAINT "product_prices_by_level_companyId_fkey";

-- DropForeignKey
ALTER TABLE "product_prices_by_level" DROP CONSTRAINT "product_prices_by_level_productId_fkey";

-- DropForeignKey
ALTER TABLE "product_sales" DROP CONSTRAINT "product_sales_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "product_sales" DROP CONSTRAINT "product_sales_unitId_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_unitId_fkey";

-- DropForeignKey
ALTER TABLE "professional_cancellation_fees" DROP CONSTRAINT "professional_cancellation_fees_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "professional_cancellation_fees" DROP CONSTRAINT "professional_cancellation_fees_companyId_fkey";

-- DropForeignKey
ALTER TABLE "professional_cancellation_fees" DROP CONSTRAINT "professional_cancellation_fees_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "professional_cancellation_fees" DROP CONSTRAINT "professional_cancellation_fees_unitId_fkey";

-- DropForeignKey
ALTER TABLE "professional_daily_availabilities" DROP CONSTRAINT "professional_daily_availabilities_companyId_fkey";

-- DropForeignKey
ALTER TABLE "professional_daily_availabilities" DROP CONSTRAINT "professional_daily_availabilities_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "professional_daily_availabilities" DROP CONSTRAINT "professional_daily_availabilities_unitId_fkey";

-- DropForeignKey
ALTER TABLE "professional_daily_time_intervals" DROP CONSTRAINT "professional_daily_time_intervals_dailyAvailabilityId_fkey";

-- DropForeignKey
ALTER TABLE "professional_units" DROP CONSTRAINT "professional_units_companyId_fkey";

-- DropForeignKey
ALTER TABLE "professional_units" DROP CONSTRAINT "professional_units_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "professional_units" DROP CONSTRAINT "professional_units_unitId_fkey";

-- DropForeignKey
ALTER TABLE "professional_weekly_availabilities" DROP CONSTRAINT "professional_weekly_availabilities_companyId_fkey";

-- DropForeignKey
ALTER TABLE "professional_weekly_availabilities" DROP CONSTRAINT "professional_weekly_availabilities_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "professional_weekly_availabilities" DROP CONSTRAINT "professional_weekly_availabilities_unitId_fkey";

-- DropForeignKey
ALTER TABLE "professional_weekly_time_intervals" DROP CONSTRAINT "professional_weekly_time_intervals_weeklyAvailabilityId_fkey";

-- DropForeignKey
ALTER TABLE "professionals" DROP CONSTRAINT "professionals_companyId_fkey";

-- DropForeignKey
ALTER TABLE "professionals" DROP CONSTRAINT "professionals_userId_fkey";

-- DropForeignKey
ALTER TABLE "push_devices" DROP CONSTRAINT "push_devices_userId_fkey";

-- DropForeignKey
ALTER TABLE "service_categories" DROP CONSTRAINT "service_categories_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "service_categories" DROP CONSTRAINT "service_categories_companyId_fkey";

-- DropForeignKey
ALTER TABLE "service_categories" DROP CONSTRAINT "service_categories_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "service_professionals" DROP CONSTRAINT "service_professionals_companyId_fkey";

-- DropForeignKey
ALTER TABLE "service_professionals" DROP CONSTRAINT "service_professionals_professionalId_fkey";

-- DropForeignKey
ALTER TABLE "service_professionals" DROP CONSTRAINT "service_professionals_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "services" DROP CONSTRAINT "services_companyId_fkey";

-- DropForeignKey
ALTER TABLE "services" DROP CONSTRAINT "services_unitId_fkey";

-- DropForeignKey
ALTER TABLE "unit_daily_availabilities" DROP CONSTRAINT "unit_daily_availabilities_companyId_fkey";

-- DropForeignKey
ALTER TABLE "unit_daily_availabilities" DROP CONSTRAINT "unit_daily_availabilities_unitId_fkey";

-- DropForeignKey
ALTER TABLE "unit_daily_time_intervals" DROP CONSTRAINT "unit_daily_time_intervals_dailyAvailabilityId_fkey";

-- DropForeignKey
ALTER TABLE "unit_weekly_availabilities" DROP CONSTRAINT "unit_weekly_availabilities_companyId_fkey";

-- DropForeignKey
ALTER TABLE "unit_weekly_availabilities" DROP CONSTRAINT "unit_weekly_availabilities_unitId_fkey";

-- DropForeignKey
ALTER TABLE "unit_weekly_time_intervals" DROP CONSTRAINT "unit_weekly_time_intervals_weeklyAvailabilityId_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT "units_companyId_fkey";

-- DropForeignKey
ALTER TABLE "whatsapp_channels" DROP CONSTRAINT "whatsapp_channels_defaultUnitId_fkey";

-- DropForeignKey
ALTER TABLE "whatsapp_sessions" DROP CONSTRAINT "whatsapp_sessions_unitId_fkey";

-- DropIndex
DROP INDEX "admin_access_unitId_idx";

-- DropIndex
DROP INDEX "analytics_events_unitId_createdAt_idx";

-- DropIndex
DROP INDEX "card_machine_credit_fees_unitId_idx";

-- DropIndex
DROP INDEX "card_machines_unitId_isActive_idx";

-- DropIndex
DROP INDEX "card_machines_unitId_name_key";

-- DropIndex
DROP INDEX "categories_companyId_showInServices_isActive_idx";

-- DropIndex
DROP INDEX "expenses_unitId_idx";

-- DropIndex
DROP INDEX "faq_events_whatsappSessionId_createdAt_idx";

-- DropIndex
DROP INDEX "order_items_planId_idx";

-- DropIndex
DROP INDEX "order_items_professionalId_idx";

-- DropIndex
DROP INDEX "order_items_serviceId_idx";

-- DropIndex
DROP INDEX "order_items_sourceAppointmentId_idx";

-- DropIndex
DROP INDEX "orders_appointmentId_idx";

-- DropIndex
DROP INDEX "orders_appointmentId_key";

-- DropIndex
DROP INDEX "orders_professionalId_idx";

-- DropIndex
DROP INDEX "orders_unitId_idx";

-- DropIndex
DROP INDEX "product_sales_professionalId_idx";

-- DropIndex
DROP INDEX "product_sales_unitId_idx";

-- DropIndex
DROP INDEX "products_unitId_idx";

-- DropIndex
DROP INDEX "whatsapp_channels_defaultUnitId_idx";

-- DropIndex
DROP INDEX "whatsapp_sessions_unitId_idx";

-- AlterTable
ALTER TABLE "admin_access" DROP COLUMN "canAccessAppointments",
DROP COLUMN "canAccessCheckout",
DROP COLUMN "canAccessClientLevels",
DROP COLUMN "canAccessClients",
DROP COLUMN "canAccessPlans",
DROP COLUMN "canAccessProfessionals",
DROP COLUMN "canAccessServices",
DROP COLUMN "unitId",
ADD COLUMN "canAccessMembers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canAccessRides" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "analytics_events" DROP COLUMN "unitId";

-- AlterTable
ALTER TABLE "card_machine_credit_fees" DROP COLUMN "unitId";

-- AlterTable
ALTER TABLE "card_machines" DROP COLUMN "unitId";

-- AlterTable
ALTER TABLE "categories" DROP COLUMN "showInServices";

-- AlterTable
ALTER TABLE "companies" ADD COLUMN "address" TEXT,
ADD COLUMN "cep" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "complement" TEXT,
ADD COLUMN "neighborhood" TEXT,
ADD COLUMN "number" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "street" TEXT;

-- AlterTable
ALTER TABLE "company_members" DROP COLUMN "lastUnitId",
ADD COLUMN "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "expenses" DROP COLUMN "unitId";

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "commissionBasePrice",
DROP COLUMN "feePercentageSnapshot",
DROP COLUMN "planId",
DROP COLUMN "professionalCommissionAmount",
DROP COLUMN "professionalId",
DROP COLUMN "professionalPercentageAtTime",
DROP COLUMN "serviceId",
DROP COLUMN "sourceAppointmentId",
ALTER COLUMN "itemType" SET DEFAULT 'PRODUCT';

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "appointmentId",
DROP COLUMN "professionalId",
DROP COLUMN "unitId";

-- AlterTable
ALTER TABLE "product_sales" DROP COLUMN "professionalId",
DROP COLUMN "unitId";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "birthdayBenefitEnabled",
DROP COLUMN "birthdayPriceLevel",
DROP COLUMN "unitId",
ALTER COLUMN "professionalPercentage" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "whatsapp_channels" DROP COLUMN "defaultUnitId";

-- AlterTable
ALTER TABLE "whatsapp_sessions" DROP COLUMN "unitId";

-- DropTable
DROP TABLE "admin_unit_access";

-- DropTable
DROP TABLE "appointment_review_tags";

-- DropTable
DROP TABLE "appointment_reviews";

-- DropTable
DROP TABLE "appointments";

-- DropTable
DROP TABLE "cancellation_charges";

-- DropTable
DROP TABLE "client_plan_service_balances";

-- DropTable
DROP TABLE "client_plans";

-- DropTable
DROP TABLE "customer_level_configs";

-- DropTable
DROP TABLE "customer_level_periods";

-- DropTable
DROP TABLE "customer_level_rules";

-- DropTable
DROP TABLE "customer_level_states";

-- DropTable
DROP TABLE "plan_credit_orders";

-- DropTable
DROP TABLE "plan_professionals";

-- DropTable
DROP TABLE "plan_services";

-- DropTable
DROP TABLE "plans";

-- DropTable
DROP TABLE "product_prices_by_level";

-- DropTable
DROP TABLE "professional_cancellation_fees";

-- DropTable
DROP TABLE "professional_daily_availabilities";

-- DropTable
DROP TABLE "professional_daily_time_intervals";

-- DropTable
DROP TABLE "professional_units";

-- DropTable
DROP TABLE "professional_weekly_availabilities";

-- DropTable
DROP TABLE "professional_weekly_time_intervals";

-- DropTable
DROP TABLE "professionals";

-- DropTable
DROP TABLE "service_categories";

-- DropTable
DROP TABLE "service_professionals";

-- DropTable
DROP TABLE "services";

-- DropTable
DROP TABLE "unit_daily_availabilities";

-- DropTable
DROP TABLE "unit_daily_time_intervals";

-- DropTable
DROP TABLE "unit_weekly_availabilities";

-- DropTable
DROP TABLE "unit_weekly_time_intervals";

-- DropTable
DROP TABLE "units";

-- AlterEnum
BEGIN;
CREATE TYPE "OrderItemType_new" AS ENUM ('PRODUCT');
ALTER TABLE "public"."order_items" ALTER COLUMN "itemType" DROP DEFAULT;
ALTER TABLE "order_items" ALTER COLUMN "itemType" TYPE "OrderItemType_new" USING ("itemType"::text::"OrderItemType_new");
ALTER TYPE "OrderItemType" RENAME TO "OrderItemType_old";
ALTER TYPE "OrderItemType_new" RENAME TO "OrderItemType";
DROP TYPE "public"."OrderItemType_old";
ALTER TABLE "order_items" ALTER COLUMN "itemType" SET DEFAULT 'PRODUCT';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('CLIENT', 'ADMIN', 'PLATFORM_OWNER', 'PLATFORM_STAFF');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;

-- DropEnum
DROP TYPE "AppointmentConfirmationStatus";

-- DropEnum
DROP TYPE "AppointmentCreatedSource";

-- DropEnum
DROP TYPE "AppointmentLocationType";

-- DropEnum
DROP TYPE "AppointmentPlanUsageType";

-- DropEnum
DROP TYPE "AppointmentStatus";

-- DropEnum
DROP TYPE "CancellationChargeStatus";

-- DropEnum
DROP TYPE "ClientPlanStatus";

-- DropEnum
DROP TYPE "CustomerLevel";

-- DropEnum
DROP TYPE "CustomerLevelRuleType";

-- DropEnum
DROP TYPE "PlanType";

-- DropEnum
DROP TYPE "ProfessionalDailyAvailabilityType";

-- CreateTable
CREATE TABLE "member_vehicles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "plate" TEXT,
    "cylinderCc" INTEGER,
    "color" TEXT,
    "year" INTEGER,
    "isMain" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "description" TEXT,
    "observation" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "RideStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_meeting_points" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_meeting_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_images" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageKey" TEXT,
    "imageMime" TEXT,
    "imageSize" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_participants" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RideParticipantStatus" NOT NULL DEFAULT 'GOING',
    "confirmedAt" TIMESTAMP(3),
    "confirmationCanceledAt" TIMESTAMP(3),
    "arrivedHomeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_reviews" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_review_tags" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_review_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_vehicles_companyId_idx" ON "member_vehicles"("companyId");

-- CreateIndex
CREATE INDEX "member_vehicles_userId_idx" ON "member_vehicles"("userId");

-- CreateIndex
CREATE INDEX "member_vehicles_companyId_userId_isActive_idx" ON "member_vehicles"("companyId", "userId", "isActive");

-- CreateIndex
CREATE INDEX "rides_companyId_idx" ON "rides"("companyId");

-- CreateIndex
CREATE INDEX "rides_startsAt_idx" ON "rides"("startsAt");

-- CreateIndex
CREATE INDEX "rides_status_idx" ON "rides"("status");

-- CreateIndex
CREATE INDEX "rides_companyId_status_idx" ON "rides"("companyId", "status");

-- CreateIndex
CREATE INDEX "rides_companyId_startsAt_idx" ON "rides"("companyId", "startsAt");

-- CreateIndex
CREATE INDEX "ride_meeting_points_rideId_idx" ON "ride_meeting_points"("rideId");

-- CreateIndex
CREATE INDEX "ride_meeting_points_rideId_order_idx" ON "ride_meeting_points"("rideId", "order");

-- CreateIndex
CREATE INDEX "ride_images_rideId_idx" ON "ride_images"("rideId");

-- CreateIndex
CREATE INDEX "ride_images_rideId_order_idx" ON "ride_images"("rideId", "order");

-- CreateIndex
CREATE INDEX "ride_participants_rideId_idx" ON "ride_participants"("rideId");

-- CreateIndex
CREATE INDEX "ride_participants_userId_idx" ON "ride_participants"("userId");

-- CreateIndex
CREATE INDEX "ride_participants_status_idx" ON "ride_participants"("status");

-- CreateIndex
CREATE INDEX "ride_participants_arrivedHomeAt_idx" ON "ride_participants"("arrivedHomeAt");

-- CreateIndex
CREATE UNIQUE INDEX "ride_participants_rideId_userId_key" ON "ride_participants"("rideId", "userId");

-- CreateIndex
CREATE INDEX "ride_reviews_companyId_idx" ON "ride_reviews"("companyId");

-- CreateIndex
CREATE INDEX "ride_reviews_clientId_idx" ON "ride_reviews"("clientId");

-- CreateIndex
CREATE INDEX "ride_reviews_rideId_idx" ON "ride_reviews"("rideId");

-- CreateIndex
CREATE UNIQUE INDEX "ride_reviews_rideId_clientId_key" ON "ride_reviews"("rideId", "clientId");

-- CreateIndex
CREATE INDEX "ride_review_tags_tagId_idx" ON "ride_review_tags"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ride_review_tags_reviewId_tagId_key" ON "ride_review_tags"("reviewId", "tagId");

-- CreateIndex
CREATE INDEX "card_machines_companyId_isActive_idx" ON "card_machines"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "card_machines_companyId_name_key" ON "card_machines"("companyId", "name");

-- CreateIndex
CREATE INDEX "faq_events_whatsappSessionId_idx" ON "faq_events"("whatsappSessionId");

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_vehicles" ADD CONSTRAINT "member_vehicles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_vehicles" ADD CONSTRAINT "member_vehicles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_meeting_points" ADD CONSTRAINT "ride_meeting_points_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_images" ADD CONSTRAINT "ride_images_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_participants" ADD CONSTRAINT "ride_participants_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_participants" ADD CONSTRAINT "ride_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_reviews" ADD CONSTRAINT "ride_reviews_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_reviews" ADD CONSTRAINT "ride_reviews_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_reviews" ADD CONSTRAINT "ride_reviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_review_tags" ADD CONSTRAINT "ride_review_tags_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ride_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_review_tags" ADD CONSTRAINT "ride_review_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "review_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_access" ADD CONSTRAINT "admin_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_notifications" ADD CONSTRAINT "app_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;