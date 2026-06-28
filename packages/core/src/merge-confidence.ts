/**
 * Confidence scoring for "are these two teams the same club?".
 *
 * GameChanger gives us a team's name, city/state, and coaching staff from its
 * OWN page, but an opponent appears in a schedule by NAME ONLY. So a freshly
 * scraped "Stars 14U" in Provo and a ghost "Stars 14U" auto-created from some
 * California team's schedule look identical on name+age alone — which is exactly
 * how distinct clubs in UT / CA / TX get wrongly merged. This module combines
 * every signal we DO have into a single 0–100 confidence score plus a list of
 * human-readable reasons/blockers, so the scraper can auto-merge only when it is
 * very confident and everything else can be triaged by an admin.
 *
 * Pure functions only — no DB access — so the scraper, the admin duplicate
 * review, and the unit tests all score merges the same way.
 */
import { normalizeTeamName } from "./slug";

export type MergeTier = "high" | "medium" | "low" | "none";

export interface MergeSignalInput {
  nameA: string;
  nameB: string;
  /** AgeGroup enum value ("U14") or null when unknown. */
  ageA?: string | null;
  ageB?: string | null;
  cityA?: string | null;
  cityB?: string | null;
  stateA?: string | null;
  stateB?: string | null;
  /** Coaching staff names from each team's own page header. */
  coachesA?: string[];
  coachesB?: string[];
  /** Exact shared matchups (same opponent + same day + same score line). */
  sharedGameCount?: number;
  /** States of each team's game-graph neighbours — a locality proxy when the
   * team itself has no city (e.g. a name-only ghost). */
  regionStatesA?: string[];
  regionStatesB?: string[];
}

export interface MergeScore {
  score: number; // 0..100
  tier: MergeTier;
  reasons: string[];
  blockers: string[];
  /** Hard no — the teams cannot be the same (e.g. different stated age). */
  disqualified: boolean;
}

const SIM_THRESHOLD = 0.72;

function ageNum(a?: string | null): number | null {
  if (!a) return null;
  const m = a.match(/\d{1,2}/);
  return m ? Number(m[0]) : null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n]!;
}

function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/** Normalize a coach name for comparison (lowercase, collapse, drop punctuation). */
function normCoach(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function coachOverlap(a: string[] = [], b: string[] = []): string[] {
  const setB = new Set(b.map(normCoach).filter((x) => x.length >= 3));
  const out: string[] = [];
  for (const raw of a) {
    const n = normCoach(raw);
    if (n.length >= 3 && setB.has(n)) out.push(raw);
  }
  return out;
}

function titleCity(c?: string | null): string {
  return (c ?? "").trim();
}

/**
 * Score how likely two teams are the same club. The caller supplies whatever
 * signals it has; missing fields simply don't contribute (they never penalize on
 * their own — only a genuine *conflict*, like different states, counts against).
 */
export function scoreMerge(input: MergeSignalInput): MergeScore {
  const reasons: string[] = [];
  const blockers: string[] = [];
  let score = 0;
  let disqualified = false;

  // ── Name ────────────────────────────────────────────────────────────────
  const normA = normalizeTeamName(input.nameA);
  const normB = normalizeTeamName(input.nameB);
  const exactName = normA === normB && normA.length > 0;
  const sim = nameSimilarity(normA, normB);
  if (exactName) {
    score += 45;
    reasons.push("Identical name");
  } else if (sim >= SIM_THRESHOLD) {
    score += Math.round(25 * sim);
    reasons.push(`Similar name (${Math.round(sim * 100)}%)`);
  } else {
    // Names too different to be the same club.
    blockers.push("Names differ");
  }

  // ── Age (hard gate) ──────────────────────────────────────────────────────
  const aA = ageNum(input.ageA);
  const aB = ageNum(input.ageB);
  if (aA != null && aB != null) {
    if (aA === aB) {
      score += 10;
      reasons.push(`Same age (U${aA})`);
    } else {
      disqualified = true;
      blockers.push(`Different age (U${aA} vs U${aB})`);
    }
  }

  // ── State / city ─────────────────────────────────────────────────────────
  const sA = (input.stateA ?? "").toUpperCase().trim();
  const sB = (input.stateB ?? "").toUpperCase().trim();
  if (sA && sB) {
    if (sA === sB) {
      score += 12;
      reasons.push(`Same state (${sA})`);
    } else {
      score -= 30;
      blockers.push(`Different state (${sA} vs ${sB})`);
    }
  }

  const cA = titleCity(input.cityA);
  const cB = titleCity(input.cityB);
  if (cA && cB) {
    if (cA.toLowerCase() === cB.toLowerCase()) {
      score += 22;
      reasons.push(`Same city (${cA})`);
    } else {
      score -= 8;
      blockers.push(`Different city (${cA} vs ${cB})`);
    }
  }

  // ── Coaches ──────────────────────────────────────────────────────────────
  const sharedCoaches = coachOverlap(input.coachesA, input.coachesB);
  if (sharedCoaches.length > 0) {
    score += Math.min(30, sharedCoaches.length * 18);
    reasons.push(
      `Shared coach${sharedCoaches.length > 1 ? "es" : ""}: ${sharedCoaches.slice(0, 3).join(", ")}`,
    );
  }

  // ── Shared games (near-proof) ────────────────────────────────────────────
  const shared = input.sharedGameCount ?? 0;
  if (shared >= 1) {
    // One shared matchup can be a tournament coincidence; two is near-proof.
    score += shared >= 2 ? 40 : 20;
    reasons.push(`${shared} shared game${shared === 1 ? "" : "s"}`);
  }

  // ── Game-region overlap (locality proxy when city is unknown) ────────────
  const rA = new Set((input.regionStatesA ?? []).map((s) => s.toUpperCase()));
  const rB = (input.regionStatesB ?? []).map((s) => s.toUpperCase());
  const regionOverlap = rB.some((s) => rA.has(s));
  const haveRegions = rA.size > 0 && rB.length > 0;
  if (!cA || !cB) {
    if (haveRegions && regionOverlap) {
      score += 10;
      reasons.push("Game regions overlap");
    } else if (haveRegions && !regionOverlap) {
      score -= 25;
      blockers.push("Game regions differ");
    }
  }

  score = Math.max(0, Math.min(100, score));

  // ── Tier ─────────────────────────────────────────────────────────────────
  let tier: MergeTier;
  const hasConflict = blockers.some(
    (b) => b.startsWith("Different state") || b === "Game regions differ",
  );
  const namesDiffer = blockers.includes("Names differ");
  const strongCorroborator =
    sharedCoaches.length > 0 || shared >= 2 || Boolean(cA && cB && cA.toLowerCase() === cB.toLowerCase());

  if (disqualified) {
    // Different stated ages can't be the same team — a hard no even with other signals.
    tier = "none";
  } else if (shared >= 2) {
    // Two exact shared matchups (opponent + day + score) is near-proof, and
    // overrides a name or locality mismatch — distinct teams don't share them.
    tier = "high";
  } else if (exactName && score >= 80 && strongCorroborator && !hasConflict) {
    tier = "high";
  } else if (score >= 55 && !hasConflict && !namesDiffer) {
    tier = "medium";
  } else {
    tier = "low";
  }

  return { score, tier, reasons, blockers, disqualified };
}
