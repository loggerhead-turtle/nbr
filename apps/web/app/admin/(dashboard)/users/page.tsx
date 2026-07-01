import { prisma, Prisma } from "@nbr/db";
import { setTdStatusAction, setUserRoleAction } from "@/lib/admin-actions";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage users", robots: { index: false } };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { claims: true, tournaments: true } } },
    take: 300,
  });

  return (
    <div>
      <h1 className="text-2xl font-black text-navy-900">Manage users</h1>
      <p className="mt-1 text-sm text-slate-500">
        {users.length} user{users.length === 1 ? "" : "s"}. Grant or revoke tournament-director
        access here.
      </p>
      <p className="mt-1 text-xs text-slate-400">
        To run your own tournaments as the owner, create a coach account, then grant it TD access
        below and open the portal at <code className="rounded bg-slate-100 px-1">/td</code>.
      </p>

      <form method="get" className="my-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name or email…" className="input max-w-xs" />
        <button className="btn-ghost">Search</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-900 text-xs uppercase text-navy-100">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Teams</th>
              <th className="px-4 py-3">Tournaments</th>
              <th className="px-4 py-3">TD status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">
                    {u.firstName} {u.lastName}
                  </div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                  {u.tdOrg && <div className="text-xs text-slate-400">{u.tdOrg}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.role === "ADMIN" ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-600">{u._count.claims}</td>
                <td className="px-4 py-3 tabular-nums text-slate-600">{u._count.tournaments}</td>
                <td className="px-4 py-3">
                  <TdBadge status={u.tdStatus} />
                  {u.tdRequestedAt && u.tdStatus === "REQUESTED" && (
                    <div className="text-xs text-slate-400">{formatDate(u.tdRequestedAt)}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {u.role !== "ADMIN" ? (
                      <form action={setUserRoleAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="role" value="ADMIN" />
                        <button className="btn-ghost text-navy-800">Make admin</button>
                      </form>
                    ) : (
                      <form action={setUserRoleAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="role" value="USER" />
                        <button className="btn-ghost text-slate-500">Remove admin</button>
                      </form>
                    )}
                    {u.role === "GAME_SCRAPER" ? (
                      <form action={setUserRoleAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="role" value="USER" />
                        <button className="btn-ghost text-slate-500">Remove scraper</button>
                      </form>
                    ) : u.role !== "ADMIN" ? (
                      <form action={setUserRoleAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="role" value="GAME_SCRAPER" />
                        <button className="btn-ghost text-sky-700">Make scraper</button>
                      </form>
                    ) : null}
                    {u.tdStatus !== "APPROVED" ? (
                      <form action={setTdStatusAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="status" value="APPROVED" />
                        <button className="btn-ghost text-emerald-700">Grant TD</button>
                      </form>
                    ) : (
                      <form action={setTdStatusAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="status" value="NONE" />
                        <button className="btn-ghost text-rose-600">Revoke TD</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TdBadge({ status }: { status: string }) {
  const cls =
    status === "APPROVED"
      ? "bg-emerald-100 text-emerald-800"
      : status === "REQUESTED"
        ? "bg-amber-100 text-amber-800"
        : status === "REJECTED"
          ? "bg-rose-100 text-rose-800"
          : "bg-slate-100 text-slate-500";
  return <span className={`badge ${cls}`}>{status}</span>;
}
