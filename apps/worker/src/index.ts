/**
 * Worker CLI entrypoint. Dispatches the two scheduled jobs:
 *   node src/index.ts scrape      — schedule-aware GameChanger scrape
 *   node src/index.ts recompute   — full Glicko-2 rating recompute
 *
 * Deployed on Render as two separate Cron Jobs (see render.yaml).
 */
import { prisma } from "@nbr/db";
import { runScrape } from "./scraper/runScrape.js";
import { runScrapeOne, runScrapeNew } from "./scraper/runScrapeOne.js";
import { runMaxPreps } from "./scraper/runMaxPreps.js";
import { runGeocode } from "./scraper/runGeocode.js";
import { runRecompute } from "./ratings/runRecompute.js";
import { runBacktest } from "./ratings/runBacktest.js";

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "scrape":
      await runScrape();
      break;
    case "scrape-one":
      await runScrapeOne(process.argv[3]);
      break;
    case "scrape-new":
      await runScrapeNew();
      break;
    case "maxpreps":
      await runMaxPreps();
      break;
    case "geocode":
      await runGeocode();
      break;
    case "recompute":
      await runRecompute();
      break;
    case "backtest":
      await runBacktest();
      break;
    default:
      console.error(
        "Usage: node src/index.ts <scrape|scrape-one <gcTeamId>|scrape-new|maxpreps|geocode|recompute|backtest>",
      );
      process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[worker] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
