/**
 * Recompute every team's rating from scratch by replaying all FINAL games.
 * Idempotent and reproducible — cheap at Utah volumes. Wrapped in a RatingRun so
 * a failure leaves the last-good Rating table intact.
 */
import { prisma } from "@nbr/db";
import { computeRatings, computeRatingsBT, EngineGame, EngineOutput } from "@nbr/ratings";

export async function runRecompute(): Promise<void> {
  const algorithm = process.env.RATING_ALGORITHM || "bt-mov-v1";
  const run = await prisma.ratingRun.create({
    data: { status: "RUNNING", algorithmVersion: algorithm },
  });
  console.log(`[recompute] started run ${run.id} (algorithm=${algorithm})`);

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

    let output: EngineOutput;
    if (algorithm === "glicko2-v1") {
      output = computeRatings(engineGames);
    } else {
      // Bradley-Terry: carry predecessor ratings forward as priors, set per-level
      // home advantage (youth vs high school), weaken the anchor for carried teams.
      // `bt-age-v1` additionally fits an age-group baseline so 8U and 16U land on
      // one absolute scale (see packages/ratings/src/bradleyTerry.ts).
      const teams = await prisma.team.findMany({
        select: { id: true, classification: true, predecessorTeamId: true, ageGroup: true },
      });
      const ratings = await prisma.rating.findMany({ select: { teamId: true, rating: true } });
      const ratingByTeam = new Map(ratings.map((r) => [r.teamId, r.rating] as const));

      const priorRating = new Map<string, number>();
      const level = new Map<string, "youth" | "hs">();
      const ageGroup = new Map<string, string>();
      const seasonBoundaryTeams = new Set<string>();
      for (const t of teams) {
        level.set(t.id, t.classification ? "hs" : "youth");
        if (t.ageGroup) ageGroup.set(t.id, t.ageGroup);
        if (t.predecessorTeamId) {
          const pred = ratingByTeam.get(t.predecessorTeamId);
          if (pred != null) {
            priorRating.set(t.id, pred);
            seasonBoundaryTeams.add(t.id);
          }
        }
      }
      output = computeRatingsBT(engineGames, {
        priorRating,
        level,
        seasonBoundaryTeams,
        ...(algorithm === "bt-age-v1" ? { ageGroup } : {}),
      });
    }
    console.log(
      `[recompute] ${output.gamesProcessed} games, ${output.teams.size} teams, ` +
        `${output.periods} periods, ${output.components} components`,
    );
    if (output.ageCurve) {
      console.log("[recompute] age-group baseline curve (display scale):");
      for (const c of output.ageCurve) {
        console.log(`  ${c.ageGroup.padEnd(5)} ${c.baseline.toFixed(0)}  (${c.bridgeGames} bridge games)`);
      }
    }

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
