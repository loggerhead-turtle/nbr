import Link from "next/link";
import { getDuplicateAuditSummary } from "@/lib/duplicates";
import { findCrossAgeMergeArtifacts, countGhostTeams } from "@nbr/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data audit", robots: { index: false } };

/** One headline number with a label and a link to where you fix it. */
function Stat({
  n,
  label,
  sub,
  href,
  tone = "slate",
}: {
  n: number;
  label: string;
  sub?: string;
  href?: string;
  tone?: "slate" | "rose" | "amber" | "emerald";
}) {
  const toneClass = {
    slate: "text-navy-900",
    rose: "text-rose-600",
    amber: "text-amber-600",
    emerald: "text-emerald-600",
  }[tone];
  const inner = (
    <div className="card h-full p-4 transition hover:shadow-md">
      <div className={`text-3xl font-black tabular-nums ${toneClass}`}>{n}</div>
      <div className="mt-1 text-sm font-semibold text-slate-700">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
      {href && <div className="mt-2 text-xs font-semibold text-sky-600">Open →</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function AuditPage() {
  const [dup, contam1, contam2, ghosts] = await Promise.all([
    getDuplicateAuditSummary(),
    findCrossAgeMergeArtifacts(1, 3, 4), // 1-year clusters (noisier)
    findCrossAgeMergeArtifacts(2, 3, 1), // 2+ year gaps (likely bad merges)
    countGhostTeams().catch(() => 0),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-navy-900">Data audit</h1>
      <p className="mb-6 max-w-3xl text-sm text-slate-600">
        A read-only snapshot of the data-quality problems in the database, so you can see how big
        each one is before you start fixing. Nothing here changes anything — every number links to
        the page where you review and act. The two big issues are{" "}
        <strong>duplicate team records</strong> (the same club split into two rows — fix by merging)
        and <strong>contaminated records</strong> (one row that absorbed another team’s games via a
        bad past merge — fix by splitting on the Bad merges page).
      </p>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Duplicate team records
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          n={dup.totalPairs}
          label="Possible duplicate pairs"
          sub="active, awaiting review"
          href="/admin/duplicates"
          tone="rose"
        />
        <Stat
          n={dup.nearCertain}
          label="Near-certain"
          sub="2+ identical games shared"
          tone="emerald"
        />
        <Stat n={dup.oneShared} label="One shared game" sub="probable, verify" tone="amber" />
        <Stat n={dup.nameOnly} label="Name/region only" sub="no shared game yet" />
        <Stat n={dup.snoozed} label="Snoozed" sub="hidden, will resurface" />
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Contaminated records (absorbed off-age games)
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          n={contam2.length}
          label="2+ year gaps"
          sub="likely bad merges"
          href="/admin/bad-merges?gap=2"
          tone="rose"
        />
        <Stat
          n={contam1.length}
          label="1-year gaps"
          sub="review carefully — includes legit play-ups"
          href="/admin/bad-merges?gap=1"
          tone="amber"
        />
        <Stat
          n={ghosts}
          label="Unverified ghosts"
          sub="auto-created from opponents"
          href="/admin/ghosts"
        />
      </div>

      <p className="max-w-3xl text-xs text-slate-400">
        Counts are computed live on each load. “Near-certain” pairs share two or more games with the
        exact same opponent, date, and score — distinct teams effectively never do, so those are the
        safest to merge first. The 1-year contamination count only includes teams with a cluster of
        4+ off-age games, to filter out normal one-year play-ups.
      </p>
    </div>
  );
}
