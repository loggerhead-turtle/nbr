/**
 * Predictive-accuracy backtest: the empirical "which model is best" answer.
 *
 * Time-split the games (train on earlier, predict a held-out recent window),
 * then score each candidate model by log-loss, Brier score, and accuracy. Lower
 * log-loss / Brier = better calibrated predictions.
 *
 * When a `teamAge` map is supplied, two extra things happen: the age-aware
 * `bt-age-v1` model joins the field, and every model is also scored on the
 * CROSS-AGE subset of the held-out games on its own. That cross-age segment is
 * the acceptance test for the unified scale — `bt-age-v1` must beat `bt-mov-v1`
 * there without regressing the same-age segment.
 */
import { computeRatings, type EngineGame } from "./engine";
import { computeRatingsBT, predictHomeWin } from "./bradleyTerry";
import { winProbability, type TeamRating } from "./glicko2";

export type BacktestSegment = "all" | "same-age" | "cross-age";

export interface BacktestScore {
  model: string;
  segment: BacktestSegment;
  n: number;
  logLoss: number;
  brier: number;
  accuracy: number;
}

export interface BacktestOptions {
  testWindowDays?: number;
  btLambda?: number;
  btHalfLifeDays?: number;
  /** Per-team age group; enables bt-age-v1 and the same-age/cross-age segments. */
  teamAge?: Map<string, string>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(p: number): number {
  return Math.min(1 - 1e-9, Math.max(1e-9, p));
}

function score(model: string, segment: BacktestSegment, preds: { p: number; y: number }[]): BacktestScore {
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
    segment,
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

  const teamAge = options.teamAge;
  const ageOf = (id: string): string | undefined => teamAge?.get(id) || undefined;
  // A game is "cross-age" only when both teams carry a (different) age group.
  const segmentOf = (g: EngineGame): "same-age" | "cross-age" | "unknown" => {
    const a = ageOf(g.homeTeamId);
    const b = ageOf(g.awayTeamId);
    if (!a || !b) return "unknown";
    return a === b ? "same-age" : "cross-age";
  };

  // Glicko-2 baseline.
  const glicko = computeRatings(train);
  const glickoPreds = evalGames.map((g) => {
    const a = glicko.teams.get(g.homeTeamId)!;
    const b = glicko.teams.get(g.awayTeamId)!;
    const ra: TeamRating = { rating: a.rating, rd: a.rd, volatility: a.volatility };
    const rb: TeamRating = { rating: b.rating, rd: b.rd, volatility: b.volatility };
    return { p: winProbability(ra, rb), y: outcome(g) };
  });

  // Bradley-Terry variants. predictHomeWin reads display ratings, so the age
  // baseline (when present) flows straight into the cross-age prediction.
  const btWl = computeRatingsBT(train, { lambda: options.btLambda, halfLifeDays: options.btHalfLifeDays, movCap: 0 });
  const btMov = computeRatingsBT(train, { lambda: options.btLambda, halfLifeDays: options.btHalfLifeDays });
  const btPreds = (out: ReturnType<typeof computeRatingsBT>) =>
    evalGames.map((g) => ({
      p: predictHomeWin(out.teams.get(g.homeTeamId)!.rating, out.teams.get(g.awayTeamId)!.rating),
      y: outcome(g),
    }));

  const baseline = evalGames.map(() => 0.5);

  // model name → per-eval-game predicted home-win probability (aligned to evalGames).
  const models: { name: string; preds: number[] }[] = [
    { name: "coinflip", preds: baseline },
    { name: "glicko2-v1", preds: glickoPreds.map((x) => x.p) },
    { name: "bt-wlt", preds: btPreds(btWl).map((x) => x.p) },
    { name: "bt-mov-v1", preds: btPreds(btMov).map((x) => x.p) },
  ];
  if (teamAge) {
    const btAge = computeRatingsBT(train, {
      lambda: options.btLambda,
      halfLifeDays: options.btHalfLifeDays,
      ageGroup: teamAge,
    });
    models.push({ name: "bt-age-v1", preds: btPreds(btAge).map((x) => x.p) });
  }

  const ys = evalGames.map(outcome);
  const segs = evalGames.map(segmentOf);
  const pick = (preds: number[], want: BacktestSegment) =>
    preds
      .map((p, i) => ({ p, y: ys[i]!, seg: segs[i]! }))
      .filter((x) => want === "all" || x.seg === want)
      .map(({ p, y }) => ({ p, y }));

  const segments: BacktestSegment[] = teamAge ? ["all", "same-age", "cross-age"] : ["all"];
  const out: BacktestScore[] = [];
  for (const seg of segments) {
    for (const m of models) out.push(score(m.name, seg, pick(m.preds, seg)));
  }
  return out;
}
