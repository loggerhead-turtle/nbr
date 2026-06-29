/** Small client-safe helpers for the TD module (no server imports). */

let counter = 0;
/** Short unique id for demo entities (client-only, never persisted server-side). */
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** "$1,250" — whole-dollar display for the payments illustration. */
export function money(dollars: number | null | undefined): string {
  if (dollars == null) return "—";
  return `$${dollars.toLocaleString("en-US")}`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "08:00" → minutes from midnight (480). */
export function parseHM(s: string): number {
  const [h, m] = (s || "0:0").split(":").map((n) => Number(n) || 0);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Inclusive list of ISO dates (YYYY-MM-DD) from start to end (capped at 14). */
export function enumerateDays(startISO: string | null, endISO: string | null): string[] {
  const start = startISO ? new Date(startISO) : new Date();
  if (Number.isNaN(start.getTime())) return [new Date().toISOString().slice(0, 10)];
  const end = endISO ? new Date(endISO) : new Date(start);
  const days: string[] = [];
  const d = new Date(start);
  let guard = 0;
  while (d <= end && guard < 14) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
    guard += 1;
  }
  if (days.length === 0) days.push(start.toISOString().slice(0, 10));
  return days;
}

/** "YYYY-MM-DD" for an ISO datetime, for date inputs. */
export function isoDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
