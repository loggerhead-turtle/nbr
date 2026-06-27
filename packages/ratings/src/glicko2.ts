/**
 * Glicko-2 rating system (Mark Glickman).
 *
 * Pure, dependency-free implementation operating on *rating periods*: each team
 * is updated once per period from the set of games it played that period. This
 * is the form Glicko-2 is designed for and is well-suited to teams that play
 * intermittently — inactivity raises a team's rating deviation (RD), correctly
 * widening uncertainty.
 *
 * Public scale: rating ~1500, RD ~350 for a brand-new team. Internally the
 * algorithm works on the Glicko-2 scale (mu, phi) via the 173.7178 conversion.
 */

export const GLICKO2_SCALE = 173.7178;
export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOLATILITY = 0.06;

export interface Glicko2Config {
  /** System constant (tau): constrains volatility change. Lower = steadier. */
  tau: number;
  /** Convergence tolerance for the volatility iteration. */
  epsilon: number;
}

export const DEFAULT_CONFIG: Glicko2Config = {
  tau: 0.5,
  epsilon: 0.000001,
};

export interface TeamRating {
  rating: number;
  rd: number;
  volatility: number;
}

/** A single game from one team's perspective. score: 1 win, 0.5 tie, 0 loss. */
export interface MatchResult {
  opponentRating: number;
  opponentRd: number;
  score: number;
}

export function defaultRating(): TeamRating {
  return {
    rating: DEFAULT_RATING,
    rd: DEFAULT_RD,
    volatility: DEFAULT_VOLATILITY,
  };
}

// ── scale conversions ───────────────────────────────────────────────────────

function toMu(rating: number): number {
  return (rating - DEFAULT_RATING) / GLICKO2_SCALE;
}

function toPhi(rd: number): number {
  return rd / GLICKO2_SCALE;
}

function fromMu(mu: number): number {
  return mu * GLICKO2_SCALE + DEFAULT_RATING;
}

function fromPhi(phi: number): number {
  return phi * GLICKO2_SCALE;
}

// ── Glicko-2 helper functions ───────────────────────────────────────────────

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Solve for the new volatility (sigma') using the Illinois variant of
 * regula falsi, exactly as specified in Glickman's Glicko-2 paper.
 */
function newVolatility(
  phi: number,
  v: number,
  delta: number,
  sigma: number,
  cfg: Glicko2Config,
): number {
  const a = Math.log(sigma * sigma);
  const tau2 = cfg.tau * cfg.tau;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) * (phi * phi + v + ex);
    return num / den - (x - a) / tau2;
  };

  let A = a;
  let B: number;
  const delta2 = delta * delta;
  const phi2v = phi * phi + v;

  if (delta2 > phi2v) {
    B = Math.log(delta2 - phi2v);
  } else {
    let k = 1;
    while (f(a - k * cfg.tau) < 0) {
      k += 1;
    }
    B = a - k * cfg.tau;
  }

  let fA = f(A);
  let fB = f(B);

  while (Math.abs(B - A) > cfg.epsilon) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  return Math.exp(A / 2);
}

/**
 * Update one team's rating from the games it played in a single rating period.
 *
 * With no games the team's rating and volatility are unchanged but its RD is
 * widened to reflect the added uncertainty of not having competed.
 */
export function rate(
  team: TeamRating,
  matches: MatchResult[],
  cfg: Glicko2Config = DEFAULT_CONFIG,
): TeamRating {
  const mu = toMu(team.rating);
  const phi = toPhi(team.rd);
  const sigma = team.volatility;

  if (matches.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return {
      rating: team.rating,
      rd: clampRd(fromPhi(phiStar)),
      volatility: sigma,
    };
  }

  // Estimated variance (v) and improvement direction (delta numerator).
  let vInv = 0;
  let deltaSum = 0;
  for (const m of matches) {
    const muJ = toMu(m.opponentRating);
    const phiJ = toPhi(m.opponentRd);
    const gj = g(phiJ);
    const e = expectedScore(mu, muJ, phiJ);
    vInv += gj * gj * e * (1 - e);
    deltaSum += gj * (m.score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  const sigmaPrime = newVolatility(phi, v, delta, sigma, cfg);

  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return {
    rating: fromMu(muPrime),
    rd: clampRd(fromPhi(phiPrime)),
    volatility: sigmaPrime,
  };
}

/** Keep RD within sane bounds (never below a floor, never above the default). */
function clampRd(rd: number): number {
  const MIN_RD = 30;
  return Math.min(DEFAULT_RD, Math.max(MIN_RD, rd));
}

/**
 * Expected probability that team A beats team B, accounting for both RDs.
 * Useful for previews and for margin-of-victory damping (engine v2).
 */
export function winProbability(a: TeamRating, b: TeamRating): number {
  const muA = toMu(a.rating);
  const muB = toMu(b.rating);
  const phiB = toPhi(b.rd);
  return expectedScore(muA, muB, phiB);
}
