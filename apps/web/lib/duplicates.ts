import { prisma } from "@nbr/db";
import { normalizeTeamName } from "@nbr/core";

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

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(
        dp[j]! + 1,
        dp[j - 1]! + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n]!;
}

function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

const SIM_THRESHOLD = 0.72;
const MAX_FUZZY_COMPARISONS = 200000;

/** Compute all candidate pairs (ids only). Shared by the badge count and page. */
async function getCandidatePairs(): Promise<[string, string][]> {
  const [teams, games, dismissals] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.game.findMany({
      where: { status: "FINAL" },
      select: { homeTeamId: true, awayTeamId: true, playedAt: true },
    }),
    prisma.duplicateDismissal.findMany({ select: { teamIdA: true, teamIdB: true } }),
  ]);
  const dismissed = new Set(dismissals.map((d) => `${d.teamIdA}|${d.teamIdB}`));
  const norm = new Map(teams.map((t) => [t.id, normalizeTeamName(t.name)] as const));

  const pairScores = new Map<string, number>(); // pairKey "a|b" -> shared-game count
  const bump = (x: string, y: string) => {
    const [a, b] = pairKey(x, y);
    const k = `${a}|${b}`;
    pairScores.set(k, (pairScores.get(k) ?? 0) + 1);
  };

  // Signal 3: shared (opponent, date) — gather teams that faced the same opponent
  // on the same day, then count co-occurrences per pair.
  const faced = new Map<string, string[]>();
  for (const g of games) {
    const day = g.playedAt.toISOString().slice(0, 10);
    (faced.get(`${g.awayTeamId}|${day}`) ?? faced.set(`${g.awayTeamId}|${day}`, []).get(`${g.awayTeamId}|${day}`)!).push(g.homeTeamId);
    (faced.get(`${g.homeTeamId}|${day}`) ?? faced.set(`${g.homeTeamId}|${day}`, []).get(`${g.homeTeamId}|${day}`)!).push(g.awayTeamId);
  }
  for (const peers of faced.values()) {
    const uniq = [...new Set(peers)];
    for (let i = 0; i < uniq.length; i++)
      for (let j = i + 1; j < uniq.length; j++) bump(uniq[i]!, uniq[j]!);
  }

  const candidates = new Set<string>();

  // Signals 1 & 2: name match, within first-token buckets for efficiency.
  const buckets = new Map<string, string[]>();
  for (const t of teams) {
    const key = (norm.get(t.id) ?? "").split(" ")[0] ?? "";
    if (!key) continue;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(t.id);
  }
  let comparisons = 0;
  for (const ids of buckets.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (comparisons++ > MAX_FUZZY_COMPARISONS) break;
        const na = norm.get(ids[i]!) ?? "";
        const nb = norm.get(ids[j]!) ?? "";
        if (na === nb || nameSimilarity(na, nb) >= SIM_THRESHOLD) {
          candidates.add(`${pairKey(ids[i]!, ids[j]!).join("|")}`);
        }
      }
    }
  }

  // Add shared-game pairs with 2+ co-occurrences.
  for (const [k, score] of pairScores) {
    if (score >= 2) candidates.add(k);
  }

  return [...candidates]
    .filter((k) => !dismissed.has(k))
    .map((k) => k.split("|") as [string, string]);
}

export async function countDuplicateCandidates(): Promise<number> {
  try {
    return (await getCandidatePairs()).length;
  } catch {
    return 0;
  }
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
  scoresMatch: boolean;
}

export interface DupTeam {
  id: string;
  name: string;
  city: string | null;
  ageGroup: string | null;
  classification: string | null;
  gcTeamId: string | null;
  isGhost: boolean;
  totalGames: number;
  games: DupGame[];
}

export interface DupPair {
  a: DupTeam;
  b: DupTeam;
  commonGames: SharedGame[];
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

  const byKey = new Map(games.map((g) => [`${g.oppId}|${g.date}`, g] as const));
  const team: DupTeam = {
    id: t.id,
    name: t.name,
    city: t.city,
    ageGroup: t.ageGroup,
    classification: t.classification,
    gcTeamId: t.gcTeamId,
    isGhost: t.isGhost,
    totalGames: games.length,
    games: games.map(({ opponent, date, us, them }) => ({ opponent, date, us, them })),
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
      });
    }

    const keepA =
      (ra.team.gcTeamId ? 1 : 0) - (rb.team.gcTeamId ? 1 : 0) || ra.team.totalGames - rb.team.totalGames;
    out.push(keepA >= 0 ? { a: ra.team, b: rb.team, commonGames } : { a: rb.team, b: ra.team, commonGames });
  }
  // Show pairs with shared games first — strongest evidence.
  return out.sort((x, y) => y.commonGames.length - x.commonGames.length);
}
