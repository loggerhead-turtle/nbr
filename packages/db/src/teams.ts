import { normalizeTeamName } from "@nbr/core";
import { prisma } from "./index";

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
