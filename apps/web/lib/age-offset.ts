/**
 * Cross-age rating offset helpers.
 *
 * The per-age-year step + clamp now live in @nbr/core so the `bt-age-v1` model
 * and this admin preview share one knob (the `ageOffsetStep` AppSetting). With
 * `bt-age-v1` active the step is already baked into stored ratings, so this
 * preview's offset is only meaningful for the non-age-normalized models.
 */
import {
  AGE_OFFSET_KEY,
  AGE_OFFSET_STEP_OLDER_KEY,
  AGE_OFFSETS_KEY,
  DEFAULT_AGE_STEP,
  DEFAULT_AGE_STEP_OLDER,
  DEFAULT_AGE_OFFSETS,
  ageBaselinePoints,
  parseAgeOffsets,
  clampAgeStep,
} from "@nbr/core";

export {
  AGE_OFFSET_KEY,
  AGE_OFFSET_STEP_OLDER_KEY,
  AGE_OFFSETS_KEY,
  DEFAULT_AGE_STEP,
  DEFAULT_AGE_STEP_OLDER,
  DEFAULT_AGE_OFFSETS,
  parseAgeOffsets,
  clampAgeStep,
};

/** Parse an age group like "14U" (or "U14") to its number; null if not an age group. */
export function ageYears(ageGroup: string | null | undefined): number | null {
  if (!ageGroup) return null;
  const m = ageGroup.match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

/**
 * Points to add to a team's raw rating for a cross-age view (14U = 0), with the
 * reduced step applied to older ages — matches the `bt-age-v1` curve.
 */
export function ageOffsetPoints(
  ageGroup: string | null | undefined,
  stepPoints: number = DEFAULT_AGE_STEP,
  olderStep: number = DEFAULT_AGE_STEP_OLDER,
): number {
  const y = ageYears(ageGroup);
  if (y == null) return 0;
  return ageBaselinePoints(y, stepPoints, olderStep);
}
