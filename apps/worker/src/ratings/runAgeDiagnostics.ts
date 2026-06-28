/**
 * Print the age-connectivity report against the real game database — the
 * Phase-1 decision gate for the unified cross-age scale. Tells us how many
 * bridge games link the age groups and how much of the pool they connect, i.e.
 * whether the `bt-age-v1` curve will be data-driven or prior-driven.
 */
import { prisma } from "@nbr/db";
import { ageConnectivity, EngineGame } from "@nbr/ratings";

export async function runAgeDiagnostics(): Promise<void> {
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

  const r = ageConnectivity(engineGames, teamAge);

  console.log("[age-diagnostics] cross-age connectivity\n");
  console.log(`teams (played):        ${r.teamsTotal}  (with age group: ${r.teamsWithAge})`);
  console.log(`same-age games:        ${r.sameAgeGames}`);
  console.log(`bridge games:          ${r.bridgeGames}`);
  console.log(`in bridging component: ${(r.fractionInBridgingComponent * 100).toFixed(1)}% of age-bearing teams`);
  if (r.isolatedAges.length) console.log(`isolated ages (prior-only): ${r.isolatedAges.join(", ")}`);

  console.log("\nage      teams   bridgeGames");
  console.log("-----    -----   -----------");
  for (const a of r.ages) {
    console.log(`${a.ageGroup.padEnd(7)}  ${String(a.teams).padStart(4)}   ${String(a.bridgeGames).padStart(8)}`);
  }

  console.log("\nbridge pair      gap   games");
  console.log("--------------   ---   -----");
  for (const b of r.bridges) {
    console.log(
      `${`${b.younger}↔${b.older}`.padEnd(14)}   ${String(b.gap).padStart(3)}   ${String(b.games).padStart(5)}`,
    );
  }
  if (r.bridges.length === 0) console.log("(no bridge games — the age curve will rest entirely on the prior)");

  // A rough, transparent rule of thumb for the gate.
  const adjacentCovered = r.adjacentBridges.filter((b) => b.games >= 3).length;
  console.log(
    `\n[age-diagnostics] adjacent age-pairs with >=3 bridge games: ${adjacentCovered}/${Math.max(0, r.ages.length - 1)}`,
  );
}
