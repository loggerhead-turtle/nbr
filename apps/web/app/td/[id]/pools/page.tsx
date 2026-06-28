import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@nbr/db";
import { generatePools, type PoolTeam } from "@nbr/core";
import { getCurrentUser } from "@/lib/user-auth";
import { PoolResultView } from "@/components/pool-result";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournament pools", robots: { index: false } };

export default async function TournamentPoolsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pools?: string }>;
}) {
  const { id } = await params;
  const { pools: poolsParam } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/td/${id}/pools`);

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      invites: {
        where: { status: "ACCEPTED" },
        include: { team: { include: { rating: true } } },
      },
    },
  });
  if (!tournament) notFound();
  if (tournament.directorUserId !== user.id) redirect("/td");

  const teams: PoolTeam[] = tournament.invites.map((inv) => ({
    id: inv.teamId,
    name: inv.team.name,
    rating: inv.team.rating?.rating ?? 1500,
    isProvisional: inv.team.rating?.isProvisional ?? true,
  }));

  const maxPools = Math.max(2, teams.length);
  let numPools = Number(poolsParam) || Math.min(4, Math.max(2, Math.floor(teams.length / 3)));
  numPools = Math.min(Math.max(2, numPools), Math.min(maxPools, 16));

  const result = teams.length >= 2 ? generatePools(teams, numPools) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="no-print">
        <Link href={`/td/${tournament.id}`} className="text-sm text-navy-700 hover:underline">
          ← Back to {tournament.name}
        </Link>
        <h1 className="mt-2 text-2xl font-black text-navy-900">{tournament.name} — Pools</h1>
        {teams.length < 2 ? (
          <p className="mt-3 text-slate-600">Accept at least two teams to generate pools.</p>
        ) : (
          <form method="get" className="mt-4 flex items-end gap-2">
            <div>
              <label className="label">Number of pools</label>
              <input
                name="pools"
                type="number"
                min={2}
                max={Math.min(maxPools, 16)}
                defaultValue={numPools}
                className="input w-28"
              />
            </div>
            <button className="btn-primary">Update</button>
          </form>
        )}
      </div>

      {result && (
        <div className="mt-6">
          <PoolResultView result={result} name={tournament.name} />
        </div>
      )}
    </div>
  );
}
