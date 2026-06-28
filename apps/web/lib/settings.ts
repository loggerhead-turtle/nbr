import { prisma } from "@nbr/db";
import {
  DEFAULT_RATING_ALGORITHM,
  isRatingAlgorithm,
  type RatingAlgorithmId,
} from "@nbr/core";

/** Admin-configurable site settings (plain reads; safe in server components). */
export const RATING_ALGORITHM_KEY = "ratingAlgorithm";

/** The statistical model the admin has chosen, or the default if unset/invalid. */
export async function getRatingAlgorithm(): Promise<RatingAlgorithmId> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { key: RATING_ALGORITHM_KEY } });
    return s && isRatingAlgorithm(s.value) ? s.value : DEFAULT_RATING_ALGORITHM;
  } catch {
    return DEFAULT_RATING_ALGORITHM;
  }
}

export async function setRatingAlgorithm(algorithm: string): Promise<void> {
  if (!isRatingAlgorithm(algorithm)) {
    throw new Error(`Unknown rating algorithm: ${algorithm}`);
  }
  await prisma.appSetting.upsert({
    where: { key: RATING_ALGORITHM_KEY },
    create: { key: RATING_ALGORITHM_KEY, value: algorithm },
    update: { value: algorithm },
  });
}
