/**
 * Built-in bracket advancement presets. Each carries a 1–2 sentence plain-English
 * synopsis the director can read before choosing. Modeled loosely on three common
 * youth-tournament rule sets (kept generic — no league is named). Directors can
 * also author a fully custom rule.
 */

import type { TdAdvancementRule } from "./types";

export const ADVANCEMENT_PRESETS: TdAdvancementRule[] = [
  {
    presetKey: "pool-winners",
    name: "Pool winners advance",
    synopsis:
      "Only the first-place team from each pool reaches the bracket, seeded by pool record. Cleanest format when you have four or more balanced pools.",
    poolWinnersAdvance: 1,
    wildcards: 0,
    seedBy: "POOL_RECORD",
    reseed: true,
    isCustom: false,
  },
  {
    presetKey: "top-two-wildcard",
    name: "Top two plus wildcards",
    synopsis:
      "The top two from every pool advance, with the best remaining teams added as wildcards to fill the bracket. Rewards a strong second-place finish in a tough pool.",
    poolWinnersAdvance: 2,
    wildcards: 2,
    seedBy: "POOL_RECORD",
    reseed: true,
    isCustom: false,
  },
  {
    presetKey: "all-advance-reseed",
    name: "Everyone advances, reseeded",
    synopsis:
      "Every team makes the bracket and is reseeded 1-through-N by overall strength, so pool play sets the seeding rather than eliminating anyone. Great for guaranteed-game-count weekends.",
    poolWinnersAdvance: 99,
    wildcards: 0,
    seedBy: "RATING",
    reseed: true,
    isCustom: false,
  },
];

export const DEFAULT_ADVANCEMENT = ADVANCEMENT_PRESETS[1]!;
