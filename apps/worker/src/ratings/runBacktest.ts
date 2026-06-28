/**
 * Backtest the rating models on the real game database: train on earlier games,
 * predict a held-out recent window, and print a log-loss / Brier / accuracy
 * comparison so we can see which model predicts best and tune it.
 */
import { prisma } from "@nbr/db";
import { backtest, BacktestSegment, EngineGame } from "@nbr/ratings";

export async function runBacktest(): Promise<void> {
  const testWindowDays = Number(process.env.BACKTEST_WINDOW_DAYS) || 21;

  const [games, teams] = await Promise.all([
    prisma.game.findMany({
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
    }),
    prisma.team.findMany({ select: { id: true, ageGroup: true } }),
  ]);

  const engineGames: EngineGame[] = games.map((g) => ({
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    homeScore: g.homeScore!,
    awayScore: g.awayScore!,
    playedAt: g.playedAt,
    neutralSite: g.neutralSite,
  }));

  const teamAge = new Map<string, string>();
  for (const t of teams) if (t.ageGroup) teamAge.set(t.id, t.ageGroup);

  const scores = backtest(engineGames, { testWindowDays, teamAge });
  if (scores.length === 0) {
    console.log(`[backtest] not enough data (need a train set + games in the last ${testWindowDays} days).`);
    return;
  }

  const segments = [...new Set(scores.map((s) => s.segment))] as BacktestSegment[];
  for (const seg of segments) {
    const rows = scores.filter((s) => s.segment === seg);
    console.log(`\n[backtest] segment: ${seg} (${rows[0]!.n} held-out games, last ${testWindowDays} days)`);
    console.log("model         logLoss   brier   accuracy");
    console.log("------------  --------  ------  --------");
    for (const s of rows) {
      console.log(
        `${s.model.padEnd(12)}  ${s.logLoss.toFixed(4)}  ${s.brier.toFixed(4)}  ${(s.accuracy * 100).toFixed(1)}%`,
      );
    }
  }

  // The unified-scale verdict: did the age model help on cross-age games?
  const cross = scores.filter((s) => s.segment === "cross-age");
  const age = cross.find((s) => s.model === "bt-age-v1");
  const mov = cross.find((s) => s.model === "bt-mov-v1");
  if (age && mov && age.n > 0) {
    const verdict = age.logLoss < mov.logLoss ? "IMPROVES" : "does NOT improve";
    console.log(
      `\n[backtest] cross-age verdict: bt-age-v1 ${verdict} on log-loss ` +
        `(${age.logLoss.toFixed(4)} vs ${mov.logLoss.toFixed(4)}, n=${age.n})`,
    );
  } else {
    console.log("\n[backtest] cross-age verdict: not enough cross-age games in the held-out window.");
  }
}
