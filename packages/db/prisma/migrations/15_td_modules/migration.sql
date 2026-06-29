-- Tournament Director module: divisions, payments, fields, scheduling,
-- umpires, and bracket advancement rules.

-- Tournament logistics + status + payment + scheduling config.
ALTER TABLE "Tournament" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Tournament" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "Tournament" ADD COLUMN "location" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "entryFee" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN "depositAmount" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN "poolPlayGames" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Tournament" ADD COLUMN "allowCrossover" BOOLEAN NOT NULL DEFAULT false;

-- Invite gains a division and a payment/roster standing.
ALTER TABLE "TournamentInvite" ADD COLUMN "divisionId" TEXT;
ALTER TABLE "TournamentInvite" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'PENCILED';

-- Divisions (age group at an NBR level).
CREATE TABLE "TournamentDivision" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "ageGroup" "AgeGroup" NOT NULL,
    "nbrLevel" TEXT NOT NULL DEFAULT 'NBR I',
    "nbrMin" INTEGER,
    "nbrMax" INTEGER,
    "poolsJson" JSONB,
    "bracketJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentDivision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TournamentDivision_tournamentId_idx" ON "TournamentDivision"("tournamentId");

-- Fields.
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasLights" BOOLEAN NOT NULL DEFAULT false,
    "allowedAgeGroups" "AgeGroup"[] DEFAULT ARRAY[]::"AgeGroup"[],
    "privateNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Field_tournamentId_idx" ON "Field"("tournamentId");

-- Umpires.
CREATE TABLE "Umpire" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "ageGroups" "AgeGroup"[] DEFAULT ARRAY[]::"AgeGroup"[],
    "available" BOOLEAN NOT NULL DEFAULT true,
    "willUmpireScrimmages" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Umpire_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Umpire_userId_key" ON "Umpire"("userId");

-- TD-only umpire evaluation notes.
CREATE TABLE "UmpireNote" (
    "id" TEXT NOT NULL,
    "umpireId" TEXT NOT NULL,
    "directorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UmpireNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UmpireNote_umpireId_createdAt_idx" ON "UmpireNote"("umpireId", "createdAt");

-- Future release: confidential coach -> umpire feedback.
CREATE TABLE "UmpireFeedback" (
    "id" TEXT NOT NULL,
    "umpireId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "likert" INTEGER NOT NULL,
    "comment" TEXT,
    "confidential" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UmpireFeedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UmpireFeedback_umpireId_idx" ON "UmpireFeedback"("umpireId");

-- Scheduled games.
CREATE TABLE "ScheduleGame" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "poolLabel" TEXT,
    "fieldId" TEXT,
    "slotLabel" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "isCrossover" BOOLEAN NOT NULL DEFAULT false,
    "umpireId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleGame_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScheduleGame_tournamentId_idx" ON "ScheduleGame"("tournamentId");
CREATE INDEX "ScheduleGame_divisionId_idx" ON "ScheduleGame"("divisionId");

-- Advancement rules (one per division).
CREATE TABLE "AdvancementRule" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "presetKey" TEXT,
    "name" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL,
    "poolWinnersAdvance" INTEGER NOT NULL DEFAULT 1,
    "wildcards" INTEGER NOT NULL DEFAULT 0,
    "seedBy" TEXT NOT NULL DEFAULT 'POOL_RECORD',
    "reseed" BOOLEAN NOT NULL DEFAULT true,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "AdvancementRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdvancementRule_divisionId_key" ON "AdvancementRule"("divisionId");

-- Foreign keys.
ALTER TABLE "TournamentDivision" ADD CONSTRAINT "TournamentDivision_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentInvite" ADD CONSTRAINT "TournamentInvite_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "TournamentDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Field" ADD CONSTRAINT "Field_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Umpire" ADD CONSTRAINT "Umpire_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UmpireNote" ADD CONSTRAINT "UmpireNote_umpireId_fkey" FOREIGN KEY ("umpireId") REFERENCES "Umpire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UmpireFeedback" ADD CONSTRAINT "UmpireFeedback_umpireId_fkey" FOREIGN KEY ("umpireId") REFERENCES "Umpire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleGame" ADD CONSTRAINT "ScheduleGame_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleGame" ADD CONSTRAINT "ScheduleGame_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "TournamentDivision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleGame" ADD CONSTRAINT "ScheduleGame_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleGame" ADD CONSTRAINT "ScheduleGame_umpireId_fkey" FOREIGN KEY ("umpireId") REFERENCES "Umpire"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdvancementRule" ADD CONSTRAINT "AdvancementRule_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "TournamentDivision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
