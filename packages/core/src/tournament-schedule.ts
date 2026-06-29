/**
 * Tournament scheduler — turns generated pools into a playable game schedule.
 *
 * Guarantees the director cares about:
 *  - Teams only play **within their pool** unless `allowCrossover` is set, in
 *    which case under-scheduled teams may be paired across pools (flagged).
 *  - Each team plays up to `poolPlayGames` games (capped by pool size).
 *  - Games land only on fields whose `allowedAgeGroups` include the division's
 *    age group (an empty list means the field hosts any age).
 *  - No team or field is double-booked within the same time slot.
 *
 * Pure and deterministic (no I/O, no clock) so it is fully unit-testable.
 */

export interface ScheduleTeam {
  id: string;
  name: string;
}

export interface SchedulePool {
  label: string; // "Pool A"
  teams: ScheduleTeam[];
}

export interface ScheduleField {
  id: string;
  name: string;
  hasLights: boolean;
  /** Age groups this field can host. Empty = hosts any age. */
  allowedAgeGroups: string[];
}

export interface ScheduleOptions {
  /** Division age group token ("U12") used to match field eligibility. */
  ageGroup: string;
  /** Target games per team in pool play. */
  poolPlayGames: number;
  /** Allow cross-pool games to top up teams below the target. */
  allowCrossover?: boolean;
  /** Optional explicit time-slot labels; auto-generated ("Slot N") if omitted. */
  slots?: string[];
}

export interface ScheduledGame {
  /** Pool label for pool play; null for a crossover game. */
  poolLabel: string | null;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  isCrossover: boolean;
  fieldId: string | null;
  fieldName: string | null;
  slotLabel: string;
}

export interface ScheduleResult {
  games: ScheduledGame[];
  warnings: string[];
}

type Pairing = { a: ScheduleTeam; b: ScheduleTeam; poolLabel: string | null; isCrossover: boolean };

/**
 * Circle-method single round-robin. Returns pairings grouped by round so games
 * are spread evenly (each team plays at most once per round).
 */
function roundRobinRounds(teams: ScheduleTeam[]): Array<Array<[ScheduleTeam, ScheduleTeam]>> {
  const list = [...teams];
  if (list.length < 2) return [];
  const bye = list.length % 2 === 1;
  if (bye) list.push({ id: "__bye__", name: "BYE" });
  const n = list.length;
  const rounds: Array<Array<[ScheduleTeam, ScheduleTeam]>> = [];
  // Fixed first element; rotate the rest.
  const arr = [...list];
  for (let r = 0; r < n - 1; r++) {
    const round: Array<[ScheduleTeam, ScheduleTeam]> = [];
    for (let i = 0; i < n / 2; i++) {
      const home = arr[i]!;
      const away = arr[n - 1 - i]!;
      if (home.id !== "__bye__" && away.id !== "__bye__") round.push([home, away]);
    }
    rounds.push(round);
    // rotate all but the first
    arr.splice(1, 0, arr.pop()!);
  }
  return rounds;
}

/**
 * Build a schedule for one division's pools.
 */
export function buildSchedule(
  pools: SchedulePool[],
  fields: ScheduleField[],
  options: ScheduleOptions,
): ScheduleResult {
  const warnings: string[] = [];
  const target = Math.max(0, Math.floor(options.poolPlayGames));
  const games: ScheduledGame[] = [];

  // Per-team game counts, seeded so every team appears even with 0 games.
  const count = new Map<string, number>();
  for (const pool of pools) for (const t of pool.teams) count.set(t.id, 0);

  // 1) Pool play: take round-robin pairings round-by-round until each team
  //    reaches the target (or the pool's pairings are exhausted).
  const selected: Pairing[] = [];
  const playedKey = new Set<string>(); // unordered "a|b" to avoid repeat matchups
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const pool of pools) {
    const rounds = roundRobinRounds(pool.teams);
    for (const round of rounds) {
      for (const [a, b] of round) {
        if ((count.get(a.id) ?? 0) >= target || (count.get(b.id) ?? 0) >= target) continue;
        selected.push({ a, b, poolLabel: pool.label, isCrossover: false });
        playedKey.add(key(a.id, b.id));
        count.set(a.id, (count.get(a.id) ?? 0) + 1);
        count.set(b.id, (count.get(b.id) ?? 0) + 1);
      }
    }
  }

  // 2) Optional crossover: pair teams still below target across pools.
  if (options.allowCrossover) {
    const teamPool = new Map<string, string>();
    const all: ScheduleTeam[] = [];
    for (const pool of pools)
      for (const t of pool.teams) {
        teamPool.set(t.id, pool.label);
        all.push(t);
      }
    let progress = true;
    while (progress) {
      progress = false;
      const under = all.filter((t) => (count.get(t.id) ?? 0) < target);
      for (let i = 0; i < under.length; i++) {
        for (let j = i + 1; j < under.length; j++) {
          const a = under[i]!;
          const b = under[j]!;
          if ((count.get(a.id) ?? 0) >= target || (count.get(b.id) ?? 0) >= target) continue;
          if (teamPool.get(a.id) === teamPool.get(b.id)) continue; // same pool handled above
          if (playedKey.has(key(a.id, b.id))) continue;
          selected.push({ a, b, poolLabel: null, isCrossover: true });
          playedKey.add(key(a.id, b.id));
          count.set(a.id, (count.get(a.id) ?? 0) + 1);
          count.set(b.id, (count.get(b.id) ?? 0) + 1);
          progress = true;
        }
      }
    }
  }

  // Warn about teams that couldn't reach the target.
  for (const pool of pools) {
    for (const t of pool.teams) {
      const got = count.get(t.id) ?? 0;
      if (got < target) {
        warnings.push(
          `${t.name} scheduled for ${got} of ${target} games${
            options.allowCrossover ? "" : " (enable crossover for more)"
          }.`,
        );
      }
    }
  }

  // 3) Assign each game to an eligible field + earliest conflict-free slot.
  const eligible = fields.filter(
    (f) => f.allowedAgeGroups.length === 0 || f.allowedAgeGroups.includes(options.ageGroup),
  );
  if (fields.length > 0 && eligible.length === 0) {
    warnings.push(`No field is configured to host ${options.ageGroup} — games left unassigned.`);
  }

  // busyTeam[slot] = set of team ids; busyField[slot] = set of field ids.
  const busyTeam: Array<Set<string>> = [];
  const busyField: Array<Set<string>> = [];
  const slotLabel = (i: number) => options.slots?.[i] ?? `Slot ${i + 1}`;
  const ensureSlot = (i: number) => {
    while (busyTeam.length <= i) {
      busyTeam.push(new Set());
      busyField.push(new Set());
    }
  };

  for (const p of selected) {
    let placed = false;
    for (let s = 0; !placed; s++) {
      ensureSlot(s);
      if (busyTeam[s]!.has(p.a.id) || busyTeam[s]!.has(p.b.id)) continue;
      if (eligible.length === 0) {
        // No usable field: schedule by slot, avoid team double-booking only.
        busyTeam[s]!.add(p.a.id);
        busyTeam[s]!.add(p.b.id);
        games.push(toGame(p, null, slotLabel(s)));
        placed = true;
        break;
      }
      const field = eligible.find((f) => !busyField[s]!.has(f.id));
      if (!field) continue; // every eligible field busy this slot — try next slot
      busyTeam[s]!.add(p.a.id);
      busyTeam[s]!.add(p.b.id);
      busyField[s]!.add(field.id);
      games.push(toGame(p, field, slotLabel(s)));
      placed = true;
    }
  }

  return { games, warnings };
}

function toGame(p: Pairing, field: ScheduleField | null, slot: string): ScheduledGame {
  return {
    poolLabel: p.poolLabel,
    homeTeamId: p.a.id,
    homeTeamName: p.a.name,
    awayTeamId: p.b.id,
    awayTeamName: p.b.name,
    isCrossover: p.isCrossover,
    fieldId: field?.id ?? null,
    fieldName: field?.name ?? null,
    slotLabel: slot,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Timed, multi-division, field-graded scheduling.
//
// Schedules the whole tournament at once (so fields and time slots are never
// double-booked across divisions), onto real clock times across one or more
// days. Fields carry a grade (Championship best → D); stronger pools and later
// bracket rounds are steered toward better fields. Fields without lights may not
// host a game that would finish after sunset, and no game may finish after the
// daily hard cutoff.
// ────────────────────────────────────────────────────────────────────────────

export type FieldGrade = "Championship" | "A" | "B" | "C" | "D";
export const FIELD_GRADES: FieldGrade[] = ["Championship", "A", "B", "C", "D"];
export const FIELD_GRADE_RANK: Record<FieldGrade, number> = {
  Championship: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
};

export interface GradedField extends ScheduleField {
  grade: FieldGrade;
}

export interface BracketGameInput {
  /** 0 = first round played (e.g. quarterfinals). */
  roundIndex: number;
  roundName: string; // "Quarterfinals" | "Semifinals" | "Final" | "Round of N"
  homeName: string; // a real team name, "BYE", or "TBD"/"Winner …" placeholder
  awayName: string;
}

export interface ScheduleDivisionInput {
  id: string;
  ageGroup: string;
  pools: SchedulePool[];
  /** Flattened bracket games to place after pool play (optional). */
  bracketGames?: BracketGameInput[];
}

export interface TournamentTimeConfig {
  /** ISO date strings in play order, e.g. ["2026-08-08","2026-08-09"]. */
  days: string[];
  dayStartMinutes: number; // minutes from midnight, e.g. 8*60
  endByMinutes: number; // hard daily cutoff — games must FINISH by this
  sunsetMinutes: number; // no-light fields must FINISH by this
  gameDurationMinutes: number; // game time limit
  poolPlayGamesPerDay: number; // per team per day cap
  poolPlayGamesTotal: number; // per team target across pool days
  allowCrossover: boolean;
  bracketDayIndex: number; // index into `days` that hosts bracket games
}

export interface TimedGame {
  divisionId: string;
  kind: "pool" | "bracket";
  poolLabel: string | null;
  roundName: string | null;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  isCrossover: boolean;
  fieldId: string | null;
  fieldName: string | null;
  fieldGrade: FieldGrade | null;
  dayIndex: number | null;
  date: string | null;
  startMinutes: number | null;
  slotLabel: string;
}

export interface TournamentScheduleResult {
  games: TimedGame[];
  warnings: string[];
}

/** Spacing between game start times on a field: time limit + a 15-min buffer. */
export function slotIntervalFor(durationMinutes: number): number {
  return durationMinutes + 15;
}

export function formatClock(min: number): string {
  let h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ap}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Round-robin (+ optional crossover) pairings for one division's pools. */
function poolPairings(
  pools: SchedulePool[],
  target: number,
  allowCrossover: boolean,
): Pairing[] {
  const count = new Map<string, number>();
  for (const pool of pools) for (const t of pool.teams) count.set(t.id, 0);
  const selected: Pairing[] = [];
  const seen = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const pool of pools) {
    for (const round of roundRobinRounds(pool.teams)) {
      for (const [a, b] of round) {
        if ((count.get(a.id) ?? 0) >= target || (count.get(b.id) ?? 0) >= target) continue;
        selected.push({ a, b, poolLabel: pool.label, isCrossover: false });
        seen.add(key(a.id, b.id));
        count.set(a.id, (count.get(a.id) ?? 0) + 1);
        count.set(b.id, (count.get(b.id) ?? 0) + 1);
      }
    }
  }

  if (allowCrossover) {
    const teamPool = new Map<string, string>();
    const all: ScheduleTeam[] = [];
    for (const pool of pools)
      for (const t of pool.teams) {
        teamPool.set(t.id, pool.label);
        all.push(t);
      }
    let progress = true;
    while (progress) {
      progress = false;
      const under = all.filter((t) => (count.get(t.id) ?? 0) < target);
      for (let i = 0; i < under.length; i++) {
        for (let j = i + 1; j < under.length; j++) {
          const a = under[i]!;
          const b = under[j]!;
          if ((count.get(a.id) ?? 0) >= target || (count.get(b.id) ?? 0) >= target) continue;
          if (teamPool.get(a.id) === teamPool.get(b.id)) continue;
          if (seen.has(key(a.id, b.id))) continue;
          selected.push({ a, b, poolLabel: null, isCrossover: true });
          seen.add(key(a.id, b.id));
          count.set(a.id, (count.get(a.id) ?? 0) + 1);
          count.set(b.id, (count.get(b.id) ?? 0) + 1);
          progress = true;
        }
      }
    }
  }
  return selected;
}

interface Slot {
  dayIndex: number;
  start: number;
}

export function buildTournamentSchedule(
  divisions: ScheduleDivisionInput[],
  fields: GradedField[],
  cfg: TournamentTimeConfig,
): TournamentScheduleResult {
  const warnings: string[] = [];
  const duration = cfg.gameDurationMinutes;
  const interval = slotIntervalFor(duration);

  // Daily slot start times that fit before the hard cutoff.
  const daySlots: number[] = [];
  for (let t = cfg.dayStartMinutes; t + duration <= cfg.endByMinutes; t += interval) {
    daySlots.push(t);
  }
  if (daySlots.length === 0) {
    warnings.push("No game slots fit between the start time and the end-by cutoff.");
    return { games: [], warnings };
  }
  if (fields.length === 0) {
    warnings.push("No fields configured — add fields to generate a schedule.");
    return { games: [], warnings };
  }

  const sortedFields = [...fields].sort(
    (a, b) => FIELD_GRADE_RANK[a.grade] - FIELD_GRADE_RANK[b.grade],
  );
  const bracketDay = Math.min(Math.max(0, cfg.bracketDayIndex), cfg.days.length - 1);
  const poolDayIndices = cfg.days
    .map((_, i) => i)
    .filter((i) => i < bracketDay || cfg.days.length === 1);
  if (poolDayIndices.length === 0) poolDayIndices.push(0);

  // Occupancy. Key by `${dayIndex}@${start}`.
  const fieldBusy = new Map<string, Set<string>>();
  const teamBusy = new Map<string, Set<string>>();
  const teamDayCount = new Map<string, number>(); // `${teamId}#${dayIndex}`
  const cellKey = (d: number, s: number) => `${d}@${s}`;
  const games: TimedGame[] = [];

  const fieldFree = (d: number, s: number, fid: string) =>
    !(fieldBusy.get(cellKey(d, s))?.has(fid) ?? false);
  const teamFree = (d: number, s: number, tid: string) =>
    !(teamBusy.get(cellKey(d, s))?.has(tid) ?? false);

  const occupy = (d: number, s: number, fid: string, ids: string[]) => {
    const k = cellKey(d, s);
    if (!fieldBusy.has(k)) fieldBusy.set(k, new Set());
    if (!teamBusy.has(k)) teamBusy.set(k, new Set());
    fieldBusy.get(k)!.add(fid);
    for (const id of ids) teamBusy.get(k)!.add(id);
  };

  const lightsOk = (f: GradedField, start: number) =>
    f.hasLights || start + duration <= cfg.sunsetMinutes;
  const ageOk = (f: GradedField, age: string) =>
    f.allowedAgeGroups.length === 0 || f.allowedAgeGroups.includes(age);

  // ── Pool play ──────────────────────────────────────────────────────────────
  interface Pending {
    div: ScheduleDivisionInput;
    poolRank: number;
    p: Pairing;
  }
  const pending: Pending[] = [];
  divisions.forEach((div, divIndex) => {
    const pairs = poolPairings(div.pools, cfg.poolPlayGamesTotal, cfg.allowCrossover);
    for (const p of pairs) {
      const poolRank = p.poolLabel ? div.pools.findIndex((x) => x.label === p.poolLabel) : div.pools.length;
      pending.push({ div, poolRank: poolRank * 100 + divIndex, p });
    }
  });
  // Stronger pools first (Pool A across divisions) so they claim better fields.
  pending.sort((a, b) => a.poolRank - b.poolRank);

  for (const { div, p } of pending) {
    let placed = false;
    // Prefer earliest day, then best field grade, then earliest time.
    outer: for (const d of poolDayIndices) {
      const tA = `${p.a.id}#${d}`;
      const tB = `${p.b.id}#${d}`;
      if ((teamDayCount.get(tA) ?? 0) >= cfg.poolPlayGamesPerDay) continue;
      if ((teamDayCount.get(tB) ?? 0) >= cfg.poolPlayGamesPerDay) continue;
      for (const f of sortedFields) {
        if (!ageOk(f, div.ageGroup)) continue;
        for (const start of daySlots) {
          if (!lightsOk(f, start)) continue;
          if (!fieldFree(d, start, f.id)) continue;
          if (!teamFree(d, start, p.a.id) || !teamFree(d, start, p.b.id)) continue;
          occupy(d, start, f.id, [p.a.id, p.b.id]);
          teamDayCount.set(tA, (teamDayCount.get(tA) ?? 0) + 1);
          teamDayCount.set(tB, (teamDayCount.get(tB) ?? 0) + 1);
          games.push({
            divisionId: div.id,
            kind: "pool",
            poolLabel: p.poolLabel,
            roundName: null,
            homeTeamId: p.a.id,
            homeTeamName: p.a.name,
            awayTeamId: p.b.id,
            awayTeamName: p.b.name,
            isCrossover: p.isCrossover,
            fieldId: f.id,
            fieldName: f.name,
            fieldGrade: f.grade,
            dayIndex: d,
            date: cfg.days[d] ?? null,
            startMinutes: start,
            slotLabel: `${dayLabel(cfg.days[d]!)} · ${formatClock(start)} · ${f.name}`,
          });
          placed = true;
          break outer;
        }
      }
    }
    if (!placed) warnings.push(`Couldn't place a ${div.ageGroup} pool game — not enough field time.`);
  }

  // ── Bracket play ─────────────────────────────────────────────────────────--
  interface PendingBracket {
    div: ScheduleDivisionInput;
    g: BracketGameInput;
    maxRound: number;
  }
  const bpending: PendingBracket[] = [];
  for (const div of divisions) {
    const bg = div.bracketGames ?? [];
    if (bg.length === 0) continue;
    const maxRound = Math.max(...bg.map((x) => x.roundIndex));
    for (const g of bg) bpending.push({ div, g, maxRound });
  }
  // Earlier rounds first (so QF gets earlier times than the Final).
  bpending.sort((a, b) => a.g.roundIndex - b.g.roundIndex);

  for (const { div, g, maxRound } of bpending) {
    // Later rounds prefer better fields: Final → Championship.
    const targetRank = Math.min(4, Math.max(0, maxRound - g.roundIndex));
    // Bracket rounds advance in time: round r can't start before this.
    const earliest = cfg.dayStartMinutes + g.roundIndex * interval;
    const candidates = [...sortedFields].sort(
      (a, b) =>
        Math.abs(FIELD_GRADE_RANK[a.grade] - targetRank) -
          Math.abs(FIELD_GRADE_RANK[b.grade] - targetRank) ||
        FIELD_GRADE_RANK[a.grade] - FIELD_GRADE_RANK[b.grade],
    );
    const homeId = `${div.id}:${g.roundName}:${g.homeName}`;
    const awayId = `${div.id}:${g.roundName}:${g.awayName}`;
    let placed = false;
    for (const start of daySlots) {
      if (start < earliest) continue;
      for (const f of candidates) {
        if (!ageOk(f, div.ageGroup)) continue;
        if (!lightsOk(f, start)) continue;
        if (!fieldFree(bracketDay, start, f.id)) continue;
        occupy(bracketDay, start, f.id, []);
        games.push({
          divisionId: div.id,
          kind: "bracket",
          poolLabel: null,
          roundName: g.roundName,
          homeTeamId: homeId,
          homeTeamName: g.homeName,
          awayTeamId: awayId,
          awayTeamName: g.awayName,
          isCrossover: false,
          fieldId: f.id,
          fieldName: f.name,
          fieldGrade: f.grade,
          dayIndex: bracketDay,
          date: cfg.days[bracketDay] ?? null,
          startMinutes: start,
          slotLabel: `${dayLabel(cfg.days[bracketDay]!)} · ${formatClock(start)} · ${f.name}`,
        });
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) warnings.push(`Couldn't place a ${div.ageGroup} ${g.roundName} game — not enough field time.`);
  }

  return { games, warnings };
}
