/**
 * Parser for a GameChanger public team schedule page.
 *
 * GameChanger renders the schedule as plain text (no game-detail links, no
 * "Final" labels). A team's schedule reads like:
 *
 *   ... HOME SCHEDULE TEAM STATS Schedule
 *   March 2026
 *   SAT 7  @ GBG Utah 14U Navy L 3-4  vs. Cannons Baseball 14U L 1-7  @ Guerilla 14U W 4-2
 *   MON 16 @ Lightning Baseball Ahrens 14U W 15-1
 *   ...
 *   MON 27 vs. Wasatch Baseball Club 14U 4:20 PM   <- upcoming (time, no result)
 *
 * So each completed game is:  (vs.|@) <Opponent> (W|L|T) <ourScore>-<theirScore>
 * with the date carried from the most recent "Month YYYY" + "DOW D" headers.
 * Upcoming games (a time instead of a W/L/T result) are ignored — only
 * completed games feed the ratings.
 *
 * All DOM knowledge is the single `innerText` read in parseSchedule(); the rest
 * is pure text parsing in parseScheduleText() so it is fully unit-testable.
 */
import type { Page } from "playwright";

export interface ParsedGame {
  gcGameId: string | null;
  opponentName: string;
  isHome: boolean;
  teamScore: number | null;
  opponentScore: number | null;
  isFinal: boolean;
  playedAt: string | null; // ISO date string
}

export async function parseSchedule(page: Page): Promise<ParsedGame[]> {
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  return parseScheduleText(text);
}

export interface TeamHeader {
  name: string | null;
  city: string | null;
  state: string | null;
  ageGroup: string | null; // AgeGroup enum value (U8..U18) or null
  coaches: string[]; // staff names from the "Staff: ..." line
}

const VALID_AGE_GROUPS = new Set([
  "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18",
]);

/**
 * Extract a team's own details from its rendered page header, which reads like:
 *   "... Sign In Join Us Utah Warriors 14U 16-17 Spring 2026 Orem, UT Staff: ..."
 * i.e. <name> <record> <season> <City, ST> before "Staff:" / "Follow team".
 */
export function parseTeamHeader(rawText: string): TeamHeader {
  const empty: TeamHeader = { name: null, city: null, state: null, ageGroup: null, coaches: [] };
  const text = rawText.replace(/\s+/g, " ").trim();
  if (!text || /Oops! We could/i.test(text)) return empty;

  const after = text.split(/Join Us\s+/i)[1] ?? text;
  const chunk = after.split(/\s+(?:Staff:|Follow team|HOME\s+SCHEDULE)/i)[0] ?? after;

  const loc = chunk.match(/([A-Za-z][A-Za-z .'’-]+),\s*([A-Z]{2})\b/);
  const rec = chunk.match(/\b\d{1,2}-\d{1,2}\b/);
  const season = chunk.match(/\b(Spring|Summer|Fall|Autumn|Winter)\s+\d{4}\b/i);

  const idxs = [loc?.index, rec?.index, season?.index].filter(
    (i): i is number => typeof i === "number",
  );
  const boundary = idxs.length ? Math.min(...idxs) : Math.min(chunk.length, 60);

  let name = chunk.slice(0, boundary).replace(/[\s,]+$/, "").trim().slice(0, 120);

  const ageMatch = name.match(/\b(\d{1,2})U\b/i) ?? name.match(/\bU(\d{1,2})\b/i);
  let ageGroup: string | null = ageMatch ? `U${ageMatch[1]}` : null;
  if (ageGroup && !VALID_AGE_GROUPS.has(ageGroup)) ageGroup = null;

  return {
    name: name.length >= 2 ? name : null,
    city: loc?.[1]?.trim() ?? null,
    state: loc?.[2] ?? null,
    ageGroup,
    coaches: parseCoaches(text),
  };
}

/**
 * Pull the coaching staff out of the header's "Staff: A, B, C" list, which sits
 * between "Staff:" and "Follow team". GameChanger separates names with commas;
 * we drop obvious non-names and cap the list.
 */
function parseCoaches(text: string): string[] {
  const m = text.match(/Staff:\s*(.+?)\s+(?:Follow team|HOME\s+SCHEDULE|$)/i);
  if (!m?.[1]) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 60 && /[a-z]/i.test(s))
    .slice(0, 8);
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

// One regex, three alternatives, scanned left-to-right so date headers update
// state before the games that follow them:
//   1,2  Month YYYY
//   3,4  DOW D            (day-of-month header)
//   5    marker (vs.|@)
//   6    opponent (stops before the next marker / a W·L·T result / a time)
//   7    result (W|L|T)
//   8,9  scores  our-their
const MASTER = new RegExp(
  [
    "(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{4})",
    "(SUN|MON|TUE|WED|THU|FRI|SAT)\\s+(\\d{1,2})\\b",
    "(vs\\.?|@)\\s+" +
      "((?:(?!vs\\.?\\s|@\\s|(?:SUN|MON|TUE|WED|THU|FRI|SAT)\\s|[WLT]\\s\\d|\\d{1,2}:\\d{2}).)+?)" +
      "\\s+([WLT])\\s+(\\d{1,2})-(\\d{1,2})",
  ].join("|"),
  "g",
);

export function parseScheduleText(rawText: string): ParsedGame[] {
  // Collapse all whitespace so the scanner is line-break agnostic.
  const text = rawText.replace(/\s+/g, " ").trim();

  const games: ParsedGame[] = [];
  let curMonth: number | null = null;
  let curYear: number | null = null;
  let curDay: number | null = null;

  let m: RegExpExecArray | null;
  MASTER.lastIndex = 0;
  while ((m = MASTER.exec(text)) !== null) {
    if (m[1]) {
      curMonth = MONTHS[m[1].toLowerCase()] ?? null;
      curYear = Number(m[2]);
    } else if (m[3]) {
      curDay = Number(m[4]);
    } else if (m[5]) {
      const isHome = /^vs/i.test(m[5]);
      const opponentName = cleanName(m[6] ?? "");
      if (!opponentName) continue;
      const teamScore = Number(m[8]);
      const opponentScore = Number(m[9]);
      const playedAt =
        curMonth != null && curYear != null && curDay != null
          ? new Date(Date.UTC(curYear, curMonth, curDay, 18, 0, 0)).toISOString()
          : null;
      games.push({
        gcGameId: null,
        opponentName,
        isHome,
        teamScore,
        opponentScore,
        isFinal: true,
        playedAt,
      });
    }
  }
  return games;
}

function cleanName(raw: string): string {
  const name = raw.replace(/\s{2,}/g, " ").trim();
  return name.length >= 2 ? name.slice(0, 120) : "";
}
