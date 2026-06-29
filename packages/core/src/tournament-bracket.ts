/**
 * Single-elimination bracket builder driven by a director's advancement rule.
 *
 * Qualifiers = the top `poolWinnersAdvance` teams from each pool, plus the best
 * `wildcards` remaining teams across all pools. Qualifiers are reseeded 1..N
 * (overall seed, snake-protected by standing) and matched 1vN, 2v(N-1), …, with
 * byes awarded to the top seeds when N is not a power of two.
 *
 * Pure and deterministic — no I/O — so it is fully unit-testable. Because a demo
 * (or a pre-play bracket preview) has no game results yet, standings can be
 * seeded by rating; `seedBy` records the director's intent.
 */

export interface BracketStandingTeam {
  id: string;
  name: string;
  poolLabel: string;
  /** Rank within the pool (1 = pool winner). */
  poolRank: number;
  /** Overall strength proxy (rating / pool points) — higher is stronger. */
  strength: number;
}

export interface AdvancementRuleInput {
  poolWinnersAdvance: number;
  wildcards: number;
  /** Recorded intent; the builder seeds by `strength` regardless. */
  seedBy?: "POOL_RECORD" | "RATING" | "RUN_DIFF";
  reseed?: boolean;
}

export interface BracketTeamSlot {
  seed: number;
  team: { id: string; name: string; poolLabel: string } | null; // null = BYE
}

export interface BracketMatchup {
  /** Match id within the bracket, 1-based in seed order. */
  matchId: number;
  home: BracketTeamSlot;
  away: BracketTeamSlot;
}

export interface BracketRound {
  name: string; // "Quarterfinals", "Semifinals", "Final", or "Round of N"
  matchups: BracketMatchup[];
}

export interface BracketResult {
  qualifiers: BracketTeamSlot[]; // seeded 1..N
  bracketSize: number; // next power of two
  rounds: BracketRound[];
  byes: number;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function roundName(slotsThisRound: number): string {
  switch (slotsThisRound) {
    case 2:
      return "Final";
    case 4:
      return "Semifinals";
    case 8:
      return "Quarterfinals";
    default:
      return `Round of ${slotsThisRound}`;
  }
}

/** Standard 1vN bracket seeding order for a bracket of `size` slots. */
function seedOrder(size: number): number[] {
  let rounds: number[] = [1, 2];
  while (rounds.length < size) {
    const next: number[] = [];
    const sum = rounds.length * 2 + 1;
    for (const s of rounds) {
      next.push(s);
      next.push(sum - s);
    }
    rounds = next;
  }
  return rounds;
}

export function buildBracket(
  standings: BracketStandingTeam[],
  rule: AdvancementRuleInput,
): BracketResult {
  const winners = Math.max(0, Math.floor(rule.poolWinnersAdvance));
  const wildcards = Math.max(0, Math.floor(rule.wildcards));

  // Pool winners (top N per pool by poolRank), strongest first.
  const byPool = new Map<string, BracketStandingTeam[]>();
  for (const t of standings) {
    const arr = byPool.get(t.poolLabel) ?? [];
    arr.push(t);
    byPool.set(t.poolLabel, arr);
  }
  const advancing: BracketStandingTeam[] = [];
  const remaining: BracketStandingTeam[] = [];
  for (const arr of byPool.values()) {
    const sorted = [...arr].sort((a, b) => a.poolRank - b.poolRank || b.strength - a.strength);
    advancing.push(...sorted.slice(0, winners));
    remaining.push(...sorted.slice(winners));
  }
  // Wildcards: best remaining across all pools by strength.
  remaining.sort((a, b) => b.strength - a.strength);
  advancing.push(...remaining.slice(0, wildcards));

  // Overall seeding by strength (pool winners naturally float up).
  const seeded = [...advancing].sort((a, b) => b.strength - a.strength);
  const qualifiers: BracketTeamSlot[] = seeded.map((t, i) => ({
    seed: i + 1,
    team: { id: t.id, name: t.name, poolLabel: t.poolLabel },
  }));

  const n = qualifiers.length;
  if (n < 2) {
    return { qualifiers, bracketSize: n, rounds: [], byes: 0 };
  }

  const size = nextPow2(n);
  const byes = size - n;

  // Pad with BYE slots to fill the bracket.
  const slots: BracketTeamSlot[] = [...qualifiers];
  for (let s = n; s < size; s++) slots.push({ seed: s + 1, team: null });

  // First round via standard seed order.
  const order = seedOrder(size); // length === size, values 1..size
  const bySeed = new Map<number, BracketTeamSlot>();
  for (const slot of slots) bySeed.set(slot.seed, slot);

  const first: BracketMatchup[] = [];
  for (let i = 0; i < order.length; i += 2) {
    first.push({
      matchId: i / 2 + 1,
      home: bySeed.get(order[i]!)!,
      away: bySeed.get(order[i + 1]!)!,
    });
  }

  const rounds: BracketRound[] = [{ name: roundName(size), matchups: first }];

  // Subsequent rounds are placeholders (winners TBD) so the full shape is shown.
  let slotsThisRound = size / 2;
  let matchBase = first.length;
  while (slotsThisRound >= 2) {
    const matchups: BracketMatchup[] = [];
    for (let i = 0; i < slotsThisRound / 2; i++) {
      matchups.push({
        matchId: matchBase + i + 1,
        home: { seed: 0, team: null },
        away: { seed: 0, team: null },
      });
    }
    rounds.push({ name: roundName(slotsThisRound), matchups });
    matchBase += matchups.length;
    slotsThisRound /= 2;
  }

  return { qualifiers, bracketSize: size, rounds, byes };
}
