/**
 * Tournament pool generator — serpentine (snake) seeding with an optional
 * balance-refinement pass.
 *
 * The problem this solves: directors often accidentally stack several strong
 * teams in one pool and weak teams in another. Snake seeding guarantees the top
 * P teams land in separate pools and the weakest are spread out too; the
 * refinement pass then trims the remaining variance in total pool strength
 * without ever co-locating two of the top-P seeds.
 *
 * Pure and deterministic — no I/O — so it is fully unit-testable.
 */

import { haversineMiles } from "./geo";

export interface PoolTeam {
  id: string;
  name: string;
  rating: number;
  isProvisional?: boolean;
  /** Optional location for the "avoid same-area pairings" objective. */
  lat?: number | null;
  lng?: number | null;
  state?: string | null;
}

export interface SeededTeam extends PoolTeam {
  /** 1-based overall seed (1 = strongest). */
  seed: number;
}

/** A same-pool pair of teams that have already played this season. */
export interface RematchPair {
  aId: string;
  bId: string;
  games: number;
}

export interface Pool {
  index: number;
  label: string; // "Pool A", "Pool B", ...
  teams: SeededTeam[];
  totalRating: number;
  averageRating: number;
  /** Same-pool pairs that have played, with game counts (for highlighting). */
  rematches: RematchPair[];
  /** Total prior games played among this pool's members. */
  pastGames: number;
}

export interface PoolResult {
  pools: Pool[];
  /** Spread between the strongest and weakest pool by total rating. */
  strengthSpread: number;
  /** Population standard deviation of pool total ratings (lower = more even). */
  balanceStdDev: number;
  numPools: number;
  numTeams: number;
  /** Total rematch pairs across all pools (0 = no team plays a prior opponent). */
  rematchPairs: number;
}

export interface PoolOptions {
  /**
   * Run a greedy swap pass to equalize pool *average* rating after snake seeding.
   * Default OFF — it distorts seed distribution (the whole point is to spread the
   * best teams across pools by seed, not to equalize averages). Kept for opt-in.
   */
  refine?: boolean;
  /** Max refinement iterations (default 200). */
  maxIterations?: number;
  /**
   * Head-to-head counts keyed by `pairKey(aId, bId)`. Enables rematch reporting
   * and (with rematchWeight) rematch-minimizing re-pooling.
   */
  pastGames?: Record<string, number>;
  /** Objective weights for the optimizer. Balance defaults to 1; the others 0. */
  balanceWeight?: number;
  /** >0 ⇒ avoid putting prior opponents in the same pool. */
  rematchWeight?: number;
  /** >0 ⇒ avoid putting geographically close teams in the same pool. */
  locationWeight?: number;
  /** Teams within this many miles count as "same area" (default 20). */
  proximityMiles?: number;
}

/** Stable key for an unordered team pair. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// How many rating points of imbalance one rematch / one close pairing is "worth"
// when trading off against pool balance in the optimizer.
const REMATCH_UNIT = 150;
const LOCATION_UNIT = 100;

function gamesBetween(a: PoolTeam, b: PoolTeam, past?: Record<string, number>): number {
  return past?.[pairKey(a.id, b.id)] ?? 0;
}

function areClose(a: PoolTeam, b: PoolTeam, proximityMiles: number): boolean {
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    return haversineMiles({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) <= proximityMiles;
  }
  // Fall back to same-state when coordinates are missing.
  return !!a.state && !!b.state && a.state === b.state;
}

function rematchesIn(pool: SeededTeam[], past?: Record<string, number>): RematchPair[] {
  const out: RematchPair[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const g = gamesBetween(pool[i]!, pool[j]!, past);
      if (g > 0) out.push({ aId: pool[i]!.id, bId: pool[j]!.id, games: g });
    }
  }
  return out;
}

function poolLabel(index: number): string {
  // A, B, ... Z, AA, AB, ...
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Pool ${label}`;
}

function summarize(teams: SeededTeam[], index: number, past?: Record<string, number>): Pool {
  const totalRating = teams.reduce((s, t) => s + t.rating, 0);
  const rematches = rematchesIn(teams, past);
  return {
    index,
    label: poolLabel(index),
    teams,
    totalRating,
    averageRating: teams.length ? totalRating / teams.length : 0,
    rematches,
    pastGames: rematches.reduce((s, r) => s + r.games, 0),
  };
}

/** Total optimizer cost: balance (rating-pt stdDev) + rematch + location penalties. */
function poolCost(
  buckets: SeededTeam[][],
  opt: { balanceWeight: number; rematchWeight: number; locationWeight: number; proximityMiles: number },
  past?: Record<string, number>,
): number {
  const totals = buckets.map((b) => b.reduce((s, t) => s + t.rating, 0));
  let rematch = 0;
  let location = 0;
  for (const pool of buckets) {
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        rematch += gamesBetween(pool[i]!, pool[j]!, past);
        if (opt.locationWeight > 0 && areClose(pool[i]!, pool[j]!, opt.proximityMiles)) location += 1;
      }
    }
  }
  return (
    opt.balanceWeight * stdDev(totals) +
    opt.rematchWeight * REMATCH_UNIT * rematch +
    opt.locationWeight * LOCATION_UNIT * location
  );
}

/**
 * Greedy best-improving swaps to minimize the combined objective (balance +
 * rematch + location), never co-locating two locked top seeds. Used when any of
 * the rematch/location weights is set; otherwise the snake seeding stands.
 */
function optimize(
  buckets: SeededTeam[][],
  lockedSeeds: Set<number>,
  opt: { balanceWeight: number; rematchWeight: number; locationWeight: number; proximityMiles: number },
  past: Record<string, number> | undefined,
  maxIterations: number,
): void {
  const swap = (pi: number, ai: number, qi: number, bi: number) => {
    const tmp = buckets[pi]![ai]!;
    buckets[pi]![ai] = buckets[qi]![bi]!;
    buckets[qi]![bi] = tmp;
  };

  for (let iter = 0; iter < maxIterations; iter++) {
    let current = poolCost(buckets, opt, past);
    let best: { pi: number; ai: number; qi: number; bi: number } | null = null;
    let bestCost = current;

    for (let pi = 0; pi < buckets.length; pi++) {
      for (let qi = pi + 1; qi < buckets.length; qi++) {
        for (let ai = 0; ai < buckets[pi]!.length; ai++) {
          if (lockedSeeds.has(buckets[pi]![ai]!.seed)) continue;
          for (let bi = 0; bi < buckets[qi]!.length; bi++) {
            if (lockedSeeds.has(buckets[qi]![bi]!.seed)) continue;
            swap(pi, ai, qi, bi);
            const c = poolCost(buckets, opt, past);
            swap(pi, ai, qi, bi); // revert
            if (c < bestCost - 1e-9) {
              bestCost = c;
              best = { pi, ai, qi, bi };
            }
          }
        }
      }
    }

    if (!best) break;
    swap(best.pi, best.ai, best.qi, best.bi);
  }
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Distribute `teams` across `numPools` pools using serpentine seeding, then
 * optionally refine for balance.
 */
export function generatePools(
  teams: PoolTeam[],
  numPools: number,
  options: PoolOptions = {},
): PoolResult {
  const refine = options.refine ?? false;
  const maxIterations = options.maxIterations ?? 200;
  const past = options.pastGames;
  const weights = {
    balanceWeight: options.balanceWeight ?? 1,
    rematchWeight: options.rematchWeight ?? 0,
    locationWeight: options.locationWeight ?? 0,
    proximityMiles: options.proximityMiles ?? 20,
  };

  if (numPools < 1) throw new Error("numPools must be at least 1");
  if (numPools > teams.length) {
    throw new Error(`Cannot make ${numPools} pools from ${teams.length} teams`);
  }

  // Seed: sort by rating desc, assign 1-based seeds.
  const seeded: SeededTeam[] = [...teams]
    .sort((a, b) => b.rating - a.rating)
    .map((t, i) => ({ ...t, seed: i + 1 }));

  // Snake distribution.
  const buckets: SeededTeam[][] = Array.from({ length: numPools }, () => []);
  seeded.forEach((team, i) => {
    const round = Math.floor(i / numPools);
    const posInRound = i % numPools;
    const poolIndex = round % 2 === 0 ? posInRound : numPools - 1 - posInRound;
    buckets[poolIndex]!.push(team);
  });

  // The top `numPools` seeds (one per pool) must never share a pool — track them.
  const lockedSeeds = new Set(seeded.slice(0, numPools).map((t) => t.seed));

  // Re-pool to minimize rematches/co-location when asked; else optional balance refine.
  if (weights.rematchWeight > 0 || weights.locationWeight > 0) {
    optimize(buckets, lockedSeeds, weights, past, options.maxIterations ?? 100);
  } else if (refine) {
    refineBalance(buckets, lockedSeeds, maxIterations);
  }

  return summarizeResult(buckets, teams.length, past);
}

function summarizeResult(
  buckets: SeededTeam[][],
  numTeams: number,
  past?: Record<string, number>,
): PoolResult {
  const pools = buckets.map((b, i) => summarize(b, i, past));
  const totals = pools.map((p) => p.totalRating);
  return {
    pools,
    strengthSpread: totals.length ? Math.max(...totals) - Math.min(...totals) : 0,
    balanceStdDev: stdDev(totals),
    numPools: pools.length,
    numTeams,
    rematchPairs: pools.reduce((s, p) => s + p.rematches.length, 0),
  };
}

/**
 * Recompute a full PoolResult from a manual pool arrangement (e.g. after a
 * director drags teams between pools). Seeds are preserved; only pool totals,
 * averages, and the balance metrics are recomputed.
 */
export function summarizePools(
  teamsByPool: SeededTeam[][],
  pastGames?: Record<string, number>,
): PoolResult {
  return summarizeResult(
    teamsByPool,
    teamsByPool.reduce((s, b) => s + b.length, 0),
    pastGames,
  );
}

/**
 * Greedy pairwise swaps between the strongest and weakest pools to reduce the
 * spread in total rating. Never swaps a locked top-seed and never makes the
 * spread worse.
 */
function refineBalance(
  buckets: SeededTeam[][],
  lockedSeeds: Set<number>,
  maxIterations: number,
): void {
  const total = (b: SeededTeam[]) => b.reduce((s, t) => s + t.rating, 0);

  for (let iter = 0; iter < maxIterations; iter++) {
    const totals = buckets.map(total);
    let maxI = 0;
    let minI = 0;
    for (let i = 1; i < buckets.length; i++) {
      if (totals[i]! > totals[maxI]!) maxI = i;
      if (totals[i]! < totals[minI]!) minI = i;
    }
    if (maxI === minI) break;

    const spread = totals[maxI]! - totals[minI]!;
    let bestDelta = 0;
    let bestSwap: { hi: number; lo: number } | null = null;

    // Try swapping a (non-locked) team from the strong pool with one from the
    // weak pool such that the strong team is heavier than the weak team.
    for (let hi = 0; hi < buckets[maxI]!.length; hi++) {
      const strong = buckets[maxI]![hi]!;
      if (lockedSeeds.has(strong.seed)) continue;
      for (let lo = 0; lo < buckets[minI]!.length; lo++) {
        const weak = buckets[minI]![lo]!;
        if (lockedSeeds.has(weak.seed)) continue;
        const diff = strong.rating - weak.rating;
        if (diff <= 0) continue;
        // New spread after swap (moving `diff` from strong pool to weak pool).
        const newSpread = Math.abs(spread - 2 * diff);
        const improvement = spread - newSpread;
        if (improvement > bestDelta) {
          bestDelta = improvement;
          bestSwap = { hi, lo };
        }
      }
    }

    if (!bestSwap || bestDelta <= 0) break;
    const tmp = buckets[maxI]![bestSwap.hi]!;
    buckets[maxI]![bestSwap.hi] = buckets[minI]![bestSwap.lo]!;
    buckets[minI]![bestSwap.lo] = tmp;
  }
}
