import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma, Prisma } from "@nbr/db";
import { getCurrentUser } from "@/lib/user-auth";
import {
  inviteTeamAction,
  removeInviteAction,
  setInviteStatusAction,
} from "@/lib/tournament-actions";
import { InviteTeams } from "@/components/td/invite-teams";
import { formatRating, formatRecord, ageGroupLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage tournament", robots: { index: false } };

const BAND = 150;

export default async function ManageTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/td/${id}`);

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      invites: { include: { team: { include: { rating: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!tournament) notFound();
  if (tournament.directorUserId !== user.id) redirect("/td");

  const invited = tournament.invites.filter((i) => i.status === "INVITED");
  const accepted = tournament.invites.filter((i) => i.status === "ACCEPTED");
  const declined = tournament.invites.filter((i) => i.status === "DECLINED");

  const excluded: Record<string, "INVITED" | "ACCEPTED" | "DECLINED"> = {};
  for (const inv of tournament.invites) excluded[inv.teamId] = inv.status as never;

  // Similar-team suggestions based on the current roster's rating range.
  const rosterRatings = [...accepted, ...invited]
    .map((i) => i.team.rating?.rating)
    .filter((r): r is number => typeof r === "number");
  let suggestions: { id: string; name: string; city: string | null; rating: number; record: string; ageGroup: string | null; classification: string | null }[] = [];
  if (rosterRatings.length > 0) {
    const lo = Math.min(...rosterRatings) - BAND;
    const hi = Math.max(...rosterRatings) + BAND;
    const avg = rosterRatings.reduce((a, b) => a + b, 0) / rosterRatings.length;
    const where: Prisma.TeamWhereInput = {
      id: { notIn: Object.keys(excluded) },
      rating: { is: { rating: { gte: lo, lte: hi }, isProvisional: false } },
      OR: [{ ageGroup: { not: null } }, { classification: { not: null } }],
    };
    const teams = await prisma.team.findMany({ where, include: { rating: true }, take: 40 });
    suggestions = teams
      .map((t) => ({
        id: t.id,
        name: t.name,
        city: t.city,
        rating: t.rating!.rating,
        record: formatRecord(t.rating!.wins, t.rating!.losses, t.rating!.ties),
        ageGroup: t.ageGroup,
        classification: t.classification,
      }))
      .sort((a, b) => Math.abs(a.rating - avg) - Math.abs(b.rating - avg))
      .slice(0, 12);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/td" className="text-sm text-navy-700 hover:underline">← All tournaments</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-navy-900">{tournament.name}</h1>
        {accepted.length >= 2 && (
          <Link href={`/td/${tournament.id}/pools`} className="btn-accent">
            Generate balanced pools ({accepted.length} teams) →
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <InviteTeams tournamentId={tournament.id} excluded={excluded} />

        {suggestions.length > 0 && (
          <div className="card p-4">
            <h2 className="mb-1 font-bold text-navy-900">Similar teams to invite</h2>
            <p className="mb-2 text-xs text-slate-500">
              Rated near the teams already in your tournament.
            </p>
            <ul className="divide-y divide-slate-100">
              {suggestions.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <Link href={`/teams/${s.id}`} className="font-medium text-slate-800">{s.name}</Link>
                    <span className="ml-2 text-xs text-slate-400">
                      {s.classification ? `Varsity ${s.classification}` : ageGroupLabel(s.ageGroup)} · {formatRating(s.rating)}
                    </span>
                  </span>
                  <form action={inviteTeamAction}>
                    <input type="hidden" name="tournamentId" value={tournament.id} />
                    <input type="hidden" name="teamId" value={s.id} />
                    <button className="btn-ghost">Invite</button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <InviteList
        title={`Accepted (${accepted.length})`}
        invites={accepted}
        tone="emerald"
        tournamentId={tournament.id}
      />
      <InviteList
        title={`Invited — awaiting response (${invited.length})`}
        invites={invited}
        tone="slate"
        tournamentId={tournament.id}
        showManualStatus
      />
      <InviteList
        title={`Declined (${declined.length})`}
        invites={declined}
        tone="rose"
        tournamentId={tournament.id}
        showRemove
      />
    </div>
  );
}

type InviteWithTeam = {
  id: string;
  teamId: string;
  status: string;
  team: { name: string; slug: string; city: string | null; rating: { rating: number; wins: number; losses: number; ties: number } | null };
};

function InviteList({
  title,
  invites,
  tone,
  tournamentId,
  showManualStatus,
  showRemove,
}: {
  title: string;
  invites: InviteWithTeam[];
  tone: "emerald" | "slate" | "rose";
  tournamentId: string;
  showManualStatus?: boolean;
  showRemove?: boolean;
}) {
  if (invites.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-bold text-navy-900">{title}</h2>
      <ul className="space-y-2">
        {invites.map((inv) => (
          <li key={inv.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="text-sm">
              <Link href={`/teams/${inv.team.slug}`} className="font-medium text-navy-800 hover:underline">
                {inv.team.name}
              </Link>
              <span className="ml-2 text-xs text-slate-400">
                {inv.team.city ?? ""} {inv.team.rating ? `· ${formatRating(inv.team.rating.rating)} · ${formatRecord(inv.team.rating.wins, inv.team.rating.losses, inv.team.rating.ties)}` : "· unrated"}
              </span>
            </span>
            <div className="flex gap-2">
              {showManualStatus && (
                <>
                  <form action={setInviteStatusAction}>
                    <input type="hidden" name="inviteId" value={inv.id} />
                    <input type="hidden" name="status" value="ACCEPTED" />
                    <button className="btn-ghost text-emerald-700">Mark accepted</button>
                  </form>
                  <form action={setInviteStatusAction}>
                    <input type="hidden" name="inviteId" value={inv.id} />
                    <input type="hidden" name="status" value="DECLINED" />
                    <button className="btn-ghost text-rose-600">Mark declined</button>
                  </form>
                </>
              )}
              {showRemove && (
                <form action={removeInviteAction}>
                  <input type="hidden" name="inviteId" value={inv.id} />
                  <button className="btn-ghost text-slate-500">Clear</button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
