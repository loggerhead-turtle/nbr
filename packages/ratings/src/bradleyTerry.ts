/**
 * Global, margin-aware, time-decayed Bradley-Terry rating (engine `bt-mov-v1`).
 *
 * Unlike Glicko-2 (which walks games sequentially), this fits ONE strength θ per
 * team over ALL games at once by maximizing a regularized, weighted logistic
 * likelihood — the right tool for ranking a large, sparsely-connected pool whose
 * teams are linked only through chains of common opponents.
 *
 *   P(home beats away) = σ(θ_home − θ_away + h_level)      [h=0 at neutral sites]
 *
 *   maximize  Σ_g w_g · logloss(y_g, σ(z_g))  −  (λ/2) Σ_i (θ_i − μ_i)²
 *
 *   - y_g   ∈ {1, 0.5, 0}  (home win / tie / loss)
 *   - w_g   = decay(age) · mov(runDiff)   — recent + decisive games weigh more
 *   - μ_i   = prior mean in θ units (a team's predecessor rating, else 0)
 *   - λ     = ridge strength (keeps undefeated teams finite; shrinks few-game
 *             teams toward their prior — natural "provisional" behaviour, and it
 *             makes the optimum unique so no global re-centring is needed)
 *
 * Solved with damped coordinate-Newton sweeps (diagonal Hessian) — dependency-
 * free, fast, and stable for thousands of teams. Per-level home advantage and a
 * per-θ standard error (→ RD) are produced too.
 */
import type { EngineGame, EngineOutput, TeamResult } from "./engine";

export type TeamLevel = "youth" | "hs";

export interface BradleyTerryOptions {
  /** Reference time for decay; defaults to the latest game date. */
  asOf?: Date;
  /** Recency half-life in days (older games weigh less). */
  halfLifeDays?: number;
  /** Max extra weight a blowout adds over a 1-run game (capped MOV). */
  movCap?: number;
  /** Ridge strength λ. Higher = stronger shrink toward the prior. */
  lambda?: number;
  /** Per-team prior mean on the DISPLAY scale (e.g. a predecessor's rating). */
  priorRating?: Map<string, number>;
  /** Extra prior widening for teams carried across a season boundary. */
  seasonBoundaryTeams?: Set<string>;
  /** Team level for per-level home advantage. */
  level?: Map<string, TeamLevel>;
  /** Fixed home advantage (θ units) per level; if omitted, it is fit from data. */
  homeAdvantage?: { youth: number; hs: number };
  maxIterations?: number;
  tolerance?: number;
  provisionalRdThreshold?: number;
  provisionalMinGames?: number;
}

const DEFAULTS = {
  halfLifeDays: 120,
  movCap: 1.0,
  lambda: 0.6,
  maxIterations: 200,
  tolerance: 1e-6,
  provisionalRdThreshold: 110,
  provisionalMinGames: 5,
};

const SCALE = 173.7178; // display points per θ unit (matches the Glicko scale)
const BASE = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
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

interface PreparedGame {
  home: string;
  away: string;
  y: number; // home outcome in {1, 0.5, 0}
  w: number; // weight (decay × mov)
  neutral: boolean;
}

export function computeRatingsBT(
  games: EngineGame[],
  options: BradleyTerryOptions = {},
): EngineOutput {
  // Per-field nullish coalescing (a spread would let an explicit `undefined`
  // override a default → NaN).
  const opt = {
    halfLifeDays: options.halfLifeDays ?? DEFAULTS.halfLifeDays,
    movCap: options.movCap ?? DEFAULTS.movCap,
    lambda: options.lambda ?? DEFAULTS.lambda,
    maxIterations: options.maxIterations ?? DEFAULTS.maxIterations,
    tolerance: options.tolerance ?? DEFAULTS.tolerance,
    provisionalRdThreshold: options.provisionalRdThreshold ?? DEFAULTS.provisionalRdThreshold,
    provisionalMinGames: options.provisionalMinGames ?? DEFAULTS.provisionalMinGames,
  };
  const finals = games.filter((g) => g.homeScore != null && g.awayScore != null);
  if (finals.length === 0) {
    return { teams: new Map(), gamesProcessed: 0, periods: 0, components: 0 };
  }

  const asOf = options.asOf ?? new Date(Math.max(...finals.map((g) => g.playedAt.getTime())));
  const decayK = Math.LN2 / opt.halfLifeDays;

  // Prepare games + bookkeeping.
  const uf = new UnionFind();
  const record = new Map<string, { w: number; l: number; t: number; gp: number }>();
  const ensure = (id: string) => {
    if (!record.has(id)) record.set(id, { w: 0, l: 0, t: 0, gp: 0 });
  };

  const prepared: PreparedGame[] = finals.map((g) => {
    ensure(g.homeTeamId);
    ensure(g.awayTeamId);
    uf.union(g.homeTeamId, g.awayTeamId);

    const hs = g.homeScore!;
    const as = g.awayScore!;
    const y = hs > as ? 1 : hs < as ? 0 : 0.5;

    const rec = record.get(g.homeTeamId)!;
    const arec = record.get(g.awayTeamId)!;
    rec.gp++; arec.gp++;
    if (hs > as) { rec.w++; arec.l++; }
    else if (hs < as) { rec.l++; arec.w++; }
    else { rec.t++; arec.t++; }

    const ageDays = Math.max(0, (asOf.getTime() - g.playedAt.getTime()) / DAY_MS);
    const decay = Math.exp(-decayK * ageDays);
    const runDiff = Math.abs(hs - as);
    const mov = 1 + Math.min(opt.movCap, 0.5 * Math.log1p(runDiff));

    return { home: g.homeTeamId, away: g.awayTeamId, y, w: decay * mov, neutral: !!g.neutralSite };
  });

  const teamIds = [...record.keys()];
  const theta = new Map<string, number>();
  const mu = new Map<string, number>(); // prior mean in θ units
  for (const id of teamIds) {
    const prior = options.priorRating?.get(id);
    const m = prior != null ? (prior - BASE) / SCALE : 0;
    mu.set(id, m);
    theta.set(id, m); // warm-start at the prior
  }
  // Carried-across-season teams get a weaker anchor (wider prior) so new results
  // move them faster — they must re-earn their spot.
  const lambdaFor = (id: string) =>
    options.seasonBoundaryTeams?.has(id) ? opt.lambda * 0.4 : opt.lambda;

  const levelOf = (id: string): TeamLevel => options.level?.get(id) ?? "youth";
  const fitHome = !options.homeAdvantage;
  const home = { youth: options.homeAdvantage?.youth ?? 0, hs: options.homeAdvantage?.hs ?? 0 };

  // Damped coordinate-Newton sweeps.
  for (let iter = 0; iter < opt.maxIterations; iter++) {
    const grad = new Map<string, number>();
    const hess = new Map<string, number>();
    for (const id of teamIds) { grad.set(id, 0); hess.set(id, 0); }
    const homeGrad = { youth: 0, hs: 0 };
    const homeHess = { youth: 0, hs: 0 };

    for (const g of prepared) {
      const h = g.neutral ? 0 : home[levelOf(g.home)];
      const z = theta.get(g.home)! - theta.get(g.away)! + h;
      const p = sigmoid(z);
      const r = g.w * (g.y - p);
      const s = g.w * p * (1 - p);
      grad.set(g.home, grad.get(g.home)! + r);
      grad.set(g.away, grad.get(g.away)! - r);
      hess.set(g.home, hess.get(g.home)! + s);
      hess.set(g.away, hess.get(g.away)! + s);
      if (fitHome && !g.neutral) {
        const lvl = levelOf(g.home);
        homeGrad[lvl] += r;
        homeHess[lvl] += s;
      }
    }

    let maxStep = 0;
    for (const id of teamIds) {
      const lam = lambdaFor(id);
      const gi = grad.get(id)! - lam * (theta.get(id)! - mu.get(id)!);
      const hi = hess.get(id)! + lam;
      const step = gi / hi;
      theta.set(id, theta.get(id)! + step);
      maxStep = Math.max(maxStep, Math.abs(step));
    }
    if (fitHome) {
      // Ridge-regularize + clamp the home advantage so it can't diverge on
      // degenerate data (e.g. when the home team almost always wins).
      const HOME_LAMBDA = 2.0;
      for (const lvl of ["youth", "hs"] as TeamLevel[]) {
        const step = (homeGrad[lvl] - HOME_LAMBDA * home[lvl]) / (homeHess[lvl] + HOME_LAMBDA);
        home[lvl] = Math.max(-1, Math.min(1, home[lvl] + step));
      }
    }
    if (maxStep < opt.tolerance) break;
  }

  // Final-pass Hessian diagonal for standard errors.
  const infoDiag = new Map<string, number>();
  for (const id of teamIds) infoDiag.set(id, lambdaFor(id));
  for (const g of prepared) {
    const h = g.neutral ? 0 : home[levelOf(g.home)];
    const z = theta.get(g.home)! - theta.get(g.away)! + h;
    const p = sigmoid(z);
    const s = g.w * p * (1 - p);
    infoDiag.set(g.home, infoDiag.get(g.home)! + s);
    infoDiag.set(g.away, infoDiag.get(g.away)! + s);
  }

  const teams = new Map<string, TeamResult>();
  for (const id of teamIds) {
    const rec = record.get(id)!;
    const rd = SCALE * Math.sqrt(1 / infoDiag.get(id)!);
    const isProvisional = rec.gp < opt.provisionalMinGames || rd > opt.provisionalRdThreshold;
    const rating = BASE + SCALE * theta.get(id)!;
    teams.set(id, {
      teamId: id,
      rating,
      rd,
      volatility: 0,
      gamesPlayed: rec.gp,
      wins: rec.w,
      losses: rec.l,
      ties: rec.t,
      isProvisional,
      componentId: uf.find(id),
      history: [{ asOf, rating, rd, volatility: 0, gamesPlayed: rec.gp }],
    });
  }

  const components = new Set([...teams.values()].map((t) => t.componentId));
  return {
    teams,
    gamesProcessed: finals.length,
    periods: 1,
    components: components.size,
  };
}

/** Predicted probability the home team wins, for backtest scoring. */
export function predictHomeWin(
  ratingHome: number,
  ratingAway: number,
  homeAdvantageDisplay = 0,
): number {
  return sigmoid((ratingHome - ratingAway + homeAdvantageDisplay) / SCALE);
}

export const BT_SCALE = SCALE;
export const BT_BASE = BASE;
