import { describe, it, expect } from "vitest";
import { rate, defaultRating, DEFAULT_CONFIG, winProbability, TeamRating } from "./glicko2.js";

describe("Glicko-2 reference example (Glickman paper)", () => {
  // Player: rating 1500, RD 200, vol 0.06, tau 0.5, against three opponents.
  const player: TeamRating = { rating: 1500, rd: 200, volatility: 0.06 };
  const matches = [
    { opponentRating: 1400, opponentRd: 30, score: 1 },
    { opponentRating: 1550, opponentRd: 100, score: 0 },
    { opponentRating: 1700, opponentRd: 300, score: 0 },
  ];

  const result = rate(player, matches, { ...DEFAULT_CONFIG, tau: 0.5 });

  it("produces the published new rating (~1464.06)", () => {
    expect(result.rating).toBeCloseTo(1464.06, 1);
  });

  it("produces the published new RD (~151.52)", () => {
    expect(result.rd).toBeCloseTo(151.52, 1);
  });

  it("produces the published new volatility (~0.05999)", () => {
    expect(result.volatility).toBeCloseTo(0.05999, 4);
  });
});

describe("inactivity", () => {
  it("widens RD and leaves rating/volatility unchanged when no games are played", () => {
    const team = defaultRating();
    const after = rate({ rating: 1600, rd: 80, volatility: 0.06 }, []);
    expect(after.rating).toBe(1600);
    expect(after.rd).toBeGreaterThan(80);
    expect(after.volatility).toBe(0.06);
    expect(team.rd).toBe(350);
  });
});

describe("monotonicity", () => {
  it("raises rating after a win and lowers it after a loss", () => {
    const start: TeamRating = { rating: 1500, rd: 200, volatility: 0.06 };
    const win = rate(start, [{ opponentRating: 1500, opponentRd: 200, score: 1 }]);
    const loss = rate(start, [{ opponentRating: 1500, opponentRd: 200, score: 0 }]);
    expect(win.rating).toBeGreaterThan(1500);
    expect(loss.rating).toBeLessThan(1500);
  });

  it("rewards beating a strong opponent more than a weak one", () => {
    const start: TeamRating = { rating: 1500, rd: 200, volatility: 0.06 };
    const beatStrong = rate(start, [{ opponentRating: 1800, opponentRd: 50, score: 1 }]);
    const beatWeak = rate(start, [{ opponentRating: 1200, opponentRd: 50, score: 1 }]);
    expect(beatStrong.rating).toBeGreaterThan(beatWeak.rating);
  });
});

describe("winProbability", () => {
  it("is 0.5 for evenly matched teams", () => {
    const a: TeamRating = { rating: 1500, rd: 50, volatility: 0.06 };
    const b: TeamRating = { rating: 1500, rd: 50, volatility: 0.06 };
    expect(winProbability(a, b)).toBeCloseTo(0.5, 5);
  });

  it("exceeds 0.5 when A is rated higher", () => {
    const a: TeamRating = { rating: 1700, rd: 50, volatility: 0.06 };
    const b: TeamRating = { rating: 1300, rd: 50, volatility: 0.06 };
    expect(winProbability(a, b)).toBeGreaterThan(0.8);
  });
});
