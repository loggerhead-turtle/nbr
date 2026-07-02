import { getDuplicateCandidates } from "@/lib/duplicates";
import { DuplicateReview } from "@/components/admin/duplicate-review";
import { MergeByConfidence } from "@/components/admin/merge-by-confidence";
import { DuplicateFilter } from "@/components/admin/duplicate-filter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Possible duplicates", robots: { index: false } };

/** Parse a 1–100 confidence bound from a query param, or null if absent/invalid. */
function parsePct(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : null;
}

export default async function DuplicatesPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string; max?: string }>;
}) {
  const sp = await searchParams;
  const minPct = parsePct(sp.min);
  const maxPct = parsePct(sp.max);
  const filtering = minPct != null || maxPct != null;

  const pairs = await getDuplicateCandidates({ limit: 60, minPct, maxPct });
  // Merge-confidence values of the mergeable (non-disqualified) listed pairs,
  // so the threshold control can show a live count.
  const confidences = pairs
    .map((p) => p.mergeConfidence)
    .filter((c): c is number => c != null);

  const rangeLabel =
    minPct != null && maxPct != null
      ? minPct === maxPct
        ? `${minPct}%`
        : `${minPct}–${maxPct}%`
      : minPct != null
        ? `≥ ${minPct}%`
        : maxPct != null
          ? `≤ ${maxPct}%`
          : null;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-navy-900">Possible duplicates</h1>
      <div className="mb-6 max-w-3xl space-y-3 text-sm text-slate-600">
        <p>
          Each card below is <strong>two team records that might be the same real club</strong> —
          usually a real team plus a “ghost” that got auto-created when an opponent listed it on
          their schedule under a slightly different name. When that happens the club’s games get
          split across both records, which throws off its win/loss totals and rating. This page is
          where you stitch them back together.
        </p>
        <p>
          Cards are ranked by a <strong>confidence heat map</strong> (name, age, city/state, coaching
          staff, and — most importantly — <em>games that line up</em>). The{" "}
          <strong>“Games that line up”</strong> table is the proof: it shows each matchup both
          records share, side by side, so you can see at a glance that they’re the same team. A{" "}
          <span className="text-emerald-700">✅</span> means both recorded the same score; a{" "}
          <span className="text-amber-700">⚠️</span> means the same game was recorded with different
          scores (usually one side’s typo). Use the blue <strong>GC ↗</strong> buttons to open either
          team’s GameChanger page in a new tab and confirm. Click{" "}
          <strong>Show all games</strong> under a team to see its full schedule.
        </p>
        <p>
          Then act: <strong>Merge</strong> folds the right-hand record into the left and combines
          their games — <em>nothing is ever lost</em>, so this is the safe default. A red{" "}
          <strong>Delete duplicate</strong> button appears only when one record’s games are entirely
          contained in the other (so deleting truly loses nothing). <strong>Not a duplicate</strong>{" "}
          permanently dismisses the pair so it never comes back. <strong>Revisit later</strong> hides
          it for a day so the next scrape can fill in more games, then resurfaces it. The scraper
          auto-merges only the near-certain matches; everything else lands here.
        </p>
        <p>
          <strong>Different ages are never a duplicate.</strong> If two records share a lot of games
          but are different ages (e.g. a 12U and a 14U), that&rsquo;s the fingerprint of a{" "}
          <em>bad cross-age merge</em> — one record absorbed the other age&rsquo;s games — not a real
          match. Those are marked <span className="text-rose-700">Not a duplicate</span> and point you
          to the <strong>Bad merges</strong> page to split them; merging is disabled. Fix the bad
          merge there and the phantom shared games (and this false pairing) disappear.
        </p>
      </div>
      <DuplicateFilter min={minPct} max={maxPct} />
      <MergeByConfidence confidences={confidences} />
      {filtering && (
        <p className="mb-3 text-sm text-slate-500">
          Showing {pairs.length} pair{pairs.length === 1 ? "" : "s"} at{" "}
          <span className="font-semibold text-navy-800">{rangeLabel}</span> merge confidence
          {pairs.length >= 60 && " (first 60)"} — scanned the strongest-evidence candidates first.
        </p>
      )}
      <DuplicateReview key={`${minPct ?? ""}-${maxPct ?? ""}`} initialPairs={pairs} />
    </div>
  );
}
