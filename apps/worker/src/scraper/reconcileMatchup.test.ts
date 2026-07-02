import { describe, it, expect } from "vitest";
import { isTbdOpponent, canonicalPair } from "./scrapeTeam.js";

describe("isTbdOpponent", () => {
  it("drops bare and date-appended TBD placeholders", () => {
    expect(isTbdOpponent("TBD")).toBe(true);
    expect(isTbdOpponent("tbd")).toBe(true);
    expect(isTbdOpponent("TBD 3/15")).toBe(true);
    expect(isTbdOpponent("  TBD 6/1  ")).toBe(true);
  });

  it("keeps real team names, including ones that merely contain 'tbd'", () => {
    expect(isTbdOpponent("Cannons Baseball 14U")).toBe(false);
    expect(isTbdOpponent("Utah Warriors 14U")).toBe(false);
    // "tbd" only triggers as the leading token, not embedded.
    expect(isTbdOpponent("Montebello 12U")).toBe(false);
  });
});

describe("canonicalPair", () => {
  it("orders the pair by id and keeps each side's count aligned to that order", () => {
    // teamId sorts BEFORE opponentId → this team is A, its count is countA.
    const p1 = canonicalPair("aaa", "bbb", 2, 1);
    expect(p1).toEqual({ teamIdA: "aaa", teamIdB: "bbb", countA: 2, countB: 1 });

    // teamId sorts AFTER opponentId → this team is B, so its count becomes countB.
    const p2 = canonicalPair("bbb", "aaa", 2, 1);
    expect(p2).toEqual({ teamIdA: "aaa", teamIdB: "bbb", countA: 1, countB: 2 });
  });

  it("produces the same canonical row from either team's scrape", () => {
    // Team A lists 2, team B lists 1 — regardless of which side is scraping, the
    // stored (teamIdA, teamIdB) row must carry (countA=2, countB=1).
    const fromA = canonicalPair("aaa", "bbb", 2, 1);
    const fromB = canonicalPair("bbb", "aaa", 1, 2);
    expect(fromA).toEqual(fromB);
  });
});
