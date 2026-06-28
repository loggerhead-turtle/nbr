import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@nbr/db";
import { getCurrentUser } from "@/lib/user-auth";
import { TdProfileForm, CreateTournamentForm } from "@/components/td/td-forms";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournament director portal", robots: { index: false } };

export default async function TdPortalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/td");
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tdStatus: true, tdTournamentName: true, tdOrg: true, tdWebsite: true },
  });
  if (account?.tdStatus !== "APPROVED") redirect("/account");

  const tournaments = await prisma.tournament.findMany({
    where: { directorUserId: user.id },
    include: { _count: { select: { invites: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-black text-navy-900">Tournament director portal</h1>
      <p className="mt-1 text-sm text-slate-500">Create tournaments, invite teams, and build balanced pools.</p>

      <div className="mt-6 space-y-6">
        <CreateTournamentForm />

        <div>
          <h2 className="mb-3 text-lg font-bold text-navy-900">Your tournaments</h2>
          {tournaments.length === 0 ? (
            <div className="card p-6 text-sm text-slate-500">No tournaments yet — create one above.</div>
          ) : (
            <ul className="space-y-2">
              {tournaments.map((t) => (
                <li key={t.id} className="card flex items-center justify-between p-4">
                  <div>
                    <Link href={`/td/${t.id}`} className="font-semibold text-navy-800 hover:underline">
                      {t.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {t._count.invites} team{t._count.invites === 1 ? "" : "s"} · created {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <Link href={`/td/${t.id}`} className="btn-ghost">Manage →</Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <TdProfileForm
          tournamentName={account.tdTournamentName}
          org={account.tdOrg}
          website={account.tdWebsite}
        />
      </div>
    </div>
  );
}
