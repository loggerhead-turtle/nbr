import Link from "next/link";
import type { ScraperStats } from "@nbr/db";
import { formatUsd } from "@/lib/format";

function Progress({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const done = goal > 0 && value >= goal;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium text-slate-500">{label}</span>
        <span className="tabular-nums text-slate-500">
          {value}
          {goal > 0 ? ` / ${goal}` : ""} {done ? "🎉" : ""}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-sky-500"}`}
          style={{ width: `${goal > 0 ? pct : 0}%` }}
        />
      </div>
    </div>
  );
}

function PeriodCard({ label, teams, cents }: { label: string; teams: number; cents: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg font-black tabular-nums text-navy-900">{formatUsd(cents)}</p>
      <p className="text-xs tabular-nums text-slate-500">{teams} team{teams === 1 ? "" : "s"}</p>
    </div>
  );
}

/**
 * The scraper's live earnings panel, shown on the GameChanger lookup page. Updates
 * after each add (the action revalidates this page). `leaderboardHref` links to
 * the teammate comparison.
 */
export function EarningsBar({
  stats,
  leaderboardHref,
}: {
  stats: ScraperStats;
  leaderboardHref: string;
}) {
  const paidDate = stats.lastPayoutAt ? stats.lastPayoutAt.slice(0, 10) : null;
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-navy-900 to-sky-800 px-5 py-4 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-200">
            Owed since last payout
          </p>
          <p className="text-3xl font-black tabular-nums">{formatUsd(stats.sinceLastPayout.cents)}</p>
          <p className="text-xs text-sky-100">
            {stats.sinceLastPayout.teams} team{stats.sinceLastPayout.teams === 1 ? "" : "s"} · at{" "}
            {formatUsd(stats.rateCents)}/team
            {paidDate ? ` · last paid ${paidDate}` : " · not paid yet"}
          </p>
        </div>
        <Link
          href={leaderboardHref}
          className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25"
        >
          Leaderboard →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 bg-slate-50 px-4 py-3">
        <PeriodCard label="Today" teams={stats.today.teams} cents={stats.today.cents} />
        <PeriodCard label="This week" teams={stats.week.teams} cents={stats.week.cents} />
        <PeriodCard label="This month" teams={stats.month.teams} cents={stats.month.cents} />
      </div>

      <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
        <Progress label="Daily goal" value={stats.today.teams} goal={stats.goals.daily} />
        <Progress label="Weekly goal" value={stats.week.teams} goal={stats.goals.weekly} />
        <Progress label="Monthly goal" value={stats.month.teams} goal={stats.goals.monthly} />
      </div>
    </div>
  );
}
