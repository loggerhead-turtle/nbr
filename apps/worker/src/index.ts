/**
 * Worker CLI entrypoint. Dispatches the two scheduled jobs:
 *   node src/index.ts scrape      — schedule-aware GameChanger scrape
 *   node src/index.ts recompute   — full Glicko-2 rating recompute
 *
 * Deployed on Render as two separate Cron Jobs (see render.yaml).
 */
import { prisma } from "@nbr/db";
import { runScrape } from "./scraper/runScrape.js";
import { runRecompute } from "./ratings/runRecompute.js";

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "scrape":
      await runScrape();
      break;
    case "recompute":
      await runRecompute();
      break;
    default:
      console.error("Usage: node src/index.ts <scrape|recompute>");
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
