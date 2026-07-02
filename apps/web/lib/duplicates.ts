/**
 * Duplicate-detection engine — moved to @nbr/db so both the web admin pages and
 * the worker (background backlog merge) share one implementation. This barrel
 * keeps the existing "@/lib/duplicates" import path working.
 */
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
} from "@nbr/db";
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
} from "@nbr/db";
