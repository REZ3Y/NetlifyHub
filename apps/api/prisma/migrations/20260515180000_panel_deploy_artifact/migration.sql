-- CreateTable
CREATE TABLE "PanelDeployArtifact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanelDeployArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PanelDeployArtifact_userId_createdAt_idx" ON "PanelDeployArtifact"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PanelDeployArtifact" ADD CONSTRAINT "PanelDeployArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
