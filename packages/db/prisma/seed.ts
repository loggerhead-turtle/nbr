/**
 * Seed a small set of Utah teams and games so the rating engine, public pages,
 * and pool generator are demonstrable without the scraper. Idempotent: re-runs
 * upsert by slug / dedup key.
 */
import { PrismaClient, GameStatus, GameSource, AgeGroup } from "@prisma/client";

const prisma = new PrismaClient();

type SeedTeam = {
  slug: string;
  name: string;
  city: string;
  ageGroup: AgeGroup;
};

const TEAMS: SeedTeam[] = [
  { slug: "slc-thunder-12u", name: "SLC Thunder", city: "Salt Lake City", ageGroup: AgeGroup.U12 },
  { slug: "provo-pioneers-12u", name: "Provo Pioneers", city: "Provo", ageGroup: AgeGroup.U12 },
  { slug: "ogden-raptors-12u", name: "Ogden Raptors", city: "Ogden", ageGroup: AgeGroup.U12 },
  { slug: "lehi-lightning-12u", name: "Lehi Lightning", city: "Lehi", ageGroup: AgeGroup.U12 },
  { slug: "stgeorge-storm-12u", name: "St. George Storm", city: "St. George", ageGroup: AgeGroup.U12 },
  { slug: "logan-loggers-12u", name: "Logan Loggers", city: "Logan", ageGroup: AgeGroup.U12 },
  { slug: "draper-dragons-12u", name: "Draper Dragons", city: "Draper", ageGroup: AgeGroup.U12 },
  { slug: "sandy-sluggers-12u", name: "Sandy Sluggers", city: "Sandy", ageGroup: AgeGroup.U12 },
];

// [homeSlug, awaySlug, homeScore, awayScore, daysAgo]
const GAMES: [string, string, number, number, number][] = [
  ["slc-thunder-12u", "provo-pioneers-12u", 7, 3, 40],
  ["slc-thunder-12u", "ogden-raptors-12u", 5, 4, 33],
  ["provo-pioneers-12u", "lehi-lightning-12u", 6, 2, 31],
  ["ogden-raptors-12u", "logan-loggers-12u", 8, 1, 28],
  ["lehi-lightning-12u", "draper-dragons-12u", 3, 5, 26],
  ["slc-thunder-12u", "lehi-lightning-12u", 9, 2, 21],
  ["stgeorge-storm-12u", "sandy-sluggers-12u", 4, 4, 20],
  ["draper-dragons-12u", "provo-pioneers-12u", 5, 6, 18],
  ["ogden-raptors-12u", "slc-thunder-12u", 2, 6, 14],
  ["logan-loggers-12u", "sandy-sluggers-12u", 3, 7, 13],
  ["provo-pioneers-12u", "stgeorge-storm-12u", 8, 5, 11],
  ["sandy-sluggers-12u", "draper-dragons-12u", 4, 6, 9],
  ["slc-thunder-12u", "stgeorge-storm-12u", 10, 0, 7],
  ["lehi-lightning-12u", "logan-loggers-12u", 5, 5, 6],
  ["draper-dragons-12u", "ogden-raptors-12u", 7, 4, 4],
  ["provo-pioneers-12u", "sandy-sluggers-12u", 6, 3, 2],
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(18, 0, 0, 0);
  return d;
}

async function main() {
  const idBySlug = new Map<string, string>();

  for (const t of TEAMS) {
    const team = await prisma.team.upsert({
      where: { slug: t.slug },
      update: { name: t.name, city: t.city, ageGroup: t.ageGroup, state: "UT" },
      create: {
        slug: t.slug,
        name: t.name,
        city: t.city,
        ageGroup: t.ageGroup,
        state: "UT",
      },
    });
    idBySlug.set(t.slug, team.id);
  }

  for (const [homeSlug, awaySlug, hs, as, ago] of GAMES) {
    const homeTeamId = idBySlug.get(homeSlug)!;
    const awayTeamId = idBySlug.get(awaySlug)!;
    const playedAt = daysAgo(ago);

    // Advisory dedup: skip if a same-day game between the same teams exists.
    const existing = await prisma.game.findFirst({
      where: { homeTeamId, awayTeamId, playedAt },
    });
    if (existing) continue;

    await prisma.game.create({
      data: {
        homeTeamId,
        awayTeamId,
        homeScore: hs,
        awayScore: as,
        status: GameStatus.FINAL,
        source: GameSource.MANUAL,
        playedAt,
      },
    });
  }

  console.log(
    `Seeded ${TEAMS.length} teams and ${GAMES.length} games. Run the worker recompute to generate ratings.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
