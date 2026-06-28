import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@nbr/db";
import { getCurrentUser } from "@/lib/user-auth";
import { logoutUserAction as logoutAction } from "@/lib/account-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const claims = await prisma.claim.findMany({
    where: { userId: user.id },
    include: { team: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-navy-900">My account</h1>
        <form action={logoutAction}>
          <button className="text-sm text-slate-500 hover:text-rose-600">Sign out</button>
        </form>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {user.firstName} {user.lastName} · {user.email}
      </p>

      <h2 className="mt-8 text-lg font-bold text-navy-900">My teams</h2>
      {claims.length === 0 ? (
        <div className="card mt-3 p-6 text-sm text-slate-500">
          You haven’t claimed a team yet. Find your team in the{" "}
          <Link href="/" className="font-medium text-navy-700 underline">ratings</Link> and click
          “Claim this team”.
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {claims.map((c) => (
            <li key={c.id} className="card flex items-center justify-between p-4">
              <div>
                <Link href={`/teams/${c.team.slug}`} className="font-semibold text-navy-800 hover:underline">
                  {c.team.name}
                </Link>
                <p className="text-xs text-slate-500">
                  Contact sharing: {c.contactOptIn ? "On (registered users can see your email/phone)" : "Off (private)"}
                </p>
              </div>
              <span className="badge bg-emerald-100 text-emerald-800">{c.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
