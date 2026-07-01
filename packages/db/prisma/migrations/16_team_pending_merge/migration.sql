-- Team.pendingMerge: set when a team has a confident, un-dismissed ghost match
-- awaiting review on the Merge queue (drives the public "Verifying" badge).
-- Cleared when the match is approved (merged) or dismissed.
ALTER TABLE "Team" ADD COLUMN "pendingMerge" BOOLEAN NOT NULL DEFAULT false;
