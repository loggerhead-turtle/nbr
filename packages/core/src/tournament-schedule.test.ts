import { describe, it, expect } from "vitest";
import {
  buildSchedule,
  type SchedulePool,
  type ScheduleField,
} from "./tournament-schedule.js";

function pool(label: string, names: string[]): SchedulePool {
  return { label, teams: names.map((n) => ({ id: n.toLowerCase(), name: n })) };
}

const field = (id: string, ages: string[], hasLights = true): ScheduleField => ({
  id,
  name: id.toUpperCase(),
  hasLights,
  allowedAgeGroups: ages,
});

describe("buildSchedule", () => {
  it("only pairs teams within the same pool when crossover is off", () => {
    const pools = [pool("Pool A", ["A1", "A2", "A3"]), pool("Pool B", ["B1", "B2", "B3"])];
    const { games } = buildSchedule(pools, [field("f1", ["U12"]), field("f2", ["U12"])], {
      ageGroup: "U12",
      poolPlayGames: 2,
      allowCrossover: false,
    });
    const memberOf = (id: string) => (id.startsWith("a") ? "A" : "B");
    for (const g of games) {
      expect(g.isCrossover).toBe(false);
      expect(memberOf(g.homeTeamId)).toBe(memberOf(g.awayTeamId));
    }
  });

  it("gives each team up to poolPlayGames games", () => {
    const pools = [pool("Pool A", ["A1", "A2", "A3", "A4"])];
    const { games } = buildSchedule(pools, [field("f1", [])], {
      ageGroup: "U12",
      poolPlayGames: 3,
      allowCrossover: false,
    });
    const counts = new Map<string, number>();
    for (const g of games) {
      counts.set(g.homeTeamId, (counts.get(g.homeTeamId) ?? 0) + 1);
      counts.set(g.awayTeamId, (counts.get(g.awayTeamId) ?? 0) + 1);
    }
    for (const c of counts.values()) expect(c).toBe(3);
  });

  it("emits crossover games (flagged) when allowed and a pool is too small", () => {
    // 2-team pools can only give 1 in-pool game; crossover tops up to the target.
    const pools = [pool("Pool A", ["A1", "A2"]), pool("Pool B", ["B1", "B2"])];
    const { games } = buildSchedule(pools, [field("f1", []), field("f2", [])], {
      ageGroup: "U12",
      poolPlayGames: 2,
      allowCrossover: true,
    });
    expect(games.some((g) => g.isCrossover)).toBe(true);
    const counts = new Map<string, number>();
    for (const g of games) {
      counts.set(g.homeTeamId, (counts.get(g.homeTeamId) ?? 0) + 1);
      counts.set(g.awayTeamId, (counts.get(g.awayTeamId) ?? 0) + 1);
    }
    for (const c of counts.values()) expect(c).toBe(2);
  });

  it("only schedules onto age-eligible fields", () => {
    const pools = [pool("Pool A", ["A1", "A2", "A3"])];
    const { games } = buildSchedule(
      pools,
      [field("young", ["U10"]), field("right", ["U12"])],
      { ageGroup: "U12", poolPlayGames: 2, allowCrossover: false },
    );
    expect(games.length).toBeGreaterThan(0);
    for (const g of games) expect(g.fieldId).toBe("right");
  });

  it("never double-books a team or a field within a slot", () => {
    const pools = [pool("Pool A", ["A1", "A2", "A3", "A4"]), pool("Pool B", ["B1", "B2", "B3", "B4"])];
    const { games } = buildSchedule(pools, [field("f1", []), field("f2", [])], {
      ageGroup: "U12",
      poolPlayGames: 3,
      allowCrossover: false,
    });
    const teamsBySlot = new Map<string, Set<string>>();
    const fieldsBySlot = new Map<string, Set<string>>();
    for (const g of games) {
      const ts = teamsBySlot.get(g.slotLabel) ?? new Set();
      expect(ts.has(g.homeTeamId)).toBe(false);
      expect(ts.has(g.awayTeamId)).toBe(false);
      ts.add(g.homeTeamId);
      ts.add(g.awayTeamId);
      teamsBySlot.set(g.slotLabel, ts);
      if (g.fieldId) {
        const fs = fieldsBySlot.get(g.slotLabel) ?? new Set();
        expect(fs.has(g.fieldId)).toBe(false);
        fs.add(g.fieldId);
        fieldsBySlot.set(g.slotLabel, fs);
      }
    }
  });

  it("warns when no field can host the division age group", () => {
    const pools = [pool("Pool A", ["A1", "A2"])];
    const { warnings } = buildSchedule(pools, [field("young", ["U10"])], {
      ageGroup: "U14",
      poolPlayGames: 1,
      allowCrossover: false,
    });
    expect(warnings.some((w) => w.includes("U14"))).toBe(true);
  });
});
