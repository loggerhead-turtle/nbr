import Link from "next/link";
import { notFound } from "next/navigation";
import { getGhostDetail } from "@nbr/db";
import { NbrLink, GcLink } from "@/components/admin/team-links";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ghost provenance", robots: { index: false } };

export default async function GhostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await getGhostDetail(id);
  if (!team) notFound();

  return (
    <div>
      <Link href="/admin/ghosts" className="text-sm text-sky-600 hover:text-sky-800">
        ← Back to ghosts
      </Link>
      <h1 className="mt-2 mb-1 flex flex-wrap items-center gap-2 text-2xl font-black text-navy-900">
        {team.name}
        <span className="text-base font-medium text-slate-400">{team.ageGroup ?? "no age"}</span>
        <NbrLink slug={team.slug} />
      </h1>
      <div className="mb-5 max-w-3xl space-y-2 text-sm text-slate-600">
        <p>
          Every game below was created when the <strong>opponent&rsquo;s</strong> GameChanger
          schedule was scraped — the opponent listed this team as their opponent. So the{" "}
          <strong>opponent column is where each game came from.</strong> Click an opponent to see
          their side (on NBR or GameChanger) and identify which real team this row actually was in
          that game.
        </p>
        <p className="text-xs text-slate-400">
          {team.games.length} game(s). A ⚠️ on the opponent means it&rsquo;s itself a ghost.
        </p>
      </div>

      {team.games.length === 0 ? (
        <p className="text-sm text-slate-400">No games.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Opponent (source)</th>
                <th className="px-3 py-2 text-left font-semibold">Age</th>
                <th className="px-3 py-2 text-right font-semibold">Score</th>
                <th className="px-3 py-2 text-left font-semibold">Links</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {team.games.map((g) => (
                <tr key={g.gameId}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{g.date}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/teams/${g.opponentSlug}`}
                      className="font-medium text-sky-700 hover:underline"
                    >
                      {g.opponentName}
                    </Link>
                    {g.opponentIsGhost && (
                      <span title="opponent is itself a ghost" className="ml-1">
                        ⚠️
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{g.opponentAge ?? "?"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-navy-800">
                    {g.us}-{g.them}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex gap-1.5">
                      <NbrLink slug={g.opponentSlug} />
                      <GcLink gcTeamId={g.opponentGcTeamId} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
