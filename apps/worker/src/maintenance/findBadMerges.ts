/**
 * Detect (and optionally repair) cross-age-group merge artifacts.
 *
 * The scraper used to merge any same-base-name ghost into a freshly enriched
 * team without checking age — normalizeTeamName strips "11U"/"14U", so a stray
 * "MBA Navy 14U" ghost collapsed into the real "MBA Navy 11U" and dragged its
 * 14U opponents along. findPromotableTeam now refuses cross-age merges; this
 * command cleans up the damage already in the database.
 *
 *   node src/index.ts find-bad-merges            # report only (dry run)
 *   node src/index.ts find-bad-merges --gap=2    # widen the suspicion threshold
 *   node src/index.ts find-bad-merges --apply    # actually split the games off
 *
 * Repair moves each off-age game onto a regenerated ghost at the opponent's age,
 * leaving the real team with only its own-cohort schedule. Re-run `recompute`
 * afterwards to refresh ratings. Always review a dry run before using --apply.
 */
import { findCrossAgeMergeArtifacts, repairCrossAgeMerge } from "@nbr/db";

export async function runFindBadMerges(argv: string[] = []): Promise<void> {
  const apply = argv.includes("--apply");
  const gapArg = argv.find((a) => a.startsWith("--gap="));
  const minGap = gapArg ? Math.max(2, Number(gapArg.split("=")[1]) || 3) : 3;

  const findings = await findCrossAgeMergeArtifacts(minGap);
  findings.sort((a, b) => b.outliers.length - a.outliers.length);

  const totalGames = findings.reduce((n, f) => n + f.outliers.length, 0);
  console.log(
    `[bad-merges] ${findings.length} polluted team(s), ${totalGames} off-age game(s) ` +
      `(opponent ≥ ${minGap} age years away). ${apply ? "APPLYING repair." : "Dry run — pass --apply to fix."}`,
  );

  for (const f of findings) {
    console.log(
      `\n  ${f.teamName} (U${f.teamAge}) — ${f.ownCohortGames} own-cohort game(s), ` +
        `${f.outliers.length} off-age:`,
    );
    for (const o of f.outliers) {
      const day = o.playedAt.toISOString().slice(0, 10);
      console.log(`    ${day}  vs ${o.opponentName} (U${o.opponentAge}, gap ${o.gap})`);
    }
    if (apply) {
      const moved = await repairCrossAgeMerge(f);
      console.log(`    → moved ${moved} game(s) onto regenerated ghost(s).`);
    }
  }

  if (apply && findings.length > 0) {
    console.log("\n[bad-merges] done. Re-run `recompute` to refresh ratings.");
  }
}
