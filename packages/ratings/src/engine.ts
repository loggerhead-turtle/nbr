/**
 * Rating engine orchestration: turn a set of completed games into current
 * ratings + per-period history. Pure (no I/O) so it is fully unit-testable; the
 * worker wires this to Prisma.
 *
 * Design choices (see repo design notes):
 *  - Full idempotent recompute: replay all FINAL games grouped into weekly
 *    rating periods from the start. Cheap at Utah volume, reproducible.
 *  - Connectivity: union-find over the game graph. Ratings are only comparable
 *    *within* a connected component; we expose componentId so the UI can be honest.
 *  - Home/away: a small home-field edge applied to the expectation only, skipped
 *    for neutral-site (tournament) games.
 *  - Margin of victory: off by default (pure W/L/T); opt-in hook for engine v2.
 */
import {
  DEFAULT_CONFIG,
  Glicko2Config,
  MatchResult,
  TeamRating,
  defaultRating,
  rate,
} from "./glicko2";

export interface EngineGame {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  playedAt: Date;
  neutralSite?: boolean;
}

export interface EngineOptions {
  glicko?: Glicko2Config;
  /** Home-field rating points added to the home team's expectation. */
  homeFieldAdvantage?: number;
  /** Length of a rating period in days. */
  periodDays?: number;
  /** Enable margin-of-victory damping (default false = pure W/L/T). */
  marginOfVictory?: boolean;
  /** RD at/above which a team is considered provisional. */
  provisionalRdThreshold?: number;
  /** Minimum games before a team can shed the provisional flag. */
  provisionalMinGames?: number;
}

const DEFAULTS = {
  homeFieldAdvantage: 25,
  periodDays: 7,
  marginOfVictory: false,
  provisionalRdThreshold: 110,
  provisionalMinGames: 5,
} satisfies Required<Omit<EngineOptions, "glicko">>;

export interface TeamResult {
  teamId: string;
  rating: number;
  rd: number;
  volatility: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  isProvisional: boolean;
  componentId: string;
  /** One snapshot per rating period the team's rating changed in. */
  history: { asOf: Date; rating: number; rd: number; volatility: number; gamesPlayed: number }[];
}

export interface EngineOutput {
  teams: Map<string, TeamResult>;
  gamesProcessed: number;
  periods: number;
  components: number;
  /**
   * Fitted age-group baseline curve on the DISPLAY scale (only set by the
   * `bt-age-v1` engine). Maps an age-group key (e.g. "U12") to the baseline
   * rating for an average team of that age. Ordered youngest → oldest.
   */
  ageCurve?: { ageGroup: string; baseline: number; bridgeGames: number }[];
}

/** Convert a final score into a Glicko score in [0,1] for the home team. */
function homeScoreValue(g: EngineGame, useMov: boolean): number {
  if (g.homeScore === g.awayScore) return 0.5;
  const homeWon = g.homeScore > g.awayScore;
  if (!useMov) return homeWon ? 1 : 0;
  // Margin-of-victory: a 1-run win sits near a coin-flip (0.5); the value rises
  // toward a decisive 1.0 as the run differential grows, saturating at ~12 runs.
  const diff = Math.abs(g.homeScore - g.awayScore);
  const magnitude = Math.min(1, Math.log(1 + diff) / Math.log(1 + 12));
  const value = 0.5 + 0.5 * magnitude;
  return homeWon ? value : 1 - value;
}

function periodKey(date: Date, epoch: number, periodMs: number): number {
  return Math.floor((date.getTime() - epoch) / periodMs);
}

/** Union-find for connectivity. */
class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    let root = this.parent.get(x) ?? x;
    if (!this.parent.has(x)) this.parent.set(x, x);
    while (root !== this.parent.get(root)) {
      const next = this.parent.get(root)!;
      this.parent.set(root, this.parent.get(next)!);
      root = this.parent.get(root)!;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function computeRatings(games: EngineGame[], options: EngineOptions = {}): EngineOutput {
  const opts = { ...DEFAULTS, ...options };
  const glicko = options.glicko ?? DEFAULT_CONFIG;
  const periodMs = opts.periodDays * 24 * 60 * 60 * 1000;

  const finals = [...games].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());

  const state = new Map<string, TeamRating>();
  const record = new Map<string, { w: number; l: number; t: number; gp: number }>();
  const history = new Map<string, TeamResult["history"]>();
  const uf = new UnionFind();

  const ensure = (id: string) => {
    if (!state.has(id)) {
      state.set(id, defaultRating());
      record.set(id, { w: 0, l: 0, t: 0, gp: 0 });
      history.set(id, []);
    }
  };

  if (finals.length === 0) {
    return { teams: new Map(), gamesProcessed: 0, periods: 0, components: 0 };
  }

  const epoch = finals[0]!.playedAt.getTime();

  // Group games into rating periods.
  const periods = new Map<number, EngineGame[]>();
  for (const g of finals) {
    const key = periodKey(g.playedAt, epoch, periodMs);
    (periods.get(key) ?? periods.set(key, []).get(key)!).push(g);
  }

  const sortedPeriodKeys = [...periods.keys()].sort((a, b) => a - b);

  for (const pk of sortedPeriodKeys) {
    const periodGames = periods.get(pk)!;

    // Collect each team's matches this period from a frozen snapshot of ratings,
    // so all updates within a period use pre-period opponent ratings (Glicko-2).
    const snapshot = new Map<string, TeamRating>();
    const matchesByTeam = new Map<string, MatchResult[]>();
    const playedThisPeriod = new Set<string>();
    const periodEnd = new Date(epoch + (pk + 1) * periodMs);

    for (const g of periodGames) {
      ensure(g.homeTeamId);
      ensure(g.awayTeamId);
      uf.union(g.homeTeamId, g.awayTeamId);
      if (!snapshot.has(g.homeTeamId)) snapshot.set(g.homeTeamId, { ...state.get(g.homeTeamId)! });
      if (!snapshot.has(g.awayTeamId)) snapshot.set(g.awayTeamId, { ...state.get(g.awayTeamId)! });
    }

    for (const g of periodGames) {
      const hfa = g.neutralSite ? 0 : opts.homeFieldAdvantage;
      const home = snapshot.get(g.homeTeamId)!;
      const away = snapshot.get(g.awayTeamId)!;
      const sHome = homeScoreValue(g, opts.marginOfVictory);

      // Home team's match: opponent looks (hfa) weaker.
      pushMatch(matchesByTeam, g.homeTeamId, {
        opponentRating: away.rating - hfa,
        opponentRd: away.rd,
        score: sHome,
      });
      // Away team's match: opponent looks (hfa) stronger.
      pushMatch(matchesByTeam, g.awayTeamId, {
        opponentRating: home.rating + hfa,
        opponentRd: home.rd,
        score: 1 - sHome,
      });

      playedThisPeriod.add(g.homeTeamId);
      playedThisPeriod.add(g.awayTeamId);

      // Update win/loss/tie records.
      const hr = record.get(g.homeTeamId)!;
      const ar = record.get(g.awayTeamId)!;
      hr.gp += 1;
      ar.gp += 1;
      if (g.homeScore > g.awayScore) {
        hr.w += 1;
        ar.l += 1;
      } else if (g.homeScore < g.awayScore) {
        hr.l += 1;
        ar.w += 1;
      } else {
        hr.t += 1;
        ar.t += 1;
      }
    }

    // Apply Glicko-2 update per team that played, and decay RD for those idle.
    for (const [teamId, current] of state) {
      const matches = matchesByTeam.get(teamId) ?? [];
      const updated = rate(snapshot.get(teamId) ?? current, matches, glicko);
      state.set(teamId, updated);
      if (matches.length > 0) {
        history.get(teamId)!.push({
          asOf: periodEnd,
          rating: updated.rating,
          rd: updated.rd,
          volatility: updated.volatility,
          gamesPlayed: record.get(teamId)!.gp,
        });
      }
    }
  }

  // Assemble results with connectivity + provisional flags.
  const teams = new Map<string, TeamResult>();
  for (const [teamId, r] of state) {
    const rec = record.get(teamId)!;
    const isProvisional = r.rd > opts.provisionalRdThreshold || rec.gp < opts.provisionalMinGames;
    teams.set(teamId, {
      teamId,
      rating: r.rating,
      rd: r.rd,
      volatility: r.volatility,
      gamesPlayed: rec.gp,
      wins: rec.w,
      losses: rec.l,
      ties: rec.t,
      isProvisional,
      componentId: uf.find(teamId),
      history: history.get(teamId)!,
    });
  }

  const components = new Set([...teams.values()].map((t) => t.componentId));

  return {
    teams,
    gamesProcessed: finals.length,
    periods: sortedPeriodKeys.length,
    components: components.size,
  };
}

function pushMatch(map: Map<string, MatchResult[]>, teamId: string, m: MatchResult): void {
  const arr = map.get(teamId);
  if (arr) arr.push(m);
  else map.set(teamId, [m]);
}
