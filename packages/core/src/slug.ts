/** Make a URL-safe slug from a team name (+ optional age group suffix). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function teamSlug(name: string, ageGroup?: string | null): string {
  const base = slugify(name);
  const suffix = ageGroup ? `-${ageGroup.toLowerCase()}` : "";
  return `${base}${suffix}`;
}

const VALID_AGE_GROUPS = new Set([
  "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18",
]);

/**
 * Derive an age group ONLY from a team's own name (e.g. "...14U" or "U14").
 * Returns null when the name states no age — callers must NOT infer age from
 * opponents, since teams routinely play up an age level.
 */
export function ageGroupFromName(name: string): string | null {
  const m = name.match(/\b(\d{1,2})U\b/i) ?? name.match(/\bU(\d{1,2})\b/i);
  if (!m) return null;
  const ag = `U${m[1]}`;
  return VALID_AGE_GROUPS.has(ag) ? ag : null;
}

/** Normalize a team name for fuzzy opponent matching (scraper). */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(\d{1,2}u|u\d{1,2})\b/g, "") // drop age-group tokens
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
