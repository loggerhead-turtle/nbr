import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { logoutAction } from "@/lib/admin-actions";
import { countDuplicateCandidates } from "@/lib/duplicates";
import { getActivitySeenMap, countNewActivityByType } from "@/lib/activity";
import { countGhostTeams } from "@nbr/db";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");

  const [dupCount, ghostCount, activityCount] = await Promise.all([
    countDuplicateCandidates(),
    countGhostTeams().catch(() => 0),
    getActivitySeenMap()
      .then((m) => countNewActivityByType(m))
      .then((c) => Object.values(c).reduce((a, b) => a + b, 0))
      .catch(() => 0),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <nav className="flex flex-wrap gap-2 text-sm font-medium">
          <Link href="/admin" className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100">
            Dashboard
          </Link>
          <Link
            href="/admin/activity"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            Activity
            {activityCount > 0 && (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white">
                {activityCount > 99 ? "99+" : activityCount}
              </span>
            )}
          </Link>
          <Link
            href="/admin/teams"
            className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            Manage teams
          </Link>
          <Link
            href="/admin/teams/new"
            className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            Add team
          </Link>
          <Link
            href="/admin/games/new"
            className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            Add game
          </Link>
          <Link
            href="/admin/audit"
            className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            Audit
          </Link>
          <Link
            href="/admin/reconcile"
            className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            Reconcile
          </Link>
          <Link
            href="/admin/duplicates"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            Duplicates
            {dupCount > 0 && (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">
                {dupCount}
              </span>
            )}
          </Link>
          <Link
            href="/admin/ghosts"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            Ghosts
            {ghostCount > 0 && (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-slate-500 px-1.5 py-0.5 text-xs font-bold text-white">
                {ghostCount}
              </span>
            )}
          </Link>
          <Link
            href="/admin/merge-queue"
            className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            Merge queue
          </Link>
          <Link
            href="/admin/bad-merges"
            className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            Bad merges
          </Link>
          <Link href="/admin/users" className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100">
            Users
          </Link>
          <Link href="/admin/tournaments" className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100">
            Tournaments
          </Link>
          <Link href="/admin/age-offset" className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100">
            Age offset
          </Link>
          <Link href="/admin/tiers" className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100">
            Tiers
          </Link>
          <Link href="/admin/settings" className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100">
            Settings
          </Link>
        </nav>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-slate-500 hover:text-rose-600">
            Sign out
          </button>
        </form>
      </div>
      {children}
    </div>
  );
}
