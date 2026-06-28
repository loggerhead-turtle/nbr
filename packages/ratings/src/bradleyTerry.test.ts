import { describe, it, expect } from "vitest";
import { computeRatingsBT } from "./bradleyTerry";
import type { EngineGame } from "./engine";

function game(home: string, away: string, hs: number, as: number, dayOffset: number): EngineGame {
  const base = new Date("2025-03-01T18:00:00Z");
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return { homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, playedAt: base, neutralSite: true };
}

describe("computeRatingsBT", () => {
  it("orders a transitive chain even when the ends never play (A>B>C>D)", () => {
    // A beats B, B beats C, C beats D — A and D never meet.
    const games: EngineGame[] = [
      game("A", "B", 5, 2, 0),
      game("A", "B", 6, 3, 7),
      game("B", "C", 5, 2, 1),
      game("B", "C", 7, 1, 8),
      game("C", "D", 5, 2, 2),
      game("C", "D", 6, 0, 9),
    ];
    const out = computeRatingsBT(games, { lambda: 0.3 });
    const r = (id: string) => out.teams.get(id)!.rating;
    expect(r("A")).toBeGreaterThan(r("B"));
    expect(r("B")).toBeGreaterThan(r("C"));
    expect(r("C")).toBeGreaterThan(r("D"));
    expect(r("A")).toBeGreaterThan(r("D")); // transitive, never played
  });

  it("rewards a bigger margin more — but caps blowouts", () => {
    const oneRun = computeRatingsBT([game("A", "B", 4, 3, 0), game("A", "B", 4, 3, 7)], { lambda: 0.3 });
    const blowout = computeRatingsBT([game("A", "B", 14, 0, 0), game("A", "B", 14, 0, 7)], { lambda: 0.3 });
    const huge = computeRatingsBT([game("A", "B", 30, 0, 0), game("A", "B", 30, 0, 7)], { lambda: 0.3 });
    const gap = (o: ReturnType<typeof computeRatingsBT>) => o.teams.get("A")!.rating - o.teams.get("B")!.rating;
    expect(gap(blowout)).toBeGreaterThan(gap(oneRun));
    // Cap: 30-run win is not dramatically beyond a 14-run win.
    expect(gap(huge) - gap(blowout)).toBeLessThan(gap(blowout) - gap(oneRun));
  });

  it("keeps an undefeated team finite (regularization)", () => {
    const games: EngineGame[] = Array.from({ length: 6 }, (_, i) => game("A", `B${i}`, 7, 1, i));
    const out = computeRatingsBT(games, { lambda: 0.6 });
    const a = out.teams.get("A")!;
    expect(Number.isFinite(a.rating)).toBe(true);
    expect(a.rating).toBeLessThan(3000); // not blown up to +inf
    expect(a.rating).toBeGreaterThan(1500);
  });

  it("flags few-game teams provisional and detects components", () => {
    const games: EngineGame[] = [
      game("A", "B", 5, 4, 0),
      game("X", "Y", 5, 4, 0),
      game("Y", "X", 6, 2, 7),
    ];
    const out = computeRatingsBT(games);
    expect(out.teams.get("A")!.isProvisional).toBe(true);
    expect(out.components).toBe(2);
    expect(out.teams.get("A")!.componentId).not.toBe(out.teams.get("X")!.componentId);
  });

  it("carries a predecessor rating forward as a prior", () => {
    // One game, A beats B. Without a prior both are near 1500; with a high prior
    // for A, A starts and stays well above.
    const games: EngineGame[] = [game("A", "B", 5, 4, 0)];
    const plain = computeRatingsBT(games, { lambda: 0.6 });
    const carried = computeRatingsBT(games, {
      lambda: 0.6,
      priorRating: new Map([["A", 2200]]),
    });
    expect(carried.teams.get("A")!.rating).toBeGreaterThan(plain.teams.get("A")!.rating + 200);
  });
});

describe("computeRatingsBT — age-baseline curve (bt-age-v1)", () => {
  // Two age groups with a few bridge games connecting them.
  const ages = new Map<string, string>([
    ["S1", "U16"], ["S2", "U16"], ["J1", "U10"], ["J2", "U10"],
  ]);
  const baseGames: EngineGame[] = [
    // within U16
    game("S1", "S2", 6, 3, 0), game("S1", "S2", 5, 2, 7),
    // within U10
    game("J1", "J2", 6, 3, 1), game("J1", "J2", 7, 2, 8),
  ];

  it("places an older age group above a younger one when bridges say so", () => {
    const games = [
      ...baseGames,
      game("S1", "J1", 10, 1, 2), game("S1", "J1", 9, 0, 9), game("S2", "J2", 8, 1, 3),
    ];
    const out = computeRatingsBT(games, { lambda: 0.3, ageGroup: ages });
    const curve = new Map(out.ageCurve!.map((c) => [c.ageGroup, c.baseline]));
    expect(curve.get("U16")!).toBeGreaterThan(curve.get("U10")!);
    // A bridge count is reported per age (used by the UI to caveat thin ages).
    expect(out.ageCurve!.find((c) => c.ageGroup === "U16")!.bridgeGames).toBe(3);
    // An average older team outranks an average younger team across the gap.
    expect(out.teams.get("S2")!.rating).toBeGreaterThan(out.teams.get("J1")!.rating);
  });

  it("never inverts the curve even if a younger team plays up and wins", () => {
    // J1 (U10) thrashes S1 (U16) in the bridges — selection bias incarnate.
    const games = [
      ...baseGames,
      game("J1", "S1", 12, 0, 2), game("J1", "S1", 11, 0, 9), game("J1", "S2", 10, 1, 3),
    ];
    const out = computeRatingsBT(games, { lambda: 0.3, ageGroup: ages, enforceMonotone: true });
    const curve = new Map(out.ageCurve!.map((c) => [c.ageGroup, c.baseline]));
    expect(curve.get("U16")!).toBeGreaterThanOrEqual(curve.get("U10")! - 1e-6);
  });

  it("preserves within-age ordering and leaves the plain model untouched", () => {
    const u12 = new Map<string, string>([["A", "U12"], ["B", "U12"], ["C", "U12"]]);
    const games: EngineGame[] = [
      game("A", "B", 5, 2, 0), game("B", "C", 6, 3, 1), game("A", "C", 7, 1, 2),
    ];
    const plain = computeRatingsBT(games, { lambda: 0.3 });
    const aged = computeRatingsBT(games, { lambda: 0.3, ageGroup: u12 });
    expect(plain.ageCurve).toBeUndefined();
    const order = (o: ReturnType<typeof computeRatingsBT>) =>
      ["A", "B", "C"].sort((x, y) => o.teams.get(y)!.rating - o.teams.get(x)!.rating);
    expect(order(aged)).toEqual(order(plain));
  });

  it("keeps a dominant young team below an average older team (the real fix)", () => {
    // A 9U team that crushes every 9U peer, and an average 14U team, in separate
    // islands (no cross-age games). With a realistic developmental prior the 14U
    // baseline must sit well above even an undefeated 9U.
    const ages2 = new Map<string, string>([
      ["Y1", "U9"], ["Y2", "U9"], ["Y3", "U9"],
      ["O1", "U14"], ["O2", "U14"], ["O3", "U14"],
    ]);
    const games: EngineGame[] = [];
    // Y1 dominates the 9U pool; O-teams trade evenly in the 14U pool.
    for (let r = 0; r < 4; r++) {
      games.push(game("Y1", "Y2", 15, 0, r), game("Y1", "Y3", 16, 0, r + 10));
      games.push(game("O1", "O2", 6, 5, r + 20), game("O2", "O3", 5, 4, r + 30));
    }
    const out = computeRatingsBT(games, { lambda: 0.3, ageGroup: ages2 });
    const r = (id: string) => out.teams.get(id)!.rating;
    // The undefeated 9U must NOT outrank a middling 14U.
    expect(r("Y1")).toBeLessThan(r("O3"));
    // Curve is centered so 14U ≈ 1500 and 9U sits clearly below it.
    const curve = new Map(out.ageCurve!.map((c) => [c.ageGroup, c.baseline]));
    expect(curve.get("U14")!).toBeGreaterThan(curve.get("U9")! + 400);
    expect(Math.abs(curve.get("U14")! - 1500)).toBeLessThan(50);
  });

  it("widens RD for an age that has no bridge games (rests on the prior)", () => {
    // Two disconnected age islands, no bridges at all.
    const games = [...baseGames];
    const out = computeRatingsBT(games, { lambda: 0.3, ageGroup: ages });
    for (const c of out.ageCurve!) expect(c.bridgeGames).toBe(0);
    // The curve still orders U16 ≥ U10 purely from the developmental prior.
    const curve = new Map(out.ageCurve!.map((c) => [c.ageGroup, c.baseline]));
    expect(curve.get("U16")!).toBeGreaterThan(curve.get("U10")!);
  });
});
