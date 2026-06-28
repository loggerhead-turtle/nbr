import { prisma } from "@nbr/db";
import { normalizeTeamName } from "@nbr/core";

/**
 * Detect likely-duplicate teams. The primary signal is an exact normalized-name
 * match (which is how ghost opponents and quick-added teams collide), and we
 * surface shared opponents/dates so a human can confirm at a glance. "Don't
 * merge" decisions are remembered in DuplicateDismissal so pairs don't recur.
 */

function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Cheap count for the nav badge: distinct candidate pairs minus dismissed. */
export async function countDuplicateCandidates(): Promise<number> {
  try {
    const [teams, dismissals] = await Promise.all([
      prisma.team.findMany({ select: { id: true, name: true } }),
      prisma.duplicateDismissal.findMany({ select: { teamIdA: true, teamIdB: true } }),
    ]);
    const dismissed = new Set(dismissals.map((d) => `${d.teamIdA}|${d.teamIdB}`));
    const groups = new Map<string, string[]>();
    for (const t of teams) {
      const key = normalizeTeamName(t.name);
      if (!key) continue;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(t.id);
    }
    let count = 0;
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = pairKey(ids[i]!, ids[j]!);
          if (!dismissed.has(`${a}|${b}`)) count += 1;
        }
      }
    }
    return count;
  } catch {
    return 0;
  }
}

export interface DupGame {
  opponent: string;
  date: string; // YYYY-MM-DD
  us: number | null;
  them: number | null;
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
  commonCount: number;
}

async function loadDupTeam(id: string): Promise<{ team: DupTeam; oppKeys: string[] } | null> {
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
  return { team, oppKeys: games.map((g) => `${g.oppId}|${g.date}`) };
}

/** Build the candidate list with details for the review page. */
export async function getDuplicateCandidates(limit = 60): Promise<DupPair[]> {
  const [teams, dismissals] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.duplicateDismissal.findMany({ select: { teamIdA: true, teamIdB: true } }),
  ]);
  const dismissed = new Set(dismissals.map((d) => `${d.teamIdA}|${d.teamIdB}`));

  const groups = new Map<string, string[]>();
  for (const t of teams) {
    const key = normalizeTeamName(t.name);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t.id);
  }

  const pairs: [string, string][] = [];
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = pairKey(ids[i]!, ids[j]!);
        if (!dismissed.has(`${a}|${b}`)) pairs.push([a, b]);
      }
    }
  }

  const out: DupPair[] = [];
  for (const [aId, bId] of pairs.slice(0, limit)) {
    const [ra, rb] = await Promise.all([loadDupTeam(aId), loadDupTeam(bId)]);
    if (!ra || !rb) continue;
    const aOpp = new Set(ra.oppKeys);
    const commonCount = rb.oppKeys.filter((k) => aOpp.has(k)).length;
    // Order so the team to KEEP (has a GC id / more games) is `a`.
    const keepA =
      (ra.team.gcTeamId ? 1 : 0) - (rb.team.gcTeamId ? 1 : 0) || ra.team.totalGames - rb.team.totalGames;
    out.push(keepA >= 0 ? { a: ra.team, b: rb.team, commonCount } : { a: rb.team, b: ra.team, commonCount });
  }
  return out;
}
