/**
 * Read-only diagnostic: open one team's GameChanger schedule and dump the DOM
 * links (opponent team pages + game pages). We currently parse only innerText and
 * capture no GameChanger IDs; this reveals whether the schedule exposes opponent
 * team IDs (/teams/<id>) and game IDs (/games/<id>) we could mine to resolve
 * opponents exactly instead of by fuzzy name.
 *
 * Run:  INSPECT_TEAM=<gcTeamId|teamId> pnpm --filter @nbr/worker inspect-links
 *   or  pnpm --filter @nbr/worker inspect-links <gcTeamId|teamId>
 */
import { prisma } from "@nbr/db";
import { launchBrowser, newContext, openSchedule, pageLinks } from "./browser.js";

export async function runInspectLinks(arg?: string): Promise<void> {
  const target = arg ?? process.env.INSPECT_TEAM?.trim();
  if (!target) {
    console.error("[inspect] pass a gcTeamId/teamId (arg or INSPECT_TEAM env).");
    return;
  }
  const team = await prisma.team.findFirst({
    where: { OR: [{ id: target }, { gcTeamId: target }] },
    select: { name: true, gcTeamId: true },
  });
  const gcId = team?.gcTeamId ?? target;
  console.log(`[inspect] ${team?.name ?? "(unknown)"} — gcTeamId=${gcId}`);

  const browser = await launchBrowser();
  try {
    const context = await newContext(browser);
    const { page, httpStatus } = await openSchedule(context, gcId);
    console.log(`[inspect] http=${httpStatus}`);
    const links = await pageLinks(page);
    const teamLinks = links.filter((l) => /\/teams?\//.test(l.href));
    const gameLinks = links.filter((l) => /\/games?\//.test(l.href));
    console.log(
      `[inspect] ${links.length} total link(s); ${teamLinks.length} team link(s), ${gameLinks.length} game link(s).`,
    );
    console.log("[inspect] --- TEAM links (opponent IDs?) ---");
    for (const l of teamLinks.slice(0, 50)) console.log(`  ${l.text || "(no text)"} -> ${l.href}`);
    console.log("[inspect] --- GAME links (game IDs?) ---");
    for (const l of gameLinks.slice(0, 50)) console.log(`  ${l.text || "(no text)"} -> ${l.href}`);
    await context.close();
  } finally {
    await browser.close();
  }
}
