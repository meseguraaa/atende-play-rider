/*
  Warnings:

  - You are about to drop the `client_addresses` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "client_addresses" DROP CONSTRAINT "client_addresses_clientId_fkey";

-- DropForeignKey
ALTER TABLE "client_addresses" DROP CONSTRAINT "client_addresses_companyId_fkey";

-- DropTable
DROP TABLE "client_addresses";
