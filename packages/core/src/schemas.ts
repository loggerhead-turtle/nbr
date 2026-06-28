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
  numPools: z.coerce.number().int().min(2).max(16),
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
