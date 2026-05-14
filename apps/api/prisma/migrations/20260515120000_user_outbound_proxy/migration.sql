-- AlterTable
ALTER TABLE "User" ADD COLUMN     "proxyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "proxyType" TEXT,
ADD COLUMN "proxyHost" TEXT,
ADD COLUMN "proxyPort" INTEGER,
ADD COLUMN "proxyUsername" TEXT,
ADD COLUMN "proxyPasswordEncrypted" TEXT;
