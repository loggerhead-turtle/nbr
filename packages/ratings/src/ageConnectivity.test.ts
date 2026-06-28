import { describe, it, expect } from "vitest";
import { ageConnectivity } from "./ageConnectivity";
import type { EngineGame } from "./engine";

function game(home: string, away: string, dayOffset: number): EngineGame {
  const base = new Date("2025-03-01T18:00:00Z");
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return { homeTeamId: home, awayTeamId: away, homeScore: 5, awayScore: 3, playedAt: base };
}

describe("ageConnectivity", () => {
  const ages = new Map<string, string>([
    ["S1", "U16"], ["S2", "U16"], ["J1", "U10"], ["J2", "U10"], ["M1", "U12"],
  ]);

  it("separates same-age from bridge games and reports pairs", () => {
    const games: EngineGame[] = [
      game("S1", "S2", 0), // same-age U16
      game("J1", "J2", 1), // same-age U10
      game("S1", "J1", 2), // bridge U16↔U10 (gap 6)
      game("M1", "J1", 3), // bridge U12↔U10 (gap 2)
    ];
    const r = ageConnectivity(games, ages);
    expect(r.sameAgeGames).toBe(2);
    expect(r.bridgeGames).toBe(2);
    expect(r.bridges.map((b) => `${b.younger}-${b.older}`).sort()).toEqual(["U10-U12", "U10-U16"]);
    expect(r.bridges.find((b) => b.older === "U16")!.gap).toBe(6);
  });

  it("flags isolated ages and computes the bridging fraction", () => {
    // U16 island never meets the U10/U12 island.
    const games: EngineGame[] = [
      game("S1", "S2", 0),
      game("J1", "M1", 1), // bridge U10↔U12
    ];
    const r = ageConnectivity(games, ages);
    expect(r.isolatedAges).toContain("U16");
    // J1 and M1 are in a bridging component; S1/S2 are not. 2 of 4 age-teams.
    expect(r.fractionInBridgingComponent).toBeCloseTo(0.5, 5);
  });

  it("ignores teams without a recognised age group", () => {
    const partial = new Map<string, string>([["S1", "U16"], ["S2", "bogus"]]);
    const r = ageConnectivity([game("S1", "S2", 0)], partial);
    expect(r.bridgeGames).toBe(0);
    expect(r.sameAgeGames).toBe(0);
    expect(r.teamsWithAge).toBe(1);
  });
});
