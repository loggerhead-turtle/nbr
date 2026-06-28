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
});
