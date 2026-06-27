import { describe, it, expect } from "vitest";
import { computeRatings, EngineGame } from "./engine.js";

function game(home: string, away: string, hs: number, as: number, dayOffset: number): EngineGame {
  const base = new Date("2025-03-01T18:00:00Z");
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return { homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, playedAt: base };
}

describe("computeRatings", () => {
  it("returns empty output for no games", () => {
    const out = computeRatings([]);
    expect(out.teams.size).toBe(0);
    expect(out.gamesProcessed).toBe(0);
  });

  it("ranks a consistently winning team above a consistently losing team", () => {
    const games: EngineGame[] = [
      game("A", "B", 10, 2, 0),
      game("A", "C", 8, 1, 7),
      game("A", "B", 9, 3, 14),
      game("A", "C", 7, 0, 21),
      game("B", "C", 5, 4, 28),
      game("A", "B", 6, 2, 35),
    ];
    const out = computeRatings(games);
    const a = out.teams.get("A")!;
    const b = out.teams.get("B")!;
    const c = out.teams.get("C")!;
    expect(a.rating).toBeGreaterThan(b.rating);
    expect(a.rating).toBeGreaterThan(c.rating);
    expect(a.wins).toBe(5);
    expect(a.losses).toBe(0);
  });

  it("tracks win/loss/tie records correctly", () => {
    const out = computeRatings([game("A", "B", 3, 3, 0)]);
    expect(out.teams.get("A")!.ties).toBe(1);
    expect(out.teams.get("B")!.ties).toBe(1);
  });

  it("detects disconnected components", () => {
    // Two separate clusters that never play each other.
    const games: EngineGame[] = [
      game("A", "B", 5, 4, 0),
      game("B", "A", 6, 2, 7),
      game("X", "Y", 5, 4, 0),
      game("Y", "X", 6, 2, 7),
    ];
    const out = computeRatings(games);
    expect(out.components).toBe(2);
    expect(out.teams.get("A")!.componentId).toBe(out.teams.get("B")!.componentId);
    expect(out.teams.get("A")!.componentId).not.toBe(out.teams.get("X")!.componentId);
  });

  it("flags teams with few games as provisional", () => {
    const out = computeRatings([game("A", "B", 5, 4, 0)]);
    expect(out.teams.get("A")!.isProvisional).toBe(true);
  });

  it("records rating history snapshots for periods a team played in", () => {
    const games: EngineGame[] = [game("A", "B", 5, 4, 0), game("A", "B", 6, 2, 7)];
    const out = computeRatings(games);
    expect(out.teams.get("A")!.history.length).toBe(2);
  });
});
