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

/** Normalize a team name for fuzzy opponent matching (scraper). */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(\d{1,2}u|u\d{1,2})\b/g, "") // drop age-group tokens
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
