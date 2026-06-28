/**
 * Scrape one team's schedule, resolve opponents, and upsert completed games.
 * Records a ScrapeJob and updates the team's scrape bookkeeping. Never throws to
 * the caller — failures are captured in the returned status.
 */
import { prisma, ScrapeStatus, AgeGroup, findPromotableTeam, mergeTeams } from "@nbr/db";
import { normalizeTeamName, teamSlug } from "@nbr/core";
import type { BrowserContext } from "playwright";
import { openSchedule, pageDiagnostics } from "./browser.js";
import { parseScheduleText, parseTeamHeader, type ParsedGame } from "./parseSchedule.js";
import { computeNextScrapeAfter, type DueTeam } from "./scheduling.js";
import { envBool } from "../util.js";

const MAX_CONSECUTIVE_FAILURES = 5;

export interface ScrapeTeamResult {
  status: ScrapeStatus;
  gamesFound: number;
  gamesNew: number;
  httpStatus: number | null;
}

export async function scrapeTeam(
  browserContextFactory: () => Promise<BrowserContext>,
  team: DueTeam,
  now: Date,
): Promise<ScrapeTeamResult> {
  const job = await prisma.scrapeJob.create({
    data: { teamId: team.id, status: "SUCCESS" },
  });

  let status: ScrapeStatus = "SUCCESS";
  let gamesFound = 0;
  let gamesNew = 0;
  let httpStatus: number | null = null;
  const context = await browserContextFactory();

  try {
    const { page, httpStatus: hs } = await openSchedule(context, team.gcTeamId);
    httpStatus = hs;

    if (envBool("SCRAPER_DEBUG")) {
      try {
        const diag = await pageDiagnostics(page);
        console.log(`[scrape:debug] ${team.name}:`, JSON.stringify(diag));
      } catch (e) {
        console.log(`[scrape:debug] ${team.name}: diagnostics failed`, e);
      }
    }

    if (hs === 403 || hs === 429) {
      status = "BLOCKED";
    } else {
      const bodyText = await page.evaluate(() => document.body?.innerText ?? "");

      // Enrich a quick-added (ID-only) team from its page header, then collapse
      // any matching ghost into it so the games line up under one record.
      await enrichTeam(team.id, bodyText);

      const parsed = parseScheduleText(bodyText);
      const finals = parsed.filter((g) => g.isFinal && g.teamScore != null && g.opponentScore != null);
      gamesFound = finals.length;

      if (finals.length === 0) {
        status = "EMPTY";
      } else {
        for (const g of finals) {
          const created = await upsertGame(team.id, g);
          if (created) gamesNew += 1;
        }
      }
    }
    await page.close();
  } catch (err) {
    status = "FAILED";
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: { error: err instanceof Error ? err.message : String(err) },
    });
  } finally {
    await context.close();
  }

  // Bookkeeping: failures/backoff.
  const failed = status === "FAILED" || status === "BLOCKED";
  await prisma.team.update({
    where: { id: team.id },
    data: {
      lastScrapedAt: now,
      nextScrapeAfter: computeNextScrapeAfter(now, team.reason),
      // Auto-disable a team after repeated failures so we stop hammering a dead ID.
      consecutiveFailures: failed ? { increment: 1 } : 0,
    },
  });

  const refreshed = await prisma.team.findUnique({
    where: { id: team.id },
    select: { consecutiveFailures: true },
  });
  if (refreshed && refreshed.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    await prisma.team.update({ where: { id: team.id }, data: { scrapeEnabled: false } });
    console.warn(`[scrape] auto-disabled ${team.name} after ${refreshed.consecutiveFailures} failures`);
  }

  await prisma.scrapeJob.update({
    where: { id: job.id },
    data: { status, gamesFound, gamesNew, httpStatus, finishedAt: now },
  });

  return { status, gamesFound, gamesNew, httpStatus };
}

/**
 * Fill in a quick-added (ID-only) team's name/city/age from its page header,
 * give it a real slug, and merge any matching ghost team into it.
 */
async function enrichTeam(teamId: string, bodyText: string): Promise<void> {
  const t = await prisma.team.findUnique({
    where: { id: teamId },
    select: { needsEnrichment: true, name: true, city: true, ageGroup: true },
  });
  if (!t?.needsEnrichment) return;

  const header = parseTeamHeader(bodyText);
  if (!header.name) return; // error page / couldn't parse — try again next run

  const ageGroup = (t.ageGroup ?? header.ageGroup) as AgeGroup | null;
  const slug = await uniqueSlug(teamSlug(header.name, header.ageGroup), teamId);

  await prisma.team.update({
    where: { id: teamId },
    data: {
      name: header.name,
      city: t.city ?? header.city ?? undefined,
      ageGroup: ageGroup ?? undefined,
      slug,
      needsEnrichment: false,
    },
  });
  console.log(`[scrape] enriched ${teamId} → "${header.name}"`);

  // Collapse a duplicate ghost (created from an opponent's schedule) into this team.
  const promo = await findPromotableTeam(header.name, header.ageGroup);
  if (promo && promo.id !== teamId) {
    await mergeTeams(promo.id, teamId);
    console.log(`[scrape] merged ghost "${promo.name}" into ${teamId}`);
  }
}

async function uniqueSlug(base: string, excludeId: string): Promise<string> {
  let slug = base || "team";
  let n = 2;
  while (true) {
    const existing = await prisma.team.findUnique({ where: { slug }, select: { id: true } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${n++}`;
  }
}

/** Resolve opponent → upsert the game by gcGameId. Returns true if newly created. */
async function upsertGame(teamId: string, g: ParsedGame): Promise<boolean> {
  const opponentId = await resolveOpponent(g.opponentName);

  const homeTeamId = g.isHome ? teamId : opponentId;
  const awayTeamId = g.isHome ? opponentId : teamId;
  const homeScore = g.isHome ? g.teamScore! : g.opponentScore!;
  const awayScore = g.isHome ? g.opponentScore! : g.teamScore!;
  const playedAt = g.playedAt ? new Date(g.playedAt) : new Date();

  if (g.gcGameId) {
    const existing = await prisma.game.findUnique({ where: { gcGameId: g.gcGameId } });
    if (existing) {
      // Update scores (e.g. SCHEDULED → FINAL transition).
      await prisma.game.update({
        where: { gcGameId: g.gcGameId },
        data: { homeScore, awayScore, status: "FINAL" },
      });
      return false;
    }
    await prisma.game.create({
      data: {
        gcGameId: g.gcGameId,
        homeTeamId,
        awayTeamId,
        homeScore,
        awayScore,
        status: "FINAL",
        source: "SCRAPE",
        playedAt,
      },
    });
    return true;
  }

  // No game id: advisory dedup on (teams, day).
  const dayStart = new Date(playedAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(playedAt);
  dayEnd.setHours(23, 59, 59, 999);
  const dup = await prisma.game.findFirst({
    where: { homeTeamId, awayTeamId, playedAt: { gte: dayStart, lte: dayEnd } },
  });
  if (dup) return false;

  await prisma.game.create({
    data: {
      homeTeamId,
      awayTeamId,
      homeScore,
      awayScore,
      status: "FINAL",
      source: "SCRAPE",
      playedAt,
    },
  });
  return true;
}

/** Match an opponent name to an existing team, else auto-create a ghost team. */
async function resolveOpponent(rawName: string): Promise<string> {
  const normalized = normalizeTeamName(rawName);

  // Cheap candidate fetch: teams whose name shares the first significant token.
  const firstToken = normalized.split(" ")[0] ?? normalized;
  const candidates = await prisma.team.findMany({
    where: { name: { contains: firstToken, mode: "insensitive" } },
    select: { id: true, name: true },
    take: 50,
  });
  const match = candidates.find((c) => normalizeTeamName(c.name) === normalized);
  if (match) return match.id;

  // Create a ghost team (unverified) so the game still contributes to ratings.
  let slug = teamSlug(rawName);
  let n = 2;
  while (await prisma.team.findUnique({ where: { slug } })) {
    slug = `${teamSlug(rawName)}-${n++}`;
  }
  const ghost = await prisma.team.create({
    data: {
      name: rawName.slice(0, 120),
      slug,
      isGhost: true,
      scrapeEnabled: false, // we don't have a GC id for ghosts
      rating: { create: {} },
    },
  });
  return ghost.id;
}
