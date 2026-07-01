/**
 * Ghost cleanup, run as a background job (no request timeout, so it scales to
 * thousands of ghosts):
 *   1. merge DUPLICATE ghosts (same name + age) into one — the pile-up repeated
 *      scrapes created;
 *   2. delete EMPTY ghosts (zero games) — cruft left after reconcile prunes.
 * Safe: only ghost rows are touched; ghost games are excluded from ratings.
 */
import { mergeDuplicateGhosts, deleteOrphanGhosts, countOrphanGhosts } from "@nbr/db";

export async function runCleanGhosts(): Promise<void> {
  const merge = await mergeDuplicateGhosts();
  console.log(
    `[clean-ghosts] merged ${merge.removed} duplicate ghost(s) across ${merge.groups} name group(s).`,
  );

  const before = await countOrphanGhosts();
  console.log(`[clean-ghosts] ${before} empty ghost team(s) with no games.`);
  if (before > 0) {
    const { deleted } = await deleteOrphanGhosts();
    console.log(`[clean-ghosts] deleted ${deleted} empty ghost team(s).`);
  }
  console.log("[clean-ghosts] done.");
}
