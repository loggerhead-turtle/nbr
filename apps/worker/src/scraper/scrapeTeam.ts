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
      const finals = parsed.filter((g) => g.isFinal && g.teamScore != null && g.opponentScore != null);
      gamesFound = finals.length;

      if (finals.length === 0) {
        status = "EMPTY";
      } else {
        for (const g of finals) {
          const created = await upsertGame(team.id, g);
          if (created) gamesNew += 1;
        }
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
    if (header.state && header.state !== t.state) data.state = header.state;
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

/** Resolve opponent → upsert the game by gcGameId. Returns true if newly created. */
async function upsertGame(teamId: string, g: ParsedGame): Promise<boolean> {
  const opponentId = await resolveOpponent(g.opponentName);

  const homeTeamId = g.isHome ? teamId : opponentId;
  const awayTeamId = g.isHome ? opponentId : teamId;
  const homeScore = g.isHome ? g.teamScore! : g.opponentScore!;
  const awayScore = g.isHome ? g.opponentScore! : g.teamScore!;
  const playedAt = g.playedAt ? new Date(g.playedAt) : new Date();

  // 1. Incremental: the exact same GameChanger game is already stored (re-scrape
  //    of this team, or a SCHEDULED → FINAL transition) — update it in place.
  if (g.gcGameId) {
    const existing = await prisma.game.findUnique({ where: { gcGameId: g.gcGameId } });
    if (existing) {
      await prisma.game.update({
        where: { gcGameId: g.gcGameId },
        data: { homeScore, awayScore, status: "FINAL" },
      });
      return false;
    }
  }

  // 2. Same matchup, same day (either orientation) already stored? Update it and
  //    backfill the gcGameId if it's missing, so a per-team UUID doesn't create a
  //    cross-team duplicate (the opponent's scrape has a DIFFERENT uuid for this
  //    same game).
  const dayStart = new Date(playedAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(playedAt);
  dayEnd.setHours(23, 59, 59, 999);
  const dup = await prisma.game.findFirst({
    where: {
      playedAt: { gte: dayStart, lte: dayEnd },
      OR: [
        { homeTeamId, awayTeamId },
        { homeTeamId: awayTeamId, awayTeamId: homeTeamId },
      ],
    },
  });
  if (dup) {
    if (g.gcGameId && !dup.gcGameId) {
      await prisma.game
        .update({ where: { id: dup.id }, data: { gcGameId: g.gcGameId } })
        .catch(() => {});
    }
    return false;
  }

  // 3. New game.
  await prisma.game.create({
    data: {
      gcGameId: g.gcGameId ?? null,
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
    select: { id: true, name: true, ageGroup: true },
    take: 50,
  });
  const sameName = candidates.filter((c) => normalizeTeamName(c.name) === normalized);

  if (oppAge != null) {
    // Opponent states an age — only ever match a team of that same age.
    const match = sameName.find(
      (c) => (ageNum(c.ageGroup) ?? ageNum(ageGroupFromName(c.name))) === oppAge,
    );
    if (match) return match.id;
  } else if (sameName.length === 1) {
    // No stated age and exactly one same-name team — unambiguous, so match it.
    return sameName[0]!.id;
  }
  // (No age + multiple same-name teams ⇒ ambiguous ⇒ fall through to a ghost.)

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
