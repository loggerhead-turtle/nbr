/**
 * Age-connectivity diagnostics — the Phase-1 "can we even do this" report.
 *
 * A unified cross-age scale (see `bt-age-v1` in ./bradleyTerry) is only as
 * data-driven as the *bridge games* that link age groups: same-age games tell
 * us nothing about where one bracket sits relative to another. This module
 * measures how many such bridges exist and how much of the pool they actually
 * connect, so we know whether the age curve is earned from data or resting on
 * the developmental prior.
 */
import type { EngineGame } from "./engine";

/** Numeric age for ordering; mirrors the parser in ./bradleyTerry. */
function ageYear(key: string | undefined): number | undefined {
  if (!key) return undefined;
  if (key === "OPEN") return 19;
  const m = /^U(\d{1,2})$/.exec(key);
  return m ? Number(m[1]) : undefined;
}

export interface AgeBridge {
  younger: string;
  older: string;
  /** Difference in years between the two brackets. */
  gap: number;
  /** Number of games played between the two brackets. */
  games: number;
}

export interface AgePresence {
  ageGroup: string;
  teams: number;
  /** Games this bracket played against a *different* bracket. */
  bridgeGames: number;
}

export interface AgeConnectivityReport {
  teamsTotal: number;
  teamsWithAge: number;
  sameAgeGames: number;
  bridgeGames: number;
  /** Per-bracket presence + bridge participation, youngest → oldest. */
  ages: AgePresence[];
  /** One entry per ordered bracket pair that actually met, most games first. */
  bridges: AgeBridge[];
  /** Bridges between adjacent ages (gap === 1) — the backbone of the curve. */
  adjacentBridges: AgeBridge[];
  /** Brackets with at least one team but zero bridge games (prior-only). */
  isolatedAges: string[];
  /**
   * Fraction of age-bearing teams that sit in a connected game-graph component
   * spanning more than one age group. Low ⇒ the curve leans on the prior.
   */
  fractionInBridgingComponent: number;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function ageConnectivity(
  games: EngineGame[],
  teamAge: Map<string, string>,
): AgeConnectivityReport {
  const finals = games.filter((g) => g.homeScore != null && g.awayScore != null);

  const ageOf = (id: string): string | undefined => {
    const k = teamAge.get(id);
    return k != null && ageYear(k) != null ? k : undefined;
  };

  const teamsSeen = new Set<string>();
  const teamTeams = new Map<string, number>(); // teams per age bracket
  const bridgeGamesByAge = new Map<string, number>();
  const pairGames = new Map<string, number>(); // "younger|older" → count
  const uf = new UnionFind();

  let sameAgeGames = 0;
  let bridgeGames = 0;

  for (const g of finals) {
    teamsSeen.add(g.homeTeamId);
    teamsSeen.add(g.awayTeamId);
    uf.union(g.homeTeamId, g.awayTeamId);
    const ah = ageOf(g.homeTeamId);
    const aa = ageOf(g.awayTeamId);
    if (!ah || !aa) continue;
    if (ah === aa) {
      sameAgeGames++;
      continue;
    }
    bridgeGames++;
    bridgeGamesByAge.set(ah, (bridgeGamesByAge.get(ah) ?? 0) + 1);
    bridgeGamesByAge.set(aa, (bridgeGamesByAge.get(aa) ?? 0) + 1);
    const [younger, older] = ageYear(ah)! < ageYear(aa)! ? [ah, aa] : [aa, ah];
    const key = `${younger}|${older}`;
    pairGames.set(key, (pairGames.get(key) ?? 0) + 1);
  }

  // Count teams per bracket from the team map, restricted to teams that played.
  for (const id of teamsSeen) {
    const a = ageOf(id);
    if (a) teamTeams.set(a, (teamTeams.get(a) ?? 0) + 1);
  }

  const presentAges = [...teamTeams.keys()].sort((a, b) => ageYear(a)! - ageYear(b)!);
  const ages: AgePresence[] = presentAges.map((a) => ({
    ageGroup: a,
    teams: teamTeams.get(a)!,
    bridgeGames: bridgeGamesByAge.get(a) ?? 0,
  }));

  const bridges: AgeBridge[] = [...pairGames.entries()]
    .map(([key, count]) => {
      const [younger, older] = key.split("|") as [string, string];
      return { younger, older, gap: ageYear(older)! - ageYear(younger)!, games: count };
    })
    .sort((a, b) => b.games - a.games);
  const adjacentBridges = bridges.filter((b) => b.gap === 1).sort((a, b) => ageYear(a.younger)! - ageYear(b.younger)!);
  const isolatedAges = ages.filter((a) => a.bridgeGames === 0).map((a) => a.ageGroup);

  // Which connected components span >1 age group?
  const compAges = new Map<string, Set<string>>();
  let teamsWithAge = 0;
  for (const id of teamsSeen) {
    const a = ageOf(id);
    if (!a) continue;
    teamsWithAge++;
    const root = uf.find(id);
    if (!compAges.has(root)) compAges.set(root, new Set());
    compAges.get(root)!.add(a);
  }
  const bridgingComponents = new Set(
    [...compAges.entries()].filter(([, set]) => set.size > 1).map(([root]) => root),
  );
  let inBridging = 0;
  for (const id of teamsSeen) {
    if (!ageOf(id)) continue;
    if (bridgingComponents.has(uf.find(id))) inBridging++;
  }

  return {
    teamsTotal: teamsSeen.size,
    teamsWithAge,
    sameAgeGames,
    bridgeGames,
    ages,
    bridges,
    adjacentBridges,
    isolatedAges,
    fractionInBridgingComponent: teamsWithAge ? inBridging / teamsWithAge : 0,
  };
}
