import { describe, it, expect } from "vitest";
import {
  buildSchedule,
  buildTournamentSchedule,
  slotIntervalFor,
  FIELD_GRADE_RANK,
  type SchedulePool,
  type ScheduleField,
  type GradedField,
  type FieldGrade,
  type ScheduleDivisionInput,
  type TournamentTimeConfig,
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

// ── Timed, multi-division, field-graded scheduling ──────────────────────────

const gf = (
  id: string,
  grade: FieldGrade,
  opts: { lights?: boolean; ages?: string[] } = {},
): GradedField => ({
  id,
  name: id,
  hasLights: opts.lights ?? true,
  allowedAgeGroups: opts.ages ?? [],
  grade,
});

const div = (id: string, ageGroup: string, poolDefs: Record<string, string[]>): ScheduleDivisionInput => ({
  id,
  ageGroup,
  pools: Object.entries(poolDefs).map(([label, names]) => ({
    label,
    teams: names.map((n) => ({ id: n, name: n })),
  })),
});

const cfg = (over: Partial<TournamentTimeConfig> = {}): TournamentTimeConfig => ({
  days: ["2026-08-08", "2026-08-09"],
  dayStartMinutes: 8 * 60,
  endByMinutes: 21 * 60,
  sunsetMinutes: 20 * 60,
  gameDurationMinutes: 105,
  poolPlayGamesPerDay: 2,
  poolPlayGamesTotal: 2,
  allowCrossover: false,
  bracketDayIndex: 1,
  ...over,
});

const FIVE_FIELDS: GradedField[] = [
  gf("champ", "Championship"),
  gf("a1", "A"),
  gf("b1", "B"),
  gf("c1", "C"),
  gf("d1", "D"),
];

describe("buildTournamentSchedule", () => {
  it("slot interval is the time limit plus a 15-minute buffer", () => {
    expect(slotIntervalFor(105)).toBe(120); // 1h45 → every 2h
    expect(slotIntervalFor(120)).toBe(135);
    expect(slotIntervalFor(135)).toBe(150);
  });

  it("never double-books a field or a team in the same day+time", () => {
    const divs = [
      div("d1", "U12", { "Pool A": ["a1", "a2", "a3"], "Pool B": ["b1", "b2", "b3"] }),
      div("d2", "U14", { "Pool A": ["x1", "x2", "x3"], "Pool B": ["y1", "y2", "y3"] }),
    ];
    const { games } = buildTournamentSchedule(divs, FIVE_FIELDS, cfg());
    const fieldCell = new Set<string>();
    const teamCell = new Set<string>();
    for (const g of games) {
      const fk = `${g.dayIndex}@${g.startMinutes}#${g.fieldId}`;
      expect(fieldCell.has(fk)).toBe(false);
      fieldCell.add(fk);
      for (const tid of [g.homeTeamId, g.awayTeamId]) {
        const tk = `${g.dayIndex}@${g.startMinutes}#${tid}`;
        expect(teamCell.has(tk)).toBe(false);
        teamCell.add(tk);
      }
    }
  });

  it("steers the strongest pool toward the best fields", () => {
    const divs = [div("d1", "U12", { "Pool A": ["a1", "a2", "a3"], "Pool B": ["b1", "b2", "b3"] })];
    const { games } = buildTournamentSchedule(divs, FIVE_FIELDS, cfg());
    const rankOf = (label: string) =>
      games
        .filter((g) => g.poolLabel === label && g.fieldGrade)
        .map((g) => FIELD_GRADE_RANK[g.fieldGrade!]);
    const a = rankOf("Pool A");
    const b = rankOf("Pool B");
    expect(a.length).toBeGreaterThan(0);
    expect(Math.min(...a)).toBe(0); // Pool A reaches the Championship field
    const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    expect(avg(a)).toBeLessThanOrEqual(avg(b)); // and is overall on better fields
  });

  it("respects the per-day games cap", () => {
    const divs = [div("d1", "U12", { "Pool A": ["a1", "a2", "a3", "a4", "a5"] })];
    const { games } = buildTournamentSchedule(
      divs,
      FIVE_FIELDS,
      cfg({ poolPlayGamesTotal: 4, poolPlayGamesPerDay: 2 }),
    );
    const perTeamPerDay = new Map<string, number>();
    for (const g of games.filter((x) => x.kind === "pool")) {
      for (const tid of [g.homeTeamId, g.awayTeamId]) {
        const k = `${tid}#${g.dayIndex}`;
        perTeamPerDay.set(k, (perTeamPerDay.get(k) ?? 0) + 1);
      }
    }
    for (const c of perTeamPerDay.values()) expect(c).toBeLessThanOrEqual(2);
  });

  it("no game finishes after the daily cutoff, and no-light fields finish by sunset", () => {
    const fields = [gf("champ", "Championship", { lights: true }), gf("dark", "A", { lights: false })];
    const divs = [div("d1", "U12", { "Pool A": ["a1", "a2", "a3", "a4"] })];
    const config = cfg({ sunsetMinutes: 12 * 60, endByMinutes: 20 * 60, poolPlayGamesTotal: 3 });
    const { games } = buildTournamentSchedule(divs, fields, config);
    for (const g of games) {
      expect(g.startMinutes! + config.gameDurationMinutes).toBeLessThanOrEqual(config.endByMinutes);
      if (g.fieldId === "dark") {
        expect(g.startMinutes! + config.gameDurationMinutes).toBeLessThanOrEqual(config.sunsetMinutes);
      }
    }
  });

  it("places bracket games on the bracket day with the Final on the Championship field", () => {
    const divs: ScheduleDivisionInput[] = [
      {
        ...div("d1", "U12", { "Pool A": ["a1", "a2"] }),
        bracketGames: [
          { roundIndex: 0, roundName: "Quarterfinals", homeName: "1", awayName: "8" },
          { roundIndex: 0, roundName: "Quarterfinals", homeName: "4", awayName: "5" },
          { roundIndex: 1, roundName: "Semifinals", homeName: "TBD", awayName: "TBD" },
          { roundIndex: 2, roundName: "Final", homeName: "TBD", awayName: "TBD" },
        ],
      },
    ];
    const { games } = buildTournamentSchedule(divs, FIVE_FIELDS, cfg({ bracketDayIndex: 1 }));
    const bracket = games.filter((g) => g.kind === "bracket");
    expect(bracket.length).toBe(4);
    for (const g of bracket) expect(g.dayIndex).toBe(1);
    const final = bracket.find((g) => g.roundName === "Final")!;
    expect(final.fieldGrade).toBe("Championship");
    // Final starts later than the quarterfinals.
    const qfStart = Math.min(...bracket.filter((g) => g.roundName === "Quarterfinals").map((g) => g.startMinutes!));
    expect(final.startMinutes!).toBeGreaterThan(qfStart);
  });
});
