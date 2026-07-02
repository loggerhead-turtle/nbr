/**
 * Duplicate backlog merge, run as a background job (no request timeout, so it
 * scales to tens of thousands of pairs). Folds every duplicate pair whose merge
 * confidence is at or above the given threshold into its kept record, logging
 * each merge to the run so an admin can watch and audit it on the Duplicates
 * backlog page.
 *
 *   node src/index.ts merge-duplicates <minPct> [runId]
 *
 * When the web app starts a run it creates the run row and passes its id here;
 * called without one (manual CLI use) a fresh run is created.
 */
import {
  createDuplicateMergeRun,
  finishDuplicateMergeRun,
  mergeDuplicateBacklog,
} from "@nbr/db";
import { runRecompute } from "../ratings/runRecompute.js";

export async function runMergeDuplicates(minPctArg?: string, runIdArg?: string): Promise<void> {
  const minPct = Math.max(1, Math.min(100, Math.round(Number(minPctArg) || 100)));
  let runId = runIdArg && /^[a-z0-9]+$/i.test(runIdArg) ? runIdArg : undefined;
  if (!runId) {
    const run = await createDuplicateMergeRun(minPct);
    runId = run.id;
  }

  console.log(`[merge-duplicates] run ${runId}: merging duplicates at >= ${minPct}% confidence…`);
  try {
    const { merged, rounds } = await mergeDuplicateBacklog({ minPct, runId });
    await finishDuplicateMergeRun(runId, { status: "SUCCESS", merged });
    console.log(`[merge-duplicates] done: merged ${merged} pair(s) over ${rounds} round(s).`);

    // Merges change the game graph, so refresh ratings once at the end.
    if (merged > 0) {
      console.log("[merge-duplicates] recomputing ratings…");
      await runRecompute();
    }
  } catch (err) {
    await finishDuplicateMergeRun(runId, { status: "FAILED", error: String(err) }).catch(() => {});
    throw err;
  }
}
