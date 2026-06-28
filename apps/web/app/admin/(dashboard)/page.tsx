import Link from "next/link";
import { prisma } from "@nbr/db";
import { formatDate } from "@/lib/format";
import { setTdStatusAction, setLiveSearchAction } from "@/lib/admin-actions";
import { advanceSeasonAction } from "@/lib/season-actions";
import { getCurrentSeasonYear } from "@/lib/season";
import { getLiveSearchEnabled } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [teamCount, ghostCount, gameCount, scrapeCount, unclassifiedCount, lastRun, recentScrapes] =
    await Promise.all([
      prisma.team.count({ where: { isGhost: false } }),
      prisma.team.count({ where: { isGhost: true } }),
      prisma.game.count({ where: { status: "FINAL" } }),
      prisma.game.count({ where: { source: "SCRAPE" } }),
      prisma.team.count({ where: { ageGroup: null, classification: null } }),
      prisma.ratingRun.findFirst({ orderBy: { startedAt: "desc" } }),
      prisma.scrapeJob.findMany({ orderBy: { startedAt: "desc" }, take: 8, include: { team: true } }),
    ]);

  const openReports = await prisma.report.findMany({
    where: { status: "OPEN" },
    include: { team: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const currentSeasonYear = await getCurrentSeasonYear();
  const liveSearch = await getLiveSearchEnabled();

  const tdRequests = await prisma.user.findMany({
    where: { tdStatus: "REQUESTED" },
    orderBy: { tdRequestedAt: "desc" },
    take: 20,
  });

  return (
    <div>
      <h1 className="text-2xl font-black text-navy-900">Admin dashboard</h1>

      {unclassifiedCount > 0 && (
        <Link
          href="/admin/teams?filter=unclassified"
          className="mt-4 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span>
            ⚠️ <strong>{unclassifiedCount}</strong> team{unclassifiedCount === 1 ? "" : "s"} need an
            age group before they show publicly.
          </span>
          <span className="font-medium underline">Classify now →</span>
        </Link>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Teams" value={teamCount} />
        <StatCard label="Unverified teams" value={ghostCount} />
        <StatCard label="Final games" value={gameCount} />
        <StatCard label="Scraped games" value={scrapeCount} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/admin/teams/new" className="btn-primary">
          + Add team
        </Link>
        <Link href="/admin/games/new" className="btn-ghost">
          + Add game manually
        </Link>
      </div>

      <div className="card mt-6 p-5">
        <h2 className="font-bold text-navy-900">Season rollover</h2>
        <p className="mt-1 text-sm text-slate-500">
          Current season: <strong>{currentSeasonYear ?? "not set"}</strong>. Advancing the season
          shows claimed-team coaches a prompt at login to add their new-season GameChanger ID
          (carrying their rating forward).
        </p>
        <form action={advanceSeasonAction} className="mt-3 flex items-end gap-2">
          <div>
            <label className="label">Set season year</label>
            <input
              name="year"
              type="number"
              defaultValue={(currentSeasonYear ?? new Date().getFullYear()) + 1}
              className="input w-32"
            />
          </div>
          <button className="btn-primary">Advance season</button>
        </form>
      </div>

      <div className="card mt-6 p-5">
        <h2 className="font-bold text-navy-900">Site settings</h2>
        <form action={setLiveSearchAction} className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              name="liveSearch"
              defaultChecked={liveSearch}
              className="h-4 w-4 shrink-0"
            />
            Live ratings search (update the list as filters change, no “Apply” button)
          </label>
          <button className="btn-ghost">Save</button>
        </form>
      </div>

      {openReports.length > 0 && (
        <div className="mt-6 rounded-lg border border-rose-300 bg-rose-50 p-4">
          <p className="text-sm font-bold text-rose-900">
            {openReports.length} open claim report{openReports.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-rose-900">
            {openReports.map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span>
                  <Link href={`/admin/teams?q=${encodeURIComponent(r.team.name)}`} className="font-medium underline">
                    {r.team.name}
                  </Link>{" "}
                  — {r.reason}
                </span>
                <span className="text-xs text-rose-500">{formatDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tdRequests.length > 0 && (
        <div className="mt-6 rounded-lg border border-sky-300 bg-sky-50 p-4">
          <p className="text-sm font-bold text-sky-900">
            {tdRequests.length} tournament-director request{tdRequests.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 space-y-2 text-sm text-sky-900">
            {tdRequests.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{u.firstName} {u.lastName}</strong> ({u.email})
                  {u.tdTournamentName ? ` — ${u.tdTournamentName}` : ""}
                  {u.tdOrg ? `, ${u.tdOrg}` : ""}
                  {u.tdWebsite ? ` · ${u.tdWebsite}` : ""}
                </span>
                <span className="flex gap-2">
                  <form action={setTdStatusAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="status" value="APPROVED" />
                    <button className="btn-ghost text-emerald-700">Approve</button>
                  </form>
                  <form action={setTdStatusAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="status" value="REJECTED" />
                    <button className="btn-ghost text-rose-600">Reject</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-bold text-navy-900">Last rating run</h2>
          {lastRun ? (
            <dl className="mt-3 space-y-1 text-sm text-slate-600">
              <Row k="Status" v={lastRun.status} />
              <Row k="Started" v={formatDate(lastRun.startedAt)} />
              <Row k="Games processed" v={String(lastRun.gamesProcessed)} />
              <Row k="Teams affected" v={String(lastRun.teamsAffected)} />
              <Row k="Algorithm" v={lastRun.algorithmVersion} />
            </dl>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              No rating run yet. Run <code className="rounded bg-slate-100 px-1">worker recompute</code>.
            </p>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-bold text-navy-900">Recent scrape jobs</h2>
          {recentScrapes.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No scrape activity yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {recentScrapes.map((s) => (
                <li key={s.id} className="flex items-center justify-between">
                  <span className="text-slate-600">{s.team?.name ?? "—"}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{formatDate(s.startedAt)}</span>
                    <ScrapeBadge status={s.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-black tabular-nums text-navy-900">{value}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-400">{k}</dt>
      <dd className="font-medium text-slate-700">{v}</dd>
    </div>
  );
}

function ScrapeBadge({ status }: { status: string }) {
  const cls =
    status === "SUCCESS"
      ? "bg-emerald-100 text-emerald-800"
      : status === "EMPTY"
        ? "bg-slate-100 text-slate-600"
        : status === "BLOCKED"
          ? "bg-amber-100 text-amber-800"
          : "bg-rose-100 text-rose-800";
  return <span className={`badge ${cls}`}>{status}</span>;
}
