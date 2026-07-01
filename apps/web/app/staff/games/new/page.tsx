import { prisma } from "@nbr/db";
import { GameForm } from "@/components/admin/game-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add game", robots: { index: false } };

export default async function StaffNewGamePage() {
  const teams = await prisma.team.findMany({
    where: { isActive: true },
    select: { id: true, name: true, ageGroup: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-navy-900">Record a game manually</h1>
      <p className="mb-6 text-sm text-slate-500">
        Use this for games the scraper can&rsquo;t reach. Ratings update on the next recompute.
      </p>
      {teams.length < 2 ? (
        <div className="card p-6 text-sm text-slate-500">You need at least two teams first.</div>
      ) : (
        <GameForm teams={teams} />
      )}
    </div>
  );
}
