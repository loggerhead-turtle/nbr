/**
 * Orchestrate a polite scrape run:
 *  - hard kill switches (SCRAPER_ENABLED env, per-team scrapeEnabled);
 *  - only act on teams the scheduler says are due (schedule-aware, weekly max);
 *  - randomize order, jitter between teams, cap teams per run;
 *  - stop early on a BLOCK; abort + alert if every team yields zero (parser break).
 */
import { prisma } from "@nbr/db";
import { launchBrowser, newContext } from "./browser.js";
import { selectTeamsToScrape } from "./scheduling.js";
import { scrapeTeam } from "./scrapeTeam.js";
import { envBool, envNum, jitterDelay, shuffle } from "../util.js";

export async function runScrape(): Promise<void> {
  if (!envBool("SCRAPER_ENABLED", false)) {
    console.log("[scrape] SCRAPER_ENABLED is not true — skipping run.");
    return;
  }

  const now = new Date();
  const maxTeams = envNum("SCRAPER_MAX_TEAMS_PER_RUN", 25);
  const postgameDelayHours = envNum("SCRAPER_POSTGAME_DELAY_HOURS", 2.5);

  const due = await selectTeamsToScrape({ now, postgameDelayHours });
  if (due.length === 0) {
    console.log("[scrape] no teams due this run.");
    return;
  }

  // Prioritize post-game fetches, then randomize within the batch and cap volume.
  const postgame = due.filter((t) => t.reason === "postgame");
  const others = shuffle(due.filter((t) => t.reason !== "postgame"));
  const batch = [...shuffle(postgame), ...others].slice(0, maxTeams);

  console.log(`[scrape] ${batch.length} team(s) due (of ${due.length}); starting.`);

  const browser = await launchBrowser();
  let processed = 0;
  let blocked = 0;
  let emptyOrZero = 0;

  try {
    for (const team of batch) {
      const result = await scrapeTeam(() => newContext(browser), team, new Date());
      processed += 1;
      console.log(
        `[scrape] ${team.name} (${team.reason}): ${result.status} ` +
          `found=${result.gamesFound} new=${result.gamesNew} http=${result.httpStatus}`,
      );

      if (result.status === "BLOCKED") {
        blocked += 1;
        console.warn("[scrape] BLOCKED — backing off and ending run early.");
        break;
      }
      if (result.status === "EMPTY") emptyOrZero += 1;

      // Polite, human-like delay before the next team. Configurable so a
      // one-time bulk backfill can run faster (restore higher values after).
      if (team !== batch[batch.length - 1]) {
        await jitterDelay(envNum("SCRAPER_MIN_DELAY_SEC", 30), envNum("SCRAPER_MAX_DELAY_SEC", 120));
      }
    }
  } finally {
    await browser.close();
  }

  // Parser-break detection: if everything we touched returned nothing, alert.
  if (processed > 0 && emptyOrZero === processed && blocked === 0) {
    console.error(
      `[scrape] WARNING: all ${processed} teams returned zero games. ` +
        "Possible layout change — review the parser before the next run.",
    );
  }

  console.log(`[scrape] done. processed=${processed} blocked=${blocked} empty=${emptyOrZero}`);
}
