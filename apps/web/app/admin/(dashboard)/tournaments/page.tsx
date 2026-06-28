import { prisma } from "@nbr/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournaments", robots: { index: false } };

export default async function AdminTournamentsPage() {
  const tournaments = await prisma.tournament.findMany({
    include: {
      director: true,
      invites: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h1 className="text-2xl font-black text-navy-900">Tournaments</h1>
      <p className="mt-1 text-sm text-slate-500">
        {tournaments.length} tournament{tournaments.length === 1 ? "" : "s"} created by directors.
      </p>

      {tournaments.length === 0 ? (
        <div className="card mt-4 p-6 text-sm text-slate-500">No tournaments yet.</div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy-900 text-xs uppercase text-navy-100">
              <tr>
                <th className="px-4 py-3">Tournament</th>
                <th className="px-4 py-3">Director</th>
                <th className="px-4 py-3 text-center">Accepted</th>
                <th className="px-4 py-3 text-center">Invited</th>
                <th className="px-4 py-3 text-center">Declined</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tournaments.map((t) => {
                const accepted = t.invites.filter((i) => i.status === "ACCEPTED").length;
                const invited = t.invites.filter((i) => i.status === "INVITED").length;
                const declined = t.invites.filter((i) => i.status === "DECLINED").length;
                return (
                  <tr key={t.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">{t.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {t.director.firstName} {t.director.lastName}
                      <div className="text-xs text-slate-400">{t.director.email}</div>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-emerald-700">{accepted}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-600">{invited}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-rose-600">{declined}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDate(t.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
