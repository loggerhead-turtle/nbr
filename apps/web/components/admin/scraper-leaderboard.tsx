import type { LeaderboardRow } from "@nbr/db";
import { formatUsd } from "@/lib/format";
import { MarkPaidButton } from "./mark-paid-button";

/**
 * Teammate comparison table. Read-only for scrapers; admins get per-row
 * "Mark paid" (banks unpaid credits and resets the pay period).
 */
export function ScraperLeaderboard({
  rows,
  admin = false,
  currentUserId,
}: {
  rows: LeaderboardRow[];
  admin?: boolean;
  currentUserId?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-slate-500">
        No scraper activity yet. Teams added on the GameChanger lookup page show up here.
      </div>
    );
  }
  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-navy-900 text-xs uppercase tracking-wide text-navy-100">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Scraper</th>
            <th className="px-3 py-2 text-right">Today</th>
            <th className="px-3 py-2 text-right">Week</th>
            <th className="px-3 py-2 text-right">Month</th>
            <th className="px-3 py-2 text-right">Owed</th>
            <th className="px-3 py-2 text-right">All-time</th>
            {admin && <th className="px-3 py-2 text-right">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={r.userId} className={r.userId === currentUserId ? "bg-sky-50" : "hover:bg-slate-50"}>
              <td className="px-3 py-2 tabular-nums text-slate-500">{medal(i)}</td>
              <td className="px-3 py-2">
                <span className="font-semibold text-navy-800">{r.name}</span>
                {r.userId === currentUserId && (
                  <span className="ml-1 text-xs font-medium text-sky-600">(you)</span>
                )}
                {r.role !== "GAME_SCRAPER" && (
                  <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                    {r.role}
                  </span>
                )}
                {r.lastPayoutAt && (
                  <span className="block text-[11px] text-slate-400">
                    last paid {r.lastPayoutAt.slice(0, 10)}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.todayTeams}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.weekTeams}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.monthTeams}</td>
              <td className="px-3 py-2 text-right">
                <span className="font-bold tabular-nums text-navy-900">{formatUsd(r.unpaidCents)}</span>
                <span className="block text-[11px] tabular-nums text-slate-400">
                  {r.unpaidTeams} team{r.unpaidTeams === 1 ? "" : "s"}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.totalTeams}</td>
              {admin && (
                <td className="px-3 py-2 text-right">
                  {r.unpaidCents > 0 ? (
                    <MarkPaidButton userId={r.userId} amountLabel={formatUsd(r.unpaidCents)} />
                  ) : (
                    <span className="text-xs text-slate-400">paid up</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
