import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nbr/db";

/** Typeahead for the pool generator: returns teams with their current rating. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const age = req.nextUrl.searchParams.get("age")?.trim() || undefined;
  if (q.length < 2) return NextResponse.json({ teams: [] });

  const teams = await prisma.team.findMany({
    where: {
      isActive: true,
      // Public tool: only classified teams.
      ageGroup: age ? (age as never) : { not: null },
      name: { contains: q, mode: "insensitive" },
    },
    include: { rating: true },
    take: 12,
    orderBy: { rating: { rating: "desc" } },
  });

  return NextResponse.json({
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      city: t.city,
      ageGroup: t.ageGroup,
      rating: t.rating ? Math.round(t.rating.rating) : null,
      isProvisional: t.rating?.isProvisional ?? true,
    })),
  });
}
