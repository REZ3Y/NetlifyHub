-- CreateTable
CREATE TABLE "NetlifyLinkedSiteNote" (
    "id" TEXT NOT NULL,
    "linkedAccountId" TEXT NOT NULL,
    "netlifySiteId" TEXT NOT NULL,
    "note" VARCHAR(512) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetlifyLinkedSiteNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NetlifyLinkedSiteNote_linkedAccountId_netlifySiteId_key" ON "NetlifyLinkedSiteNote"("linkedAccountId", "netlifySiteId");

-- CreateIndex
CREATE INDEX "NetlifyLinkedSiteNote_linkedAccountId_idx" ON "NetlifyLinkedSiteNote"("linkedAccountId");

-- AddForeignKey
ALTER TABLE "NetlifyLinkedSiteNote" ADD CONSTRAINT "NetlifyLinkedSiteNote_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "NetlifyLinkedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
