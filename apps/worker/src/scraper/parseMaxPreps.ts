/**
 * Pure parsers for MaxPreps pages (Utah high-school varsity baseball).
 *
 * MaxPreps blocks non-browser requests and ships an obfuscated layout, so — as
 * with GameChanger — these parsers work on stable anchors (team-page URL shape)
 * and on text patterns (result + score + opponent + date). The exact selectors
 * are refined against a real page captured via the MAXPREPS_DEBUG dump.
 */

/** A MaxPreps team page URL looks like https://www.maxpreps.com/<st>/<city>/<mascot>/baseball/ */
const TEAM_HREF_RE = /maxpreps\.com\/([a-z]{2})\/([^/]+)\/([^/]+)\/baseball\/?(?:[?#].*)?$/i;

export function isLikelyTeamHref(href: string): boolean {
  return TEAM_HREF_RE.test(href);
}

/** Canonicalize a team URL to its base (strip query/sub-paths) for dedup. */
export function canonicalTeamUrl(href: string): string | null {
  const m = href.match(/^(https?:\/\/(?:www\.)?maxpreps\.com\/[a-z]{2}\/[^/]+\/[^/]+\/baseball)\//i);
  return m ? `${m[1]}/` : isLikelyTeamHref(href) ? href.replace(/[?#].*$/, "") : null;
}

/** The schedule page for a team base URL. */
export function teamScheduleUrl(teamBaseUrl: string): string {
  return teamBaseUrl.endsWith("/") ? `${teamBaseUrl}schedule/` : `${teamBaseUrl}/schedule/`;
}

export interface MaxPrepsTeamLink {
  name: string;
  url: string;
}

/** Extract unique team links from a listing/standings/rankings page's anchors. */
export function extractTeamLinks(
  links: { href: string; text: string }[],
): MaxPrepsTeamLink[] {
  const byUrl = new Map<string, MaxPrepsTeamLink>();
  for (const l of links) {
    if (!isLikelyTeamHref(l.href)) continue;
    const url = canonicalTeamUrl(l.href);
    if (!url) continue;
    const name = l.text.replace(/\s+/g, " ").trim();
    if (!byUrl.has(url) && name.length >= 2) {
      byUrl.set(url, { name: name.slice(0, 120), url });
    } else if (!byUrl.has(url)) {
      byUrl.set(url, { name: deriveNameFromUrl(url), url });
    }
  }
  return [...byUrl.values()];
}

function deriveNameFromUrl(url: string): string {
  const m = url.match(/\/[a-z]{2}\/([^/]+)\/([^/]+)\/baseball/i);
  if (!m) return "Unknown";
  const words = `${m[1]} ${m[2]}`.replace(/-/g, " ").trim();
  return words.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 120);
}

export interface MaxPrepsTeamHeader {
  name: string | null;
  city: string | null;
  classification: string | null; // "1A".."6A"
}

const CLASS_RE = /\b([1-6]A)\b/;

/**
 * Extract a team's name, city, and classification from its MaxPreps team page.
 * Classification ("6A", "5A", …) is read from the team's OWN page — never
 * inferred from opponents.
 */
export function parseMaxPrepsTeamHeader(rawText: string): MaxPrepsTeamHeader {
  const text = rawText.replace(/\s+/g, " ").trim();
  const cls = text.match(CLASS_RE);
  // Heuristic name: the longest title-cased run near the top; refined post-debug.
  const nameMatch = text.match(/\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,4})\b/);
  const locMatch = text.match(/([A-Za-z][A-Za-z .'’-]+),\s*([A-Z]{2})\b/);
  return {
    name: nameMatch?.[1]?.slice(0, 120) ?? null,
    city: locMatch?.[1]?.trim() ?? null,
    classification: cls?.[1] ?? null,
  };
}

export interface MaxPrepsGame {
  opponentName: string;
  isHome: boolean;
  teamScore: number | null;
  opponentScore: number | null;
  isFinal: boolean;
  playedAt: string | null;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Best-effort schedule parser. MaxPreps rows typically carry a result letter,
 * a score, an opponent, and a date, e.g.:
 *   "5/12/2025 W 7-2 vs Lehi"   or   "May 12 L 1-4 @ American Fork Final"
 * Tune the patterns here once the real page text is captured.
 */
export function parseMaxPrepsSchedule(rawText: string, year?: number): MaxPrepsGame[] {
  const text = rawText.replace(/\s+/g, " ").trim();
  const games: MaxPrepsGame[] = [];

  // result + score + home/away + opponent, with a nearby date.
  const re =
    /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|[A-Z][a-z]{2}\.?\s+\d{1,2})?\s*\b([WLT])\b\s+(\d{1,2})-(\d{1,2})\s+(vs\.?|@)\s+((?:(?!\b[WLT]\b\s+\d|vs\.?\s|@\s|\d{1,2}\/\d{1,2}).)+)/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const teamScore = Number(m[3]);
    const opponentScore = Number(m[4]);
    const isHome = /^vs/i.test(m[5] ?? "");
    const opponentName = (m[6] ?? "").replace(/\s+(Final|Box Score|Recap).*$/i, "").trim().slice(0, 120);
    if (!opponentName) continue;
    games.push({
      opponentName,
      isHome,
      teamScore,
      opponentScore,
      isFinal: true,
      playedAt: parseDate(m[1], year),
    });
  }
  return games;
}

function parseDate(raw: string | undefined, fallbackYear?: number): string | null {
  if (!raw) return null;
  const slash = raw.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (slash) {
    const month = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : fallbackYear ?? new Date().getUTCFullYear();
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month, day, 18, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const named = raw.match(/([A-Z][a-z]{2})\.?\s+(\d{1,2})/);
  if (named) {
    const month = MONTHS[named[1]!.toLowerCase()];
    if (month == null) return null;
    const year = fallbackYear ?? new Date().getUTCFullYear();
    const d = new Date(Date.UTC(year, month, Number(named[2]), 18, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}
