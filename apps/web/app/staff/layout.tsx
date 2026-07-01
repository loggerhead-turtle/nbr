import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffAccess } from "@/lib/user-auth";
import { logoutUserAction } from "@/lib/account-actions";

/**
 * Limited staff area for game-scraper accounts (admins can use it too). Access is
 * restricted to the GameChanger lookup and adding games; everything else lives
 * under /admin, which game-scrapers cannot reach.
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const access = await getStaffAccess();
  if (!access) redirect("/login?next=/staff/gc-lookup");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <nav className="flex flex-wrap gap-2 text-sm font-medium">
          <Link
            href="/staff/gc-lookup"
            className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            GC lookup
          </Link>
          <Link
            href="/staff/games/new"
            className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            Add game
          </Link>
          <Link
            href="/staff/leaderboard"
            className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100"
          >
            Leaderboard
          </Link>
          <Link href="/account" className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100">
            Account
          </Link>
          {access === "admin" && (
            <Link
              href="/admin"
              className="rounded-md px-3 py-1.5 text-sky-700 hover:bg-slate-100"
            >
              Full admin →
            </Link>
          )}
        </nav>
        <form action={logoutUserAction}>
          <button type="submit" className="text-sm text-slate-500 hover:text-rose-600">
            Sign out
          </button>
        </form>
      </div>
      {children}
    </div>
  );
}
