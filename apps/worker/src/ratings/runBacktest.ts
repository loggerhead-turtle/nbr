/**
 * Backtest the rating models on the real game database: train on earlier games,
 * predict a held-out recent window, and print a log-loss / Brier / accuracy
 * comparison so we can see which model predicts best and tune it.
 */
import { prisma } from "@nbr/db";
import { backtest, EngineGame } from "@nbr/ratings";

export async function runBacktest(): Promise<void> {
  const testWindowDays = Number(process.env.BACKTEST_WINDOW_DAYS) || 21;

  const games = await prisma.game.findMany({
    where: { status: "FINAL", homeScore: { not: null }, awayScore: { not: null } },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      playedAt: true,
      neutralSite: true,
    },
    orderBy: { playedAt: "asc" },
  });

  const engineGames: EngineGame[] = games.map((g) => ({
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    homeScore: g.homeScore!,
    awayScore: g.awayScore!,
    playedAt: g.playedAt,
    neutralSite: g.neutralSite,
  }));

  const scores = backtest(engineGames, { testWindowDays });
  if (scores.length === 0) {
    console.log(`[backtest] not enough data (need a train set + games in the last ${testWindowDays} days).`);
    return;
  }

  console.log(`[backtest] held-out window: last ${testWindowDays} days, ${scores[0]!.n} games\n`);
  console.log("model         logLoss   brier   accuracy");
  console.log("------------  --------  ------  --------");
  for (const s of scores) {
    console.log(
      `${s.model.padEnd(12)}  ${s.logLoss.toFixed(4)}  ${s.brier.toFixed(4)}  ${(s.accuracy * 100).toFixed(1)}%`,
    );
  }
  const best = [...scores].sort((a, b) => a.logLoss - b.logLoss)[0]!;
  console.log(`\n[backtest] best by log-loss: ${best.model}`);
}
