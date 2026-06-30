/**
 * Delete ghost teams that have zero games — pure cruft left behind after a
 * reconcile prune removed their phantom games (or after an opponent was
 * re-resolved to a real team). Nothing references them, so this is always safe.
 * Intended to run right after `reconcile` with RECONCILE_APPLY=true.
 */
import { deleteOrphanGhosts, countOrphanGhosts } from "@nbr/db";

export async function runCleanGhosts(): Promise<void> {
  const before = await countOrphanGhosts();
  console.log(`[clean-ghosts] ${before} empty ghost team(s) with no games.`);
  if (before === 0) return;
  const { deleted } = await deleteOrphanGhosts();
  console.log(`[clean-ghosts] deleted ${deleted} empty ghost team(s).`);
}
