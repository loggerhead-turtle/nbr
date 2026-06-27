import Link from "next/link";
import { prisma } from "@nbr/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [teamCount, ghostCount, gameCount, scrapeCount, lastRun, recentScrapes] =
    await Promise.all([
      prisma.team.count({ where: { isGhost: false } }),
      prisma.team.count({ where: { isGhost: true } }),
      prisma.game.count({ where: { status: "FINAL" } }),
      prisma.game.count({ where: { source: "SCRAPE" } }),
      prisma.ratingRun.findFirst({ orderBy: { startedAt: "desc" } }),
      prisma.scrapeJob.findMany({ orderBy: { startedAt: "desc" }, take: 8, include: { team: true } }),
    ]);

  return (
    <div>
      <h1 className="text-2xl font-black text-navy-900">Admin dashboard</h1>

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
