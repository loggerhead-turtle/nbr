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

export interface PoolTeam {
  id: string;
  name: string;
  rating: number;
  isProvisional?: boolean;
}

export interface SeededTeam extends PoolTeam {
  /** 1-based overall seed (1 = strongest). */
  seed: number;
}

export interface Pool {
  index: number;
  label: string; // "Pool A", "Pool B", ...
  teams: SeededTeam[];
  totalRating: number;
  averageRating: number;
}

export interface PoolResult {
  pools: Pool[];
  /** Spread between the strongest and weakest pool by total rating. */
  strengthSpread: number;
  /** Population standard deviation of pool total ratings (lower = more even). */
  balanceStdDev: number;
  numPools: number;
  numTeams: number;
}

export interface PoolOptions {
  /** Run greedy swap refinement after snake seeding (default true). */
  refine?: boolean;
  /** Max refinement iterations (default 200). */
  maxIterations?: number;
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

function summarize(teams: SeededTeam[], index: number): Pool {
  const totalRating = teams.reduce((s, t) => s + t.rating, 0);
  return {
    index,
    label: poolLabel(index),
    teams,
    totalRating,
    averageRating: teams.length ? totalRating / teams.length : 0,
  };
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
  const refine = options.refine ?? true;
  const maxIterations = options.maxIterations ?? 200;

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

  if (refine) {
    refineBalance(buckets, lockedSeeds, maxIterations);
  }

  const pools = buckets.map((b, i) => summarize(b, i));
  const totals = pools.map((p) => p.totalRating);
  const strengthSpread = totals.length ? Math.max(...totals) - Math.min(...totals) : 0;

  return {
    pools,
    strengthSpread,
    balanceStdDev: stdDev(totals),
    numPools,
    numTeams: teams.length,
  };
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
