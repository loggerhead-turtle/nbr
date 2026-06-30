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

/** Count exact shared matchups (same opponent team + same day) between two teams. */
async function sharedMatchupCount(aId: string, bId: string): Promise<number> {
  const keysFor = async (teamId: string, otherId: string) => {
    const games = await prisma.game.findMany({
      where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      select: { homeTeamId: true, awayTeamId: true, playedAt: true },
      take: 500,
    });
    const keys = new Set<string>();
    for (const g of games) {
      const oppId = g.homeTeamId === teamId ? g.awayTeamId : g.homeTeamId;
      if (oppId === otherId) continue; // games directly against each other don't count
      keys.add(`${oppId}|${g.playedAt.toISOString().slice(0, 10)}`);
    }
    return keys;
  };
  const [ka, kb] = await Promise.all([keysFor(aId, bId), keysFor(bId, aId)]);
  let n = 0;
  for (const k of ka) if (kb.has(k)) n += 1;
  return n;
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
  targetCity: string | null;
  targetState: string | null;
  targetGcTeamId: string | null;
  score: MergeScore;
}

export interface GhostTeamWithSuggestions {
  id: string;
  name: string;
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
      const [shared, ghostRegion, targetRegion] = await Promise.all([
        sharedMatchupCount(g.id, c.id),
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
        sharedGameCount: shared,
        regionStatesA: ghostRegion,
        regionStatesB: targetRegion,
      });
      suggestions.push({
        targetId: c.id,
        targetName: c.name,
        targetCity: c.city,
        targetState: c.state,
        targetGcTeamId: c.gcTeamId,
        score,
      });
    }
    suggestions.sort((a, b) => b.score.score - a.score.score);

    results.push({
      id: g.id,
      name: g.name,
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
  teamAge: number;
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
      ageGroup: true,
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
        teamAge,
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
export async function dedupeTeamGames(teamId: string): Promise<void> {
  const games = await prisma.game.findMany({
    where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    orderBy: { createdAt: "asc" },
  });

  const seen = new Set<string>();
  const toDelete: string[] = [];
  for (const g of games) {
    if (g.homeTeamId === g.awayTeamId) {
      toDelete.push(g.id);
      continue;
    }
    const day = g.playedAt.toISOString().slice(0, 10);
    const key = `${g.homeTeamId}|${g.awayTeamId}|${day}`;
    if (seen.has(key)) toDelete.push(g.id);
    else seen.add(key);
  }
  if (toDelete.length) {
    await prisma.game.deleteMany({ where: { id: { in: toDelete } } });
  }
}
