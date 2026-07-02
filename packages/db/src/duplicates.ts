import { prisma } from "./index";
import { scoreMerge, normalizeTeamName, ageGroupFromName, type MergeScore } from "@nbr/core";
import { mergeTeams } from "./teams";

/**
 * Normalization for duplicate detection. Unlike the scraper's opponent-matching
 * normalizer, this KEEPS age tokens so "Utah 12U" and "Utah 13U" aren't treated
 * as the same team.
 */
function dupNorm(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Detect likely-duplicate teams using three signals:
 *  1. exact normalized-name match (ghost vs added team),
 *  2. fuzzy name similarity (e.g. "Cannons Baseball 14U" vs "Cannons Black 14U"),
 *  3. two or more shared games (same opponent + same date) — near-proof it's the
 *     same team, since two distinct teams won't share multiple exact matchups.
 * "Don't merge" decisions are remembered in DuplicateDismissal.
 */

function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Numeric age from an AgeGroup value or name token ("U11" → 11), else null. */
function ageNumOf(a: string | null | undefined): number | null {
  const m = a?.match(/\d{1,2}/);
  return m ? Number(m[0]) : null;
}

/**
 * One pass over teams + games to find candidate duplicate pairs and how many
 * identical matchups each pair shares (the strongest evidence). Shared by the
 * review page, the nav badge count, and the audit summary.
 */
async function scanCandidates() {
  const [teams, games, dismissals] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true, ageGroup: true, city: true, state: true } }),
    prisma.game.findMany({
      where: { status: "FINAL", homeScore: { not: null }, awayScore: { not: null } },
      select: { homeTeamId: true, awayTeamId: true, playedAt: true, homeScore: true, awayScore: true },
    }),
    prisma.duplicateDismissal.findMany({ select: { teamIdA: true, teamIdB: true } }),
  ]);
  const dismissed = new Set(dismissals.map((d) => `${d.teamIdA}|${d.teamIdB}`));
  const norm = new Map(teams.map((t) => [t.id, dupNorm(t.name)] as const));
  // Shared-game matching keys on the opponent's normalized NAME (age stripped)
  // rather than its row id. In a name-collision mess the opponents are duplicated
  // too, so the SAME real game scraped onto two "Utah Legends" rows points at two
  // different "Slammers" rows — id matching would see zero shared games. Matching
  // by name + date + score finds it.
  const oppName = new Map(teams.map((t) => [t.id, normalizeTeamName(t.name)] as const));

  const pairScores = new Map<string, number>(); // pairKey "a|b" -> identical-matchup count
  const bump = (x: string, y: string) => {
    const [a, b] = pairKey(x, y);
    const k = `${a}|${b}`;
    pairScores.set(k, (pairScores.get(k) ?? 0) + 1);
  };

  // Two RECORDS of the SAME team have identical games. Group by a per-team
  // matchup signature (opponent + date + that team's score line). Teams sharing
  // the exact same matchup line are likely the same team — NOT merely teams that
  // both played a common opponent (that would falsely pair tournament rivals).
  const matchup = new Map<string, string[]>();
  const add = (key: string, teamId: string) => {
    (matchup.get(key) ?? matchup.set(key, []).get(key)!).push(teamId);
  };
  for (const g of games) {
    const day = g.playedAt.toISOString().slice(0, 10);
    const home = oppName.get(g.homeTeamId) ?? "";
    const away = oppName.get(g.awayTeamId) ?? "";
    // Key on opponent name + date only (NOT score), so the same game still groups
    // two rows even when one recorded a slightly different score.
    add(`${away}|${day}`, g.homeTeamId);
    add(`${home}|${day}`, g.awayTeamId);
  }
  for (const bucket of matchup.values()) {
    const uniq = [...new Set(bucket)];
    for (let i = 0; i < uniq.length; i++)
      for (let j = i + 1; j < uniq.length; j++) bump(uniq[i]!, uniq[j]!);
  }

  // Age per team (column, else from the name) for the same-age gate below.
  const ageOf = new Map(
    teams.map((t) => [t.id, ageNumOf(t.ageGroup ?? ageGroupFromName(t.name))] as const),
  );
  // Same age, or one side's age unknown. Different stated ages are never a
  // duplicate (that's contamination — handled on the Bad merges page), so they
  // never become candidates here.
  const ageCompatible = (a: string, b: string): boolean => {
    const x = ageOf.get(a) ?? null;
    const y = ageOf.get(b) ?? null;
    return x == null || y == null || x === y;
  };

  // State per team — but only TRUST it when the team has a city (a located, real
  // team). Ghosts and quick-added stubs default to "UT" with no city, so their
  // state is "unknown" and stays compatible with anything (so a ghost still pairs
  // with its real out-of-state twin). Two teams that BOTH have a city in DIFFERENT
  // states are different clubs — a same-name collision, not a duplicate. This is
  // what stops "Stars 12U" in NV/CA/TX from being flagged as duplicates of each
  // other (the combinatorial blow-up after adding out-of-state teams).
  const stateOf = new Map(
    teams.map((t) => [t.id, t.city && t.state ? t.state.toUpperCase() : null] as const),
  );
  const stateCompatible = (a: string, b: string): boolean => {
    const x = stateOf.get(a) ?? null;
    const y = stateOf.get(b) ?? null;
    return x == null || y == null || x === y;
  };

  const candidates = new Set<string>();

  // Signal 1: exact same normalized name (age token kept) — the real team + a
  // ghost twin. Group by full normalized name; every pair in a group is an exact
  // match. (Fuzzy "looks similar" name matching is intentionally dropped — it
  // flagged thousands of distinct same-prefix teams as duplicates.)
  const byNorm = new Map<string, string[]>();
  for (const t of teams) {
    const n = norm.get(t.id) ?? "";
    if (n) (byNorm.get(n) ?? byNorm.set(n, []).get(n)!).push(t.id);
  }
  for (const ids of byNorm.values()) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        if (ageCompatible(ids[i]!, ids[j]!) && stateCompatible(ids[i]!, ids[j]!))
          candidates.add(pairKey(ids[i]!, ids[j]!).join("|"));
  }

  // Signal 2: 3+ games against the same opponent on the same date — near-proof of
  // the same team (scores checked for closeness later). Same-age only; NOT state-
  // gated on purpose — sharing 3+ exact matchups means it's the same team even if
  // a state is mislabeled.
  for (const [k, score] of pairScores) {
    if (score < 3) continue;
    const [a, b] = k.split("|") as [string, string];
    if (ageCompatible(a, b)) candidates.add(k);
  }

  return { candidates, pairScores, dismissed };
}

/** AppSetting key holding a JSON map of pairKey → ISO "snoozed until" timestamp. */
const SNOOZE_KEY = "duplicateSnoozes";

/** Pairs the admin snoozed ("revisit later") that are still within their window. */
async function getActiveSnoozes(): Promise<Set<string>> {
  const active = new Set<string>();
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SNOOZE_KEY } });
    if (!row?.value) return active;
    const map = JSON.parse(row.value) as Record<string, string>;
    const now = Date.now();
    for (const [k, until] of Object.entries(map)) {
      if (new Date(until).getTime() > now) active.add(k);
    }
  } catch {
    // ignore — snoozes are best-effort
  }
  return active;
}

/**
 * Candidate pairs (ids only), strongest evidence first, with dismissed and
 * still-snoozed pairs removed. Shared by the nav badge and the review page.
 */
async function getCandidatePairs(): Promise<[string, string][]> {
  const [{ candidates, pairScores, dismissed }, snoozed] = await Promise.all([
    scanCandidates(),
    getActiveSnoozes(),
  ]);
  // Order by identical-matchup count (strongest "same team" evidence) first, so
  // the page's top-N cap keeps the most certain duplicates rather than whichever
  // happened to hash first.
  return [...candidates]
    .filter((k) => !dismissed.has(k) && !snoozed.has(k))
    .sort((x, y) => (pairScores.get(y) ?? 0) - (pairScores.get(x) ?? 0))
    .map((k) => k.split("|") as [string, string]);
}

export async function countDuplicateCandidates(): Promise<number> {
  try {
    return (await getCandidatePairs()).length;
  } catch {
    return 0;
  }
}

export interface DuplicateAuditSummary {
  /** Active (not dismissed, not snoozed) candidate pairs. */
  totalPairs: number;
  /** Pairs sharing 2+ identical matchups — near-certain duplicates. */
  nearCertain: number;
  /** Pairs sharing exactly one identical matchup. */
  oneShared: number;
  /** Pairs flagged by name/region similarity only (no identical shared game). */
  nameOnly: number;
  /** Pairs currently snoozed for later. */
  snoozed: number;
}

/**
 * Blast-radius numbers for the audit page. Computed from a single scan (no
 * per-pair game loads) so it stays cheap even with thousands of pairs.
 */
export async function getDuplicateAuditSummary(): Promise<DuplicateAuditSummary> {
  const [{ candidates, pairScores, dismissed }, snoozed] = await Promise.all([
    scanCandidates(),
    getActiveSnoozes(),
  ]);
  const summary: DuplicateAuditSummary = {
    totalPairs: 0,
    nearCertain: 0,
    oneShared: 0,
    nameOnly: 0,
    snoozed: 0,
  };
  for (const k of candidates) {
    if (dismissed.has(k)) continue;
    if (snoozed.has(k)) {
      summary.snoozed += 1;
      continue;
    }
    summary.totalPairs += 1;
    const s = pairScores.get(k) ?? 0;
    if (s >= 2) summary.nearCertain += 1;
    else if (s === 1) summary.oneShared += 1;
    else summary.nameOnly += 1;
  }
  return summary;
}

export interface DupGame {
  opponent: string;
  date: string;
  us: number | null;
  them: number | null;
}

export interface SharedGame {
  opponent: string;
  date: string;
  aUs: number | null;
  aThem: number | null;
  bUs: number | null;
  bThem: number | null;
  /** Scores identical on both rows. */
  scoresMatch: boolean;
  /** Scores within a small tolerance (allows for scoring typos). Includes exact. */
  scoresClose: boolean;
}

/** Two score lines are "close" if they differ by at most this many total runs. */
const SCORE_TOLERANCE = 2;

function scoresWithinTolerance(
  aUs: number | null,
  aThem: number | null,
  bUs: number | null,
  bThem: number | null,
): boolean {
  if (aUs == null || aThem == null || bUs == null || bThem == null) return false;
  return Math.abs(aUs - bUs) + Math.abs(aThem - bThem) <= SCORE_TOLERANCE;
}

export interface DupTeam {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  ageGroup: string | null;
  classification: string | null;
  gcTeamId: string | null;
  isGhost: boolean;
  coaches: string[];
  totalGames: number;
  games: DupGame[];
  /** States of game-graph neighbours — a locality proxy when city is unknown. */
  regionStates: string[];
}

/** How the two rows' game sets overlap — the human-checkable evidence. */
export interface DupOverlap {
  /** Same opponent + date + identical score on both rows (strongest proof). */
  exact: number;
  /** Same opponent + date with scores within tolerance (includes exact). */
  close: number;
  /** Same opponent + date but the score differs beyond tolerance. */
  diffScore: number;
  /** Games only the kept row (a) has. */
  uniqueA: number;
  /** Games only the other row (b) has. */
  uniqueB: number;
}

/**
 * What to do with the pair. "delete-safe" means b's games are entirely a subset
 * of a's, so deleting b loses nothing; "merge" means each row has games the other
 * lacks (merge combines them); "review" means the evidence is too thin to act
 * one-click.
 */
export type DupRecommendation =
  | { kind: "delete-safe"; deleteId: string; note: string }
  | { kind: "merge"; note: string }
  | { kind: "review"; note: string }
  /** Different stated ages — can't be a duplicate; shared games mean a bad merge. */
  | { kind: "different-age"; note: string };

export interface DupPair {
  a: DupTeam;
  b: DupTeam;
  commonGames: SharedGame[];
  /** Name/age/location/coach match score (the heat-map bar). */
  confidence: MergeScore;
  overlap: DupOverlap;
  recommendation: DupRecommendation;
  /**
   * Merge confidence as a percentage, driven by how cleanly the folded (ghost)
   * record's games line up with the kept (verified) one. null when disqualified
   * (different ages — never a duplicate). This is what the bulk-merge threshold
   * compares against.
   */
  mergeConfidence: number | null;
  /** Plain-English deductions explaining any drop below 100%. Empty at 100%. */
  mergeReasons: string[];
}

export interface MergeConfidence {
  /** 0–100, or null when the pair is disqualified (never a duplicate). */
  pct: number | null;
  /** Why it's below 100% (empty when a clean 100%). */
  reasons: string[];
}

/**
 * Compute merge confidence from the game overlap between the kept (verified)
 * record and the folded (ghost) record `b`:
 *  - 100 when every ghost game is on the verified team with an identical score;
 *  - −1 for each shared game scored only "close" (within a couple runs) or that
 *    differs beyond that (an off-score game is weaker evidence, not proof);
 *  - a ghost game the verified team lacks entirely (wrong date/opponent) is a
 *    bigger problem: the first caps confidence at 70, each additional one another
 *    −10 (60, 50, …). Close-score penalties still apply on top of the cap.
 * Different-age pairs are disqualified and return null.
 */
export function mergeConfidenceFrom(overlap: DupOverlap, disqualified: boolean): MergeConfidence {
  if (disqualified) return { pct: null, reasons: ["Different ages — not the same team."] };

  const closeOnly = Math.max(0, overlap.close - overlap.exact); // within tolerance, not identical
  const scorePenalty = closeOnly + overlap.diffScore; // each off-score shared game costs 1%
  const extra = overlap.uniqueB; // ghost games with no matching verified game
  const cap = extra === 0 ? 100 : Math.max(10, 70 - (extra - 1) * 10);
  const pct = Math.max(0, cap - scorePenalty);

  const reasons: string[] = [];
  if (extra === 1) {
    reasons.push("the duplicate has 1 game the kept team doesn't (wrong date or opponent) — capped at 70%");
  } else if (extra > 1) {
    reasons.push(`the duplicate has ${extra} games the kept team doesn't — capped at ${cap}%`);
  }
  if (closeOnly > 0) {
    reasons.push(`${closeOnly} shared game${closeOnly === 1 ? "" : "s"} scored close but not identical (−${closeOnly}%)`);
  }
  if (overlap.diffScore > 0) {
    reasons.push(`${overlap.diffScore} shared game${overlap.diffScore === 1 ? "" : "s"} scored differently (−${overlap.diffScore}%)`);
  }
  return { pct, reasons };
}

async function loadDupTeam(
  id: string,
): Promise<{ team: DupTeam; byKey: Map<string, DupGame & { oppId: string }> } | null> {
  const t = await prisma.team.findUnique({
    where: { id },
    include: {
      homeGames: { where: { status: "FINAL" }, include: { awayTeam: true }, orderBy: { playedAt: "desc" } },
      awayGames: { where: { status: "FINAL" }, include: { homeTeam: true }, orderBy: { playedAt: "desc" } },
    },
  });
  if (!t) return null;
  const games = [
    ...t.homeGames.map((g) => ({
      opponent: g.awayTeam.name,
      oppId: g.awayTeamId,
      date: g.playedAt.toISOString().slice(0, 10),
      us: g.homeScore,
      them: g.awayScore,
    })),
    ...t.awayGames.map((g) => ({
      opponent: g.homeTeam.name,
      oppId: g.homeTeamId,
      date: g.playedAt.toISOString().slice(0, 10),
      us: g.awayScore,
      them: g.homeScore,
    })),
  ].sort((x, y) => (x.date < y.date ? 1 : -1));

  // Key by normalized opponent NAME + date (not opponent id) so the same real
  // game is matched across duplicated opponent rows.
  const byKey = new Map(
    games.map((g) => [`${normalizeTeamName(g.opponent)}|${g.date}`, g] as const),
  );
  // Locality proxy: states of opponents we actually located (they have a city;
  // ghosts default to "UT" and would otherwise fake a match).
  const regionStates = [
    ...t.homeGames.map((g) => g.awayTeam),
    ...t.awayGames.map((g) => g.homeTeam),
  ]
    .filter((o) => o.city && o.state)
    .map((o) => o.state);
  const team: DupTeam = {
    id: t.id,
    name: t.name,
    slug: t.slug,
    city: t.city,
    state: t.state,
    ageGroup: t.ageGroup,
    classification: t.classification,
    gcTeamId: t.gcTeamId,
    isGhost: t.isGhost,
    coaches: t.coaches ?? [],
    totalGames: games.length,
    games: games.map(({ opponent, date, us, them }) => ({ opponent, date, us, them })),
    regionStates,
  };
  return { team, byKey };
}

/** True when a pair's merge confidence meets the given threshold percentage. */
export function pairMeetsThreshold(p: DupPair, minPct: number): boolean {
  return p.mergeConfidence != null && p.mergeConfidence >= minPct;
}

/**
 * Duplicate candidates whose merge confidence is at least `minPct`, returned in
 * merge orientation (source folds into the kept target), matching the review
 * page's keep/merge choice. Powers the threshold-based bulk merge. `limit` bounds
 * how many candidates are scored per call (same order the review page uses:
 * strongest evidence first) so a single request stays fast even with a large
 * backlog — the caller re-runs to work through the rest.
 */
export async function getDuplicateMergesAtLeast(
  minPct: number,
  limit = 300,
): Promise<{ sourceId: string; targetId: string; confidence: number }[]> {
  const pairs = await getDuplicateCandidates({ limit, scan: limit, minPct });
  return pairs.map((p) => ({ sourceId: p.b.id, targetId: p.a.id, confidence: p.mergeConfidence ?? minPct }));
}

/** Score a single candidate pair into a full DupPair (or null if a team is gone). */
async function buildDupPair(aId: string, bId: string): Promise<DupPair | null> {
  const [ra, rb] = await Promise.all([loadDupTeam(aId), loadDupTeam(bId)]);
  if (!ra || !rb) return null;

  const commonGames: SharedGame[] = [];
  for (const [key, ag] of ra.byKey) {
    const bg = rb.byKey.get(key);
    if (!bg) continue;
    commonGames.push({
      opponent: ag.opponent,
      date: ag.date,
      aUs: ag.us,
      aThem: ag.them,
      bUs: bg.us,
      bThem: bg.them,
      scoresMatch: ag.us === bg.us && ag.them === bg.them,
      scoresClose: scoresWithinTolerance(ag.us, ag.them, bg.us, bg.them),
    });
  }

  const keepA =
    (ra.team.gcTeamId ? 1 : 0) - (rb.team.gcTeamId ? 1 : 0) || ra.team.totalGames - rb.team.totalGames;
  const a = keepA >= 0 ? ra.team : rb.team;
  const b = keepA >= 0 ? rb.team : ra.team;

  // Game-overlap breakdown. commonGames.length = keys present on both rows
  // (same opponent + date); the rest of each row's keys are unique games.
  const exact = commonGames.filter((g) => g.scoresMatch).length;
  const close = commonGames.filter((g) => g.scoresClose).length; // includes exact
  const diffScore = commonGames.length - close;
  const raUnique = ra.byKey.size - commonGames.length;
  const rbUnique = rb.byKey.size - commonGames.length;
  const overlap: DupOverlap = {
    exact,
    close,
    diffScore,
    uniqueA: keepA >= 0 ? raUnique : rbUnique,
    uniqueB: keepA >= 0 ? rbUnique : raUnique,
  };

  const confidence = scoreMerge({
    nameA: a.name,
    nameB: b.name,
    // Fall back to the age stated in the name when the DB column is unset, so a
    // "… 14U" ghost/contaminated row is correctly read as U14 and never looks
    // like a match for a U12. This is what makes the age hard-gate actually fire.
    ageA: a.ageGroup ?? ageGroupFromName(a.name),
    ageB: b.ageGroup ?? ageGroupFromName(b.name),
    cityA: a.city,
    cityB: b.city,
    stateA: a.city ? a.state : null,
    stateB: b.city ? b.state : null,
    coachesA: a.coaches,
    coachesB: b.coaches,
    // Closely-matching games (same opponent + date, score within tolerance) are
    // the "same team" proof, so feed that count to the scorer.
    sharedGameCount: close,
    regionStatesA: a.regionStates,
    regionStatesB: b.regionStates,
  });

  // 3+ closely-matching games (same opponent + date, score within tolerance) is
  // near-proof it's one team — slight score differences are treated as the same
  // game (scoring typos), per the matching spec.
  const strong = close >= 3;
  let recommendation: DupRecommendation;
  if (confidence.disqualified) {
    // Different stated ages can't be the same team. If they nonetheless share
    // games, that's the fingerprint of a bad cross-age merge (one row absorbed
    // the other age's games) — route to the Bad merges page, never merge here.
    recommendation = {
      kind: "different-age",
      note:
        close > 0
          ? "Different ages — NOT a duplicate. The shared games come from a bad cross-age merge; fix it on the Bad merges page, don't merge these."
          : "Different ages — not the same team.",
    };
  } else if (strong && overlap.uniqueB === 0 && b.totalGames > 0) {
    recommendation = {
      kind: "delete-safe",
      deleteId: b.id,
      note: `All ${close} of “${b.name}”’s games are already on “${a.name}” — deleting it loses nothing.`,
    };
  } else if (strong) {
    recommendation = {
      kind: "merge",
      note: `${close} closely-matching shared games — almost certainly the same team. Merge fully combines them.`,
    };
  } else {
    recommendation = {
      kind: "review",
      note:
        close === 0
          ? `No closely-matching shared games — verify before acting.`
          : `Only ${close} closely-matching shared game${close === 1 ? "" : "s"} — need 3+ to be confident. Check below.`,
    };
  }

  // Game-overlap merge confidence (the % the bulk threshold compares against).
  // When it's below 100 and still mergeable, spell out why right in the note so
  // the admin can look closer before merging.
  const mc = mergeConfidenceFrom(overlap, confidence.disqualified);
  if (!confidence.disqualified && mc.pct != null) {
    recommendation.note +=
      mc.pct >= 100
        ? ` Merge confidence 100% — every shared game matches and the duplicate has no extra games.`
        : ` Merge confidence ${mc.pct}% — ${mc.reasons.join("; ")}.`;
  }

  return {
    a,
    b,
    commonGames,
    confidence,
    overlap,
    recommendation,
    mergeConfidence: mc.pct,
    mergeReasons: mc.reasons,
  };
}

export interface DuplicateQuery {
  /** Max pairs to return (default 60). */
  limit?: number;
  /**
   * How many candidates to score before filtering (default = limit). Raise this
   * when filtering by confidence so lower levels — which sort below the top of
   * the list — can still be found without scoring the entire backlog.
   */
  scan?: number;
  /** Only include pairs with merge confidence ≥ this (disqualified excluded). */
  minPct?: number | null;
  /** Only include pairs with merge confidence ≤ this (disqualified excluded). */
  maxPct?: number | null;
}

export async function getDuplicateCandidates(query: number | DuplicateQuery = 60): Promise<DupPair[]> {
  const opts: DuplicateQuery = typeof query === "number" ? { limit: query } : query;
  const limit = opts.limit ?? 60;
  const minPct = opts.minPct ?? null;
  const maxPct = opts.maxPct ?? null;
  const filtering = minPct != null || maxPct != null;
  // With a confidence filter we scan deeper (matches can sit past the top slots);
  // unfiltered we only score what we'll show.
  const scan = Math.max(limit, opts.scan ?? (filtering ? 500 : limit));

  const pairs = await getCandidatePairs();
  const out: DupPair[] = [];
  for (const [aId, bId] of pairs.slice(0, scan)) {
    const dp = await buildDupPair(aId, bId);
    if (!dp) continue;
    if (filtering) {
      // Disqualified pairs have no merge confidence — a confidence filter hides them.
      if (dp.mergeConfidence == null) continue;
      if (minPct != null && dp.mergeConfidence < minPct) continue;
      if (maxPct != null && dp.mergeConfidence > maxPct) continue;
    }
    out.push(dp);
  }
  // Real candidates first; different-age (disqualified) pairs sink to the bottom
  // — they can never be merged here — then by merge confidence, then shared games.
  out.sort(
    (x, y) =>
      Number(x.confidence.disqualified) - Number(y.confidence.disqualified) ||
      (y.mergeConfidence ?? -1) - (x.mergeConfidence ?? -1) ||
      y.commonGames.length - x.commonGames.length,
  );
  return out.slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Backlog merge runs — the worker-driven bulk merge and its persisted log.
// ─────────────────────────────────────────────────────────────────────────────

export interface DuplicateMergeRunView {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  minConfidence: number;
  merged: number;
  scanned: number;
  error: string | null;
}

export interface DuplicateMergeLogView {
  id: string;
  mergedAt: Date;
  keptName: string;
  mergedName: string;
  keptTeamId: string | null;
  confidence: number;
  gamesMoved: number;
}

/** Open a new backlog-merge run (status RUNNING). */
export async function createDuplicateMergeRun(minConfidence: number): Promise<{ id: string }> {
  const run = await prisma.duplicateMergeRun.create({
    data: { minConfidence },
    select: { id: true },
  });
  return run;
}

/** Mark a run finished (SUCCESS or FAILED) and stamp its final counts. */
export async function finishDuplicateMergeRun(
  runId: string,
  data: { status: "SUCCESS" | "FAILED"; merged?: number; scanned?: number; error?: string | null },
): Promise<void> {
  await prisma.duplicateMergeRun.update({
    where: { id: runId },
    data: {
      status: data.status,
      finishedAt: new Date(),
      ...(data.merged != null ? { merged: data.merged } : {}),
      ...(data.scanned != null ? { scanned: data.scanned } : {}),
      ...(data.error !== undefined ? { error: data.error } : {}),
    },
  });
}

/** Recent backlog-merge runs, newest first. */
export async function getRecentDuplicateMergeRuns(limit = 20): Promise<DuplicateMergeRunView[]> {
  return prisma.duplicateMergeRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      startedAt: true,
      finishedAt: true,
      status: true,
      minConfidence: true,
      merged: true,
      scanned: true,
      error: true,
    },
  });
}

/** The per-merge log for a run (which team folded into which), newest first. */
export async function getDuplicateMergeLogs(runId: string, limit = 500): Promise<DuplicateMergeLogView[]> {
  return prisma.duplicateMergeLog.findMany({
    where: { runId },
    orderBy: { mergedAt: "desc" },
    take: limit,
    select: {
      id: true,
      mergedAt: true,
      keptName: true,
      mergedName: true,
      keptTeamId: true,
      confidence: true,
      gamesMoved: true,
    },
  });
}

/**
 * Work through the duplicate backlog: repeatedly pull the pairs at or above
 * `minPct` confidence and fold each into its kept record, logging every merge to
 * the run. Re-scans each round so chains and the next batch surface, until no
 * qualifying pairs remain (or a safety cap is hit). No request timeout applies —
 * this runs on the worker.
 */
export async function mergeDuplicateBacklog(opts: {
  minPct: number;
  runId: string;
  batch?: number;
  maxRounds?: number;
}): Promise<{ merged: number; rounds: number }> {
  const batch = opts.batch ?? 300;
  const maxRounds = opts.maxRounds ?? 500;
  let merged = 0;
  let rounds = 0;

  for (; rounds < maxRounds; rounds++) {
    const candidates = await getDuplicateMergesAtLeast(opts.minPct, batch);
    if (candidates.length === 0) break;

    const deleted = new Set<string>();
    let roundMerged = 0;
    for (const { sourceId, targetId, confidence } of candidates) {
      if (deleted.has(sourceId) || deleted.has(targetId)) continue;
      // Capture names + moved-game count before the merge deletes the source.
      const [src, tgt] = await Promise.all([
        prisma.team.findUnique({
          where: { id: sourceId },
          select: { name: true, _count: { select: { homeGames: true, awayGames: true } } },
        }),
        prisma.team.findUnique({ where: { id: targetId }, select: { name: true } }),
      ]);
      if (!src || !tgt) continue;
      const gamesMoved = src._count.homeGames + src._count.awayGames;

      await mergeTeams(sourceId, targetId);
      await prisma.duplicateMergeLog.create({
        data: {
          runId: opts.runId,
          keptTeamId: targetId,
          keptName: tgt.name,
          mergedName: src.name,
          confidence,
          gamesMoved,
        },
      });
      deleted.add(sourceId);
      merged += 1;
      roundMerged += 1;
    }

    await prisma.duplicateMergeRun.update({ where: { id: opts.runId }, data: { merged } });
    if (roundMerged === 0) break; // no progress — avoid looping forever
  }

  return { merged, rounds };
}
