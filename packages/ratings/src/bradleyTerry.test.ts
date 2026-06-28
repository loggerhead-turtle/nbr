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
