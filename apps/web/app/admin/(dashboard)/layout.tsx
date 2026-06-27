import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { logoutAction } from "@/lib/admin-actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <nav className="flex flex-wrap gap-2 text-sm font-medium">
          <Link href="/admin" className="rounded-md px-3 py-1.5 text-navy-800 hover:bg-slate-100">
            Dashboard
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
