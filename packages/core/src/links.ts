/** Public GameChanger team page for a team id (null if no id). */
export function gameChangerUrl(gcTeamId: string | null | undefined): string | null {
  return gcTeamId ? `https://web.gc.com/teams/${gcTeamId}` : null;
}

/**
 * Normalize a user-entered website URL: trim, prepend https:// if no scheme,
 * cap length, and return null for blanks or anything that isn't http(s).
 */
export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return withScheme.slice(0, 300);
  } catch {
    return null;
  }
}
