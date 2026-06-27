/**
 * Recompute every team's rating from scratch by replaying all FINAL games.
 * Idempotent and reproducible — cheap at Utah volumes. Wrapped in a RatingRun so
 * a failure leaves the last-good Rating table intact.
 */
import { prisma } from "@nbr/db";
import { computeRatings, EngineGame } from "@nbr/ratings";

export async function runRecompute(): Promise<void> {
  const run = await prisma.ratingRun.create({
    data: { status: "RUNNING", algorithmVersion: "glicko2-v1" },
  });
  console.log(`[recompute] started run ${run.id}`);

  try {
    const games = await prisma.game.findMany({
      where: {
        status: "FINAL",
        homeScore: { not: null },
        awayScore: { not: null },
      },
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

    const output = computeRatings(engineGames);
    console.log(
      `[recompute] ${output.gamesProcessed} games, ${output.teams.size} teams, ` +
        `${output.periods} periods, ${output.components} components`,
    );

    // Persist results. Upsert the current Rating row, append a history snapshot.
    let teamsAffected = 0;
    for (const [teamId, r] of output.teams) {
      // Skip ratings for teams that no longer exist (defensive).
      const exists = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
      if (!exists) continue;

      await prisma.rating.upsert({
        where: { teamId },
        create: {
          teamId,
          rating: r.rating,
          rd: r.rd,
          volatility: r.volatility,
          gamesPlayed: r.gamesPlayed,
          isProvisional: r.isProvisional,
          wins: r.wins,
          losses: r.losses,
          ties: r.ties,
          componentId: r.componentId,
          computedAt: new Date(),
        },
        update: {
          rating: r.rating,
          rd: r.rd,
          volatility: r.volatility,
          gamesPlayed: r.gamesPlayed,
          isProvisional: r.isProvisional,
          wins: r.wins,
          losses: r.losses,
          ties: r.ties,
          componentId: r.componentId,
          computedAt: new Date(),
        },
      });

      // One history snapshot per team for this run (latest state).
      await prisma.ratingHistory.create({
        data: {
          teamId,
          runId: run.id,
          rating: r.rating,
          rd: r.rd,
          volatility: r.volatility,
          gamesPlayed: r.gamesPlayed,
        },
      });
      teamsAffected += 1;
    }

    // Mark all processed games as rated (audit; recompute remains full each run).
    await prisma.game.updateMany({
      where: { status: "FINAL", ratedAt: null },
      data: { ratedAt: new Date() },
    });

    await prisma.ratingRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        gamesProcessed: output.gamesProcessed,
        teamsAffected,
      },
    });
    console.log(`[recompute] run ${run.id} SUCCESS — ${teamsAffected} teams updated`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.ratingRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message },
    });
    console.error(`[recompute] run ${run.id} FAILED:`, message);
    throw err;
  }
}
