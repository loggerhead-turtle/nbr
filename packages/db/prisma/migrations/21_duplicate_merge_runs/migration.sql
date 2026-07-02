-- DuplicateMergeRun: a background duplicate-backlog merge, driven by the worker.
-- Records the confidence threshold and how many pairs were merged so an admin can
-- watch progress and audit the result on the Duplicates backlog page.
CREATE TABLE "DuplicateMergeRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "minConfidence" INTEGER NOT NULL,
    "merged" INTEGER NOT NULL DEFAULT 0,
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    CONSTRAINT "DuplicateMergeRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DuplicateMergeRun_startedAt_idx" ON "DuplicateMergeRun"("startedAt");

-- DuplicateMergeLog: one folded-in duplicate (which record merged into which).
CREATE TABLE "DuplicateMergeLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keptTeamId" TEXT,
    "keptName" TEXT NOT NULL,
    "mergedName" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "gamesMoved" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DuplicateMergeLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DuplicateMergeLog_runId_mergedAt_idx" ON "DuplicateMergeLog"("runId", "mergedAt");

ALTER TABLE "DuplicateMergeLog" ADD CONSTRAINT "DuplicateMergeLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DuplicateMergeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
