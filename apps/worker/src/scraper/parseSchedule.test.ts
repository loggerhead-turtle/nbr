import { describe, it, expect } from "vitest";
import { parseOne } from "./parseSchedule.js";

describe("parseOne (defensive game-row parsing)", () => {
  it("parses a completed home game with a score and game id", () => {
    const g = parseOne(
      "/games/AbCd1234XyZ",
      "Final vs Provo Pioneers 7 - 3 May 10, 2025",
    );
    expect(g).not.toBeNull();
    expect(g!.gcGameId).toBe("AbCd1234XyZ");
    expect(g!.isHome).toBe(true);
    expect(g!.teamScore).toBe(7);
    expect(g!.opponentScore).toBe(3);
    expect(g!.isFinal).toBe(true);
    expect(g!.opponentName.toLowerCase()).toContain("provo");
    expect(g!.playedAt).toMatch(/^2025-05-10/);
  });

  it("detects an away game from the @ marker", () => {
    const g = parseOne("/game/zzz999", "Final @ Ogden Raptors 2 - 6 Apr 3, 2025");
    expect(g).not.toBeNull();
    expect(g!.isHome).toBe(false);
    expect(g!.teamScore).toBe(2);
    expect(g!.opponentScore).toBe(6);
  });

  it("returns null for an upcoming game with no score", () => {
    const g = parseOne("/games/future1", "Sat 6:00 PM vs Lehi Lightning");
    expect(g).toBeNull();
  });

  it("handles an en-dash score separator", () => {
    const g = parseOne("/games/dash1", "Final vs Sandy Sluggers 4–4 Jun 1, 2025");
    expect(g).not.toBeNull();
    expect(g!.teamScore).toBe(4);
    expect(g!.opponentScore).toBe(4);
  });

  it("returns null when there is no opponent", () => {
    const g = parseOne("/games/x", "Final 5 - 2");
    expect(g).toBeNull();
  });
});
