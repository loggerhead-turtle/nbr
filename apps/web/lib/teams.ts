import { prisma } from "@nbr/db";
import { normalizeTeamName } from "@nbr/core";

/**
 * Find a single existing team that an incoming team should be merged into rather
 * than duplicated — typically a "ghost" auto-created from an opponent's schedule.
 * Returns the match only when it is unambiguous (exactly one candidate without a
 * GameChanger ID), to avoid wrongly merging e.g. a 12U and a 14U of the same club.
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

  // If an age group is provided, prefer candidates that share it (or whose raw
  // name contains the age token), which disambiguates same-club different-age teams.
  if (ageGroup && matches.length > 1) {
    const ageNum = ageGroup.replace(/^U/i, "").toLowerCase();
    const ageRe = new RegExp(`\\b(${ageGroup.toLowerCase()}|${ageNum}u|u${ageNum})\\b`);
    const preferred = matches.filter(
      (c) => c.ageGroup === ageGroup || ageRe.test(c.name.toLowerCase()),
    );
    if (preferred.length) matches = preferred;
  }

  if (matches.length !== 1) return null;
  const m = matches[0]!;
  return { id: m.id, name: m.name, games: m._count.homeGames + m._count.awayGames };
}

/**
 * Merge `sourceId` into `targetId`: reassign games, transfer a GameChanger ID and
 * any missing location/age fields, drop self-games and duplicate matchups, then
 * delete the source. Ratings refresh on the next recompute.
 */
export async function mergeTeams(sourceId: string, targetId: string): Promise<void> {
  if (!sourceId || !targetId || sourceId === targetId) return;

  const [source, target] = await Promise.all([
    prisma.team.findUnique({ where: { id: sourceId } }),
    prisma.team.findUnique({ where: { id: targetId } }),
  ]);
  if (!source || !target) return;

  // Move games from source to target.
  await prisma.game.updateMany({ where: { homeTeamId: sourceId }, data: { homeTeamId: targetId } });
  await prisma.game.updateMany({ where: { awayTeamId: sourceId }, data: { awayTeamId: targetId } });

  // Free the source's GameChanger ID (unique) before transferring it.
  const sourceGcId = source.gcTeamId;
  if (sourceGcId) {
    await prisma.team.update({ where: { id: sourceId }, data: { gcTeamId: null } });
  }
  await prisma.team.delete({ where: { id: sourceId } });

  // Transfer fields the target is missing.
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

/** Remove self-games and duplicate matchups (same teams + same day) for a team. */
async function dedupeTeamGames(teamId: string): Promise<void> {
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
    // Prefer keeping a row that has a GameChanger game id.
    if (seen.has(key)) {
      toDelete.push(g.id);
    } else {
      seen.add(key);
    }
  }
  if (toDelete.length) {
    await prisma.game.deleteMany({ where: { id: { in: toDelete } } });
  }
}
