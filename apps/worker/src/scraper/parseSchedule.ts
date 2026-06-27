/**
 * Defensive parser for a GameChanger public team schedule page.
 *
 * IMPORTANT: GameChanger ships an obfuscated SPA whose CSS class names are hashed
 * and change frequently. We therefore parse on STABLE anchors only:
 *   - links to game detail pages (href contains "/game(s)/<id>") → the game id;
 *   - the word "Final" → a completed game;
 *   - a score pattern like "7 - 3" or "7-3";
 *   - "vs" (home) / "@" (away) to infer home/away;
 *   - a parseable date near the row.
 *
 * All knowledge of the DOM lives here. Every game is parsed in its own try/catch
 * so one malformed row can't sink the whole scrape, and the caller treats a
 * page that yields zero rows (while others succeed) as a possible layout break.
 */
import type { Page } from "playwright";

export interface ParsedGame {
  gcGameId: string | null;
  opponentName: string;
  isHome: boolean;
  teamScore: number | null;
  opponentScore: number | null;
  isFinal: boolean;
  playedAt: string | null; // ISO date string, best-effort
}

/** Extract raw game blocks from the rendered page, then parse each defensively. */
export async function parseSchedule(page: Page): Promise<ParsedGame[]> {
  // Pull lightweight, structured candidates out of the DOM in the page context.
  const candidates = await page.evaluate(() => {
    const out: { href: string | null; text: string }[] = [];
    const anchors = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
    const seen = new Set<string>();

    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      if (!/\/games?\//.test(href)) continue;
      // Walk up to a reasonably-sized container holding the game's text.
      let node: HTMLElement | null = a;
      for (let i = 0; i < 4 && node?.parentElement; i++) {
        node = node.parentElement;
        if ((node.innerText || "").length > 25) break;
      }
      const text = (node?.innerText || a.innerText || "").replace(/\s+/g, " ").trim();
      const key = `${href}|${text}`;
      if (seen.has(key) || text.length < 3) continue;
      seen.add(key);
      out.push({ href, text });
    }
    return out;
  });

  const games: ParsedGame[] = [];
  for (const c of candidates) {
    try {
      const parsed = parseOne(c.href, c.text);
      if (parsed) games.push(parsed);
    } catch {
      // Skip malformed rows.
    }
  }
  return dedupeByGameId(games);
}

const GAME_ID_RE = /\/games?\/([A-Za-z0-9]{6,})/;
const SCORE_RE = /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/;
// Anchor the date to a real month name so capitalized words like "Pioneers 7"
// aren't mistaken for "Month Day".
const DATE_RE =
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i;

export function parseOne(href: string | null, text: string): ParsedGame | null {
  const isFinal = /\bfinal\b/i.test(text);
  // Only completed games matter for ratings; skip rows with no score/final.
  const scoreMatch = text.match(SCORE_RE);
  if (!isFinal && !scoreMatch) return null;

  const gcGameId = href?.match(GAME_ID_RE)?.[1] ?? null;

  // Home/away: "@ Opponent" = away; "vs Opponent" = home. Default to home.
  const isAway = /(^|\s)@\s/.test(text) || /\baway\b/i.test(text);
  const isHome = !isAway;

  const opponentName = extractOpponent(text);
  if (!opponentName) return null;

  let teamScore: number | null = null;
  let opponentScore: number | null = null;
  if (scoreMatch) {
    // GameChanger typically renders the followed team's score first on its own
    // schedule page. We store both; the caller knows which team this page is for.
    const a = Number(scoreMatch[1]);
    const b = Number(scoreMatch[2]);
    teamScore = a;
    opponentScore = b;
  }

  return {
    gcGameId,
    opponentName,
    isHome,
    teamScore,
    opponentScore,
    isFinal: isFinal || scoreMatch != null,
    playedAt: extractDate(text),
  };
}

function extractOpponent(text: string): string | null {
  // Take the chunk following "vs" or "@", trimmed of result/score/date noise.
  const m = text.match(/(?:vs\.?|@)\s+([A-Za-z0-9][^|]*?)(?:\s+(?:Final|W|L|T)\b|\s+\d|$)/i);
  let name = m?.[1]?.trim() ?? null;
  if (!name) return null;
  name = name
    .replace(SCORE_RE, "")
    .replace(/\b(final|home|away|won|lost|tie)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return name.length >= 2 ? name.slice(0, 120) : null;
}

function extractDate(text: string): string | null {
  const m = text.match(DATE_RE);
  if (!m) return null;
  const [, mon, day, year] = m;
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const mi = months[mon!.slice(0, 3).toLowerCase()];
  if (mi == null) return null;
  const y = year ? Number(year) : new Date().getUTCFullYear();
  const d = new Date(Date.UTC(y, mi, Number(day), 18, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dedupeByGameId(games: ParsedGame[]): ParsedGame[] {
  const byId = new Map<string, ParsedGame>();
  const noId: ParsedGame[] = [];
  for (const g of games) {
    if (g.gcGameId) byId.set(g.gcGameId, g);
    else noId.push(g);
  }
  return [...byId.values(), ...noId];
}
