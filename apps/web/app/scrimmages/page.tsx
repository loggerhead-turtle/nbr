import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, Prisma } from "@nbr/db";
import { getCurrentUser } from "@/lib/user-auth";
import { sendScrimmageRequestAction } from "@/lib/scrimmage-actions";
import { formatRating, formatRecord, ageGroupLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find scrimmages", robots: { index: false } };

const BAND = 150;

export default async function ScrimmagesPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/scrimmages");

  const claims = await prisma.claim.findMany({
    where: { userId: user.id },
    include: { team: { include: { rating: true } } },
  });

  if (claims.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-black text-navy-900">Find scrimmages</h1>
        <p className="mt-3 text-slate-600">
          Claim your team first, then turn on “Looking for scrimmages” in your{" "}
          <Link href="/account" className="font-medium text-navy-700 underline">account</Link>.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const selected = claims.find((c) => c.team.id === sp.team) ?? claims[0]!;
  const team = selected.team;

  let candidates: Awaited<ReturnType<typeof loadCandidates>> = [];
  if (team.rating) candidates = await loadCandidates(team.id, team.rating.rating, team.ageGroup, team.classification);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-black text-navy-900">Find scrimmages</h1>
      <p className="mt-1 text-sm text-slate-500">
        Teams looking for scrimmages within ±{BAND} rating points of your team, in the same
        division.
      </p>

      <form method="get" className="mt-4 flex items-end gap-2">
        <div>
          <label className="label">Your team</label>
          <select name="team" defaultValue={team.id} className="input">
            {claims.map((c) => (
              <option key={c.team.id} value={c.team.id}>
                {c.team.name}
                {c.team.rating ? ` (${formatRating(c.team.rating.rating)})` : ""}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-ghost">Show matches</button>
      </form>

      {!team.rating && (
        <p className="mt-6 text-sm text-slate-500">
          {team.name} isn’t rated yet, so we can’t match by skill. Once it has enough games, matches
          will appear here.
        </p>
      )}

      <div className="mt-6 space-y-3">
        {team.rating && candidates.length === 0 && (
          <div className="card p-6 text-sm text-slate-500">
            No teams are currently seeking scrimmages near your rating. Check back later.
          </div>
        )}
        {candidates.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/teams/${c.slug}`} className="font-semibold text-navy-800 hover:underline">
                  {c.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {c.city ? `${c.city}, ${c.state}` : c.state} ·{" "}
                  {c.classification ? `Varsity ${c.classification}` : ageGroupLabel(c.ageGroup)} ·{" "}
                  Rating {c.ratingValue ? formatRating(c.ratingValue) : "—"} · {c.record}
                </p>
                {c.notes && <p className="mt-1 text-sm text-slate-600">“{c.notes}”</p>}
                {c.contactEmail && (
                  <p className="mt-1 text-xs text-slate-500">
                    Contact: <a href={`mailto:${c.contactEmail}`} className="text-navy-700 underline">{c.contactEmail}</a>
                    {c.contactPhone ? ` · ${c.contactPhone}` : ""}
                  </p>
                )}
              </div>
              <form action={sendScrimmageRequestAction} className="flex w-full max-w-xs flex-col gap-2">
                <input type="hidden" name="fromTeamId" value={team.id} />
                <input type="hidden" name="toTeamId" value={c.id} />
                <input name="message" placeholder="Optional message" className="input text-sm" />
                <button className="btn-primary">Request scrimmage</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function loadCandidates(
  teamId: string,
  rating: number,
  ageGroup: string | null,
  classification: string | null,
) {
  const where: Prisma.TeamWhereInput = {
    id: { not: teamId },
    scrimmagePref: { is: { seekingScrimmage: true } },
    rating: { is: { rating: { gte: rating - BAND, lte: rating + BAND } } },
    ...(ageGroup ? { ageGroup: ageGroup as Prisma.TeamWhereInput["ageGroup"] } : {}),
    ...(classification ? { classification } : {}),
  };
  const teams = await prisma.team.findMany({
    where,
    include: { rating: true, scrimmagePref: true, claim: { include: { user: true } } },
    take: 50,
  });
  return teams
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      city: t.city,
      state: t.state,
      ageGroup: t.ageGroup,
      classification: t.classification,
      ratingValue: t.rating?.rating ?? null,
      record: t.rating ? formatRecord(t.rating.wins, t.rating.losses, t.rating.ties) : "",
      notes: t.scrimmagePref?.notes ?? null,
      // Contact shown to this signed-in coach only if the other coach opted in.
      contactEmail: t.claim?.contactOptIn ? t.claim.user.email : null,
      contactPhone: t.claim?.contactOptIn ? t.claim.user.phone : null,
    }))
    .sort((a, b) => Math.abs((a.ratingValue ?? 0) - rating) - Math.abs((b.ratingValue ?? 0) - rating));
}
