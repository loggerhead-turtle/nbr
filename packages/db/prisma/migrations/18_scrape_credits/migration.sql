-- Compensation tracking for game-scraper staff: one credit per team added, and
-- payouts an admin records.
CREATE TABLE "ScrapeCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "gcTeamId" TEXT,
    "rateCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScrapeCredit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScrapeCredit_teamId_key" ON "ScrapeCredit"("teamId");
CREATE INDEX "ScrapeCredit_userId_createdAt_idx" ON "ScrapeCredit"("userId", "createdAt");

CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "teamsCount" INTEGER NOT NULL DEFAULT 0,
    "paidThrough" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Payout_userId_createdAt_idx" ON "Payout"("userId", "createdAt");

ALTER TABLE "ScrapeCredit" ADD CONSTRAINT "ScrapeCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrapeCredit" ADD CONSTRAINT "ScrapeCredit_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
