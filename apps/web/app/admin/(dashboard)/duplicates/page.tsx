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
        Teams that look like the same club (matching names). Each card shows both side by side with
        their game counts and shared games. Click <strong>Merge</strong> to combine them (the
        right-hand team folds into the left), <strong>Not a duplicate</strong> to dismiss the pair
        permanently, or <strong>Pause</strong> to skip it for now. No saving needed.
      </p>
      <DuplicateReview initialPairs={pairs} />
    </div>
  );
}
