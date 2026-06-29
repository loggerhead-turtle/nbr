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
