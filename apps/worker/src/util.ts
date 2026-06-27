/** Small worker utilities: jitter, sleep, env parsing. */

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Uniform random integer in [min, max]. */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Human-like delay between team fetches (seconds → ms), configurable. */
export async function jitterDelay(minSec = 30, maxSec = 120): Promise<void> {
  await sleep(randInt(minSec, maxSec) * 1000);
}

export function envBool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v == null) return fallback;
  const normalized = v.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function envNum(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

/** Shuffle in place (Fisher–Yates) — randomize team order each run. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
