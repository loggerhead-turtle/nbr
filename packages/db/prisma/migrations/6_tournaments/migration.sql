-- Tournament directors + tournaments + invites.
ALTER TABLE "User" ADD COLUMN "tdStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "User" ADD COLUMN "tdOrg" TEXT;
ALTER TABLE "User" ADD COLUMN "tdWebsite" TEXT;
ALTER TABLE "User" ADD COLUMN "tdTournamentName" TEXT;
ALTER TABLE "User" ADD COLUMN "tdRequestedAt" TIMESTAMP(3);

CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "directorUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Tournament_directorUserId_idx" ON "Tournament"("directorUserId");

CREATE TABLE "TournamentInvite" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TournamentInvite_tournamentId_teamId_key" ON "TournamentInvite"("tournamentId", "teamId");
CREATE INDEX "TournamentInvite_teamId_status_idx" ON "TournamentInvite"("teamId", "status");

ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_directorUserId_fkey" FOREIGN KEY ("directorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentInvite" ADD CONSTRAINT "TournamentInvite_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentInvite" ADD CONSTRAINT "TournamentInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
