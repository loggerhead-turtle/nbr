import { describe, it, expect } from "vitest";
import { generatePools, PoolTeam } from "./pool-generator.js";

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

  it("throws when there are fewer teams than pools", () => {
    expect(() => generatePools(makeTeams([1500, 1400]), 3)).toThrow();
  });
});
