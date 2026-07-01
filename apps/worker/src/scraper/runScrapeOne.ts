/**
 * On-demand scrapes triggered when a team is added (via the Render one-off Job
 * API — see apps/web/lib/render-jobs.ts). These bypass the polite weekly cadence
 * because they're explicit, low-volume, user-initiated actions; they still
 * respect each team's own `scrapeEnabled` flag. After scraping, a rating
 * recompute runs so the new team's games show up immediately.
 */
import { prisma } from "@nbr/db";
import { launchBrowser, newContext } from "./browser.js";
import { scrapeTeam } from "./scrapeTeam.js";
import { runRecompute } from "../ratings/runRecompute.js";
import { envBool, envNum, jitterDelay } from "../util.js";

async function maybeRecompute(reason: string): Promise<void> {
  if (!envBool("SCRAPE_THEN_RECOMPUTE", true)) {
    console.log("[scrape-one] SCRAPE_THEN_RECOMPUTE disabled — skipping recompute.");
    return;
  }
  console.log(`[scrape-one] ${reason} — running recompute.`);
  try {
    await runRecompute();
  } catch (err) {
    console.error("[scrape-one] recompute failed:", err);
  }
}

/** Scrape a single team by GameChanger ID, then recompute. */
export async function runScrapeOne(gcTeamId: string | undefined): Promise<void> {
  if (!gcTeamId) {
    console.error("[scrape-one] usage: scrape-one <gcTeamId>");
    return;
  }

  const team = await prisma.team.findUnique({
    where: { gcTeamId },
    select: { id: true, gcTeamId: true, name: true, scrapeEnabled: true },
  });
  if (!team || !team.gcTeamId) {
    console.warn(`[scrape-one] no team with GameChanger ID ${gcTeamId}.`);
    return;
  }
  if (!team.scrapeEnabled) {
    console.warn(`[scrape-one] ${team.name} has scraping disabled — skipping.`);
    return;
  }

  const browser = await launchBrowser();
  let result;
  try {
    result = await scrapeTeam(
      () => newContext(browser),
      { id: team.id, gcTeamId: team.gcTeamId, name: team.name, reason: "initial" },
      new Date(),
    );
  } finally {
    await browser.close();
  }
  console.log(
    `[scrape-one] ${team.name}: ${result.status} found=${result.gamesFound} ` +
      `new=${result.gamesNew} http=${result.httpStatus}`,
  );

  await maybeRecompute(`scraped ${team.name}`);
}

/**
 * Full re-scrape of EVERY scrapeable team (regardless of when last scraped), then
 * recompute once. A deliberate, run-when-ready one-off — e.g. to backfill new
 * fields (gcSeason/gcRecord/gcGameId) across the whole population. Idempotent:
 * scrapeTeam updates lastScrapedAt as it goes, so a re-run just does everyone
 * again. Long-running (polite delay per team); stops early if BLOCKED.
 */
export async function runScrapeAll(): Promise<void> {
  const teams = await prisma.team.findMany({
    where: { scrapeEnabled: true, gcTeamId: { not: null } },
    select: { id: true, gcTeamId: true, name: true },
    orderBy: { lastScrapedAt: "asc" }, // oldest first so a killed run resumes usefully
  });
  if (teams.length === 0) {
    console.log("[scrape-all] no scrapeable teams.");
    return;
  }
  console.log(`[scrape-all] re-scraping all ${teams.length} team(s).`);

  const browser = await launchBrowser();
  let totalNew = 0;
  let processed = 0;
  try {
    for (const t of teams) {
      const result = await scrapeTeam(
        () => newContext(browser),
        { id: t.id, gcTeamId: t.gcTeamId!, name: t.name, reason: "weekly" },
        new Date(),
      );
      totalNew += result.gamesNew;
      processed += 1;
      console.log(
        `[scrape-all] ${processed}/${teams.length} ${t.name}: ${result.status} ` +
          `found=${result.gamesFound} new=${result.gamesNew}`,
      );
      if (result.status === "BLOCKED") {
        console.warn("[scrape-all] BLOCKED — ending early; re-run later to finish.");
        break;
      }
      if (t !== teams[teams.length - 1]) {
        await jitterDelay(envNum("SCRAPER_MIN_DELAY_SEC", 10), envNum("SCRAPER_MAX_DELAY_SEC", 30));
      }
    }
  } finally {
    await browser.close();
  }

  await maybeRecompute(`re-scraped ${processed}/${teams.length} team(s), ${totalNew} new game(s)`);
}

/** Scrape every just-added (never-scraped) team, then recompute once. */
export async function runScrapeNew(): Promise<void> {
  const teams = await prisma.team.findMany({
    where: { scrapeEnabled: true, gcTeamId: { not: null }, lastScrapedAt: null },
    select: { id: true, gcTeamId: true, name: true },
  });
  if (teams.length === 0) {
    console.log("[scrape-new] no just-added teams to scrape.");
    return;
  }
  console.log(`[scrape-new] ${teams.length} new team(s) to scrape.`);

  const browser = await launchBrowser();
  let totalNew = 0;
  try {
    for (const t of teams) {
      const result = await scrapeTeam(
        () => newContext(browser),
        { id: t.id, gcTeamId: t.gcTeamId!, name: t.name, reason: "initial" },
        new Date(),
      );
      totalNew += result.gamesNew;
      console.log(
        `[scrape-new] ${t.name}: ${result.status} found=${result.gamesFound} new=${result.gamesNew}`,
      );
      if (result.status === "BLOCKED") {
        console.warn("[scrape-new] BLOCKED — ending early.");
        break;
      }
      // Polite delay between teams, tunable for faster one-off bulk loads.
      if (t !== teams[teams.length - 1]) {
        await jitterDelay(envNum("SCRAPER_MIN_DELAY_SEC", 10), envNum("SCRAPER_MAX_DELAY_SEC", 30));
      }
    }
  } finally {
    await browser.close();
  }

  await maybeRecompute(`${totalNew} new game(s) across ${teams.length} team(s)`);
}
