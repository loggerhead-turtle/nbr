-- Cross-season succession + season config.
ALTER TABLE "Team" ADD COLUMN "seasonYear" INTEGER;
ALTER TABLE "Team" ADD COLUMN "predecessorTeamId" TEXT;
CREATE UNIQUE INDEX "Team_predecessorTeamId_key" ON "Team"("predecessorTeamId");
ALTER TABLE "Team" ADD CONSTRAINT "Team_predecessorTeamId_fkey" FOREIGN KEY ("predecessorTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
