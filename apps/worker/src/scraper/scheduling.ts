/**
 * Decide which teams are *due* to be scraped right now.
 *
 * Cadence (per the project's anti-flagging design):
 *  - Schedule-aware post-game fetch: if a team has a game whose scheduled end was
 *    ~2–3 hours ago and whose result we haven't pulled yet, fetch it once. This
 *    clusters naturally on game days (Sat/Mon) and looks like a fan checking the
 *    final score — never live monitoring.
 *  - No-schedule fallback: check on a random weekday (never Saturday) at most
 *    weekly.
 *  - Adaptive dormancy backoff: a team with no schedule and no new games for
 *    ~3–4 weeks drops to monthly checks (via nextScrapeAfter); normal cadence
 *    resumes automatically once a game or schedule reappears.
 *
 * The cron runs hourly and acts only on teams this function returns, so a team
 * is touched at most ~once per week in practice.
 */
import { prisma } from "@nbr/db";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface DueTeam {
  id: string;
  gcTeamId: string;
  name: string;
  reason: "initial" | "postgame" | "weekly" | "dormant-monthly";
}

export interface ScheduleParams {
  now: Date;
  postgameDelayHours: number;
}

export async function selectTeamsToScrape(params: ScheduleParams): Promise<DueTeam[]> {
  const { now, postgameDelayHours } = params;
  const postgameCutoff = new Date(now.getTime() - postgameDelayHours * HOUR);
  const isSaturday = now.getDay() === 6;

  const teams = await prisma.team.findMany({
    where: { scrapeEnabled: true, gcTeamId: { not: null } },
    select: {
      id: true,
      gcTeamId: true,
      name: true,
      lastScrapedAt: true,
      nextScrapeAfter: true,
    },
  });

  const due: DueTeam[] = [];

  for (const t of teams) {
    if (!t.gcTeamId) continue;
    // Respect an active backoff window.
    if (t.nextScrapeAfter && t.nextScrapeAfter > now) continue;

    // 0) Initial backfill: a team we've never scraped is visited promptly on any
    //    weekday to discover its schedule and past games. The polite, weekday-
    //    restricted cadence applies only after this first scrape.
    if (!t.lastScrapedAt) {
      due.push({ id: t.id, gcTeamId: t.gcTeamId, name: t.name, reason: "initial" });
      continue;
    }

    // 1) Post-game: a known game whose result we likely don't have yet
    //    (a SCHEDULED game whose start was before the post-game cutoff).
    const pendingResult = await prisma.game.findFirst({
      where: {
        status: "SCHEDULED",
        playedAt: { lte: postgameCutoff },
        OR: [{ homeTeamId: t.id }, { awayTeamId: t.id }],
      },
      select: { id: true },
    });
    if (pendingResult) {
      due.push({ id: t.id, gcTeamId: t.gcTeamId, name: t.name, reason: "postgame" });
      continue;
    }

    // Don't run blind (no-schedule) checks on Saturdays — those are reserved for
    // post-game timing tied to a known game.
    if (isSaturday) continue;

    // Determine dormancy: no completed game in ~28 days and no upcoming game.
    const recentFinal = await prisma.game.findFirst({
      where: {
        status: "FINAL",
        playedAt: { gte: new Date(now.getTime() - 28 * DAY) },
        OR: [{ homeTeamId: t.id }, { awayTeamId: t.id }],
      },
      select: { id: true },
    });
    const upcoming = await prisma.game.findFirst({
      where: {
        status: "SCHEDULED",
        playedAt: { gt: now },
        OR: [{ homeTeamId: t.id }, { awayTeamId: t.id }],
      },
      select: { id: true },
    });
    const dormant = !recentFinal && !upcoming;
    const interval = dormant ? 30 * DAY : 7 * DAY;

    const lastScraped = t.lastScrapedAt?.getTime() ?? 0;
    if (now.getTime() - lastScraped >= interval) {
      due.push({
        id: t.id,
        gcTeamId: t.gcTeamId,
        name: t.name,
        reason: dormant ? "dormant-monthly" : "weekly",
      });
    }
  }

  return due;
}

/** Compute the next-check time to persist after a scrape, given dormancy. */
export function computeNextScrapeAfter(now: Date, reason: DueTeam["reason"]): Date {
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Post-game and weekly checks resume on the normal weekly cycle; dormant teams
  // back off to ~monthly. A small random spread avoids a fixed pattern.
  const base = reason === "dormant-monthly" ? 30 : 7;
  const jitterDays = Math.floor(Math.random() * 3); // 0–2 days
  return new Date(now.getTime() + (base + jitterDays) * DAY_MS);
}
