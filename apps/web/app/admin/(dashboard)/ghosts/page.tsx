import { getGhostTeamsWithSuggestions, countExactNameGhostMatches } from "@nbr/db";
import { GhostReview } from "@/components/admin/ghost-review";
import { BulkGhostDelete } from "@/components/admin/bulk-ghost-delete";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ghost teams", robots: { index: false } };

export default async function GhostsPage() {
  const [ghosts, exactMatchCount] = await Promise.all([
    getGhostTeamsWithSuggestions(80),
    countExactNameGhostMatches(),
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
        games, game-region overlap). Merge into the suggested team, search for a different target, or
        leave it. Merging folds the ghost&rsquo;s games into the real team and deletes the ghost.
      </p>
      <BulkGhostDelete count={exactMatchCount} />
      <GhostReview withMatch={withMatch} orphans={orphans} />
    </div>
  );
}
