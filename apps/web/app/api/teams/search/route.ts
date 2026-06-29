import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@nbr/db";
import { geocodeCity, haversineMiles } from "@nbr/core";

/**
 * Team typeahead/search. Used by the pool generator and the tournament-director
 * team-finder. Supports name search plus optional rating min/max and a "near"
 * city for distance-ordered results. Never returns scraped ghost opponents.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = p.get("q")?.trim() ?? "";
  const age = p.get("age")?.trim() || undefined;
  const classification = p.get("class")?.trim() || undefined;
  const ratingMin = numParam(p.get("ratingMin"));
  const ratingMax = numParam(p.get("ratingMax"));
  const near = p.get("near")?.trim() || undefined;
  const nearState = p.get("nearState")?.trim() || "UT";
  const maxMiles = numParam(p.get("maxMiles"));

  // Require at least one real filter so we don't dump the whole DB.
  if (q.length < 2 && ratingMin == null && ratingMax == null && !age && !classification && !near) {
    return NextResponse.json({ teams: [] });
  }

  const ratingBound: Prisma.FloatFilter = {};
  if (ratingMin != null) ratingBound.gte = ratingMin;
  if (ratingMax != null) ratingBound.lte = ratingMax;
  const hasRatingBound = ratingMin != null || ratingMax != null;

  const where: Prisma.TeamWhereInput = {
    isActive: true,
    isGhost: false,
    // Public tool: only classified teams (youth age group OR varsity class).
    ...(age
      ? { ageGroup: age as never }
      : classification
        ? { classification }
        : { OR: [{ ageGroup: { not: null } }, { classification: { not: null } }] }),
    ...(q.length >= 2 ? { name: { contains: q, mode: "insensitive" } } : {}),
    rating: hasRatingBound ? { is: { rating: ratingBound } } : { isNot: null },
  };

  const teams = await prisma.team.findMany({
    where,
    include: { rating: true, claim: { select: { status: true } } },
    take: 40,
    orderBy: { rating: { rating: "desc" } },
  });

  // Distance ordering when a "near" city is given and resolvable.
  const origin = near ? geocodeCity(near, nearState) : null;

  const rows = teams.map((t) => {
    const distanceMiles =
      origin && t.latitude != null && t.longitude != null
        ? haversineMiles(origin, { lat: t.latitude, lng: t.longitude })
        : null;
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      city: t.city,
      state: t.state,
      ageGroup: t.ageGroup,
      classification: t.classification,
      rating: t.rating ? Math.round(t.rating.rating) : null,
      isProvisional: t.rating?.isProvisional ?? true,
      hasApprovedClaim: t.claim?.status === "APPROVED",
      distanceMiles: distanceMiles == null ? null : Math.round(distanceMiles),
    };
  });

  // Optional hard distance cap (only meaningful when we have an origin).
  let out = rows;
  if (origin && maxMiles != null) {
    out = rows.filter((r) => r.distanceMiles != null && r.distanceMiles <= maxMiles);
  }

  // When ordering by distance, located teams first (nearest), then the rest.
  if (origin) {
    out = [...out].sort(
      (a, b) =>
        (a.distanceMiles ?? Number.POSITIVE_INFINITY) -
        (b.distanceMiles ?? Number.POSITIVE_INFINITY),
    );
  }

  return NextResponse.json({ teams: out, geocoded: !!origin });
}

function numParam(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
