-- Coaching staff parsed from each team's own GameChanger page header
-- ("Staff: Coach A, Coach B, ..."). Used as a merge-confidence signal:
-- two teams with the same name AND a shared coach are very likely one club.
ALTER TABLE "Team" ADD COLUMN "coaches" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
