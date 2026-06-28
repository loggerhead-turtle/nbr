/**
 * MaxPreps harvester for Utah high-school varsity baseball.
 *
 * Two modes:
 *  - DEBUG (env MAXPREPS_DEBUG_URL set): render that URL and dump its team links
 *    + text sample, so the parsers can be tuned to MaxPreps' real layout. This is
 *    the same loop used to crack GameChanger.
 *  - HARVEST: for each listing URL in MAXPREPS_SEEDS (JSON array of URLs, or the
 *    defaults), collect team links, then visit each team page to read its
 *    classification and parse its completed games.
 *
 * The HS season is over, so this is intended as a one-time run.
 */
import { prisma } from "@nbr/db";
import { normalizeTeamName, teamSlug } from "@nbr/core";
import { launchBrowser, newContext, openUrl, pageLinks, pageDiagnostics } from "./browser.js";
import {
  extractTeamLinks,
  teamScheduleUrl,
  parseMaxPrepsSchedule,
  parseMaxPrepsTeamHeader,
  type MaxPrepsGame,
} from "./parseMaxPreps.js";
import { envBool, envNum, jitterDelay } from "../util.js";

const DEFAULT_SEEDS = [
  // Statewide rankings/scores list teams across all classifications; each team's
  // own page provides its classification. Tune/extend after the debug run.
  "https://www.maxpreps.com/ut/baseball/rankings/1/",
];

export async function runMaxPreps(): Promise<void> {
  if (!envBool("SCRAPER_ENABLED", false)) {
    console.log("[maxpreps] SCRAPER_ENABLED is not true — skipping run.");
    return;
  }

  const browser = await launchBrowser();
  try {
    const debugUrl = process.env.MAXPREPS_DEBUG_URL;
    if (debugUrl) {
      await debugDump(browser, debugUrl);
      return;
    }
    await harvest(browser);
  } finally {
    await browser.close();
  }
}

async function debugDump(browser: Awaited<ReturnType<typeof launchBrowser>>, url: string) {
  const ctx = await newContext(browser);
  try {
    const { page, httpStatus } = await openUrl(ctx, url);
    const links = await pageLinks(page);
    const teamLinks = extractTeamLinks(links);
    const diag = await pageDiagnostics(page);
    console.log(`[maxpreps:debug] ${url} http=${httpStatus}`);
    console.log(`[maxpreps:debug] anchors=${links.length} teamLinks=${teamLinks.length}`);
    console.log(`[maxpreps:debug] teamLinkSamples=${JSON.stringify(teamLinks.slice(0, 10))}`);
    console.log(`[maxpreps:debug] page=${JSON.stringify(diag)}`);
    await page.close();
  } finally {
    await ctx.close();
  }
}

async function harvest(browser: Awaited<ReturnType<typeof launchBrowser>>) {
  const seeds = readSeeds();
  const maxTeams = envNum("MAXPREPS_MAX_TEAMS", 500);
  const year = envNum("MAXPREPS_SEASON_YEAR", new Date().getUTCFullYear());

  // 1) Collect team links from all listing pages.
  const teamLinks = new Map<string, { name: string; url: string }>();
  for (const seed of seeds) {
    const ctx = await newContext(browser);
    try {
      const { page, httpStatus } = await openUrl(ctx, seed);
      const links = extractTeamLinks(await pageLinks(page));
      for (const t of links) teamLinks.set(t.url, t);
      console.log(`[maxpreps] seed ${seed} http=${httpStatus} teams=${links.length}`);
      await page.close();
    } catch (e) {
      console.error(`[maxpreps] seed failed ${seed}:`, e instanceof Error ? e.message : e);
    } finally {
      await ctx.close();
    }
    await jitterDelay(20, 60);
  }

  console.log(`[maxpreps] ${teamLinks.size} unique team links discovered.`);

  // 2) Visit each team page: read classification + parse games.
  let processed = 0;
  for (const t of teamLinks.values()) {
    if (processed >= maxTeams) break;
    processed += 1;
    const ctx = await newContext(browser);
    try {
      const teamId = await upsertHsTeam(t.name, t.url);
      const { page, httpStatus } = await openUrl(ctx, teamScheduleUrl(t.url));
      const bodyText = await page.evaluate(() => document.body?.innerText ?? "");

      const header = parseMaxPrepsTeamHeader(bodyText);
      if (header.classification) {
        await prisma.team.update({
          where: { id: teamId },
          data: { classification: header.classification, city: header.city ?? undefined },
        });
      }

      const games = parseMaxPrepsSchedule(bodyText, year).filter(
        (g) => g.teamScore != null && g.opponentScore != null,
      );
      let added = 0;
      for (const g of games) {
        if (await upsertGame(teamId, g)) added += 1;
      }
      console.log(
        `[maxpreps] ${t.name} (${header.classification ?? "?"}) http=${httpStatus} games=${games.length} new=${added}`,
      );
      await page.close();
    } catch (e) {
      console.error(`[maxpreps] team failed ${t.url}:`, e instanceof Error ? e.message : e);
    } finally {
      await ctx.close();
    }
    await jitterDelay(15, 45);
  }

  console.log(`[maxpreps] done. processed=${processed} teams.`);
}

function readSeeds(): string[] {
  const raw = process.env.MAXPREPS_SEEDS;
  if (!raw) return DEFAULT_SEEDS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
  } catch {
    // fall through
  }
  return DEFAULT_SEEDS;
}

async function upsertHsTeam(name: string, maxprepsUrl: string): Promise<string> {
  const existing = await prisma.team.findUnique({ where: { maxprepsUrl } });
  if (existing) return existing.id;

  // Match an existing team by name (e.g. a manually-added one) before creating.
  const norm = normalizeTeamName(name);
  const candidates = await prisma.team.findMany({
    where: { name: { contains: norm.split(" ")[0] ?? norm, mode: "insensitive" }, maxprepsUrl: null },
    select: { id: true, name: true },
    take: 50,
  });
  const match = candidates.find((c) => normalizeTeamName(c.name) === norm);
  if (match) {
    await prisma.team.update({ where: { id: match.id }, data: { maxprepsUrl } });
    return match.id;
  }

  const slug = await uniqueSlug(teamSlug(name));
  const team = await prisma.team.create({
    data: { name: name.slice(0, 120), slug, maxprepsUrl, state: "UT", rating: { create: {} } },
  });
  return team.id;
}

async function upsertGame(teamId: string, g: MaxPrepsGame): Promise<boolean> {
  const opponentId = await resolveOpponent(g.opponentName);
  const homeTeamId = g.isHome ? teamId : opponentId;
  const awayTeamId = g.isHome ? opponentId : teamId;
  const homeScore = g.isHome ? g.teamScore! : g.opponentScore!;
  const awayScore = g.isHome ? g.opponentScore! : g.teamScore!;
  const playedAt = g.playedAt ? new Date(g.playedAt) : new Date();
  if (homeTeamId === awayTeamId) return false;

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

async function resolveOpponent(rawName: string): Promise<string> {
  const norm = normalizeTeamName(rawName);
  const candidates = await prisma.team.findMany({
    where: { name: { contains: norm.split(" ")[0] ?? norm, mode: "insensitive" } },
    select: { id: true, name: true },
    take: 50,
  });
  const match = candidates.find((c) => normalizeTeamName(c.name) === norm);
  if (match) return match.id;

  // Opponent not yet known — create a ghost (classification unknown → admin work).
  const slug = await uniqueSlug(teamSlug(rawName));
  const ghost = await prisma.team.create({
    data: {
      name: rawName.slice(0, 120),
      slug,
      isGhost: true,
      scrapeEnabled: false,
      rating: { create: {} },
    },
  });
  return ghost.id;
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || "team";
  let n = 2;
  while (await prisma.team.findUnique({ where: { slug } })) slug = `${base}-${n++}`;
  return slug;
}
