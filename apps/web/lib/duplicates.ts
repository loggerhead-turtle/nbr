import { prisma } from "@nbr/db";
import { scoreMerge, normalizeTeamName, ageGroupFromName, type MergeScore } from "@nbr/core";

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
  /** Merge confidence (same model the scraper uses to auto-merge). */
  confidence: MergeScore;
  overlap: DupOverlap;
  recommendation: DupRecommendation;
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

export async function getDuplicateCandidates(limit = 60): Promise<DupPair[]> {
  const pairs = await getCandidatePairs();
  const out: DupPair[] = [];
  for (const [aId, bId] of pairs.slice(0, limit)) {
    const [ra, rb] = await Promise.all([loadDupTeam(aId), loadDupTeam(bId)]);
    if (!ra || !rb) continue;

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

    out.push({ a, b, commonGames, confidence, overlap, recommendation });
  }
  // Real candidates first; different-age (disqualified) pairs sink to the bottom
  // — they can never be merged here — then by confidence and shared-game count.
  return out.sort(
    (x, y) =>
      Number(x.confidence.disqualified) - Number(y.confidence.disqualified) ||
      y.confidence.score - x.confidence.score ||
      y.commonGames.length - x.commonGames.length,
  );
}
