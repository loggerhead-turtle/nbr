import { getDuplicateCandidates } from "@/lib/duplicates";
import { DuplicateReview } from "@/components/admin/duplicate-review";

export const dynamic = "force-dynamic";
export const metadata = { title: "Possible duplicates", robots: { index: false } };

export default async function DuplicatesPage() {
  const pairs = await getDuplicateCandidates(60);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-navy-900">Possible duplicates</h1>
      <p className="mb-6 max-w-2xl text-sm text-slate-500">
        Teams that look like the same club, ordered by a <strong>confidence heat map</strong> that
        weighs name, age, city/state, coaching staff, shared games, and game-region overlap. Green
        is a near-certain match; amber/red need a closer look. Each card lists the reasons for and
        against, links to both <strong>GameChanger</strong> pages, and shows both rosters side by
        side. Click <strong>Merge</strong> to combine them (the right-hand team folds into the
        left), <strong>Not a duplicate</strong> to dismiss the pair permanently, or{" "}
        <strong>Pause</strong> to skip it. The scraper now auto-merges only high-confidence matches;
        everything else lands here.
      </p>
      <DuplicateReview initialPairs={pairs} />
    </div>
  );
}
