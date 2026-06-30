/**
 * Reconcile the database against reality.
 *
 * Re-fetches each team's authoritative GameChanger schedule and compares it to
 * what we have stored, finding:
 *   - EXTRA  games: in our DB but NOT on the team's own page — the phantom /
 *     mis-attributed games behind cross-age contamination.
 *   - MISSING games: on the page but not in our DB (a normal scrape adds these).
 *
 * Two modes:
 *   • FULL run (no team argument): a read-only "capture" — scans every verified
 *     team once (short delay between teams) and writes a snapshot to AppSetting
 *     so the admin Reconcile page can review and delete offline, without hitting
 *     GameChanger again. Deletes nothing.
 *   • SINGLE team (CLI arg or RECONCILE_TEAM): reports to the log, and with
 *     RECONCILE_APPLY=true prunes that one team's phantom extras (guarded).
 *
 * Env: RECONCILE_DELAY_SEC (default 3) between teams in a full capture;
 * RECONCILE_MAX_TEAMS (0 = no cap); RECONCILE_APPLY (single-team prune).
 */
import { prisma } from "@nbr/db";
import {
  normalizeTeamName,
  RECONCILE_SNAPSHOT_KEY,
  type ReconcileSnapshot,
  type ReconcileTeamFinding,
} from "@nbr/core";
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

/** Fetch a team's authoritative completed games + the DB games we hold for it. */
async function diffTeam(
  context: Awaited<ReturnType<typeof newContext>>,
  team: { id: string; gcTeamId: string },
): Promise<{ http: number | null; live: ParsedGame[]; db: DbGame[]; extras: DbGame[] } | null> {
  let parsed: ParsedGame[] = [];
  let http: number | null = null;
  try {
    const { page, httpStatus } = await openSchedule(context, team.gcTeamId);
    http = httpStatus;
    parsed = await parseSchedule(page);
  } catch {
    return null;
  }

  const live = parsed.filter((g) => g.isFinal);
  const liveById = new Set<string>();
  const liveByName = new Set<string>();
  for (const g of live) {
    if (g.gcGameId) liveById.add(g.gcGameId);
    if (g.playedAt) liveByName.add(`${normalizeTeamName(g.opponentName)}|${g.playedAt.slice(0, 10)}`);
  }

  const dbTeam = await prisma.team.findUnique({
    where: { id: team.id },
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
  const db: DbGame[] = [
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
  // Only scraped games are ever prune candidates — never manual entries.
  const extras = db.filter((g) => !onPage(g) && g.source === "SCRAPE");

  return { http, live, db, extras };
}

export async function runReconcile(arg?: string): Promise<void> {
  const apply = envBool("RECONCILE_APPLY", false);
  const maxTeams = envNum("RECONCILE_MAX_TEAMS", 0); // 0 = no cap
  const single = arg ?? (process.env.RECONCILE_TEAM?.trim() || undefined);
  const delaySec = envNum("RECONCILE_DELAY_SEC", 3);

  const where = single
    ? { OR: [{ id: single }, { gcTeamId: single }] }
    : { gcTeamId: { not: null }, isGhost: false, scrapeEnabled: true };
  let teams = await prisma.team.findMany({
    where,
    select: { id: true, name: true, gcTeamId: true, ageGroup: true },
    orderBy: { name: "asc" },
  });
  if (!single && maxTeams > 0) teams = teams.slice(0, maxTeams);

  console.log(
    `[reconcile] ${teams.length} team(s); mode=${
      single ? (apply ? "single APPLY" : "single report") : "capture (report-only, writes snapshot)"
    }.`,
  );
  if (teams.length === 0) return;

  const browser = await launchBrowser();
  const withExtras: ReconcileTeamFinding[] = [];
  const deadIds: ReconcileTeamFinding[] = [];
  let totalExtras = 0;
  let totalDeleted = 0;

  try {
    for (const t of teams) {
      if (!t.gcTeamId) {
        console.log(`[reconcile] ${t.name}: no GameChanger id — skipping.`);
        continue;
      }
      const context = await newContext(browser);
      const res = await diffTeam(context, { id: t.id, gcTeamId: t.gcTeamId });
      await context.close();
      if (!res) {
        console.warn(`[reconcile] ${t.name}: fetch failed — skipping.`);
        continue;
      }

      const { http, live, db, extras } = res;
      const liveCount = live.length;
      const dbCount = db.length;
      const sparse = liveCount > 0 && liveCount < dbCount * 0.5;
      totalExtras += extras.length;

      const finding: ReconcileTeamFinding = {
        teamId: t.id,
        name: t.name,
        gcTeamId: t.gcTeamId,
        ageGroup: t.ageGroup ?? null,
        dbCount,
        liveCount,
        sparse,
        extras: extras.map((g) => ({
          gameId: g.id,
          opponent: g.opp,
          date: g.date,
          us: g.us,
          them: g.them,
        })),
      };

      if (liveCount === 0) {
        // GC page shows nothing online — dead/empty id. Never auto-prune these.
        finding.extras = [];
        deadIds.push(finding);
        console.log(`[reconcile] ${t.name}: GC page empty (db=${dbCount}) — dead/empty id.`);
      } else if (extras.length > 0) {
        withExtras.push(finding);
        console.log(
          `[reconcile] ${t.name}: ${extras.length} phantom (db ${dbCount}/live ${liveCount})${sparse ? " [SPARSE]" : ""}.`,
        );
        for (const g of extras)
          console.log(`    EXTRA: ${g.date} vs ${g.opp} ${g.us}-${g.them} [${g.source}]`);
      } else {
        console.log(`[reconcile] ${t.name}: ✓ in sync (db ${dbCount}/live ${liveCount}).`);
      }

      // Single-team targeted prune (CLI), guarded. Capture mode never deletes.
      if (single && apply && extras.length > 0) {
        if (http !== 200 || liveCount === 0) {
          console.warn(`    skip prune: page not healthy (http=${http}, live=${liveCount}).`);
        } else if (extras.length > dbCount * 0.8) {
          console.warn(`    skip prune: extras (${extras.length}) dwarf schedule (${dbCount}).`);
        } else {
          await prisma.game.deleteMany({ where: { id: { in: extras.map((g) => g.id) } } });
          totalDeleted += extras.length;
          console.log(`    pruned ${extras.length} scraped phantom game(s).`);
        }
      }

      if (!single && t !== teams[teams.length - 1]) {
        await jitterDelay(delaySec, delaySec + 2);
      }
    }
  } finally {
    await browser.close();
  }

  // Full capture → persist the snapshot for the admin Reconcile page.
  if (!single) {
    const snapshot: ReconcileSnapshot = {
      capturedAt: new Date().toISOString(),
      teamsScanned: teams.length,
      withExtras,
      deadIds,
    };
    await prisma.appSetting.upsert({
      where: { key: RECONCILE_SNAPSHOT_KEY },
      create: { key: RECONCILE_SNAPSHOT_KEY, value: JSON.stringify(snapshot) },
      update: { value: JSON.stringify(snapshot) },
    });
    console.log(
      `[reconcile] capture saved: ${withExtras.length} team(s) with phantoms (${totalExtras} games), ` +
        `${deadIds.length} dead/empty id(s). Review on /admin/reconcile.`,
    );
  } else {
    console.log(
      `[reconcile] done. extras=${totalExtras} deleted=${totalDeleted}` +
        (apply ? "" : " (report-only)"),
    );
  }
}
