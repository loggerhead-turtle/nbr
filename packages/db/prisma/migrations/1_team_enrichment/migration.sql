-- Add enrichment flag: team quick-added by GameChanger ID, name/details filled
-- in by the scraper on first run.
ALTER TABLE "Team" ADD COLUMN "needsEnrichment" BOOLEAN NOT NULL DEFAULT false;
