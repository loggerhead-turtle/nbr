-- Remember admin "don't merge" decisions so dismissed pairs don't resurface.
CREATE TABLE "DuplicateDismissal" (
    "id" TEXT NOT NULL,
    "teamIdA" TEXT NOT NULL,
    "teamIdB" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DuplicateDismissal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DuplicateDismissal_teamIdA_teamIdB_key" ON "DuplicateDismissal"("teamIdA", "teamIdB");
