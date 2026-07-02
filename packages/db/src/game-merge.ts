import { prisma } from "./index";

// ─────────────────────────────────────────────────────────────────────────────
// Game merge queue
//
// A same-day matchup where the two teams' schedules disagree on how many games
// they played each other (e.g. one lists a doubleheader, the other lists a single
// game). The scraper can't tell a real doubleheader from a game that was entered
// twice but played once — completed GameChanger games carry no time — so instead
// of guessing it parks the matchup here (GameMergeCandidate) for a human to
// resolve. This is deliberately separate from the team Duplicates page: the two
// records are NOT the same team, so a differing game count must not be read as
// evidence to merge the teams.
// ─────────────────────────────────────────────────────────────────────────────

const GC_TEAM_URL = (gcTeamId: string) => `https://web.gc.com/teams/${gcTeamId}/schedule`;

export interface GameMergeSide {
  id: string;
  name: string;
  slug: string;
  isGhost: boolean;
  gcTeamId: string | null;
  /** Link to this team's GameChanger schedule (null when it has no GC id). */
  scheduleUrl: string | null;
  /** How many games this side's own schedule lists for the matchup that day. */
  count: number;
}

export interface GameMergeStoredGame {
  id: string;
  /** Score from side A's perspective. */
  aScore: number | null;
  bScore: number | null;
  /** The team whose scrape produced this row (null for manual/legacy). */
  sourceTeamId: string | null;
}

export interface GameMergeCandidateView {
  id: string;
  day: string;
  a: GameMergeSide;
  b: GameMergeSide;
  /** The game rows currently stored between the two teams that day. */
  games: GameMergeStoredGame[];
}

/** Open (unresolved) game-count conflicts, newest first. */
export async function getOpenGameMergeCandidates(limit = 60): Promise<GameMergeCandidateView[]> {
  const rows = await prisma.gameMergeCandidate.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const out: GameMergeCandidateView[] = [];
  for (const c of rows) {
    const [a, b] = await Promise.all([
      prisma.team.findUnique({
        where: { id: c.teamIdA },
        select: { id: true, name: true, slug: true, isGhost: true, gcTeamId: true },
      }),
      prisma.team.findUnique({
        where: { id: c.teamIdB },
        select: { id: true, name: true, slug: true, isGhost: true, gcTeamId: true },
      }),
    ]);
    if (!a || !b) continue; // a team was deleted/merged since — the conflict is moot
    const dayStart = new Date(`${c.day}T00:00:00.000Z`);
    const dayEnd = new Date(`${c.day}T23:59:59.999Z`);
    const games = await prisma.game.findMany({
      where: {
        playedAt: { gte: dayStart, lte: dayEnd },
        OR: [
          { homeTeamId: c.teamIdA, awayTeamId: c.teamIdB },
          { homeTeamId: c.teamIdB, awayTeamId: c.teamIdA },
        ],
      },
      select: {
        id: true,
        homeTeamId: true,
        homeScore: true,
        awayScore: true,
        sourceTeamId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    out.push({
      id: c.id,
      day: c.day,
      a: {
        id: a.id,
        name: a.name,
        slug: a.slug,
        isGhost: a.isGhost,
        gcTeamId: a.gcTeamId,
        scheduleUrl: a.gcTeamId ? GC_TEAM_URL(a.gcTeamId) : null,
        count: c.countA,
      },
      b: {
        id: b.id,
        name: b.name,
        slug: b.slug,
        isGhost: b.isGhost,
        gcTeamId: b.gcTeamId,
        scheduleUrl: b.gcTeamId ? GC_TEAM_URL(b.gcTeamId) : null,
        count: c.countB,
      },
      games: games.map((g) => ({
        id: g.id,
        aScore: g.homeTeamId === c.teamIdA ? g.homeScore : g.awayScore,
        bScore: g.homeTeamId === c.teamIdA ? g.awayScore : g.homeScore,
        sourceTeamId: g.sourceTeamId,
      })),
    });
  }
  return out;
}

/** Badge count for the admin nav. */
export async function countOpenGameMergeCandidates(): Promise<number> {
  try {
    return await prisma.gameMergeCandidate.count({ where: { status: "open" } });
  } catch {
    return 0;
  }
}

export type GameMergeResolution = "doubleheader" | "single" | "dismiss";

/**
 * Resolve one conflict:
 *   - "doubleheader": the games are real. Keep the larger side's leg set (its
 *     authoritative count, grouped by Game.sourceTeamId) and drop the other
 *     side's duplicate copies — so a 2-vs-1 conflict settles at 2, not 3.
 *   - "single": it was one game entered twice — collapse the stored rows for that
 *     matchup+day to a single representative (prefer a verified opponent, then the
 *     earliest), deleting the rest.
 *   - "dismiss": take no action on the games, just close the item.
 * Returns the number of duplicate game rows deleted. Recompute ratings after a
 * "single" or "doubleheader" collapse (the game graph changed).
 */
export async function resolveGameMergeCandidate(
  id: string,
  resolution: GameMergeResolution,
): Promise<number> {
  const c = await prisma.gameMergeCandidate.findUnique({ where: { id } });
  if (!c) return 0;

  let deleted = 0;
  if (resolution === "single" || resolution === "doubleheader") {
    const dayStart = new Date(`${c.day}T00:00:00.000Z`);
    const dayEnd = new Date(`${c.day}T23:59:59.999Z`);
    const games = await prisma.game.findMany({
      where: {
        playedAt: { gte: dayStart, lte: dayEnd },
        OR: [
          { homeTeamId: c.teamIdA, awayTeamId: c.teamIdB },
          { homeTeamId: c.teamIdB, awayTeamId: c.teamIdA },
        ],
      },
      select: {
        id: true,
        homeTeamId: true,
        createdAt: true,
        sourceTeamId: true,
        homeTeam: { select: { isGhost: true } },
        awayTeam: { select: { isGhost: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const ghosty = (g: (typeof games)[number]) => (g.homeTeam.isGhost || g.awayTeam.isGhost ? 1 : 0);

    let keepIds: Set<string>;
    if (resolution === "single") {
      // Keep one representative: verified opponent first, then earliest.
      const sorted = [...games].sort((x, y) => {
        if (ghosty(x) !== ghosty(y)) return ghosty(x) - ghosty(y);
        return x.createdAt < y.createdAt ? -1 : 1;
      });
      keepIds = new Set(sorted.slice(0, 1).map((g) => g.id));
    } else {
      // Keep the largest single-source leg set (the authoritative doubleheader).
      const bySource = new Map<string, typeof games>();
      for (const g of games) {
        if (!g.sourceTeamId) continue;
        (bySource.get(g.sourceTeamId) ?? bySource.set(g.sourceTeamId, []).get(g.sourceTeamId)!).push(g);
      }
      if (bySource.size > 0) {
        const best = [...bySource.values()].sort((a, b) => {
          if (a.length !== b.length) return b.length - a.length;
          if (ghosty(a[0]!) !== ghosty(b[0]!)) return ghosty(a[0]!) - ghosty(b[0]!);
          return a[0]!.createdAt < b[0]!.createdAt ? -1 : 1;
        })[0]!;
        keepIds = new Set(best.map((g) => g.id));
      } else {
        // No sourced rows to reason about — keep everything as-is.
        keepIds = new Set(games.map((g) => g.id));
      }
    }

    const drop = games.filter((g) => !keepIds.has(g.id)).map((g) => g.id);
    if (drop.length) {
      await prisma.game.deleteMany({ where: { id: { in: drop } } });
      deleted = drop.length;
    }
  }

  await prisma.gameMergeCandidate.update({
    where: { id },
    data: { status: "resolved", resolvedAt: new Date() },
  });
  return deleted;
}
