-- Tournament director ↔ coach conversation threads: per-side read state + sharing, and messages.
ALTER TABLE "TournamentInvite" ADD COLUMN "directorReadAt" TIMESTAMP(3);
ALTER TABLE "TournamentInvite" ADD COLUMN "teamReadAt" TIMESTAMP(3);
ALTER TABLE "TournamentInvite" ADD COLUMN "directorShareEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TournamentInvite" ADD COLUMN "directorSharePhone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TournamentInvite" ADD COLUMN "teamShareEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TournamentInvite" ADD COLUMN "teamSharePhone" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TournamentMessage" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TournamentMessage_inviteId_createdAt_idx" ON "TournamentMessage"("inviteId", "createdAt");
ALTER TABLE "TournamentMessage" ADD CONSTRAINT "TournamentMessage_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "TournamentInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
