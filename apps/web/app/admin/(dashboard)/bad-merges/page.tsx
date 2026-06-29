import { findCrossAgeMergeArtifacts } from "@nbr/db";
import { BadMergeReview, type FindingVM } from "@/components/admin/bad-merge-review";

export const dynamic = "force-dynamic";
export const metadata = { title: "Repair bad merges", robots: { index: false } };

export default async function BadMergesPage({
  searchParams,
}: {
  searchParams: Promise<{ gap?: string }>;
}) {
  const sp = await searchParams;
  const gap = Math.max(2, Number(sp?.gap ?? "3") || 3);

  const findings = await findCrossAgeMergeArtifacts(gap);
  // Serialize for the client (Dates → ISO day strings).
  const vm: FindingVM[] = findings.map((f) => ({
    teamId: f.teamId,
    teamName: f.teamName,
    teamAge: f.teamAge,
    ownCohortGames: f.ownCohortGames,
    outliers: f.outliers.map((o) => ({
      gameId: o.gameId,
      opponentName: o.opponentName,
      opponentAge: o.opponentAge,
      gap: o.gap,
      date: o.playedAt.toISOString().slice(0, 10),
    })),
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-navy-900">Repair bad merges</h1>
      <p className="mb-6 max-w-2xl text-sm text-slate-500">
        Teams whose schedule contains games against opponents <strong>{gap}+ age years</strong> away
        — the signature of an old cross-age-group merge (e.g. an 11U team carrying 14U games).
        Repairing moves those off-age games onto a regenerated ghost at the opponent&rsquo;s age,
        leaving the real team with only its own schedule, then triggers a ratings recompute. Review
        before applying. Lower the threshold to catch closer mismatches.
      </p>
      <BadMergeReview findings={vm} gap={gap} />
    </div>
  );
}
