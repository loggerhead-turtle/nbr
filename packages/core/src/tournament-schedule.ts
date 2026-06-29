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
