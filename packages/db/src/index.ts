import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads / serverless invocations to
// avoid exhausting the connection pool.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export { Prisma } from "@prisma/client";
export {
  findPromotableTeam,
  findAutoMergeTarget,
  mergeTeams,
  dedupeTeamGames,
  dedupeAllGames,
  mergeDuplicateGhosts,
  findCrossAgeMergeArtifacts,
  repairCrossAgeMerge,
  getGhostTeamsWithSuggestions,
  countGhostTeams,
  findExactNameGhostMatches,
  countExactNameGhostMatches,
  deleteExactNameGhosts,
  countOrphanGhosts,
  deleteOrphanGhosts,
  getGhostSplitGroups,
  reassignTeamGames,
  getGhostDetail,
  getGhostMergeQueue,
  deleteTbdTeams,
  refreshTeamPendingMerge,
  getLookupTeams,
  getLookupStates,
  getUnverifiedOpponents,
  GHOST_MERGE_DISMISSALS_KEY,
} from "./teams";
export type {
  BadMergeFinding,
  BadMergeOutlier,
  AutoMergeTarget,
  GhostTeamWithSuggestions,
  GhostMergeSuggestion,
  ExactGhostMatch,
  SharedGameRow,
  GhostSplitGame,
  GhostSplitGroup,
  GhostGameOrigin,
  GhostDetail,
  GhostMergeQueueItem,
  GhostMergeQueueGhost,
  GhostMergeQueueTarget,
  LookupTeam,
  UnverifiedOpponent,
  TeamOpponentsView,
} from "./teams";
export {
  SCRAPE_RATE_KEY,
  SCRAPE_GOALS_KEY,
  getScrapePayRateCents,
  setScrapePayRateCents,
  getScrapeGoals,
  setScrapeGoals,
  recordScrapeCredits,
  getScraperStats,
  getScraperLeaderboard,
  recordPayout,
} from "./scrape-credits";
export type {
  ScrapeGoals,
  PeriodStat,
  ScraperStats,
  LeaderboardRow,
  PayoutResult,
} from "./scrape-credits";
export {
  getOpenGameMergeCandidates,
  countOpenGameMergeCandidates,
  resolveGameMergeCandidate,
} from "./game-merge";
export type {
  GameMergeCandidateView,
  GameMergeSide,
  GameMergeStoredGame,
  GameMergeResolution,
} from "./game-merge";
export {
  countDuplicateCandidates,
  getDuplicateAuditSummary,
  mergeConfidenceFrom,
  pairMeetsThreshold,
  getDuplicateMergesAtLeast,
  getDuplicateCandidates,
  createDuplicateMergeRun,
  finishDuplicateMergeRun,
  getRecentDuplicateMergeRuns,
  getDuplicateMergeLogs,
  mergeDuplicateBacklog,
} from "./duplicates";
export type {
  DuplicateAuditSummary,
  DupGame,
  SharedGame,
  DupTeam,
  DupOverlap,
  DupRecommendation,
  DupPair,
  MergeConfidence,
  DuplicateQuery,
  DuplicateMergeRunView,
  DuplicateMergeLogView,
} from "./duplicates";
