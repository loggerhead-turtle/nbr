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
  const gap = Math.min(6, Math.max(1, Number(sp?.gap ?? "3") || 3));

  // One-year gaps include legitimate "play-ups", so demand a real cluster of
  // off-age games (not a stray one or two) before flagging at that threshold.
  const minOutliers = gap <= 1 ? 4 : 1;
  const findings = await findCrossAgeMergeArtifacts(gap, 3, minOutliers);
  // Serialize for the client (Dates → ISO day strings).
  const vm: FindingVM[] = findings.map((f) => ({
    teamId: f.teamId,
    teamName: f.teamName,
    teamAge: f.teamAge,
    gcTeamId: f.gcTeamId,
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
        {gap <= 1 && (
          <>
            {" "}
            <strong className="text-amber-700">
              At the 1-year threshold, expect false positives:
            </strong>{" "}
            teams legitimately play up a year, so inspect each one (only clusters of 4+ off-age
            games are shown) and open their GameChanger page before repairing.
          </>
        )}
      </p>
      <BadMergeReview findings={vm} gap={gap} />
    </div>
  );
}
