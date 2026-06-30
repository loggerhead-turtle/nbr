import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nbr/db";
import { pairKey } from "@nbr/core";

/**
 * Read-only head-to-head counts among a set of teams: how many FINAL games each
 * pair has already played. Used by the pool generator (incl. the demo) to flag
 * rematches. Strictly a read — it never writes, so the demo can pull real game
 * history from the live DB without persisting anything.
 *
 * GET /api/teams/head-to-head?ids=a,b,c  →  { pastGames: { "a|b": 2, ... } }
 */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 300);

  const pastGames: Record<string, number> = {};
  if (ids.length >= 2) {
    try {
      const games = await prisma.game.findMany({
        where: { status: "FINAL", homeTeamId: { in: ids }, awayTeamId: { in: ids } },
        select: { homeTeamId: true, awayTeamId: true },
      });
      for (const g of games) {
        const k = pairKey(g.homeTeamId, g.awayTeamId);
        pastGames[k] = (pastGames[k] ?? 0) + 1;
      }
    } catch {
      // DB unavailable — return no rematches rather than failing the request.
    }
  }
  return NextResponse.json({ pastGames });
}
