/**
 * Reconcile the database against reality.
 *
 * Re-fetches each team's authoritative GameChanger schedule and compares it to
 * what we have stored, reporting:
 *   - EXTRA  games: in our DB but NOT on the team's own page — the phantom /
 *     mis-attributed games behind cross-age contamination (e.g. an 11U game
 *     sitting on the real Bolts 12U because an opponent listed "Bolts").
 *   - MISSING games: on the page but not in our DB (a normal scrape would add
 *     these; we only report them here).
 *
 * REPORT-ONLY by default — it writes nothing. Set RECONCILE_APPLY=true to delete
 * the phantom extras, and even then only when it's safe:
 *   - only SCRAPE-sourced games are ever deleted (MANUAL entries are sacred);
 *   - the page must have fetched cleanly (HTTP 200, non-empty) — a transient
 *     fetch failure must never be read as "the team has no games, delete them";
 *   - if the extras dwarf the real schedule (>80%), we skip and warn — that's a
 *     sign the match logic is off, not that the data is all wrong.
 *
 * Pass a single gcTeamId or team id as an argument to reconcile just that team
 * (spot-check Bolts before running the whole DB):
 *   pnpm --filter @nbr/worker reconcile <gcTeamId>
 *
 * Scanning everyone honors the same polite inter-team delay as the scraper.
 * Cap the batch with RECONCILE_MAX_TEAMS (0 = no cap).
 */
import { prisma } from "@nbr/db";
import { normalizeTeamName } from "@nbr/core";
import { launchBrowser, newContext, openSchedule } from "./browser.js";
import { parseSchedule, type ParsedGame } from "./parseSchedule.js";
import { envBool, envNum, jitterDelay } from "../util.js";

interface DbGame {
  id: string;
  gcGameId: string | null;
  source: string;
  date: string;
  opp: string;
  us: number | null;
  them: number | null;
}

export async function runReconcile(arg?: string): Promise<void> {
  const apply = envBool("RECONCILE_APPLY", false);
  const maxTeams = envNum("RECONCILE_MAX_TEAMS", 0); // 0 = no cap

  const where = arg
    ? { OR: [{ id: arg }, { gcTeamId: arg }] }
    : { gcTeamId: { not: null }, isGhost: false, scrapeEnabled: true };
  let teams = await prisma.team.findMany({
    where,
    select: { id: true, name: true, gcTeamId: true },
    orderBy: { name: "asc" },
  });
  if (!arg && maxTeams > 0) teams = teams.slice(0, maxTeams);

  console.log(
    `[reconcile] ${teams.length} team(s); mode=${
      apply ? "APPLY (will delete phantom scraped games)" : "report-only"
    }.`,
  );
  if (teams.length === 0) return;

  const browser = await launchBrowser();
  let totalExtras = 0;
  let totalMissing = 0;
  let totalDeleted = 0;

  try {
    for (const t of teams) {
      if (!t.gcTeamId) {
        console.log(`[reconcile] ${t.name}: no GameChanger id — skipping.`);
        continue;
      }

      // Fetch the authoritative schedule from the team's own page.
      let parsed: ParsedGame[] = [];
      let http: number | null = null;
      const context = await newContext(browser);
      try {
        const { page, httpStatus } = await openSchedule(context, t.gcTeamId);
        http = httpStatus;
        parsed = await parseSchedule(page);
      } catch (err) {
        console.warn(`[reconcile] ${t.name}: fetch failed (${String(err)}) — skipping.`);
        await context.close();
        continue;
      }
      await context.close();

      const liveFinal = parsed.filter((g) => g.isFinal);
      const liveById = new Set<string>();
      const liveByName = new Set<string>();
      for (const g of liveFinal) {
        if (g.gcGameId) liveById.add(g.gcGameId);
        if (g.playedAt) liveByName.add(`${normalizeTeamName(g.opponentName)}|${g.playedAt.slice(0, 10)}`);
      }

      // What we have stored for this team (FINAL games only).
      const dbTeam = await prisma.team.findUnique({
        where: { id: t.id },
        select: {
          homeGames: {
            where: { status: "FINAL" },
            select: {
              id: true,
              gcGameId: true,
              source: true,
              playedAt: true,
              homeScore: true,
              awayScore: true,
              awayTeam: { select: { name: true } },
            },
          },
          awayGames: {
            where: { status: "FINAL" },
            select: {
              id: true,
              gcGameId: true,
              source: true,
              playedAt: true,
              homeScore: true,
              awayScore: true,
              homeTeam: { select: { name: true } },
            },
          },
        },
      });
      const dbGames: DbGame[] = [
        ...(dbTeam?.homeGames ?? []).map((g) => ({
          id: g.id,
          gcGameId: g.gcGameId,
          source: String(g.source),
          date: g.playedAt.toISOString().slice(0, 10),
          opp: g.awayTeam.name,
          us: g.homeScore,
          them: g.awayScore,
        })),
        ...(dbTeam?.awayGames ?? []).map((g) => ({
          id: g.id,
          gcGameId: g.gcGameId,
          source: String(g.source),
          date: g.playedAt.toISOString().slice(0, 10),
          opp: g.homeTeam.name,
          us: g.awayScore,
          them: g.homeScore,
        })),
      ];

      const onPage = (g: DbGame) =>
        (g.gcGameId != null && liveById.has(g.gcGameId)) ||
        liveByName.has(`${normalizeTeamName(g.opp)}|${g.date}`);
      const extras = dbGames.filter((g) => !onPage(g));

      const dbById = new Set(dbGames.map((g) => g.gcGameId).filter((x): x is string => x != null));
      const dbByName = new Set(dbGames.map((g) => `${normalizeTeamName(g.opp)}|${g.date}`));
      const missing = liveFinal.filter((g) => {
        const byId = g.gcGameId != null && dbById.has(g.gcGameId);
        const byName = g.playedAt
          ? dbByName.has(`${normalizeTeamName(g.opponentName)}|${g.playedAt.slice(0, 10)}`)
          : false;
        return !byId && !byName;
      });

      totalExtras += extras.length;
      totalMissing += missing.length;

      if (extras.length === 0 && missing.length === 0) {
        console.log(`[reconcile] ${t.name}: ✓ in sync (${dbGames.length} games).`);
      } else {
        console.log(
          `[reconcile] ${t.name}: ${extras.length} extra (DB-only), ${missing.length} missing ` +
            `(page-only) — DB ${dbGames.length} / live ${liveFinal.length}.`,
        );
        for (const g of extras)
          console.log(
            `    EXTRA: ${g.date} vs ${g.opp} ${g.us}-${g.them} [${g.source}${g.gcGameId ? " " + g.gcGameId : ""}]`,
          );
        for (const g of missing.slice(0, 20))
          console.log(
            `    missing: ${g.playedAt?.slice(0, 10) ?? "?"} vs ${g.opponentName} ${g.teamScore}-${g.opponentScore}`,
          );
        if (missing.length > 20) console.log(`    …and ${missing.length - 20} more missing.`);
      }

      if (apply && extras.length > 0) {
        if (http !== 200 || liveFinal.length === 0) {
          console.warn(`    skip prune: page not healthy (http=${http}, live games=${liveFinal.length}).`);
        } else {
          const prunable = extras.filter((g) => g.source === "SCRAPE");
          if (prunable.length > dbGames.length * 0.8) {
            console.warn(
              `    skip prune: extras (${prunable.length}) dwarf the schedule (${dbGames.length}) — ` +
                "likely a matching bug, not contamination.",
            );
          } else if (prunable.length > 0) {
            await prisma.game.deleteMany({ where: { id: { in: prunable.map((g) => g.id) } } });
            totalDeleted += prunable.length;
            console.log(`    pruned ${prunable.length} scraped phantom game(s).`);
          }
        }
      }

      // Polite delay between teams when scanning the whole DB.
      if (!arg && t !== teams[teams.length - 1]) {
        await jitterDelay(envNum("SCRAPER_MIN_DELAY_SEC", 30), envNum("SCRAPER_MAX_DELAY_SEC", 120));
      }
    }
  } finally {
    await browser.close();
  }

  console.log(
    `[reconcile] done. extras=${totalExtras} missing=${totalMissing} deleted=${totalDeleted}` +
      (apply ? "" : " (report-only; set RECONCILE_APPLY=true to delete extras)"),
  );
  if (apply && totalDeleted > 0) {
    console.log("[reconcile] pruned games — run recompute to refresh ratings.");
  }
}
