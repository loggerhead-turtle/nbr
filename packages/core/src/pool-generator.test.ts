import { describe, it, expect } from "vitest";
import { generatePools, pairKey, PoolTeam } from "./pool-generator.js";

function makeTeams(ratings: number[]): PoolTeam[] {
  return ratings.map((r, i) => ({ id: `t${i}`, name: `Team ${i}`, rating: r }));
}

describe("generatePools", () => {
  it("separates the top-N seeds across N pools", () => {
    const teams = makeTeams([2000, 1900, 1800, 1700, 1600, 1500, 1400, 1300]);
    const { pools } = generatePools(teams, 4);
    // Each pool should contain exactly one of the top 4 seeds.
    const topIds = new Set(["t0", "t1", "t2", "t3"]);
    for (const pool of pools) {
      const topInPool = pool.teams.filter((t) => topIds.has(t.id));
      expect(topInPool.length).toBe(1);
    }
  });

  it("separates the weakest teams across pools too", () => {
    const teams = makeTeams([2000, 1900, 1800, 1700, 1600, 1500, 1400, 1300]);
    const { pools } = generatePools(teams, 4);
    const bottomIds = new Set(["t4", "t5", "t6", "t7"]);
    for (const pool of pools) {
      const bottomInPool = pool.teams.filter((t) => bottomIds.has(t.id));
      expect(bottomInPool.length).toBe(1);
    }
  });

  it("keeps pool strengths close (low std dev)", () => {
    const teams = makeTeams([2000, 1950, 1820, 1790, 1610, 1560, 1410, 1300]);
    const result = generatePools(teams, 2);
    // With balanced snake seeding, the two pools should be near-equal.
    expect(result.balanceStdDev).toBeLessThan(60);
  });

  it("handles an uneven number of teams", () => {
    const teams = makeTeams([2000, 1900, 1800, 1700, 1600]);
    const { pools } = generatePools(teams, 2);
    const counts = pools.map((p) => p.teams.length).sort();
    expect(counts).toEqual([2, 3]);
  });

  it("assigns sequential 1-based seeds by rating", () => {
    const teams = makeTeams([1500, 1800, 1200]);
    const { pools } = generatePools(teams, 1);
    const seeds = pools[0]!.teams.map((t) => ({ id: t.id, seed: t.seed }));
    expect(seeds.find((s) => s.id === "t1")!.seed).toBe(1); // 1800 is strongest
    expect(seeds.find((s) => s.id === "t2")!.seed).toBe(3); // 1200 is weakest
  });

  it("labels pools A, B, C...", () => {
    const teams = makeTeams([1500, 1400, 1300, 1200]);
    const { pools } = generatePools(teams, 3);
    expect(pools.map((p) => p.label)).toEqual(["Pool A", "Pool B", "Pool C"]);
  });

  it("uses pure serpentine order (no average-equalizing swaps)", () => {
    // 6 teams, 3 pools → A:[1,6] B:[2,5] C:[3,4]
    const teams = makeTeams([2000, 1900, 1800, 1700, 1600, 1500]); // t0..t5 by rating
    const { pools } = generatePools(teams, 3);
    const seeds = (i: number) => pools[i]!.teams.map((t) => t.seed).sort((a, b) => a - b);
    expect(seeds(0)).toEqual([1, 6]);
    expect(seeds(1)).toEqual([2, 5]);
    expect(seeds(2)).toEqual([3, 4]);
  });

  it("throws when there are fewer teams than pools", () => {
    expect(() => generatePools(makeTeams([1500, 1400]), 3)).toThrow();
  });

  it("reports same-pool rematches with game counts", () => {
    // 4 teams, 1 pool → all together. t0 & t3 have played twice.
    const teams = makeTeams([2000, 1900, 1800, 1700]);
    const past = { [pairKey("t0", "t3")]: 2, [pairKey("t1", "t2")]: 1 };
    const { pools, rematchPairs } = generatePools(teams, 1, { pastGames: past });
    expect(rematchPairs).toBe(2);
    expect(pools[0]!.pastGames).toBe(3);
    const pair = pools[0]!.rematches.find((r) => r.games === 2)!;
    expect(new Set([pair.aId, pair.bId])).toEqual(new Set(["t0", "t3"]));
  });

  it("minimizes rematches when asked (re-pools prior opponents apart)", () => {
    // Snake puts seeds [1,4] and [2,3] together. Make t0&t3 and t1&t2 rivals so
    // the default arrangement has 2 rematches; the optimizer should cut them.
    const teams = makeTeams([2000, 1900, 1800, 1700]);
    const past = { [pairKey("t0", "t3")]: 3, [pairKey("t1", "t2")]: 3 };
    const plain = generatePools(teams, 2, { pastGames: past });
    expect(plain.rematchPairs).toBeGreaterThan(0);
    const fixed = generatePools(teams, 2, { pastGames: past, rematchWeight: 1, balanceWeight: 0.2 });
    expect(fixed.rematchPairs).toBeLessThan(plain.rematchPairs);
  });

  it("avoids same-area pairings when locationWeight is set", () => {
    // Two UT teams (seeds 1,4 → same pool by snake) and two CA teams (2,3).
    const teams: PoolTeam[] = [
      { id: "ut1", name: "UT1", rating: 2000, state: "UT" },
      { id: "ca1", name: "CA1", rating: 1900, state: "CA" },
      { id: "ca2", name: "CA2", rating: 1800, state: "CA" },
      { id: "ut2", name: "UT2", rating: 1700, state: "UT" },
    ];
    const out = generatePools(teams, 2, { locationWeight: 1, balanceWeight: 0.2 });
    // No pool should contain both same-state teams.
    for (const pool of out.pools) {
      const states = pool.teams.map((t) => t.state);
      expect(new Set(states).size).toBe(states.length);
    }
  });

  it("never moves a locked top seed during optimization", () => {
    const teams = makeTeams([2000, 1900, 1800, 1700, 1600, 1500]);
    const past = { [pairKey("t0", "t1")]: 5 }; // top two seeds are rivals (already apart)
    const out = generatePools(teams, 3, { pastGames: past, rematchWeight: 1 });
    // The 3 top seeds (t0,t1,t2) must each be alone in a pool.
    const top = new Set(["t0", "t1", "t2"]);
    for (const pool of out.pools) {
      expect(pool.teams.filter((t) => top.has(t.id)).length).toBe(1);
    }
  });
});
