-- CreateTable
CREATE TABLE "PanelSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "netlifyCacheTtlMinutes" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanelSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PanelSettings" ("id", "netlifyCacheTtlMinutes", "updatedAt")
VALUES ('singleton', 30, CURRENT_TIMESTAMP);
