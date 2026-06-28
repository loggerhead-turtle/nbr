import { describe, it, expect } from "vitest";
import { scoreMerge } from "./merge-confidence";

describe("scoreMerge", () => {
  it("disqualifies different age groups (the 11U-absorbs-14U bug)", () => {
    const r = scoreMerge({ nameA: "MBA Navy 11U", nameB: "MBA Navy 14U", ageA: "U11", ageB: "U14" });
    expect(r.disqualified).toBe(true);
    expect(r.tier).toBe("none");
    expect(r.blockers.some((b) => b.includes("Different age"))).toBe(true);
  });

  it("does NOT auto-merge same name in different states (Stars UT vs CA)", () => {
    const r = scoreMerge({
      nameA: "Stars 14U",
      nameB: "Stars 14U",
      ageA: "U14",
      ageB: "U14",
      stateA: "UT",
      stateB: "CA",
      cityA: "Provo",
      cityB: "Fresno",
    });
    expect(r.tier).not.toBe("high");
    expect(r.blockers.some((b) => b.startsWith("Different state"))).toBe(true);
  });

  it("auto-merges identical name + age + city + shared coach", () => {
    const r = scoreMerge({
      nameA: "Stars 14U",
      nameB: "Stars 14U",
      ageA: "U14",
      ageB: "U14",
      stateA: "UT",
      stateB: "UT",
      cityA: "Provo",
      cityB: "Provo",
      coachesA: ["Mike Smith", "Jane Doe"],
      coachesB: ["Mike Smith"],
    });
    expect(r.tier).toBe("high");
  });

  it("treats 2+ shared exact matchups as near-proof", () => {
    const r = scoreMerge({
      nameA: "Cannons Baseball 14U",
      nameB: "Cannons Black 14U",
      ageA: "U14",
      ageB: "U14",
      sharedGameCount: 3,
    });
    expect(r.tier).toBe("high");
  });

  it("uses game-region overlap when cities are unknown (name-only ghost)", () => {
    const merge = scoreMerge({
      nameA: "Stars 14U",
      nameB: "Stars 14U",
      ageA: "U14",
      ageB: "U14",
      stateA: "UT",
      regionStatesA: ["UT", "UT", "ID"],
      regionStatesB: ["UT", "UT"],
      sharedGameCount: 1,
    });
    expect(merge.reasons.some((r) => r.includes("Game regions overlap"))).toBe(true);

    const block = scoreMerge({
      nameA: "Stars 14U",
      nameB: "Stars 14U",
      ageA: "U14",
      ageB: "U14",
      regionStatesA: ["CA", "CA", "NV"],
      regionStatesB: ["UT", "UT"],
    });
    expect(block.tier).not.toBe("high");
    expect(block.blockers).toContain("Game regions differ");
  });

  it("flags similar (not identical) names as medium/low, never auto-high alone", () => {
    const r = scoreMerge({ nameA: "Utah Hammers 12U", nameB: "Utah Hamers 12U", ageA: "U12", ageB: "U12" });
    expect(["medium", "low"]).toContain(r.tier);
  });
});
