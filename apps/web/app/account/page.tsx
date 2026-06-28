import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@nbr/db";
import { getCurrentUser } from "@/lib/user-auth";
import { logoutUserAction } from "@/lib/account-actions";
import { respondScrimmageRequestAction } from "@/lib/scrimmage-actions";
import { ScrimmageSettings } from "@/components/account/scrimmage-settings";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const claims = await prisma.claim.findMany({
    where: { userId: user.id },
    include: { team: { include: { scrimmagePref: true } } },
    orderBy: { createdAt: "desc" },
  });
  const myTeamIds = claims.map((c) => c.team.id);
  const myTeamName = new Map(claims.map((c) => [c.team.id, c.team.name] as const));

  const [incoming, sent] = await Promise.all([
    prisma.scrimmageRequest.findMany({
      where: { toTeamId: { in: myTeamIds }, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.scrimmageRequest.findMany({
      where: { fromTeamId: { in: myTeamIds } },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  // Resolve the other teams referenced by requests.
  const otherIds = [
    ...incoming.map((r) => r.fromTeamId),
    ...sent.map((r) => r.toTeamId),
  ];
  const others = await prisma.team.findMany({
    where: { id: { in: otherIds } },
    include: { claim: { include: { user: true } } },
  });
  const otherById = new Map(others.map((t) => [t.id, t] as const));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy-900">My account</h1>
        <form action={logoutUserAction}>
          <button className="text-sm text-slate-500 hover:text-rose-600">Sign out</button>
        </form>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {user.firstName} {user.lastName} · {user.email}
      </p>

      {/* Incoming scrimmage requests */}
      {incoming.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-navy-900">Scrimmage requests to you</h2>
          <ul className="mt-3 space-y-3">
            {incoming.map((r) => {
              const from = otherById.get(r.fromTeamId);
              const optedIn = from?.claim?.contactOptIn;
              return (
                <li key={r.id} className="card p-4">
                  <p className="text-sm">
                    <strong>{from?.name ?? "A team"}</strong> wants to scrimmage{" "}
                    <strong>{myTeamName.get(r.toTeamId)}</strong>.
                  </p>
                  {r.message && <p className="mt-1 text-sm text-slate-600">“{r.message}”</p>}
                  {optedIn && from?.claim && (
                    <p className="mt-1 text-xs text-slate-500">
                      Reach them: {from.claim.user.email}
                      {from.claim.user.phone ? ` · ${from.claim.user.phone}` : ""}
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <form action={respondScrimmageRequestAction}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <input type="hidden" name="decision" value="ACCEPTED" />
                      <button className="btn-primary">Accept</button>
                    </form>
                    <form action={respondScrimmageRequestAction}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <input type="hidden" name="decision" value="DECLINED" />
                      <button className="btn-ghost">Decline</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* My teams + scrimmage settings */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-navy-900">My teams</h2>
        {claims.length === 0 ? (
          <div className="card mt-3 p-6 text-sm text-slate-500">
            You haven’t claimed a team yet. Find your team in the{" "}
            <Link href="/" className="font-medium text-navy-700 underline">ratings</Link> and click
            “Claim this team”.
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {claims.map((c) => (
              <li key={c.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <Link href={`/teams/${c.team.slug}`} className="font-semibold text-navy-800 hover:underline">
                    {c.team.name}
                  </Link>
                  <span className="text-xs text-slate-500">
                    Contact sharing: {c.contactOptIn ? "On" : "Off"}
                  </span>
                </div>
                <ScrimmageSettings
                  teamId={c.team.id}
                  seeking={c.team.scrimmagePref?.seekingScrimmage ?? false}
                  maxDistanceMiles={c.team.scrimmagePref?.maxDistanceMiles ?? null}
                  notes={c.team.scrimmagePref?.notes ?? null}
                />
              </li>
            ))}
          </ul>
        )}
        {claims.length > 0 && (
          <Link href="/scrimmages" className="btn-accent mt-4">
            Find scrimmages →
          </Link>
        )}
      </section>

      {/* Sent requests */}
      {sent.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-navy-900">Requests you’ve sent</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {sent.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span className="text-slate-600">
                  {myTeamName.get(r.fromTeamId)} → {otherById.get(r.toTeamId)?.name ?? "a team"}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{formatDate(r.createdAt)}</span>
                  <span
                    className={`badge ${
                      r.status === "ACCEPTED"
                        ? "bg-emerald-100 text-emerald-800"
                        : r.status === "DECLINED"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
