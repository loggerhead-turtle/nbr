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
import { runReconcile } from "./scraper/runReconcile.js";
import { runRecompute } from "./ratings/runRecompute.js";
import { runBacktest } from "./ratings/runBacktest.js";
import { runAgeDiagnostics } from "./ratings/runAgeDiagnostics.js";
import { runFindBadMerges } from "./maintenance/findBadMerges.js";

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
    case "reconcile":
      await runReconcile(process.argv[3]);
      break;
    case "recompute":
      await runRecompute();
      break;
    case "backtest":
      await runBacktest();
      break;
    case "age-diagnostics":
      await runAgeDiagnostics();
      break;
    case "find-bad-merges":
      await runFindBadMerges(process.argv.slice(3));
      break;
    default:
      console.error(
        "Usage: node src/index.ts <scrape|scrape-one <gcTeamId>|scrape-new|maxpreps|geocode|reconcile [gcTeamId]|recompute|backtest|age-diagnostics|find-bad-merges>",
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
