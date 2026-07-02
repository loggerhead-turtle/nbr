import Link from "next/link";
import {
  getRecentDuplicateMergeRuns,
  getDuplicateMergeLogs,
  countDuplicateCandidates,
} from "@/lib/duplicates";
import { getBacklogMinConfidence } from "@/lib/site-settings";
import { BacklogRunner } from "@/components/admin/backlog-runner";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duplicates backlog", robots: { index: false } };

function statusChip(status: string): string {
  return status === "SUCCESS"
    ? "bg-emerald-100 text-emerald-800"
    : status === "FAILED"
      ? "bg-rose-100 text-rose-800"
      : "bg-amber-100 text-amber-800";
}

function when(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${formatDate(date)} ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
}

export default async function DuplicatesBacklogPage() {
  const [runs, defaultMinPct, remaining] = await Promise.all([
    getRecentDuplicateMergeRuns(20),
    getBacklogMinConfidence(),
    countDuplicateCandidates().catch(() => 0),
  ]);
  const running = runs.some((r) => r.status === "RUNNING");
  const latest = runs[0] ?? null;
  const logs = latest ? await getDuplicateMergeLogs(latest.id, 500) : [];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy-900">Duplicates backlog</h1>
        <Link href="/admin/duplicates" className="btn-ghost text-navy-800">
          ← Review individually
        </Link>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-slate-600">
        Run the background worker to merge the whole duplicate backlog at or above a confidence
        level you choose — start with <strong>100%</strong> (identical games, ghost fully contained)
        and lower it as you gain trust. Every merge is logged below so you can see exactly which
        teams were combined. {remaining.toLocaleString()} possible duplicate
        {remaining === 1 ? "" : "s"} remain.
      </p>

      <BacklogRunner defaultMinPct={defaultMinPct} running={running} />

      <div className="mt-4 flex items-center gap-3">
        <Link href="/admin/duplicates-backlog" className="btn-ghost text-navy-800">
          ↻ Refresh
        </Link>
        {running && (
          <span className="text-sm text-amber-700">
            A merge is running on the worker — refresh to see new merges appear.
          </span>
        )}
      </div>

      {/* Recent runs */}
      <h2 className="mt-8 text-lg font-bold text-navy-900">Recent runs</h2>
      {runs.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No backlog merges have been run yet.</p>
      ) : (
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy-900 text-xs uppercase text-navy-100">
              <tr>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Threshold</th>
                <th className="px-4 py-3 text-right">Merged</th>
                <th className="px-4 py-3">Finished</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 text-slate-600">{when(r.startedAt)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`badge ${statusChip(r.status)}`}>{r.status}</span>
                    {r.error && <div className="mt-1 max-w-md text-xs text-rose-600">{r.error}</div>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600">≥ {r.minConfidence}%</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-navy-800">
                    {r.merged.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {r.finishedAt ? when(r.finishedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Merge log for the latest run */}
      {latest && (
        <>
          <h2 className="mt-8 text-lg font-bold text-navy-900">
            Merge log{" "}
            <span className="text-sm font-normal text-slate-500">
              — latest run ({when(latest.startedAt)}), newest first{logs.length >= 500 ? " (last 500)" : ""}
            </span>
          </h2>
          {logs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No merges recorded yet for this run{latest.status === "RUNNING" ? " — check back shortly." : "."}
            </p>
          ) : (
            <div className="card mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Merged (removed)</th>
                    <th className="px-4 py-2.5">Into (kept)</th>
                    <th className="px-4 py-2.5 text-right">Conf.</th>
                    <th className="px-4 py-2.5 text-right">Games moved</th>
                    <th className="px-4 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2 text-slate-700">{l.mergedName}</td>
                      <td className="px-4 py-2">
                        {l.keptTeamId ? (
                          <span className="font-medium text-navy-800">{l.keptName}</span>
                        ) : (
                          l.keptName
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{l.confidence}%</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{l.gamesMoved}</td>
                      <td className="px-4 py-2 text-xs text-slate-400">{when(l.mergedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
