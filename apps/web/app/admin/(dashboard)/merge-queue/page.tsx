import { getGhostMergeQueue } from "@nbr/db";
import { MergeQueueReview } from "@/components/admin/merge-queue-review";

export const dynamic = "force-dynamic";
export const metadata = { title: "Merge queue", robots: { index: false } };

export default async function MergeQueuePage() {
  const items = await getGhostMergeQueue();
  const newCount = items.filter((it) => it.target.isNew).length;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-navy-900">Merge queue</h1>
      <p className="mb-4 max-w-2xl text-sm text-slate-500">
        When a team is added, it&rsquo;s created <strong>fresh</strong> — we no longer auto-merge a
        same-name ghost into it, because same name and age isn&rsquo;t proof it&rsquo;s the same club
        (that&rsquo;s how contamination spread). Instead, any strong ghost match shows up here for you
        to approve. Each card shows the added team, the ghost it looks like, every confidence signal
        (name, age, city/state, coaches, shared games, game-region overlap), and the{" "}
        <strong>games the two actually share</strong> (<span className="text-emerald-700">✅</span>{" "}
        score matches, <span className="text-amber-700">⚠️</span> differs). Approving folds the
        ghost&rsquo;s games into the team and deletes the ghost; dismiss stops the pair from being
        suggested. After approving one or more, hit <strong>Recompute ratings</strong>.
      </p>
      {newCount > 0 && (
        <p className="mb-4 text-sm font-medium text-emerald-700">
          {newCount} match{newCount === 1 ? "" : "es"} involve a recently added team.
        </p>
      )}
      <MergeQueueReview items={items} />
    </div>
  );
}
