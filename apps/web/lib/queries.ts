import { prisma, Prisma } from "@nbr/db";

export interface RatingRow {
  teamId: string;
  slug: string;
  name: string;
  city: string | null;
  state: string;
  ageGroup: string | null;
  isGhost: boolean;
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
  };
  if (q.search) {
    where.name = { contains: q.search, mode: "insensitive" };
  }
  if (q.ageGroup) {
    where.ageGroup = q.ageGroup as Prisma.TeamWhereInput["ageGroup"];
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
        include: { rating: true },
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
        isGhost: t.isGhost,
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

export async function getAllTeamSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  return prisma.team.findMany({
    where: { isActive: true },
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
