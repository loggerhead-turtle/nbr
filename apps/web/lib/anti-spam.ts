/**
 * Lightweight spam defenses for public account creation. Deliberately low-
 * friction (no CAPTCHA / email verification yet — planned):
 *  1. a honeypot field real users never see or fill;
 *  2. a per-IP + per-email signup rate limit (in-memory — the web app runs as a
 *     single long-lived Render process, so a Map is sufficient and resets on
 *     deploy, which is fine for abuse throttling);
 *  3. a disposable/throwaway email-domain blocklist.
 */

import { headers } from "next/headers";

export { HONEYPOT_FIELD } from "./spam-constants";

/** Best-effort client IP from the proxy headers (Render sets x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

// ── In-memory sliding-window rate limiter ────────────────────────────────────
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const hits = new Map<string, number[]>();

/**
 * Record an attempt for `key` and return whether it's still within `max` per
 * hour. Prunes old timestamps so the map doesn't grow without bound.
 */
export function rateLimit(key: string, max: number): { ok: boolean; retryAfterMin: number } {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
  recent.push(now);
  hits.set(key, recent);
  // Opportunistic cleanup of unrelated stale keys.
  if (hits.size > 5000) {
    for (const [k, arr] of hits) {
      const kept = arr.filter((t) => t > cutoff);
      if (kept.length === 0) hits.delete(k);
      else hits.set(k, kept);
    }
  }
  if (recent.length > max) {
    const oldest = recent[0]!;
    return { ok: false, retryAfterMin: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 60000)) };
  }
  return { ok: true, retryAfterMin: 0 };
}

// ── Disposable email domains ─────────────────────────────────────────────────
// A small, high-signal blocklist of throwaway providers. Not exhaustive by
// design — it stops the common ones without a heavy dependency.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "sharklasers.com",
  "10minutemail.com", "temp-mail.org", "tempmail.com", "throwawaymail.com",
  "yopmail.com", "trashmail.com", "getnada.com", "maildrop.cc", "dispostable.com",
  "fakeinbox.com", "mailnesia.com", "mohmal.com", "emailondeck.com", "mintemail.com",
  "spam4.me", "grr.la", "tempinbox.com", "moakt.com", "harakirimail.com",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}
