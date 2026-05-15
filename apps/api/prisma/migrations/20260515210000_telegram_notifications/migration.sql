-- CreateEnum
CREATE TYPE "TelegramNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "TelegramNotificationSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "botTokenEncrypted" TEXT,
    "proxyUserId" TEXT,
    "recipientChatIdsJson" TEXT NOT NULL DEFAULT '[]',
    "bandwidthThresholdPercent" INTEGER NOT NULL DEFAULT 80,
    "creditThresholdPercent" INTEGER NOT NULL DEFAULT 80,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramNotificationLog" (
    "id" TEXT NOT NULL,
    "status" "TelegramNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT NOT NULL,
    "recipientsJson" TEXT NOT NULL,
    "linkedAccountId" TEXT,
    "accountLabel" TEXT,
    "teamSlug" TEXT,
    "quotaKind" VARCHAR(32),
    "usedPercent" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramNotificationLog_createdAt_idx" ON "TelegramNotificationLog"("createdAt");

-- CreateIndex
CREATE INDEX "TelegramNotificationLog_linkedAccountId_createdAt_idx" ON "TelegramNotificationLog"("linkedAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "TelegramNotificationSettings" ADD CONSTRAINT "TelegramNotificationSettings_proxyUserId_fkey" FOREIGN KEY ("proxyUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Default singleton row
INSERT INTO "TelegramNotificationSettings" ("id", "enabled", "recipientChatIdsJson", "bandwidthThresholdPercent", "creditThresholdPercent", "updatedAt")
VALUES ('singleton', false, '[]', 80, 80, CURRENT_TIMESTAMP);
