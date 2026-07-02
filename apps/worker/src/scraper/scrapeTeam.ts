/**
 * Scrape one team's schedule, resolve opponents, and upsert completed games.
 * Records a ScrapeJob and updates the team's scrape bookkeeping. Never throws to
 * the caller — failures are captured in the returned status.
 */
import {
  prisma,
  ScrapeStatus,
  AgeGroup,
  findAutoMergeTarget,
  mergeTeams,
  refreshTeamPendingMerge,
} from "@nbr/db";
import { normalizeTeamName, teamSlug, ageGroupFromName, geocodeCity } from "@nbr/core";
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
      const finals = parsed.filter(
        (g) =>
          g.isFinal &&
          g.teamScore != null &&
          g.opponentScore != null &&
          // "TBD" placeholders (sometimes with a date appended) can never be
          // matched to a real team, so they're dropped entirely — never stored.
          !isTbdOpponent(g.opponentName),
      );
      gamesFound = finals.length;

      if (finals.length === 0) {
        status = "EMPTY";
      } else {
        gamesNew += await reconcileScrapedGames(team.id, finals);
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
    select: {
      needsEnrichment: true,
      name: true,
      city: true,
      state: true,
      latitude: true,
      locationLocked: true,
      ageGroup: true,
      coaches: true,
      gcSeason: true,
      gcRecord: true,
    },
  });
  if (!t) return;

  const header = parseTeamHeader(bodyText);

  // Always backfill missing location/age from the team's OWN page (every scrape),
  // so the whole population gets cities filled in over time. Never overwrite
  // values already set, and never infer age from opponents. When an admin has
  // locked the location (GameChanger sometimes reports a tournament's host city),
  // leave city/coords untouched.
  const data: Record<string, unknown> = {};

  // GameChanger header metadata (provenance + future season/succession work).
  // Season is GC's own label; record is their stated W-L. Refresh when changed.
  if (header.season && header.season !== t.gcSeason) data.gcSeason = header.season;
  if (header.record && header.record !== t.gcRecord) data.gcRecord = header.record;
  if (!t.locationLocked) {
    if (!t.city && header.city) data.city = header.city;
    // State comes from the team's OWN page and is authoritative. Quick-added
    // teams are created with a "UT" default, so a NV/CA/etc. team would otherwise
    // stay mislabeled (e.g. "Henderson, UT"). Correct it whenever the page's
    // state differs from what we have.
    if (header.state && header.state !== t.state) {
      data.state = header.state;
      console.log(`[scrape] ${teamId}: corrected state ${t.state} → ${header.state}`);
    }
  }

  // Coaching staff from the team's own page powers merge-confidence scoring.
  // Refresh whenever the page lists staff (authoritative, and rosters change).
  if (header.coaches.length > 0) data.coaches = header.coaches;

  // Geocode to a centroid when we first learn a city OR when the state was just
  // corrected (so a mislabeled team isn't left pinned in the wrong state). If no
  // centroid matches (e.g. an out-of-state city we don't bundle), clear stale
  // coords rather than keep the wrong ones.
  if (!t.locationLocked && (t.latitude == null || data.state != null)) {
    const cityForGeo = (data.city as string | undefined) ?? t.city;
    const stateForGeo = (data.state as string | undefined) ?? t.state;
    if (cityForGeo) {
      const geo = geocodeCity(cityForGeo, stateForGeo);
      if (geo) {
        data.latitude = geo.lat;
        data.longitude = geo.lng;
      } else if (data.state != null) {
        data.latitude = null;
        data.longitude = null;
      }
    }
  }
  // Age comes from the team's OWN page. Set it if missing, and ALSO advance it
  // when the team has aged up (header age is higher than what we have) — never
  // lower it (a decrease is almost certainly a misparse, and protects admin edits).
  if (header.ageGroup) {
    const ageNum = (a: string | null) => (a ? Number(a.replace(/^U/i, "")) : 0);
    if (!t.ageGroup || ageNum(header.ageGroup) > ageNum(t.ageGroup)) {
      data.ageGroup = header.ageGroup as AgeGroup;
    }
  }

  // Full enrichment of a quick-added stub: set the real name + slug, clear flag.
  const doFullEnrich = t.needsEnrichment && !!header.name;
  if (doFullEnrich) {
    data.name = header.name;
    data.slug = await uniqueSlug(teamSlug(header.name!, header.ageGroup ?? t.ageGroup), teamId);
    data.needsEnrichment = false;
  }

  if (Object.keys(data).length > 0) {
    await prisma.team.update({ where: { id: teamId }, data });
    if (doFullEnrich) console.log(`[scrape] enriched ${teamId} → "${header.name}"`);
  }

  // After naming a stub we *could* collapse a matching ghost into it, but
  // automatic merging proved too error-prone: a single wrong merge writes
  // off-age games that then surface on opponents' schedules and make THEM look
  // merged — a self-reinforcing mess. So auto-merge is OFF by default; all
  // merges are now manual, reviewed actions on the age-safe Possible-duplicates
  // and Ghost-teams pages. Set SCRAPER_AUTO_MERGE=true to re-enable.
  if (doFullEnrich && envBool("SCRAPER_AUTO_MERGE", false)) {
    const finalAge = (data.ageGroup as AgeGroup | undefined) ?? (t.ageGroup as AgeGroup | null);
    const finalCoaches = (data.coaches as string[] | undefined) ?? t.coaches;
    const auto = await findAutoMergeTarget({
      id: teamId,
      name: header.name!,
      ageGroup: finalAge ?? null,
      city: (data.city as string | undefined) ?? t.city,
      state: t.state,
      coaches: finalCoaches,
    });
    if (auto) {
      await mergeTeams(auto.id, teamId);
      console.log(
        `[scrape] merged ghost "${auto.name}" into ${teamId} ` +
          `(confidence ${auto.score.score}, ${auto.score.reasons.join("; ")})`,
      );
    }
  }

  // A newly named team may now have a confident ghost twin awaiting review —
  // set/clear its "Verifying" flag so the public badge stays in step with the
  // Merge queue. (No-op unless the name changed this run.)
  if (doFullEnrich) {
    await refreshTeamPendingMerge(teamId).catch(() => {});
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

/** GameChanger lists placeholder opponents as "TBD" (often with a date appended,
 *  e.g. "TBD 3/15") for unscheduled slots. They can never be matched to a real
 *  team, so they're dropped rather than spawning junk ghosts. */
export function isTbdOpponent(name: string): boolean {
  return /^tbd\b/i.test(name.trim());
}

/** The team's calendar day for a parsed game, "YYYY-MM-DD" (UTC — the whole
 *  codebase keys games on the UTC day, matching dedupeTeamGames). */
function dayOf(playedAt: string | null): string {
  return (playedAt ? new Date(playedAt) : new Date()).toISOString().slice(0, 10);
}

/**
 * Store a team's completed games, grouped by opponent (normalized name) + day so
 * a doubleheader is reconciled as a unit rather than one leg silently colliding
 * with the other. Returns the number of NEW game rows created (for the scrape
 * stats). See reconcileMatchup for the doubleheader / duplicate / conflict rules.
 */
async function reconcileScrapedGames(teamId: string, finals: ParsedGame[]): Promise<number> {
  const groups = new Map<string, ParsedGame[]>();
  for (const g of finals) {
    const key = `${normalizeTeamName(g.opponentName)}|${dayOf(g.playedAt)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(g);
  }
  let created = 0;
  for (const legs of groups.values()) {
    created += await reconcileMatchup(teamId, legs);
  }
  return created;
}

/** teamId's own (us, them) score for a stored row, regardless of home/away side. */
function rowScore(teamId: string, row: { homeTeamId: string; homeScore: number | null; awayScore: number | null }) {
  return row.homeTeamId === teamId
    ? { us: row.homeScore, them: row.awayScore }
    : { us: row.awayScore, them: row.homeScore };
}

/** The Game row fields for one parsed leg, from teamId's perspective. */
function legRow(teamId: string, opponentId: string, leg: ParsedGame) {
  return {
    homeTeamId: leg.isHome ? teamId : opponentId,
    awayTeamId: leg.isHome ? opponentId : teamId,
    homeScore: leg.isHome ? leg.teamScore! : leg.opponentScore!,
    awayScore: leg.isHome ? leg.opponentScore! : leg.teamScore!,
  };
}

/**
 * Reconcile every game one team lists against a single opponent on a single day.
 *
 * The count a team lists in its OWN schedule is authoritative for its own games,
 * and is the only reliable way to tell a real doubleheader (two legs on this
 * team's schedule) from a cross-team duplicate (one game that appears on both
 * teams' schedules) — the two are otherwise identical by opponent + day + score,
 * because completed GameChanger games carry no time and each team gets a
 * different per-game id. So:
 *   1. Make THIS team's own rows exactly match the `n` legs it lists (adopt any
 *      unowned/legacy rows, update in place, create the shortfall, drop our own
 *      surplus). These n rows are kept even if their scores differ — a same-day
 *      pair on one team's schedule is a doubleheader, not a duplicate.
 *   2. Compare against the OTHER side's rows (rows its scrape produced):
 *        • same count  → the same games from both sides → collapse the duplicate
 *          copies (keep ours), ignoring any score disagreement (data-entry noise).
 *        • different count (e.g. 2 vs 1) → we can't tell a doubleheader from a
 *          double-entered single game, so park it on the Game merge queue for a
 *          human instead of guessing. Nothing is deleted while it waits.
 */
async function reconcileMatchup(teamId: string, legs: ParsedGame[]): Promise<number> {
  const first = legs[0]!;
  const opponentId = await resolveOpponent(first.opponentName);
  const oppNorm = normalizeTeamName(first.opponentName);
  const day = dayOf(first.playedAt);
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(`${day}T23:59:59.999Z`);

  const sameDay = await prisma.game.findMany({
    where: {
      playedAt: { gte: dayStart, lte: dayEnd },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      sourceTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  const rows = sameDay.filter((r) => {
    const opp = r.homeTeamId === teamId ? r.awayTeam : r.homeTeam;
    return normalizeTeamName(opp.name) === oppNorm;
  });

  // Rows this team owns (or legacy/unstamped rows, which we adopt) vs rows the
  // OTHER side's scrape produced.
  const pool = rows.filter((r) => r.sourceTeamId === teamId || r.sourceTeamId == null);
  const theirs = rows.filter((r) => r.sourceTeamId != null && r.sourceTeamId !== teamId);

  // 1. Reconcile our side to exactly the legs we listed. Match each leg to an
  //    existing pool row by score first (so a re-scrape updates in place), then
  //    reuse any leftover pool row, then create.
  const available = [...pool];
  let created = 0;
  for (const leg of legs) {
    const want = { us: leg.teamScore, them: leg.opponentScore };
    let idx = available.findIndex((r) => {
      const s = rowScore(teamId, r);
      return s.us === want.us && s.them === want.them;
    });
    if (idx === -1 && available.length) idx = 0;
    const data = legRow(teamId, opponentId, leg);
    if (idx === -1) {
      const playedAt = leg.playedAt ? new Date(leg.playedAt) : new Date();
      await prisma.game.create({
        data: { ...data, status: "FINAL", source: "SCRAPE", sourceTeamId: teamId, playedAt },
      });
      created += 1;
    } else {
      const [row] = available.splice(idx, 1);
      await prisma.game.update({
        where: { id: row!.id },
        data: { ...data, status: "FINAL", sourceTeamId: teamId },
      });
    }
  }
  // Our own surplus rows (we listed fewer games than are stored under our name):
  // delete the ones we own; leave unattributable legacy rows for dedupe/next scrape.
  const surplus = available.filter((r) => r.sourceTeamId === teamId).map((r) => r.id);
  if (surplus.length) await prisma.game.deleteMany({ where: { id: { in: surplus } } });

  // 2. Cross-team reconciliation against the opponent's own rows.
  const n = legs.length;
  const k = theirs.length;
  if (k > 0 && k === n) {
    // Both schedules agree on the count → same games. Drop the duplicate copies
    // (keep ours), ignoring score disagreement.
    await prisma.game.deleteMany({ where: { id: { in: theirs.map((t) => t.id) } } });
    await clearGameMergeCandidate(teamId, opponentId, day);
  } else if (k > 0) {
    // Counts disagree — hand it to a human rather than guess.
    await openGameMergeCandidate(teamId, opponentId, day, n, k);
  }
  return created;
}

/** Canonical (teamIdA < teamIdB) pair plus each side's game count for that order. */
export function canonicalPair(teamId: string, opponentId: string, n: number, k: number) {
  const teamFirst = teamId < opponentId;
  return {
    teamIdA: teamFirst ? teamId : opponentId,
    teamIdB: teamFirst ? opponentId : teamId,
    countA: teamFirst ? n : k,
    countB: teamFirst ? k : n,
  };
}

/** Park a same-day matchup with disagreeing game counts on the Game merge queue. */
async function openGameMergeCandidate(
  teamId: string,
  opponentId: string,
  day: string,
  n: number,
  k: number,
): Promise<void> {
  const { teamIdA, teamIdB, countA, countB } = canonicalPair(teamId, opponentId, n, k);
  await prisma.gameMergeCandidate
    .upsert({
      where: { teamIdA_teamIdB_day: { teamIdA, teamIdB, day } },
      create: { teamIdA, teamIdB, day, countA, countB, status: "open" },
      update: { countA, countB, status: "open", resolvedAt: null },
    })
    .catch(() => {});
}

/** Clear an open conflict once the two schedules come back into agreement. */
async function clearGameMergeCandidate(teamId: string, opponentId: string, day: string): Promise<void> {
  const { teamIdA, teamIdB } = canonicalPair(teamId, opponentId, 0, 0);
  await prisma.gameMergeCandidate
    .updateMany({
      where: { teamIdA, teamIdB, day, status: "open" },
      data: { status: "resolved", resolvedAt: new Date() },
    })
    .catch(() => {});
}

/** Numeric age from an AgeGroup value or name token ("U11" → 11), else null. */
function ageNum(a?: string | null): number | null {
  const m = a?.match(/\d{1,2}/);
  return m ? Number(m[0]) : null;
}

/**
 * Match an opponent name to an existing team, else auto-create a ghost team.
 *
 * Matching is AGE-AWARE on purpose. `normalizeTeamName` strips the age token, so
 * "Bolts 11U" and "Bolts 12U" normalize identically — matching on name alone let
 * an opponent listed at one age attach to a real team of another age, which is
 * the root cause of cross-age contamination (an 11U "Bolts" game landing on the
 * real Bolts 12U). So:
 *   - if the opponent name states an age, only a SAME-age team matches; otherwise
 *     we create a correctly-aged ghost rather than pollute a wrong-age team;
 *   - if it states no age, we match only when unambiguous (exactly one same-name
 *     team); with several (e.g. Bolts 11U and 12U) we make a ghost, not a guess.
 * Erring toward a ghost is safe — ghosts get triaged on the Ghost-teams page and
 * never corrupt a real team's record.
 */
async function resolveOpponent(rawName: string): Promise<string> {
  const normalized = normalizeTeamName(rawName);
  const oppAge = ageNum(ageGroupFromName(rawName));

  // Cheap candidate fetch: teams whose name shares the first significant token.
  const firstToken = normalized.split(" ")[0] ?? normalized;
  const candidates = await prisma.team.findMany({
    where: { name: { contains: firstToken, mode: "insensitive" } },
    select: { id: true, name: true, ageGroup: true, isGhost: true },
    take: 50,
  });
  const sameName = candidates.filter((c) => normalizeTeamName(c.name) === normalized);
  const ageOfCand = (c: (typeof sameName)[number]) =>
    ageNum(c.ageGroup) ?? ageNum(ageGroupFromName(c.name));

  if (oppAge != null) {
    // Opponent states an age — only ever match a team of that same age.
    const match = sameName.find((c) => ageOfCand(c) === oppAge);
    if (match) return match.id;
  } else if (sameName.length === 1) {
    // No stated age and exactly one same-name team — unambiguous, so match it.
    return sameName[0]!.id;
  }

  // Before creating a ghost, REUSE an existing same-name ghost of this age
  // (age-less matches age-less). Without this, an age-less opponent that is
  // "ambiguous" among 2+ same-name teams would spawn a NEW ghost on every scrape,
  // multiplying duplicate ghosts each re-scrape.
  const ghostTwin = sameName.find((c) => c.isGhost && (ageOfCand(c) ?? null) === (oppAge ?? null));
  if (ghostTwin) return ghostTwin.id;

  // Create a ghost team (unverified) so the game still contributes to ratings.
  let slug = teamSlug(rawName);
  let n = 2;
  while (await prisma.team.findUnique({ where: { slug } })) {
    slug = `${teamSlug(rawName)}-${n++}`;
  }
  // Age comes only from the opponent's OWN stated name (e.g. "Cannons 14U"),
  // never inferred — left null (unclassified) when the name states no age.
  const ageGroup = ageGroupFromName(rawName) as AgeGroup | null;
  const ghost = await prisma.team.create({
    data: {
      name: rawName.slice(0, 120),
      slug,
      ageGroup: ageGroup ?? undefined,
      isGhost: true,
      scrapeEnabled: false, // we don't have a GC id for ghosts
      rating: { create: {} },
    },
  });
  return ghost.id;
}
