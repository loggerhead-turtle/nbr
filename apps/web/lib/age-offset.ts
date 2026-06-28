/**
 * Cross-age rating offset helpers.
 *
 * The per-age-year step + clamp now live in @nbr/core so the `bt-age-v1` model
 * and this admin preview share one knob (the `ageOffsetStep` AppSetting). With
 * `bt-age-v1` active the step is already baked into stored ratings, so this
 * preview's offset is only meaningful for the non-age-normalized models.
 */
import { AGE_OFFSET_KEY, DEFAULT_AGE_STEP, AGE_ANCHOR_YEAR, clampAgeStep } from "@nbr/core";

export { AGE_OFFSET_KEY, DEFAULT_AGE_STEP, clampAgeStep };

const ANCHOR_AGE = AGE_ANCHOR_YEAR;

/** Parse an age group like "14U" (or "U14") to its number; null if not an age group. */
export function ageYears(ageGroup: string | null | undefined): number | null {
  if (!ageGroup) return null;
  const m = ageGroup.match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

/** Points to add to a team's raw rating for a cross-age view (14U = 0). */
export function ageOffsetPoints(
  ageGroup: string | null | undefined,
  stepPoints: number = DEFAULT_AGE_STEP,
): number {
  const y = ageYears(ageGroup);
  if (y == null) return 0;
  return (y - ANCHOR_AGE) * stepPoints;
}
