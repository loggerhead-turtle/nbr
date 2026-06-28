import { describe, it, expect } from "vitest";
import { parseScheduleText, parseTeamHeader, ParsedGame } from "./parseSchedule.js";

// Real text captured from a GameChanger public schedule page (Utah Warriors 14U).
const SAMPLE = `Pricing Support Sign In Join Us Utah Warriors 14U 16-17 Spring 2026 Orem, UT Staff: Jennifer Eaquinto, Greg Larsen, Gabe Eyerly, Nathan & Heidi Rich Follow team HOME SCHEDULE TEAM STATS Schedule March 2026 SAT 7 @ GBG Utah 14U Navy L 3-4 vs. Cannons Baseball 14U L 1-7 @ Guerilla 14U W 4-2 MON 16 @ Lightning Baseball Ahrens 14U W 15-1 TUE 17 @ Fort Collins Force NoCo 14u L 6-7 vs. Slammers Stealth 14U L 3-5 WED 18 vs. Slammers Stealth 14U L 2-6 April 2026 MON 13 vs. Cannons Baseball 14U W 6-5 vs. Utah Prime 14U L 2-12 WED 22 @ Vice 13U W 6-5 FRI 24 @ Sanpete Rampage 14U W 13-0 vs. Honey Badgers 14U L 10-12 SAT 25 vs. Nephi Aces 14U W 10-2 @ Milford Tigers 14u W 15-0 MON 27 vs. Wasatch Baseball Club 14U 4:20 PM @ Honey Badgers 14U 6:20 PM May 2026 FRI 1 @ Utah Owlz 14U L 4-11 MON 4 @ Diamond Devils 14U W 9-4 @ Juab Blaze 14U L 2-7 June 2026 MON 1 vs. Wasatch Baseball Club 14U L 6-8 @ Honey Badgers 14U L 6-9 Get the App Fan Pricing Status Privacy Terms`;

describe("parseScheduleText (GameChanger schedule)", () => {
  const games = parseScheduleText(SAMPLE);

  it("parses every completed game and skips upcoming ones", () => {
    // The two MON 27 entries have times (no result) and must be skipped.
    const hasUpcoming = games.some((g) => g.teamScore === null);
    expect(hasUpcoming).toBe(false);
    expect(games.length).toBe(19);
  });

  it("reads home/away from vs. and @", () => {
    const first = games[0]!;
    expect(first.opponentName).toContain("GBG Utah");
    expect(first.isHome).toBe(false); // "@ GBG Utah"
    expect(first.teamScore).toBe(3);
    expect(first.opponentScore).toBe(4);

    const home = games.find((g) => g.opponentName.includes("Cannons"))!;
    expect(home.isHome).toBe(true); // "vs. Cannons"
  });

  it("does not let opponent names swallow adjacent entries", () => {
    const owlz = games.find((g) => g.opponentName.includes("Utah Owlz"))!;
    expect(owlz.opponentName).toBe("Utah Owlz 14U");
    expect(owlz.teamScore).toBe(4);
    expect(owlz.opponentScore).toBe(11);
    // Opponent with an embedded year-like token stays intact.
    const gbg = games.find((g) => g.opponentName.includes("2030"));
    // (not in this sample, but ensure none captured a month header)
    expect(games.every((g) => !/\b(March|April|May|June)\b/.test(g.opponentName))).toBe(true);
    expect(gbg).toBeUndefined();
  });

  it("carries the date from month + day headers", () => {
    const first = games[0]!; // SAT 7 March 2026
    expect(first.playedAt).toMatch(/^2026-03-07/);
    const june = games.find((g) => g.opponentName.includes("Wasatch") && g.playedAt?.startsWith("2026-06"));
    expect(june).toBeTruthy(); // June 1 vs Wasatch L 6-8
  });

  it("marks all parsed games final with both scores", () => {
    expect(games.every((g: ParsedGame) => g.isFinal && g.teamScore != null && g.opponentScore != null)).toBe(true);
  });

  it("returns nothing for an error page", () => {
    expect(parseScheduleText("Oops! We couldn't load this page. Reload Contact Support")).toEqual([]);
  });
});

describe("parseTeamHeader", () => {
  it("extracts name, city, state, and age group", () => {
    const h = parseTeamHeader(SAMPLE);
    expect(h.name).toBe("Utah Warriors 14U");
    expect(h.city).toBe("Orem");
    expect(h.state).toBe("UT");
    expect(h.ageGroup).toBe("U14");
  });

  it("returns nulls for the error page", () => {
    const h = parseTeamHeader("Pricing Support Sign In Join Us Oops! We couldn’t load this page.");
    expect(h.name).toBeNull();
    expect(h.ageGroup).toBeNull();
  });
});
