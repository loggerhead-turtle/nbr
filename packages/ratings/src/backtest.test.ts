import { describe, it, expect } from "vitest";
import { backtest } from "./backtest";
import type { EngineGame } from "./engine";

/** Build a season where a strict strength order A>B>C>D>E mostly holds. */
function buildSeason(): EngineGame[] {
  const teams = ["A", "B", "C", "D", "E"];
  const strength: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };
  const games: EngineGame[] = [];
  let day = 0;
  // Round-robin several times; stronger team wins by its strength gap.
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        // Alternate home/away each round so the stronger team isn't always home.
        const [home, away] = round % 2 === 0 ? [teams[i]!, teams[j]!] : [teams[j]!, teams[i]!];
        const diff = strength[home]! - strength[away]!; // can be negative (home weaker)
        const hs = 5 + diff;
        const as = 5 - diff;
        const base = new Date("2025-03-01T18:00:00Z");
        base.setUTCDate(base.getUTCDate() + day++);
        games.push({ homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, playedAt: base, neutralSite: true });
      }
    }
  }
  return games;
}

describe("backtest", () => {
  const scores = backtest(buildSeason(), { testWindowDays: 14 });

  it("returns scores for the candidate models", () => {
    const names = scores.map((s) => s.model);
    expect(names).toContain("glicko2-v1");
    expect(names).toContain("bt-mov-v1");
    expect(scores.every((s) => s.n > 0)).toBe(true);
  });

  it("rating models beat a coin flip on log-loss", () => {
    const coin = scores.find((s) => s.model === "coinflip")!;
    const bt = scores.find((s) => s.model === "bt-mov-v1")!;
    expect(bt.logLoss).toBeLessThan(coin.logLoss);
    expect(bt.accuracy).toBeGreaterThan(0.5);
  });

  it("defaults to a single 'all' segment with no age map", () => {
    expect(scores.every((s) => s.segment === "all")).toBe(true);
  });

  it("adds bt-age-v1 and same/cross-age segments when ages are supplied", () => {
    // A>B>C are U12, D>E are U10; cross-age games connect them.
    const teamAge = new Map<string, string>([
      ["A", "U12"], ["B", "U12"], ["C", "U12"], ["D", "U10"], ["E", "U10"],
    ]);
    const withAge = backtest(buildSeason(), { testWindowDays: 14, teamAge });
    expect(withAge.some((s) => s.model === "bt-age-v1")).toBe(true);
    const segs = new Set(withAge.map((s) => s.segment));
    expect(segs.has("cross-age")).toBe(true);
    expect(segs.has("same-age")).toBe(true);
    // Cross-age rows only count games between different age groups.
    const crossN = withAge.find((s) => s.segment === "cross-age")!.n;
    const sameN = withAge.find((s) => s.segment === "same-age")!.n;
    const allN = withAge.find((s) => s.segment === "all")!.n;
    expect(crossN + sameN).toBe(allN);
    expect(crossN).toBeGreaterThan(0);
  });
});
