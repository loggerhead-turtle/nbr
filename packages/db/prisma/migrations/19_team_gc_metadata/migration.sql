-- Capture GameChanger header metadata: the team's season label (e.g. "Spring
-- 2026") and stated W-L record. Per-game GameChanger UUIDs use the existing
-- Game.gcGameId column.
ALTER TABLE "Team" ADD COLUMN "gcSeason" TEXT;
ALTER TABLE "Team" ADD COLUMN "gcRecord" TEXT;
