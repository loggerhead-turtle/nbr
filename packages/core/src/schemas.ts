import { z } from "zod";

// Utah high-school classifications, largest enrollment to smallest.
export const CLASSIFICATIONS = ["6A", "5A", "4A", "3A", "2A", "1A"] as const;

export const AGE_GROUPS = [
  "U8",
  "U9",
  "U10",
  "U11",
  "U12",
  "U13",
  "U14",
  "U15",
  "U16",
  "U17",
  "U18",
  "OPEN",
] as const;

/**
 * Statistical evaluation models a site admin can choose from for rating
 * recomputes. Order is display order; the first entry is the recommended one.
 */
export const RATING_ALGORITHMS = [
  {
    id: "bt-age-v1",
    label: "Bradley-Terry · age-normalized",
    description:
      "Unified cross-age scale: every age group sits on one developmental curve, so an average 16U team ranks above an average 8U team. Recommended.",
  },
  {
    id: "bt-mov-v1",
    label: "Bradley-Terry · margin of victory",
    description:
      "Global, margin-aware model. Rates teams relative to the opponents they played, with no age baseline (an 8U and a 16U can share a number).",
  },
  {
    id: "glicko2-v1",
    label: "Glicko-2",
    description:
      "Sequential, per-period model with rating deviation and volatility. No age baseline.",
  },
] as const;

export type RatingAlgorithmId = (typeof RATING_ALGORITHMS)[number]["id"];

/** The model used when an admin hasn't chosen one. */
export const DEFAULT_RATING_ALGORITHM: RatingAlgorithmId = "bt-age-v1";

export function isRatingAlgorithm(value: string): value is RatingAlgorithmId {
  return RATING_ALGORITHMS.some((a) => a.id === value);
}

/**
 * Cross-age developmental step: how many rating points a team gains per age-year.
 * Older youth teams are materially stronger, so the rating scale shifts each age
 * group's baseline by this much, anchored at 14U = 0 (14U keeps a ~1500 center,
 * younger sits below, older above). This single knob drives both the `bt-age-v1`
 * model's prior and the admin cross-age preview.
 */
export const AGE_OFFSET_KEY = "ageOffsetStep";
export const DEFAULT_AGE_STEP = 200;
export const AGE_ANCHOR_YEAR = 14;
/** Reduced per-year step for older ages (the gap shrinks as kids grow). */
export const AGE_OFFSET_STEP_OLDER_KEY = "ageOffsetStepOlder";
export const DEFAULT_AGE_STEP_OLDER = 75;
/** Ages at/above this year use the reduced (older) step. */
export const AGE_OLDER_THRESHOLD = 16;

/**
 * Per-age-group baseline offsets (display points, 14U = 0), set explicitly by an
 * admin. Stored as JSON in AppSetting; overrides the per-year step model for the
 * ages listed. Lets each bracket be tuned independently.
 */
export const AGE_OFFSETS_KEY = "ageOffsets";
export const DEFAULT_AGE_OFFSETS: Record<string, number> = {
  U8: -1200,
  U9: -1000,
  U10: -800,
  U11: -600,
  U12: -400,
  U13: -200,
  U14: 0,
  U15: 100,
  U16: 200,
  U17: 237,
  U18: 275,
  OPEN: 350,
};

/** Parse a stored ageOffsets JSON blob into a clean {ageGroup: points} map. */
export function parseAgeOffsets(value: string | null | undefined): Record<string, number> {
  if (!value) return {};
  try {
    const obj = JSON.parse(value) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const a of AGE_GROUPS) {
      const n = Number(obj[a]);
      if (Number.isFinite(n)) out[a] = Math.round(n);
    }
    return out;
  } catch {
    return {};
  }
}

// ── NBR competitive tiers (A / AA / AAA / Majors) ──────────────────────────
// A team's tier is its rating's percentile WITHIN its own age group (older teams
// rate higher on the unified scale, so a global percentile would just re-encode
// age). Cutoffs are the percentile lower-bounds and are admin-tunable.
export const NBR_TIERS = ["A", "AA", "AAA", "Majors"] as const;
export type NbrTier = (typeof NBR_TIERS)[number];
export const TIER_CUTOFFS_KEY = "nbrTierCutoffs";
export interface TierCutoffs {
  AA: number;
  AAA: number;
  Majors: number;
}
/** USSSA-style pyramid: A <25th, AA 25–60, AAA 60–92, Majors top ~8%. */
export const DEFAULT_TIER_CUTOFFS: TierCutoffs = { AA: 25, AAA: 60, Majors: 92 };
/** Below this many established teams in an age group, tiers aren't meaningful. */
export const MIN_TEAMS_FOR_TIERS = 5;

export function parseTierCutoffs(value: string | null | undefined): TierCutoffs {
  const d = DEFAULT_TIER_CUTOFFS;
  if (!value) return { ...d };
  try {
    const o = JSON.parse(value) as Record<string, unknown>;
    const clamp = (x: unknown, def: number) => {
      const n = Number(x);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : def;
    };
    const AA = clamp(o.AA, d.AA);
    const AAA = Math.max(AA, clamp(o.AAA, d.AAA));
    const Majors = Math.max(AAA, clamp(o.Majors, d.Majors));
    return { AA, AAA, Majors };
  } catch {
    return { ...d };
  }
}

/** Percentile (0–100) of `rating` within a same-age rating list (fraction below). */
export function percentileOf(rating: number, sameAgeRatings: number[]): number {
  const n = sameAgeRatings.length;
  if (n <= 1) return 50;
  let below = 0;
  for (const r of sameAgeRatings) if (r < rating) below++;
  return (below / (n - 1)) * 100;
}

export function tierForPercentile(pct: number, c: TierCutoffs = DEFAULT_TIER_CUTOFFS): NbrTier {
  if (pct >= c.Majors) return "Majors";
  if (pct >= c.AAA) return "AAA";
  if (pct >= c.AA) return "AA";
  return "A";
}

/** Cumulative cross-age offset (display points) for an age, 14U = 0, with the
 *  reduced step applied at/above AGE_OLDER_THRESHOLD. */
export function ageBaselinePoints(
  ageYearNum: number,
  step: number = DEFAULT_AGE_STEP,
  olderStep: number = DEFAULT_AGE_STEP_OLDER,
  anchor: number = AGE_ANCHOR_YEAR,
  threshold: number = AGE_OLDER_THRESHOLD,
): number {
  let v = 0;
  if (ageYearNum > anchor) {
    for (let y = anchor + 1; y <= ageYearNum; y++) v += y >= threshold ? olderStep : step;
  } else {
    for (let y = ageYearNum + 1; y <= anchor; y++) v -= y >= threshold ? olderStep : step;
  }
  return v;
}

/** Clamp a raw points-per-age-year value to a sane range. */
export function clampAgeStep(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_AGE_STEP;
  return Math.max(0, Math.min(1000, Math.round(n)));
}

// GameChanger opaque team ids are short alphanumeric strings (e.g. 21nCCNFQXjHB).
export const gcTeamIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{8,24}$/, "That doesn't look like a GameChanger team ID.");

export const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(120),
  gcTeamId: gcTeamIdSchema.optional().or(z.literal("").transform(() => undefined)),
  ageGroup: z.enum(AGE_GROUPS).optional(),
  division: z.string().trim().max(60).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().length(2).default("UT"),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "ZIP must be 5 digits.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const createGameSchema = z
  .object({
    homeTeamId: z.string().min(1),
    awayTeamId: z.string().min(1),
    homeScore: z.coerce.number().int().min(0).max(100),
    awayScore: z.coerce.number().int().min(0).max(100),
    playedAt: z.coerce.date(),
    neutralSite: z.coerce.boolean().default(false),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((g) => g.homeTeamId !== g.awayTeamId, {
    message: "A team cannot play itself.",
    path: ["awayTeamId"],
  });
export type CreateGameInput = z.infer<typeof createGameSchema>;

export const poolGenerateSchema = z.object({
  name: z.string().trim().max(120).optional(),
  numPools: z.coerce.number().int().min(1).max(256),
  teams: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(120),
        rating: z.coerce.number().min(0).max(4000),
        isProvisional: z.boolean().optional(),
      }),
    )
    .min(2)
    .max(256),
});
export type PoolGenerateInput = z.infer<typeof poolGenerateSchema>;
