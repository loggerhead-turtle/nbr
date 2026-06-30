import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma, Prisma } from "@nbr/db";
import { generatePools, poolGenerateSchema, pairKey, type PoolTeam } from "@nbr/core";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = poolGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const { teams, numPools, name, balanceWeight, rematchWeight, locationWeight } = parsed.data;
  if (numPools > teams.length) {
    return NextResponse.json(
      { error: `Cannot make ${numPools} pools from ${teams.length} teams.` },
      { status: 400 },
    );
  }

  // Enrich real (DB-backed) teams with locations + head-to-head history so the
  // generator can report rematches and (with weights) re-pool to avoid them.
  const ids = teams.map((t) => t.id);
  const pastGames: Record<string, number> = {};
  let enriched: PoolTeam[] = teams;
  try {
    const [dbTeams, games] = await Promise.all([
      prisma.team.findMany({
        where: { id: { in: ids } },
        select: { id: true, latitude: true, longitude: true, state: true },
      }),
      prisma.game.findMany({
        where: { status: "FINAL", homeTeamId: { in: ids }, awayTeamId: { in: ids } },
        select: { homeTeamId: true, awayTeamId: true },
      }),
    ]);
    const locById = new Map(dbTeams.map((t) => [t.id, t] as const));
    enriched = teams.map((t) => {
      const l = locById.get(t.id);
      return { ...t, lat: l?.latitude ?? null, lng: l?.longitude ?? null, state: l?.state ?? null };
    });
    for (const g of games) {
      const k = pairKey(g.homeTeamId, g.awayTeamId);
      pastGames[k] = (pastGames[k] ?? 0) + 1;
    }
  } catch {
    // DB unavailable — fall back to ratings-only pooling.
  }

  const result = generatePools(enriched, numPools, {
    pastGames,
    balanceWeight,
    rematchWeight,
    locationWeight,
  });

  const save = new URL(req.url).searchParams.get("save") === "1";
  let token: string | null = null;
  if (save) {
    token = randomBytes(9).toString("base64url");
    await prisma.tournamentPool.create({
      data: {
        token,
        name: name ?? null,
        numPools,
        config: { teams, name } as unknown as Prisma.InputJsonValue,
        result: result as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return NextResponse.json({ result, token });
}
