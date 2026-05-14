-- AlterTable
ALTER TABLE "User" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "NetlifyLinkedAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "netlifyId" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "fullName" TEXT,
    "avatarUrl" TEXT,
    "email" TEXT,
    "affiliateId" TEXT,
    "siteCount" INTEGER NOT NULL DEFAULT 0,
    "netlifyCreatedAt" TEXT,
    "netlifyLastLogin" TEXT,
    "tokenEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetlifyLinkedAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NetlifyLinkedAccount_userId_netlifyId_key" ON "NetlifyLinkedAccount"("userId", "netlifyId");

CREATE INDEX "NetlifyLinkedAccount_userId_idx" ON "NetlifyLinkedAccount"("userId");

ALTER TABLE "NetlifyLinkedAccount" ADD CONSTRAINT "NetlifyLinkedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
