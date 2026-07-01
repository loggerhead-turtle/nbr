import { normalizeTeamName, ageGroupFromName, teamSlug, scoreMerge } from "@nbr/core";
import type { MergeScore } from "@nbr/core";
import { prisma } from "./index";
import type { AgeGroup } from "@prisma/client";

/**
 * Find a single existing team that an incoming team should merge into rather than
 * duplicate — typically a "ghost" auto-created from an opponent's schedule.
 * Returns a match only when unambiguous (one candidate without a GameChanger ID).
 */
export async function findPromotableTeam(
  name: string,
  ageGroup?: string | null,
): Promise<{ id: string; name: string; games: number } | null> {
  const norm = normalizeTeamName(name);
  if (!norm) return null;
  const firstToken = norm.split(" ")[0] ?? norm;

  const candidates = await prisma.team.findMany({
    where: { name: { contains: firstToken, mode: "insensitive" }, gcTeamId: null },
    select: {
      id: true,
      name: true,
      ageGroup: true,
      _count: { select: { homeGames: true, awayGames: true } },
    },
    take: 50,
  });

  let matches = candidates.filter((c) => normalizeTeamName(c.name) === norm);

  // Never merge across a known age-group boundary. normalizeTeamName strips age
  // tokens, so "MBA Navy 11U" and "MBA Navy 14U" collapse to the same string;
  // without this guard a stray 14U ghost merges into the 11U team and drags its
  // 14U opponents along. A candidate whose own age is unknown stays eligible —
  // the common, legitimate case of an opponent listed without an age suffix.
  if (ageGroup) {
    const target = ageGroup.toUpperCase();
    matches = matches.filter((c) => {
      const candAge = c.ageGroup ?? ageGroupFromName(c.name);
      return !candAge || candAge.toUpperCase() === target;
    });
  }

  if (matches.length !== 1) return null;
  const m = matches[0]!;
  return { id: m.id, name: m.name, games: m._count.homeGames + m._count.awayGames };
}

/** States of a team's game-graph neighbours — a locality proxy when the team
 * itself has no city (a name-only ghost). `otherId` is excluded so a pair being
 * compared doesn't count each other. */
async function teamRegionStates(teamId: string, otherId?: string): Promise<string[]> {
  const games = await prisma.game.findMany({
    where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    select: {
      homeTeam: { select: { id: true, state: true, city: true, isGhost: true } },
      awayTeam: { select: { id: true, state: true, city: true, isGhost: true } },
    },
    take: 300,
  });
  const states: string[] = [];
  for (const g of games) {
    const opp = g.homeTeam.id === teamId ? g.awayTeam : g.homeTeam;
    if (opp.id === otherId) continue;
    // Only trust a state we actually learned from the team's own page (it has a
    // city); ghosts default to "UT" and would otherwise fake a locality match.
    if (opp.city && opp.state) states.push(opp.state);
  }
  return states;
}

/** A matchup two teams both played, with each team's recorded score — the
 * human-checkable evidence shown on the Ghost-teams page. */
export interface SharedGameRow {
  opponent: string;
  date: string;
  aUs: number | null;
  aThem: number | null;
  bUs: number | null;
  bThem: number | null;
  scoresMatch: boolean;
}

/**
 * Games two teams BOTH played against the same opponent on the same day, matched
 * by the opponent's NORMALIZED NAME (not its row id) — so duplicated opponents
 * don't hide the match (the exact blind spot that made suggestions look weak).
 * Returns the rows so the UI can show the evidence; games the two teams played
 * directly against each other are excluded.
 */
async function sharedGamesByName(aId: string, bId: string): Promise<SharedGameRow[]> {
  const load = async (teamId: string, otherId: string) => {
    const t = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        homeGames: {
          where: { status: "FINAL" },
          select: {
            awayTeamId: true,
            homeScore: true,
            awayScore: true,
            playedAt: true,
            awayTeam: { select: { name: true } },
          },
        },
        awayGames: {
          where: { status: "FINAL" },
          select: {
            homeTeamId: true,
            homeScore: true,
            awayScore: true,
            playedAt: true,
            homeTeam: { select: { name: true } },
          },
        },
      },
    });
    const m = new Map<string, { opponent: string; us: number | null; them: number | null }>();
    if (!t) return m;
    for (const g of t.homeGames) {
      if (g.awayTeamId === otherId) continue;
      const day = g.playedAt.toISOString().slice(0, 10);
      m.set(`${normalizeTeamName(g.awayTeam.name)}|${day}`, {
        opponent: g.awayTeam.name,
        us: g.homeScore,
        them: g.awayScore,
      });
    }
    for (const g of t.awayGames) {
      if (g.homeTeamId === otherId) continue;
      const day = g.playedAt.toISOString().slice(0, 10);
      m.set(`${normalizeTeamName(g.homeTeam.name)}|${day}`, {
        opponent: g.homeTeam.name,
        us: g.awayScore,
        them: g.homeScore,
      });
    }
    return m;
  };
  const [ma, mb] = await Promise.all([load(aId, bId), load(bId, aId)]);
  const out: SharedGameRow[] = [];
  for (const [k, a] of ma) {
    const b = mb.get(k);
    if (!b) continue;
    out.push({
      opponent: a.opponent,
      date: k.slice(k.lastIndexOf("|") + 1),
      aUs: a.us,
      aThem: a.them,
      bUs: b.us,
      bThem: b.them,
      scoresMatch: a.us === b.us && a.them === b.them,
    });
  }
  out.sort((x, y) => (x.date < y.date ? 1 : -1));
  return out;
}

/** Count shared matchups (same opponent name + same day) between two teams. */
async function sharedMatchupCount(aId: string, bId: string): Promise<number> {
  return (await sharedGamesByName(aId, bId)).length;
}

export interface AutoMergeTarget {
  id: string;
  name: string;
  score: MergeScore;
}

/**
 * Decide whether a freshly enriched team should absorb a same-name ghost, using
 * the full confidence model rather than name+age alone. Returns the ghost ONLY
 * when confidence is "high" (near-proof via shared games, or matching
 * name+age+location/coach). Returns null when there is no candidate, when the
 * match is ambiguous (2+ same-name ghosts), or when confidence is anything less
 * — those are left for an admin to triage on the Possible-duplicates page.
 */
export async function findAutoMergeTarget(target: {
  id: string;
  name: string;
  ageGroup: string | null;
  city: string | null;
  state: string | null;
  coaches: string[];
}): Promise<AutoMergeTarget | null> {
  const norm = normalizeTeamName(target.name);
  if (!norm) return null;
  const firstToken = norm.split(" ")[0] ?? norm;

  const candidates = await prisma.team.findMany({
    where: { name: { contains: firstToken, mode: "insensitive" }, gcTeamId: null, id: { not: target.id } },
    select: { id: true, name: true, ageGroup: true, city: true, state: true, coaches: true },
    take: 50,
  });

  const matches = candidates.filter((c) => {
    if (normalizeTeamName(c.name) !== norm) return false;
    if (target.ageGroup) {
      const candAge = c.ageGroup ?? ageGroupFromName(c.name);
      if (candAge && candAge.toUpperCase() !== target.ageGroup.toUpperCase()) return false;
    }
    return true;
  });
  // 0 → nothing to merge; 2+ → genuinely ambiguous (e.g. "Stars 14U" in two
  // regions) — never guess, hand it to the admin queue.
  if (matches.length !== 1) return null;
  const ghost = matches[0]!;

  const [shared, ghostRegion, targetRegion] = await Promise.all([
    sharedMatchupCount(target.id, ghost.id),
    teamRegionStates(ghost.id, target.id),
    teamRegionStates(target.id, ghost.id),
  ]);

  const score = scoreMerge({
    nameA: target.name,
    nameB: ghost.name,
    ageA: target.ageGroup,
    ageB: ghost.ageGroup ?? ageGroupFromName(ghost.name),
    cityA: target.city,
    cityB: ghost.city, // ghosts have no city → null, so no spurious match
    stateA: target.state,
    stateB: ghost.city ? ghost.state : null, // ignore a ghost's default "UT"
    coachesA: target.coaches,
    coachesB: ghost.coaches ?? [],
    sharedGameCount: shared,
    regionStatesA: targetRegion,
    regionStatesB: ghostRegion,
  });

  return score.tier === "high" ? { id: ghost.id, name: ghost.name, score } : null;
}

export interface GhostMergeSuggestion {
  targetId: string;
  targetName: string;
  targetSlug: string;
  targetCity: string | null;
  targetState: string | null;
  targetGcTeamId: string | null;
  score: MergeScore;
  /** Matchups the ghost and this target both played — the evidence to eyeball. */
  sharedGames: SharedGameRow[];
}

export interface GhostTeamWithSuggestions {
  id: string;
  name: string;
  slug: string;
  ageGroup: string | null;
  city: string | null;
  state: string | null;
  totalGames: number;
  /** Ranked real-team merge targets (best first); empty when nothing matches. */
  suggestions: GhostMergeSuggestion[];
}

/**
 * List ghost teams (auto-created opponents) with ranked, confidence-scored merge
 * targets for the admin Ghost-teams page. For each ghost we cheaply pre-score
 * same-name real teams, then run the full model (incl. shared games + game-region
 * overlap) on the top few — so admins see exactly why each suggestion is strong
 * or weak before merging.
 */
export async function getGhostTeamsWithSuggestions(limit = 100): Promise<GhostTeamWithSuggestions[]> {
  const ghosts = await prisma.team.findMany({
    where: { isGhost: true },
    select: {
      id: true,
      name: true,
      slug: true,
      ageGroup: true,
      city: true,
      state: true,
      coaches: true,
      _count: { select: { homeGames: true, awayGames: true } },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const results: GhostTeamWithSuggestions[] = [];
  for (const g of ghosts) {
    const norm = normalizeTeamName(g.name);
    const firstToken = norm.split(" ")[0] ?? norm;

    const candidates = norm
      ? await prisma.team.findMany({
          where: {
            id: { not: g.id },
            isGhost: false,
            name: { contains: firstToken, mode: "insensitive" },
          },
          select: {
            id: true,
            name: true,
            slug: true,
            ageGroup: true,
            city: true,
            state: true,
            coaches: true,
            gcTeamId: true,
          },
          take: 25,
        })
      : [];

    // Cheap first pass (no game queries) to pick the few worth refining.
    const prelim = candidates
      .map((c) => ({
        c,
        cheap: scoreMerge({
          nameA: g.name,
          nameB: c.name,
          ageA: g.ageGroup,
          ageB: c.ageGroup ?? ageGroupFromName(c.name),
          cityA: g.city,
          cityB: c.city,
          stateA: g.city ? g.state : null,
          stateB: c.state,
          coachesA: g.coaches,
          coachesB: c.coaches,
        }),
      }))
      .filter((x) => !x.cheap.disqualified && x.cheap.tier !== "none")
      .sort((a, b) => b.cheap.score - a.cheap.score)
      .slice(0, 3);

    const suggestions: GhostMergeSuggestion[] = [];
    for (const { c } of prelim) {
      const [sharedGames, ghostRegion, targetRegion] = await Promise.all([
        sharedGamesByName(g.id, c.id),
        teamRegionStates(g.id, c.id),
        teamRegionStates(c.id, g.id),
      ]);
      const score = scoreMerge({
        nameA: g.name,
        nameB: c.name,
        ageA: g.ageGroup,
        ageB: c.ageGroup ?? ageGroupFromName(c.name),
        cityA: g.city,
        cityB: c.city,
        stateA: g.city ? g.state : null,
        stateB: c.state,
        coachesA: g.coaches,
        coachesB: c.coaches,
        sharedGameCount: sharedGames.length,
        regionStatesA: ghostRegion,
        regionStatesB: targetRegion,
      });
      suggestions.push({
        targetId: c.id,
        targetName: c.name,
        targetSlug: c.slug,
        targetCity: c.city,
        targetState: c.state,
        targetGcTeamId: c.gcTeamId,
        score,
        sharedGames,
      });
    }
    suggestions.sort((a, b) => b.score.score - a.score.score);

    results.push({
      id: g.id,
      name: g.name,
      slug: g.slug,
      ageGroup: g.ageGroup,
      city: g.city,
      state: g.state,
      totalGames: g._count.homeGames + g._count.awayGames,
      suggestions,
    });
  }

  // Ghosts with a confident match float to the top; orphans sink.
  results.sort(
    (a, b) => (b.suggestions[0]?.score.score ?? -1) - (a.suggestions[0]?.score.score ?? -1),
  );
  return results;
}

/** Count ghost teams (for the admin nav badge). */
export async function countGhostTeams(): Promise<number> {
  return prisma.team.count({ where: { isGhost: true } });
}

/** Normalize a name for EXACT display matching (keeps the age token, unlike the
 * scraper normalizer): lowercase, strip diacritics/punctuation, collapse spaces. */
function displayNorm(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface ExactGhostMatch {
  ghostId: string;
  ghostName: string;
  targetId: string;
  targetName: string;
  targetGcTeamId: string | null;
}

/**
 * Find ghost teams whose name EXACTLY matches a single verified team (one with a
 * GameChanger ID). Age is implicitly matched because the full name — including
 * the "10U"/"14U" token — must match, so "Riverdawgs 10U" never collapses into
 * "Riverdawgs 11U". Ambiguous cases (2+ verified teams of the same exact name,
 * e.g. the same club name in two regions) are skipped, not guessed.
 */
export async function findExactNameGhostMatches(): Promise<ExactGhostMatch[]> {
  const [ghosts, verified] = await Promise.all([
    prisma.team.findMany({ where: { isGhost: true }, select: { id: true, name: true } }),
    prisma.team.findMany({
      where: { gcTeamId: { not: null } },
      select: { id: true, name: true, gcTeamId: true },
    }),
  ]);

  const byName = new Map<string, { id: string; name: string; gcTeamId: string | null }[]>();
  for (const v of verified) {
    const key = displayNorm(v.name);
    if (!key) continue;
    (byName.get(key) ?? byName.set(key, []).get(key)!).push(v);
  }

  const out: ExactGhostMatch[] = [];
  for (const g of ghosts) {
    const matches = byName.get(displayNorm(g.name));
    if (matches && matches.length === 1) {
      out.push({
        ghostId: g.id,
        ghostName: g.name,
        targetId: matches[0]!.id,
        targetName: matches[0]!.name,
        targetGcTeamId: matches[0]!.gcTeamId,
      });
    }
  }
  return out;
}

/** Count exact-name ghost→verified matches (for the admin button label). */
export async function countExactNameGhostMatches(): Promise<number> {
  return (await findExactNameGhostMatches()).length;
}

/**
 * Ghosts with no games at all — pure cruft, e.g. left behind after a reconcile
 * prune removed their phantom games, or after an opponent was re-resolved to a
 * real team. Nothing references them, so they're always safe to delete.
 */
export async function countOrphanGhosts(): Promise<number> {
  return prisma.team.count({
    where: { isGhost: true, homeGames: { none: {} }, awayGames: { none: {} } },
  });
}

/** Delete every ghost team that has zero games. Returns how many were removed. */
export async function deleteOrphanGhosts(): Promise<{ deleted: number }> {
  const orphans = await prisma.team.findMany({
    where: { isGhost: true, homeGames: { none: {} }, awayGames: { none: {} } },
    select: { id: true },
  });
  const ids = orphans.map((o) => o.id);
  if (ids.length > 0) {
    await prisma.team.deleteMany({ where: { id: { in: ids } } });
  }
  return { deleted: ids.length };
}

/**
 * DELETE every ghost whose exact name matches a single verified (GameChanger)
 * team. The ghost — and its games, via the DB's ON DELETE CASCADE — is removed;
 * the verified team is untouched. We delete rather than merge on purpose: the
 * verified team already holds the authoritative games from its own scrape, so
 * folding the ghost's opponent-perspective copies back in just re-creates
 * duplicate games. Returns how many ghosts were deleted.
 */
export async function deleteExactNameGhosts(): Promise<{
  deleted: number;
  matches: ExactGhostMatch[];
}> {
  const matches = await findExactNameGhostMatches();
  const ids = matches.map((m) => m.ghostId);
  if (ids.length > 0) {
    await prisma.team.deleteMany({ where: { id: { in: ids } } });
  }
  return { deleted: ids.length, matches };
}

/**
 * Merge `sourceId` into `targetId`: reassign games, transfer a GameChanger ID and
 * any missing fields, drop self-games and duplicate matchups, delete the source.
 */
export async function mergeTeams(sourceId: string, targetId: string): Promise<void> {
  if (!sourceId || !targetId || sourceId === targetId) return;

  const [source, target] = await Promise.all([
    prisma.team.findUnique({ where: { id: sourceId } }),
    prisma.team.findUnique({ where: { id: targetId } }),
  ]);
  if (!source || !target) return;

  await prisma.game.updateMany({ where: { homeTeamId: sourceId }, data: { homeTeamId: targetId } });
  await prisma.game.updateMany({ where: { awayTeamId: sourceId }, data: { awayTeamId: targetId } });

  const sourceGcId = source.gcTeamId;
  if (sourceGcId) {
    await prisma.team.update({ where: { id: sourceId }, data: { gcTeamId: null } });
  }
  await prisma.team.delete({ where: { id: sourceId } });

  await prisma.team.update({
    where: { id: targetId },
    data: {
      gcTeamId: target.gcTeamId ?? sourceGcId ?? null,
      ageGroup: target.ageGroup ?? source.ageGroup ?? null,
      city: target.city ?? source.city ?? null,
      zip: target.zip ?? source.zip ?? null,
      coaches: target.coaches?.length ? target.coaches : source.coaches ?? [],
      isGhost: false,
      ...(target.gcTeamId || sourceGcId
        ? { lastScrapedAt: null, nextScrapeAfter: null, consecutiveFailures: 0 }
        : {}),
    },
  });

  await dedupeTeamGames(targetId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-age-group merge repair
//
// The scraper historically merged any same-base-name ghost into a freshly
// enriched team without checking age (normalizeTeamName strips "11U"/"14U"), so
// a stray "MBA Navy 14U" ghost collapsed into the real "MBA Navy 11U" and
// dragged its 14U opponents along. findPromotableTeam now guards against this
// going forward; the helpers below find and undo the damage already in the DB.
// ─────────────────────────────────────────────────────────────────────────────

const ageToNum = (a?: string | null): number | null => {
  if (!a) return null;
  const m = a.match(/\d{1,2}/);
  return m ? Number(m[0]) : null;
};

/** Replace the age token in a team name (or append one), e.g. "MBA Navy 11U" → 14 → "MBA Navy 14U". */
function renameAge(name: string, num: number): string {
  const tag = `${num}U`;
  if (/\b\d{1,2}u\b/i.test(name)) return name.replace(/\b\d{1,2}u\b/i, tag);
  if (/\bu\d{1,2}\b/i.test(name)) return name.replace(/\bu\d{1,2}\b/i, tag);
  return `${name} ${tag}`;
}

export interface BadMergeOutlier {
  gameId: string;
  side: "home" | "away";
  opponentName: string;
  opponentAge: number;
  gap: number;
  playedAt: Date;
}

export interface BadMergeFinding {
  teamId: string;
  teamName: string;
  teamSlug: string;
  teamAge: number;
  gcTeamId: string | null;
  /** Games within one age year of the team — its legitimate base. */
  ownCohortGames: number;
  outliers: BadMergeOutlier[];
}

/**
 * Find teams that look polluted by a cross-age-group merge: a team with a known
 * age and a solid base of own-cohort games that also carries games against
 * opponents `minGap`+ years away (the signature of an absorbed off-age ghost).
 * Read-only. Opponents whose age can't be determined are ignored.
 */
export async function findCrossAgeMergeArtifacts(
  minGap = 3,
  minOwnCohort = 3,
  minOutliers = 1,
): Promise<BadMergeFinding[]> {
  // When hunting 1-year gaps, only exact-age games count as the team's "own
  // cohort" — a one-year play-up is legitimate and common, so for wider gaps it
  // still counts as own. `minOutliers` lets the 1-year view demand a real
  // cluster (not a stray play-up) before flagging.
  const cohortRadius = minGap <= 1 ? 0 : 1;
  const teams = await prisma.team.findMany({
    where: { gcTeamId: { not: null }, ageGroup: { not: null } },
    select: {
      id: true,
      name: true,
      slug: true,
      ageGroup: true,
      gcTeamId: true,
      homeGames: {
        select: { id: true, playedAt: true, awayTeam: { select: { name: true, ageGroup: true } } },
      },
      awayGames: {
        select: { id: true, playedAt: true, homeTeam: { select: { name: true, ageGroup: true } } },
      },
    },
  });

  const findings: BadMergeFinding[] = [];
  for (const t of teams) {
    const teamAge = ageToNum(t.ageGroup);
    if (teamAge == null) continue;

    const rows = [
      ...t.homeGames.map((g) => ({
        gameId: g.id,
        side: "home" as const,
        playedAt: g.playedAt,
        oppName: g.awayTeam.name,
        oppAge: g.awayTeam.ageGroup,
      })),
      ...t.awayGames.map((g) => ({
        gameId: g.id,
        side: "away" as const,
        playedAt: g.playedAt,
        oppName: g.homeTeam.name,
        oppAge: g.homeTeam.ageGroup,
      })),
    ];

    let ownCohortGames = 0;
    const outliers: BadMergeOutlier[] = [];
    for (const r of rows) {
      const oppAge = ageToNum(r.oppAge ?? ageGroupFromName(r.oppName));
      if (oppAge == null) continue;
      const gap = Math.abs(oppAge - teamAge);
      if (gap <= cohortRadius) ownCohortGames += 1;
      else if (gap >= minGap) {
        outliers.push({
          gameId: r.gameId,
          side: r.side,
          opponentName: r.oppName,
          opponentAge: oppAge,
          gap,
          playedAt: r.playedAt,
        });
      }
    }

    if (ownCohortGames >= minOwnCohort && outliers.length >= minOutliers) {
      findings.push({
        teamId: t.id,
        teamName: t.name,
        teamSlug: t.slug,
        teamAge,
        gcTeamId: t.gcTeamId,
        ownCohortGames,
        outliers,
      });
    }
  }
  return findings;
}

/** Find or create a ghost team of the same base name at a given age. */
async function ghostAtAge(baseName: string, num: number): Promise<string> {
  const targetName = renameAge(baseName, num);
  const ag = `U${num}` as AgeGroup;
  const norm = normalizeTeamName(targetName);
  const firstToken = norm.split(" ")[0] ?? norm;

  const existing = (
    await prisma.team.findMany({
      where: { gcTeamId: null, name: { contains: firstToken, mode: "insensitive" } },
      select: { id: true, name: true, ageGroup: true },
      take: 50,
    })
  ).find(
    (c) =>
      normalizeTeamName(c.name) === norm &&
      ageToNum(c.ageGroup ?? ageGroupFromName(c.name)) === num,
  );
  if (existing) return existing.id;

  let slug = teamSlug(targetName, ag);
  let n = 2;
  while (await prisma.team.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${teamSlug(targetName, ag)}-${n++}`;
  }
  const created = await prisma.team.create({
    data: {
      name: targetName.slice(0, 120),
      slug,
      ageGroup: ag,
      isGhost: true,
      scrapeEnabled: false,
      rating: { create: {} },
    },
  });
  return created.id;
}

/**
 * Undo a cross-age-group merge for one finding: move each outlier game off the
 * polluted team onto a regenerated ghost at the opponent's age, then dedupe.
 * Re-scraping the real team afterwards keeps its own (correctly-aged) games.
 * Returns the number of games moved.
 */
export async function repairCrossAgeMerge(finding: BadMergeFinding): Promise<number> {
  const byAge = new Map<number, BadMergeOutlier[]>();
  for (const o of finding.outliers) {
    const list = byAge.get(o.opponentAge) ?? [];
    list.push(o);
    byAge.set(o.opponentAge, list);
  }

  let moved = 0;
  for (const [age, outliers] of byAge) {
    const ghostId = await ghostAtAge(finding.teamName, age);
    for (const o of outliers) {
      await prisma.game.update({
        where: { id: o.gameId },
        data: o.side === "home" ? { homeTeamId: ghostId } : { awayTeamId: ghostId },
      });
      moved += 1;
    }
    await dedupeTeamGames(ghostId);
  }
  return moved;
}

/** Remove self-games and duplicate matchups (same teams + same day) for a team. */
export async function dedupeTeamGames(teamId: string): Promise<number> {
  const games = await prisma.game.findMany({
    where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
      playedAt: true,
      createdAt: true,
      homeTeam: { select: { name: true, isGhost: true } },
      awayTeam: { select: { name: true, isGhost: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by the OPPONENT's normalized name + day, ignoring home/away orientation
  // and whether the opponent is the real team or a ghost of it. This catches the
  // duplicate created when a team is verified (its own scraped game) and then a
  // ghost is merged in (the same matchup from the opponent's side, often with the
  // opponent recorded as a different ghost record or with sides swapped) — cases
  // the old id+orientation key missed.
  const groups = new Map<string, typeof games>();
  const toDelete: string[] = [];
  for (const g of games) {
    if (g.homeTeamId === g.awayTeamId) {
      toDelete.push(g.id); // self-game: always junk
      continue;
    }
    const opp = g.homeTeamId === teamId ? g.awayTeam : g.homeTeam;
    const day = g.playedAt.toISOString().slice(0, 10);
    const key = `${normalizeTeamName(opp.name)}|${day}`;
    const arr = groups.get(key);
    if (arr) arr.push(g);
    else groups.set(key, [g]);
  }

  for (const gs of groups.values()) {
    if (gs.length <= 1) continue;
    // Keep the best representative: prefer the game whose opponent is a VERIFIED
    // (non-ghost) team, then the earliest recorded. Delete the rest.
    gs.sort((a, b) => {
      const oppA = a.homeTeamId === teamId ? a.awayTeam : a.homeTeam;
      const oppB = b.homeTeamId === teamId ? b.awayTeam : b.homeTeam;
      if (oppA.isGhost !== oppB.isGhost) return oppA.isGhost ? 1 : -1;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
    for (const g of gs.slice(1)) toDelete.push(g.id);
  }

  if (toDelete.length) {
    await prisma.game.deleteMany({ where: { id: { in: toDelete } } });
  }
  return toDelete.length;
}

/**
 * Run the (orientation/ghost-aware) dedupe across every verified team — the
 * cleanup for duplicate games left by earlier merges. Returns the number of
 * duplicate game rows removed. Recompute afterward (games changed).
 */
export async function dedupeAllGames(): Promise<number> {
  const teams = await prisma.team.findMany({ where: { isGhost: false }, select: { id: true } });
  let removed = 0;
  for (const t of teams) removed += await dedupeTeamGames(t.id);
  return removed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ghost splitter — untangle a "junk-drawer" ghost that pooled games from more
// than one real team (because opponents all wrote the same age-less name). We
// group the ghost's games by the OPPONENT's age and suggest the same-name team
// at that age, but the admin confirms each group's destination (so a legit
// play-up isn't auto-misrouted).
// ─────────────────────────────────────────────────────────────────────────────

export interface GhostSplitGame {
  gameId: string;
  opponent: string;
  date: string;
  us: number | null;
  them: number | null;
}

export interface GhostSplitGroup {
  /** Opponent age for this group (null = couldn't determine). */
  oppAge: number | null;
  label: string;
  games: GhostSplitGame[];
  /** Best same-name team at that age, if one exists (real preferred). */
  suggestedTargetId: string | null;
  suggestedTargetName: string | null;
}

/** Group a ghost's games by opponent age, with a suggested same-name target each. */
export async function getGhostSplitGroups(ghostId: string): Promise<GhostSplitGroup[]> {
  const g = await prisma.team.findUnique({
    where: { id: ghostId },
    select: {
      name: true,
      homeGames: {
        where: { status: "FINAL" },
        select: {
          id: true,
          playedAt: true,
          homeScore: true,
          awayScore: true,
          awayTeam: { select: { name: true, ageGroup: true } },
        },
      },
      awayGames: {
        where: { status: "FINAL" },
        select: {
          id: true,
          playedAt: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: { name: true, ageGroup: true } },
        },
      },
    },
  });
  if (!g) return [];

  const rows = [
    ...g.homeGames.map((x) => ({
      gameId: x.id,
      date: x.playedAt.toISOString().slice(0, 10),
      us: x.homeScore,
      them: x.awayScore,
      oppName: x.awayTeam.name,
      oppAge: x.awayTeam.ageGroup,
    })),
    ...g.awayGames.map((x) => ({
      gameId: x.id,
      date: x.playedAt.toISOString().slice(0, 10),
      us: x.awayScore,
      them: x.homeScore,
      oppName: x.homeTeam.name,
      oppAge: x.homeTeam.ageGroup,
    })),
  ];

  const byAge = new Map<number | null, GhostSplitGame[]>();
  for (const r of rows) {
    const age = ageToNum(r.oppAge ?? ageGroupFromName(r.oppName));
    const list = byAge.get(age) ?? byAge.set(age, []).get(age)!;
    list.push({ gameId: r.gameId, opponent: r.oppName, date: r.date, us: r.us, them: r.them });
  }

  const base = normalizeTeamName(g.name);
  const firstToken = base.split(" ")[0] ?? base;
  const sameName = base
    ? await prisma.team.findMany({
        where: { id: { not: ghostId }, name: { contains: firstToken, mode: "insensitive" } },
        select: { id: true, name: true, ageGroup: true, gcTeamId: true },
        take: 50,
      })
    : [];

  const groups: GhostSplitGroup[] = [];
  for (const [oppAge, games] of byAge) {
    let suggestedTargetId: string | null = null;
    let suggestedTargetName: string | null = null;
    if (oppAge != null) {
      const matches = sameName.filter(
        (c) =>
          normalizeTeamName(c.name) === base &&
          ageToNum(c.ageGroup ?? ageGroupFromName(c.name)) === oppAge,
      );
      const best = matches.find((c) => c.gcTeamId) ?? matches[0];
      if (best) {
        suggestedTargetId = best.id;
        suggestedTargetName = best.name;
      }
    }
    groups.push({
      oppAge,
      label: oppAge != null ? `U${oppAge}` : "Unknown age",
      games,
      suggestedTargetId,
      suggestedTargetName,
    });
  }
  groups.sort((a, b) => (a.oppAge ?? 99) - (b.oppAge ?? 99));
  return groups;
}

/**
 * Reassign specific games from one team to another (used by the ghost splitter):
 * for each game, the side that referenced `sourceTeamId` is pointed at
 * `targetTeamId`, then the target is deduped. Returns how many games moved.
 */
export async function reassignTeamGames(
  sourceTeamId: string,
  gameIds: string[],
  targetTeamId: string,
): Promise<number> {
  if (!sourceTeamId || !targetTeamId || sourceTeamId === targetTeamId || gameIds.length === 0) {
    return 0;
  }
  const games = await prisma.game.findMany({
    where: {
      id: { in: gameIds },
      OR: [{ homeTeamId: sourceTeamId }, { awayTeamId: sourceTeamId }],
    },
    select: { id: true, homeTeamId: true },
  });
  let moved = 0;
  for (const g of games) {
    await prisma.game.update({
      where: { id: g.id },
      data: g.homeTeamId === sourceTeamId ? { homeTeamId: targetTeamId } : { awayTeamId: targetTeamId },
    });
    moved += 1;
  }
  if (moved > 0) await dedupeTeamGames(targetTeamId);
  return moved;
}

export interface GhostGameOrigin {
  gameId: string;
  date: string;
  us: number | null;
  them: number | null;
  /** The opponent — i.e. the team whose schedule scrape created this ghost game. */
  opponentId: string;
  opponentName: string;
  opponentSlug: string;
  opponentGcTeamId: string | null;
  opponentAge: string | null;
  opponentIsGhost: boolean;
}

export interface GhostDetail {
  id: string;
  name: string;
  slug: string;
  ageGroup: string | null;
  isGhost: boolean;
  games: GhostGameOrigin[];
}

/**
 * Full game list for one team, with each opponent resolved — for the ghost
 * provenance view. A ghost has no page of its own, so every game here was created
 * when the OPPONENT's schedule was scraped; the opponent is therefore the source.
 */
export async function getGhostDetail(teamId: string): Promise<GhostDetail | null> {
  const oppSelect = {
    select: { id: true, name: true, slug: true, gcTeamId: true, ageGroup: true, isGhost: true },
  };
  const t = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      slug: true,
      ageGroup: true,
      isGhost: true,
      homeGames: {
        where: { status: "FINAL" },
        select: { id: true, playedAt: true, homeScore: true, awayScore: true, awayTeam: oppSelect },
      },
      awayGames: {
        where: { status: "FINAL" },
        select: { id: true, playedAt: true, homeScore: true, awayScore: true, homeTeam: oppSelect },
      },
    },
  });
  if (!t) return null;

  const games: GhostGameOrigin[] = [
    ...t.homeGames.map((g) => ({
      gameId: g.id,
      date: g.playedAt.toISOString().slice(0, 10),
      us: g.homeScore,
      them: g.awayScore,
      opponentId: g.awayTeam.id,
      opponentName: g.awayTeam.name,
      opponentSlug: g.awayTeam.slug,
      opponentGcTeamId: g.awayTeam.gcTeamId,
      opponentAge: g.awayTeam.ageGroup,
      opponentIsGhost: g.awayTeam.isGhost,
    })),
    ...t.awayGames.map((g) => ({
      gameId: g.id,
      date: g.playedAt.toISOString().slice(0, 10),
      us: g.awayScore,
      them: g.homeScore,
      opponentId: g.homeTeam.id,
      opponentName: g.homeTeam.name,
      opponentSlug: g.homeTeam.slug,
      opponentGcTeamId: g.homeTeam.gcTeamId,
      opponentAge: g.homeTeam.ageGroup,
      opponentIsGhost: g.homeTeam.isGhost,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return { id: t.id, name: t.name, slug: t.slug, ageGroup: t.ageGroup, isGhost: t.isGhost, games };
}

// ── Merge review queue ──────────────────────────────────────────────────────
// A human-in-the-loop replacement for the old auto-promote-on-add behavior. When
// a real team is added (by an admin or the public form) it is now created fresh
// rather than silently absorbing a same-name ghost. This queue re-discovers those
// strong ghost↔real matches so an admin can approve (fold the ghost's games into
// the real team) or dismiss — with every confidence signal visible first.

/** AppSetting key: a JSON array of "ghostId|targetId" pairs the admin dismissed. */
export const GHOST_MERGE_DISMISSALS_KEY = "ghostMergeDismissals";

export interface GhostMergeQueueGhost {
  id: string;
  name: string;
  slug: string;
  ageGroup: string | null;
  city: string | null;
  state: string | null;
  totalGames: number;
}

export interface GhostMergeQueueTarget {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  gcTeamId: string | null;
  /** ISO date the real team was added — the "arrival" this review hangs off. */
  createdAt: string;
  /** Added within the recency window (newWithinDays) — a fresh arrival. */
  isNew: boolean;
  totalGames: number;
}

export interface GhostMergeQueueItem {
  /** Source: folds into the target and is deleted on approve. */
  ghost: GhostMergeQueueGhost;
  /** Destination: the real (added) team, kept. */
  target: GhostMergeQueueTarget;
  score: MergeScore;
  sharedGames: SharedGameRow[];
  /** Stable key for approve/dismiss actions: `${ghostId}|${targetId}`. */
  dismissKey: string;
}

/** Read the dismissed-pair set (best-effort; never throws). */
async function getGhostMergeDismissals(): Promise<Set<string>> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: GHOST_MERGE_DISMISSALS_KEY } });
    if (!row?.value) return new Set();
    const arr = JSON.parse(row.value) as unknown;
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Prisma select for a real team being matched against ghosts (queue + refresh). */
const QUEUE_TEAM_SELECT = {
  id: true,
  name: true,
  slug: true,
  ageGroup: true,
  city: true,
  state: true,
  gcTeamId: true,
  coaches: true,
  createdAt: true,
  _count: { select: { homeGames: true, awayGames: true } },
} as const;

type QueueTeamRow = {
  id: string;
  name: string;
  slug: string;
  ageGroup: string | null;
  city: string | null;
  state: string;
  gcTeamId: string | null;
  coaches: string[];
  createdAt: Date;
  _count: { homeGames: number; awayGames: number };
};

/**
 * The single best confident, un-dismissed ghost match for one real team, fully
 * scored (name, age, city/state, coaches, shared games, region) — or null when
 * there's no confident, age-compatible, non-dismissed candidate. Shared by the
 * queue (loop over teams) and the per-team pendingMerge refresh so both agree.
 */
async function bestGhostMatchForTeam(
  t: QueueTeamRow,
  dismissed: Set<string>,
  newCutoff: number,
): Promise<GhostMergeQueueItem | null> {
  const norm = normalizeTeamName(t.name);
  if (!norm) return null;
  const firstToken = norm.split(" ")[0] ?? norm;

  const ghosts = await prisma.team.findMany({
    where: { isGhost: true, name: { contains: firstToken, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      slug: true,
      ageGroup: true,
      city: true,
      state: true,
      coaches: true,
      _count: { select: { homeGames: true, awayGames: true } },
    },
    take: 25,
  });
  if (ghosts.length === 0) return null;

  // Cheap first pass (no game queries) to pick the single ghost worth refining.
  const prelim = ghosts
    .map((g) => ({
      g,
      cheap: scoreMerge({
        nameA: t.name,
        nameB: g.name,
        ageA: t.ageGroup ?? ageGroupFromName(t.name),
        ageB: g.ageGroup ?? ageGroupFromName(g.name),
        cityA: t.city,
        cityB: g.city,
        stateA: t.city ? t.state : null,
        stateB: g.city ? g.state : null,
        coachesA: t.coaches,
        coachesB: g.coaches,
      }),
    }))
    .filter((x) => !x.cheap.disqualified && x.cheap.tier !== "none")
    .sort((a, b) => b.cheap.score - a.cheap.score);
  if (prelim.length === 0) return null;
  const g = prelim[0]!.g;

  const dismissKey = `${g.id}|${t.id}`;
  if (dismissed.has(dismissKey)) return null;

  const [sharedGames, ghostRegion, targetRegion] = await Promise.all([
    sharedGamesByName(g.id, t.id),
    teamRegionStates(g.id, t.id),
    teamRegionStates(t.id, g.id),
  ]);
  const score = scoreMerge({
    nameA: t.name,
    nameB: g.name,
    ageA: t.ageGroup ?? ageGroupFromName(t.name),
    ageB: g.ageGroup ?? ageGroupFromName(g.name),
    cityA: t.city,
    cityB: g.city,
    stateA: t.city ? t.state : null,
    stateB: g.city ? g.state : null,
    coachesA: t.coaches,
    coachesB: g.coaches,
    sharedGameCount: sharedGames.length,
    regionStatesA: targetRegion,
    regionStatesB: ghostRegion,
  });
  // Only confident, age-compatible matches belong in a review queue.
  if (score.disqualified) return null;
  if (score.tier !== "high" && score.tier !== "medium") return null;

  return {
    ghost: {
      id: g.id,
      name: g.name,
      slug: g.slug,
      ageGroup: g.ageGroup,
      city: g.city,
      state: g.state,
      totalGames: g._count.homeGames + g._count.awayGames,
    },
    target: {
      id: t.id,
      name: t.name,
      slug: t.slug,
      city: t.city,
      state: t.state,
      gcTeamId: t.gcTeamId,
      createdAt: t.createdAt.toISOString(),
      isNew: t.createdAt.getTime() >= newCutoff,
      totalGames: t._count.homeGames + t._count.awayGames,
    },
    score,
    sharedGames,
    dismissKey,
  };
}

/**
 * Recompute one team's `pendingMerge` flag from the live queue logic and persist
 * it. Call after adding a team, or after a merge/dismiss, so the public
 * "Verifying" badge appears/clears in step with the queue. Returns the new value.
 */
export async function refreshTeamPendingMerge(teamId: string): Promise<boolean> {
  const t = (await prisma.team.findUnique({
    where: { id: teamId },
    select: { ...QUEUE_TEAM_SELECT, isGhost: true },
  })) as (QueueTeamRow & { isGhost: boolean }) | null;
  // Ghosts are never public targets; a missing team is a no-op.
  const match = t && !t.isGhost ? await bestGhostMatchForTeam(t, await getGhostMergeDismissals(), 0) : null;
  const pending = match != null;
  if (t) {
    await prisma.team.update({ where: { id: teamId }, data: { pendingMerge: pending } });
  }
  return pending;
}

/**
 * Build the merge review queue: for the most recently added REAL teams, find the
 * single best-matching ghost and, when the match is confident (tier high/medium
 * and not age-disqualified), surface it for human approval. Newest arrivals and
 * strongest matches float to the top. Dismissed pairs are hidden unless
 * `includeDismissed` is set.
 */
export async function getGhostMergeQueue(opts?: {
  limit?: number;
  newWithinDays?: number;
  includeDismissed?: boolean;
}): Promise<GhostMergeQueueItem[]> {
  const limit = opts?.limit ?? 150;
  const newWithinDays = opts?.newWithinDays ?? 21;
  const newCutoff = Date.now() - newWithinDays * 24 * 60 * 60 * 1000;
  const dismissed = opts?.includeDismissed ? new Set<string>() : await getGhostMergeDismissals();

  const teams = (await prisma.team.findMany({
    where: { isGhost: false },
    select: QUEUE_TEAM_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  })) as QueueTeamRow[];

  const items: GhostMergeQueueItem[] = [];
  for (const t of teams) {
    const match = await bestGhostMatchForTeam(t, dismissed, newCutoff);
    if (match) items.push(match);
  }

  // New arrivals first, then strongest match first.
  items.sort(
    (a, b) =>
      Number(b.target.isNew) - Number(a.target.isNew) || b.score.score - a.score.score,
  );
  return items;
}

// ── GameChanger lookup (verify opponents) ───────────────────────────────────
// Admin workflow: pick a verified team, see its still-unverified (ghost)
// opponents, copy each name to paste into GameChanger search, then add the real
// team by id. Working through verified teams this way steadily verifies the
// opponents they've played.

export interface LookupTeam {
  id: string;
  name: string;
  slug: string;
  ageGroup: string | null;
  city: string | null;
  gcTeamId: string | null;
  createdAt: string;
  /** Distinct unverified (ghost) opponents on this team's schedule. */
  unverifiedCount: number;
}

/** Distinct ghost-opponent count per (non-ghost) team, one pass over FINAL games. */
async function ghostOpponentCounts(): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ team_id: string; cnt: number }[]>`
    SELECT team_id, COUNT(DISTINCT opp_id)::int AS cnt FROM (
      SELECT g."homeTeamId" AS team_id, g."awayTeamId" AS opp_id
        FROM "Game" g JOIN "Team" o ON o.id = g."awayTeamId"
        WHERE g.status = 'FINAL' AND o."isGhost" = true
      UNION ALL
      SELECT g."awayTeamId" AS team_id, g."homeTeamId" AS opp_id
        FROM "Game" g JOIN "Team" o ON o.id = g."homeTeamId"
        WHERE g.status = 'FINAL' AND o."isGhost" = true
    ) x GROUP BY team_id`;
  return new Map(rows.map((r) => [r.team_id, Number(r.cnt)]));
}

/**
 * Verified (non-ghost) teams for the lookup page, ranked by how many unverified
 * (ghost) opponents they still have — most first — so the biggest cleanup jobs
 * surface. Optional name search and age-group filter. When browsing (no search)
 * only teams that actually have unverified opponents are shown (the worklist);
 * a name search shows all matches so any team is findable. Ghosts are excluded —
 * you verify FROM a real team's schedule.
 */
export async function getLookupTeams(opts?: {
  q?: string;
  ageGroup?: string;
  state?: string;
  limit?: number;
}): Promise<LookupTeam[]> {
  const q = opts?.q?.trim();
  const ageGroup = opts?.ageGroup?.trim() || undefined;
  const state = opts?.state?.trim().toUpperCase() || undefined;
  const limit = opts?.limit ?? 40;

  const countByTeam = await ghostOpponentCounts();

  const teams = await prisma.team.findMany({
    where: {
      isGhost: false,
      ...(q
        ? { name: { contains: q, mode: "insensitive" as const } }
        : // Browsing: only teams that have unverified opponents (the worklist).
          { id: { in: [...countByTeam.keys()] } }),
      ...(ageGroup ? { ageGroup: ageGroup as never } : {}),
      ...(state ? { state } : {}),
    },
    select: { id: true, name: true, slug: true, ageGroup: true, city: true, gcTeamId: true, createdAt: true },
    take: 1000,
  });

  return teams
    .map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      ageGroup: t.ageGroup,
      city: t.city,
      gcTeamId: t.gcTeamId,
      createdAt: t.createdAt.toISOString(),
      unverifiedCount: countByTeam.get(t.id) ?? 0,
    }))
    .sort((a, b) => b.unverifiedCount - a.unverifiedCount || (a.name < b.name ? -1 : 1))
    .slice(0, limit);
}

/** Distinct states present among verified teams — for the lookup state filter. */
export async function getLookupStates(): Promise<string[]> {
  const rows = await prisma.team.findMany({
    where: { isGhost: false, state: { not: "" } },
    select: { state: true },
    distinct: ["state"],
    orderBy: { state: "asc" },
  });
  return rows.map((r) => r.state).filter(Boolean);
}

export interface UnverifiedOpponent {
  id: string;
  name: string;
  slug: string;
  ageGroup: string | null;
  games: number;
  lastPlayed: string;
}

export interface TeamOpponentsView {
  team: { id: string; name: string; slug: string; gcTeamId: string | null; ageGroup: string | null };
  opponents: UnverifiedOpponent[];
}

/**
 * One team's UNVERIFIED (ghost) opponents, deduped by opponent with a game count
 * and most-recent date. These are the teams to find on GameChanger and add.
 */
export async function getUnverifiedOpponents(teamId: string): Promise<TeamOpponentsView | null> {
  const oppSelect = { select: { id: true, name: true, slug: true, ageGroup: true, isGhost: true } };
  const t = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      slug: true,
      gcTeamId: true,
      ageGroup: true,
      homeGames: {
        where: { status: "FINAL" },
        select: { playedAt: true, awayTeam: oppSelect },
      },
      awayGames: {
        where: { status: "FINAL" },
        select: { playedAt: true, homeTeam: oppSelect },
      },
    },
  });
  if (!t) return null;

  const byOpp = new Map<string, UnverifiedOpponent>();
  const add = (opp: { id: string; name: string; slug: string; ageGroup: string | null; isGhost: boolean }, playedAt: Date) => {
    if (!opp.isGhost) return; // only unverified opponents
    const date = playedAt.toISOString().slice(0, 10);
    const cur = byOpp.get(opp.id);
    if (cur) {
      cur.games += 1;
      if (date > cur.lastPlayed) cur.lastPlayed = date;
    } else {
      byOpp.set(opp.id, {
        id: opp.id,
        name: opp.name,
        slug: opp.slug,
        ageGroup: opp.ageGroup,
        games: 1,
        lastPlayed: date,
      });
    }
  };
  for (const g of t.homeGames) add(g.awayTeam, g.playedAt);
  for (const g of t.awayGames) add(g.homeTeam, g.playedAt);

  const opponents = [...byOpp.values()].sort((a, b) => (a.lastPlayed < b.lastPlayed ? 1 : -1));
  return {
    team: { id: t.id, name: t.name, slug: t.slug, gcTeamId: t.gcTeamId, ageGroup: t.ageGroup },
    opponents,
  };
}
