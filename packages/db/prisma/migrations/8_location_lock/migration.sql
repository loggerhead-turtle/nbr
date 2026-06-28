-- Admin-controlled location lock: when set, the scraper won't overwrite the
-- team's city/coordinates and geocoding is skipped.
ALTER TABLE "Team" ADD COLUMN "locationLocked" BOOLEAN NOT NULL DEFAULT false;
