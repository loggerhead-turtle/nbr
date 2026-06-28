/**
 * Cross-age rating offset (experimental, admin-only for now).
 *
 * Ratings are only comparable within a connected web of opponents. Age groups
 * almost never play each other, so each forms its own island that the display
 * centers around the same number — making a top 12U look on par with a mid 14U.
 * This offset injects the real-world fact that older teams are stronger, by
 * shifting each age group's baseline by a fixed amount per age year (anchored at
 * 14U = 0). It is NOT baked into stored ratings or shown publicly yet — it's used
 * to visualize a combined cross-age ranking on the admin side.
 */
export const DEFAULT_AGE_STEP = 200;
const ANCHOR_AGE = 14;

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
