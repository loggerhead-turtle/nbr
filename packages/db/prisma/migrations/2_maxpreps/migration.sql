-- High-school varsity support: classification (1A..6A) and MaxPreps team URL.
ALTER TABLE "Team" ADD COLUMN "classification" TEXT;
ALTER TABLE "Team" ADD COLUMN "maxprepsUrl" TEXT;
CREATE UNIQUE INDEX "Team_maxprepsUrl_key" ON "Team"("maxprepsUrl");
CREATE INDEX "Team_classification_idx" ON "Team"("classification");
