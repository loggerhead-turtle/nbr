import { prisma, Prisma } from "@nbr/db";

export interface RatingRow {
  teamId: string;
  slug: string;
  name: string;
  city: string | null;
  state: string;
  ageGroup: string | null;
  classification: string | null;
  isGhost: boolean;
  hasApprovedClaim: boolean;
  rating: number;
  rd: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  isProvisional: boolean;
}

export interface RatingsQuery {
  search?: string;
  ageGroup?: string;
  classification?: string;
  includeProvisional?: boolean;
  sort?: "rating" | "name" | "games";
  page?: number;
  pageSize?: number;
}

export async function getRatings(q: RatingsQuery = {}): Promise<{
  rows: RatingRow[];
  total: number;
}> {
  const pageSize = q.pageSize ?? 50;
  const page = Math.max(1, q.page ?? 1);

  const where: Prisma.TeamWhereInput = {
    isActive: true,
    rating: { isNot: null },
    // Public side requires a classification: a youth age group OR a varsity class.
    // Unclassified teams are admin-only.
    OR: [{ ageGroup: { not: null } }, { classification: { not: null } }],
  };
  if (q.search) {
    where.name = { contains: q.search, mode: "insensitive" };
  }
  if (q.ageGroup) {
    where.ageGroup = q.ageGroup as Prisma.TeamWhereInput["ageGroup"];
    delete where.OR;
  }
  if (q.classification) {
    where.classification = q.classification;
    delete where.OR;
  }
  if (!q.includeProvisional) {
    where.rating = { is: { isProvisional: false } };
  }

  const orderBy: Prisma.TeamOrderByWithRelationInput =
    q.sort === "name"
      ? { name: "asc" }
      : q.sort === "games"
        ? { rating: { gamesPlayed: "desc" } }
        : { rating: { rating: "desc" } };

  try {
    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        orderBy,
        include: { rating: true, claim: { select: { status: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.team.count({ where }),
    ]);

    const rows: RatingRow[] = teams
      .filter((t) => t.rating)
      .map((t) => ({
        teamId: t.id,
        slug: t.slug,
        name: t.name,
        city: t.city,
        state: t.state,
        ageGroup: t.ageGroup,
        classification: t.classification,
        isGhost: t.isGhost,
        hasApprovedClaim: t.claim?.status === "APPROVED",
        rating: t.rating!.rating,
        rd: t.rating!.rd,
        gamesPlayed: t.rating!.gamesPlayed,
        wins: t.rating!.wins,
        losses: t.rating!.losses,
        ties: t.rating!.ties,
        isProvisional: t.rating!.isProvisional,
      }));

    return { rows, total };
  } catch {
    // DB unavailable (e.g. during a build with no database): render empty.
    return { rows: [], total: 0 };
  }
}

export async function getTeamBySlug(slug: string) {
  return prisma.team.findUnique({
    where: { slug },
    include: {
      rating: true,
      claim: { include: { user: true } },
      ratingHistory: { orderBy: { asOf: "asc" } },
      homeGames: {
        where: { status: "FINAL" },
        include: { awayTeam: true },
        orderBy: { playedAt: "desc" },
        take: 25,
      },
      awayGames: {
        where: { status: "FINAL" },
        include: { homeTeam: true },
        orderBy: { playedAt: "desc" },
        take: 25,
      },
    },
  });
}

/**
 * Walk the succession chain (newest team's predecessors) to build a season-by-
 * season website history. Each prior season had its own GameChanger team page.
 */
export async function getTeamSeasonHistory(
  predecessorTeamId: string | null,
): Promise<{ id: string; name: string; slug: string; gcTeamId: string | null; website: string | null; seasonYear: number | null }[]> {
  const out: { id: string; name: string; slug: string; gcTeamId: string | null; website: string | null; seasonYear: number | null }[] = [];
  let cursor = predecessorTeamId;
  let guard = 0;
  while (cursor && guard < 15) {
    const t = await prisma.team.findUnique({
      where: { id: cursor },
      select: { id: true, name: true, slug: true, gcTeamId: true, website: true, seasonYear: true, predecessorTeamId: true },
    });
    if (!t) break;
    out.push({ id: t.id, name: t.name, slug: t.slug, gcTeamId: t.gcTeamId, website: t.website, seasonYear: t.seasonYear });
    cursor = t.predecessorTeamId;
    guard += 1;
  }
  return out;
}

export interface MapPoint {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  tier: "green" | "gray" | "ghost";
}

/** Located teams for the map, plus summary counts (verified / coached / etc.). */
export async function getTeamMapData(): Promise<{
  points: MapPoint[];
  counts: { verified: number; coached: number; ghost: number; unlocatedVerified: number };
}> {
  try {
    const located = await prisma.team.findMany({
      where: { isActive: true, latitude: { not: null }, longitude: { not: null } },
      select: {
        slug: true,
        name: true,
        latitude: true,
        longitude: true,
        isGhost: true,
        claim: { select: { status: true } },
      },
    });

    const points: MapPoint[] = located.map((t) => ({
      slug: t.slug,
      name: t.name,
      lat: t.latitude!,
      lng: t.longitude!,
      tier: t.isGhost ? "ghost" : t.claim?.status === "APPROVED" ? "green" : "gray",
    }));

    const verified = points.filter((p) => p.tier !== "ghost").length;
    const coached = points.filter((p) => p.tier === "green").length;
    const ghost = points.filter((p) => p.tier === "ghost").length;

    // Verified teams we couldn't place yet (no coordinates).
    const unlocatedVerified = await prisma.team.count({
      where: { isActive: true, isGhost: false, OR: [{ latitude: null }, { longitude: null }] },
    });

    return { points, counts: { verified, coached, ghost, unlocatedVerified } };
  } catch {
    return { points: [], counts: { verified: 0, coached: 0, ghost: 0, unlocatedVerified: 0 } };
  }
}

export async function getAllTeamSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  return prisma.team.findMany({
    where: {
      isActive: true,
      OR: [{ ageGroup: { not: null } }, { classification: { not: null } }],
    },
    select: { slug: true, updatedAt: true },
  });
}

/** Rank within the comparable set (non-provisional, same component) for display. */
export async function getTeamRank(teamId: string, rating: number): Promise<number | null> {
  const team = await prisma.rating.findUnique({ where: { teamId } });
  if (!team || team.isProvisional) return null;
  const better = await prisma.rating.count({
    where: { isProvisional: false, rating: { gt: rating } },
  });
  return better + 1;
}
