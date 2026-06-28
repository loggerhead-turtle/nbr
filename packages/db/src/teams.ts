import { normalizeTeamName, ageGroupFromName, teamSlug } from "@nbr/core";
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
): Promise<BadMergeFinding[]> {
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
      if (gap <= 1) ownCohortGames += 1;
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

    if (ownCohortGames >= minOwnCohort && outliers.length > 0) {
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
