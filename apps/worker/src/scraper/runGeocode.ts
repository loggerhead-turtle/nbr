/**
 * One-time / occasional backfill: geocode every team that has a city but no
 * coordinates yet, so the scrimmage finder can match by distance. Respects the
 * admin location lock and is safe to re-run (only fills missing coords).
 */
import { prisma } from "@nbr/db";
import { geocodeCity } from "@nbr/core";

export async function runGeocode(): Promise<void> {
  const teams = await prisma.team.findMany({
    where: { latitude: null, locationLocked: false, city: { not: null } },
    select: { id: true, name: true, city: true, state: true, zip: true },
  });
  console.log(`[geocode] ${teams.length} team(s) with a city but no coordinates.`);

  let located = 0;
  let missed = 0;
  const missing = new Map<string, number>();

  for (const t of teams) {
    const geo = geocodeCity(t.city, t.state, t.zip);
    if (geo) {
      await prisma.team.update({
        where: { id: t.id },
        data: { latitude: geo.lat, longitude: geo.lng },
      });
      located += 1;
    } else {
      missed += 1;
      const k = `${t.city}, ${t.state}`;
      missing.set(k, (missing.get(k) ?? 0) + 1);
    }
  }

  if (missing.size > 0) {
    const top = [...missing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    console.log("[geocode] cities not in the centroid table (add them to packages/core/src/geo.ts):");
    for (const [city, n] of top) console.log(`  ${n}× ${city}`);
  }

  console.log(`[geocode] done. located=${located} unmatched=${missed}`);
}
