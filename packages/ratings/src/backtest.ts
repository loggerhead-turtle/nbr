/**
 * Predictive-accuracy backtest: the empirical "which model is best" answer.
 *
 * Time-split the games (train on earlier, predict a held-out recent window),
 * then score each candidate model by log-loss, Brier score, and accuracy. Lower
 * log-loss / Brier = better calibrated predictions.
 */
import { computeRatings, type EngineGame } from "./engine";
import { computeRatingsBT, predictHomeWin } from "./bradleyTerry";
import { winProbability, type TeamRating } from "./glicko2";

export interface BacktestScore {
  model: string;
  n: number;
  logLoss: number;
  brier: number;
  accuracy: number;
}

export interface BacktestOptions {
  testWindowDays?: number;
  btLambda?: number;
  btHalfLifeDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(p: number): number {
  return Math.min(1 - 1e-9, Math.max(1e-9, p));
}

function score(model: string, preds: { p: number; y: number }[]): BacktestScore {
  let ll = 0;
  let brier = 0;
  let correct = 0;
  let decisive = 0;
  for (const { p, y } of preds) {
    const pc = clamp(p);
    ll += -(y * Math.log(pc) + (1 - y) * Math.log(1 - pc));
    brier += (pc - y) ** 2;
    if (y !== 0.5) {
      decisive++;
      if ((pc > 0.5 && y === 1) || (pc < 0.5 && y === 0)) correct++;
    }
  }
  const n = preds.length;
  return {
    model,
    n,
    logLoss: n ? ll / n : 0,
    brier: n ? brier / n : 0,
    accuracy: decisive ? correct / decisive : 0,
  };
}

/** Run all candidate models on the same train/test split and return their scores. */
export function backtest(games: EngineGame[], options: BacktestOptions = {}): BacktestScore[] {
  const testWindowDays = options.testWindowDays ?? 21;
  const finals = games
    .filter((g) => g.homeScore != null && g.awayScore != null)
    .sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
  if (finals.length < 10) return [];

  const maxT = finals[finals.length - 1]!.playedAt.getTime();
  const cutoff = maxT - testWindowDays * DAY_MS;
  const train = finals.filter((g) => g.playedAt.getTime() < cutoff);
  const test = finals.filter((g) => g.playedAt.getTime() >= cutoff);
  if (train.length < 5 || test.length === 0) return [];

  const trained = new Set<string>();
  for (const g of train) {
    trained.add(g.homeTeamId);
    trained.add(g.awayTeamId);
  }
  const evalGames = test.filter((g) => trained.has(g.homeTeamId) && trained.has(g.awayTeamId));
  if (evalGames.length === 0) return [];

  const outcome = (g: EngineGame): number =>
    g.homeScore! > g.awayScore! ? 1 : g.homeScore! < g.awayScore! ? 0 : 0.5;

  // Glicko-2 baseline.
  const glicko = computeRatings(train);
  const glickoPreds = evalGames.map((g) => {
    const a = glicko.teams.get(g.homeTeamId)!;
    const b = glicko.teams.get(g.awayTeamId)!;
    const ra: TeamRating = { rating: a.rating, rd: a.rd, volatility: a.volatility };
    const rb: TeamRating = { rating: b.rating, rd: b.rd, volatility: b.volatility };
    return { p: winProbability(ra, rb), y: outcome(g) };
  });

  // Bradley-Terry (W/L/T only) and BT + capped MOV.
  const btWl = computeRatingsBT(train, { lambda: options.btLambda, halfLifeDays: options.btHalfLifeDays, movCap: 0 });
  const btMov = computeRatingsBT(train, { lambda: options.btLambda, halfLifeDays: options.btHalfLifeDays });
  const btPreds = (out: ReturnType<typeof computeRatingsBT>) =>
    evalGames.map((g) => ({
      p: predictHomeWin(out.teams.get(g.homeTeamId)!.rating, out.teams.get(g.awayTeamId)!.rating),
      y: outcome(g),
    }));

  // A naive "home always wins 50/50" reference.
  const baseline = evalGames.map((g) => ({ p: 0.5, y: outcome(g) }));

  return [
    score("coinflip", baseline),
    score("glicko2-v1", glickoPreds),
    score("bt-wlt", btPreds(btWl)),
    score("bt-mov-v1", btPreds(btMov)),
  ];
}
