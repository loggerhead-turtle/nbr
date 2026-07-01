import {
  getGhostTeamsWithSuggestions,
  countExactNameGhostMatches,
  countOrphanGhosts,
} from "@nbr/db";
import { GhostReview } from "@/components/admin/ghost-review";
import { BulkGhostDelete } from "@/components/admin/bulk-ghost-delete";
import { OrphanGhostCleanup } from "@/components/admin/orphan-ghost-cleanup";
import { MergeDuplicateGhosts } from "@/components/admin/merge-duplicate-ghosts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ghost teams", robots: { index: false } };

export default async function GhostsPage() {
  const [ghosts, exactMatchCount, orphanCount] = await Promise.all([
    getGhostTeamsWithSuggestions(80),
    countExactNameGhostMatches(),
    countOrphanGhosts(),
  ]);
  const withMatch = ghosts.filter((g) => g.suggestions.length > 0);
  const orphans = ghosts.filter((g) => g.suggestions.length === 0);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-navy-900">Ghost teams</h1>
      <p className="mb-6 max-w-2xl text-sm text-slate-500">
        Ghosts are opponents auto-created from other teams&rsquo; schedules before the real team was
        added. Each row shows the ghost and its best <strong>real-team</strong> merge targets, scored
        by the same confidence model the scraper uses (name, age, city/state, coaching staff, shared
        games, game-region overlap). Each suggestion now lists the{" "}
        <strong>games the two actually share</strong> — same opponent and date, with each side&rsquo;s
        score (<span className="text-emerald-700">✅</span> match,{" "}
        <span className="text-amber-700">⚠️</span> differ) — so you can verify the match yourself
        instead of trusting the score. Merge into the suggested team, search for a different target,
        or leave it. Merging folds the ghost&rsquo;s games into the real team and deletes the ghost.
      </p>
      <p className="mb-6 max-w-2xl text-sm text-slate-500">
        Reviewing matches for <strong>recently added</strong> teams? The{" "}
        <a href="/admin/merge-queue" className="font-medium text-sky-600 hover:text-sky-800">
          Merge queue
        </a>{" "}
        shows only confident ghost matches for newly added teams — the review step that replaced
        auto-merging on team add.
      </p>
      <MergeDuplicateGhosts />
      <BulkGhostDelete count={exactMatchCount} />
      <OrphanGhostCleanup count={orphanCount} />
      <GhostReview withMatch={withMatch} orphans={orphans} />
    </div>
  );
}
