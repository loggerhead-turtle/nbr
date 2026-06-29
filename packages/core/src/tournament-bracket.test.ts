import { describe, it, expect } from "vitest";
import { buildBracket, type BracketStandingTeam } from "./tournament-bracket.js";

/** Two pools of 4, strength descending within each pool. */
function standings(): BracketStandingTeam[] {
  const out: BracketStandingTeam[] = [];
  for (const p of ["Pool A", "Pool B"]) {
    for (let rank = 1; rank <= 4; rank++) {
      out.push({
        id: `${p}-${rank}`,
        name: `${p} #${rank}`,
        poolLabel: p,
        poolRank: rank,
        strength: 2000 - (p === "Pool B" ? 50 : 0) - rank * 100,
      });
    }
  }
  return out;
}

describe("buildBracket", () => {
  it("advances the right number of qualifiers (winners + wildcards)", () => {
    const r = buildBracket(standings(), { poolWinnersAdvance: 1, wildcards: 2 });
    // 2 pool winners + 2 wildcards = 4 qualifiers.
    expect(r.qualifiers).toHaveLength(4);
    expect(r.bracketSize).toBe(4);
    expect(r.byes).toBe(0);
  });

  it("only takes the top-N per pool when no wildcards", () => {
    const r = buildBracket(standings(), { poolWinnersAdvance: 2, wildcards: 0 });
    expect(r.qualifiers).toHaveLength(4);
    // Every qualifier must be a pool seed 1 or 2 (no 3rd/4th place teams).
    for (const q of r.qualifiers) {
      expect(["1", "2"]).toContain(q.team!.id.split("-")[1]);
    }
  });

  it("seeds 1 vs lowest in the opening round", () => {
    const r = buildBracket(standings(), { poolWinnersAdvance: 2, wildcards: 0 });
    const opener = r.rounds[0]!.matchups[0]!;
    expect(opener.home.seed).toBe(1);
    expect(opener.away.seed).toBe(4); // 1v4 in a 4-team bracket
  });

  it("adds byes for non-power-of-two fields", () => {
    // 3 pools × 1 winner + 3 wildcards = 6 qualifiers -> bracket size 8, 2 byes.
    const three: BracketStandingTeam[] = [];
    for (const p of ["A", "B", "C"]) {
      for (let rank = 1; rank <= 3; rank++) {
        three.push({
          id: `${p}${rank}`,
          name: `${p}${rank}`,
          poolLabel: p,
          poolRank: rank,
          strength: 1000 - rank * 10 - p.charCodeAt(0),
        });
      }
    }
    const r = buildBracket(three, { poolWinnersAdvance: 1, wildcards: 3 });
    expect(r.qualifiers).toHaveLength(6);
    expect(r.bracketSize).toBe(8);
    expect(r.byes).toBe(2);
    // Top seeds get the byes (their opponent slot is null).
    const top = r.rounds[0]!.matchups.find((m) => m.home.seed === 1)!;
    expect(top.away.team).toBeNull();
  });

  it("produces the right number of rounds (R16 down to Final)", () => {
    const big: BracketStandingTeam[] = [];
    for (const p of ["A", "B", "C", "D"]) {
      for (let rank = 1; rank <= 4; rank++) {
        big.push({
          id: `${p}${rank}`,
          name: `${p}${rank}`,
          poolLabel: p,
          poolRank: rank,
          strength: 2000 - rank * 100 - p.charCodeAt(0),
        });
      }
    }
    const r = buildBracket(big, { poolWinnersAdvance: 2, wildcards: 0 });
    expect(r.qualifiers).toHaveLength(8);
    expect(r.rounds.map((x) => x.name)).toEqual(["Quarterfinals", "Semifinals", "Final"]);
  });
});
