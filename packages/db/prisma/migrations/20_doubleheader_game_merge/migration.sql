-- Game.sourceTeamId: the team whose scrape produced this row. Distinguishes a
-- real doubleheader (two legs from the same team's schedule) from a cross-team
-- duplicate (one game on both schedules), which are otherwise identical by
-- opponent + day + score. Null for manual entries and pre-existing rows.
ALTER TABLE "Game" ADD COLUMN "sourceTeamId" TEXT;

-- GameMergeCandidate: a same-day matchup where the two teams' schedules disagree
-- on the number of games played, parked for admin review on the Game merge queue
-- rather than auto-collapsed (would drop a real game) or sent to team Duplicates
-- (would falsely suggest the records are the same team).
CREATE TABLE "GameMergeCandidate" (
    "id" TEXT NOT NULL,
    "teamIdA" TEXT NOT NULL,
    "teamIdB" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "countA" INTEGER NOT NULL,
    "countB" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameMergeCandidate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GameMergeCandidate_teamIdA_teamIdB_day_key" ON "GameMergeCandidate"("teamIdA", "teamIdB", "day");
CREATE INDEX "GameMergeCandidate_status_idx" ON "GameMergeCandidate"("status");
