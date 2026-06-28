-- Scrimmage requests between claimed teams.
CREATE TABLE "ScrimmageRequest" (
    "id" TEXT NOT NULL,
    "fromTeamId" TEXT NOT NULL,
    "toTeamId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScrimmageRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScrimmageRequest_toTeamId_status_idx" ON "ScrimmageRequest"("toTeamId", "status");
CREATE INDEX "ScrimmageRequest_fromTeamId_idx" ON "ScrimmageRequest"("fromTeamId");
