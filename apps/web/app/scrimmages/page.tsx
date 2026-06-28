import Link from "next/link";
import { prisma, Prisma } from "@nbr/db";
import { haversineMiles, effectiveDistanceMi } from "@nbr/core";
import { getCurrentUser } from "@/lib/user-auth";
import { sendScrimmageRequestAction } from "@/lib/scrimmage-actions";
import { formatRating, formatRecord, ageGroupLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find scrimmages", robots: { index: false } };

// Rating window for a "similarly matched" opponent.
const BAND = 150;

export default async function ScrimmagesPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();

  // A coach's own claimed teams (used to default the picker and to gate scheduling).
  const myClaims = user
    ? await prisma.claim.findMany({ where: { userId: user.id }, select: { teamId: true } })
    : [];
  const myTeamIds = new Set(myClaims.map((c) => c.teamId));

  // Resolve the selected "your team": explicit ?team=, else the coach's first
  // claimed team, else nothing (visitor must search).
  let selectedId = sp.team?.trim() || null;
  if (!selectedId && myClaims[0]) selectedId = myClaims[0].teamId;

  const selected = selectedId
    ? await prisma.team.findUnique({
        where: { id: selectedId },
        include: { rating: true },
      })
    : null;

  const candidates = selected?.rating
    ? await loadCandidates(selected, selected.rating.rating, !!user)
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-black text-navy-900">Find a scrimmage</h1>
      <p className="mt-1 text-sm text-slate-500">
        Pick a team to see evenly matched opponents nearby — sorted by distance, with
        coach-confirmed teams first.
      </p>

      <TeamPicker selected={selected} q={sp.q} myTeamIds={myTeamIds} />

      {!selected ? null : !selected.rating ? (
        <p className="mt-6 text-sm text-slate-500">
          <strong>{selected.name}</strong> isn’t rated yet, so we can’t match by skill. Once it has
          enough games, matches will appear here.
        </p>
      ) : (
        <Results
          selected={selected}
          candidates={candidates}
          signedIn={!!user}
          ownsSelected={myTeamIds.has(selected.id)}
        />
      )}
    </div>
  );
}

async function TeamPicker({
  selected,
  q,
  myTeamIds,
}: {
  selected: { id: string; name: string; slug: string } | null;
  q?: string;
  myTeamIds: Set<string>;
}) {
  // When searching (no team chosen yet, or actively changing), show matches to pick.
  const query = q?.trim();
  const matches = query
    ? await prisma.team.findMany({
        where: { name: { contains: query, mode: "insensitive" }, rating: { isNot: null } },
        select: { id: true, name: true, slug: true, city: true, state: true },
        orderBy: { name: "asc" },
        take: 20,
      })
    : [];

  return (
    <div className="mt-5 card p-4">
      {selected && (
        <p className="mb-3 text-sm">
          Showing matches for <strong className="text-navy-900">{selected.name}</strong>
          {myTeamIds.has(selected.id) && (
            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
              your team
            </span>
          )}
        </p>
      )}
      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="q">
            {selected ? "Choose a different team" : "Select your team"}
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Search team name…"
            className="input"
          />
        </div>
        <button className="btn-ghost">Search</button>
      </form>

      {query && (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {matches.length === 0 && <li className="py-2 text-slate-500">No rated teams match “{query}”.</li>}
          {matches.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <span>
                <span className="font-medium text-navy-900">{m.name}</span>{" "}
                <span className="text-xs text-slate-500">
                  {m.city ? `${m.city}, ${m.state}` : m.state}
                </span>
              </span>
              <Link href={`/scrimmages?team=${m.id}`} className="btn-ghost text-xs">
                Select
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Results({
  selected,
  candidates,
  signedIn,
  ownsSelected,
}: {
  selected: { id: string; slug: string; name: string };
  candidates: Awaited<ReturnType<typeof loadCandidates>>;
  signedIn: boolean;
  ownsSelected: boolean;
}) {
  if (candidates.length === 0) {
    return (
      <div className="mt-6 card p-6 text-sm text-slate-500">
        No similarly rated teams found in the same division yet. Check back as more teams are rated.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {candidates.map((c) => (
        <div key={c.id} className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/teams/${c.slug}`} className="font-semibold text-navy-800 hover:underline">
                  {c.name}
                </Link>
                {c.confirmed && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                    ✓ Coach-confirmed
                  </span>
                )}
                {c.seeking && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                    Looking for scrimmages
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {c.city ? `${c.city}, ${c.state}` : c.state} ·{" "}
                {c.classification ? `Varsity ${c.classification}` : ageGroupLabel(c.ageGroup)} ·{" "}
                Rating {c.ratingValue ? formatRating(c.ratingValue) : "—"} · {c.record} ·{" "}
                <span className="font-medium text-slate-600">
                  {c.distanceMiles == null ? "distance unknown" : `~${Math.round(c.distanceMiles)} mi away`}
                </span>
              </p>
              {c.notes && <p className="mt-1 text-sm text-slate-600">“{c.notes}”</p>}
              {c.contactEmail && (
                <p className="mt-1 text-xs text-slate-500">
                  Contact:{" "}
                  <a href={`mailto:${c.contactEmail}`} className="text-navy-700 underline">
                    {c.contactEmail}
                  </a>
                  {c.contactPhone ? ` · ${c.contactPhone}` : ""}
                </p>
              )}
            </div>

            {/* Scheduling is gated: logged-out → login; signed-in coach of the
                selected team → real request; otherwise → claim the team. */}
            {signedIn && ownsSelected ? (
              <form action={sendScrimmageRequestAction} className="flex w-full max-w-xs flex-col gap-2">
                <input type="hidden" name="fromTeamId" value={selected.id} />
                <input type="hidden" name="toTeamId" value={c.id} />
                <input name="message" placeholder="Optional message" className="input text-sm" />
                <button className="btn-primary">Request scrimmage</button>
              </form>
            ) : !signedIn ? (
              <Link
                href={`/login?next=${encodeURIComponent(`/scrimmages?team=${selected.id}`)}`}
                className="btn-primary whitespace-nowrap"
              >
                Log in to schedule
              </Link>
            ) : (
              <Link href={`/teams/${selected.slug}`} className="btn-ghost whitespace-nowrap text-sm">
                Claim {selected.name} to schedule
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

async function loadCandidates(
  selected: {
    id: string;
    ageGroup: string | null;
    classification: string | null;
    latitude: number | null;
    longitude: number | null;
  },
  rating: number,
  signedIn: boolean,
) {
  const where: Prisma.TeamWhereInput = {
    id: { not: selected.id },
    rating: { is: { rating: { gte: rating - BAND, lte: rating + BAND } } },
    // Match within the same division: youth by age group, varsity by class.
    ...(selected.classification
      ? { classification: selected.classification }
      : selected.ageGroup
        ? { ageGroup: selected.ageGroup as Prisma.TeamWhereInput["ageGroup"] }
        : {}),
  };

  const teams = await prisma.team.findMany({
    where,
    include: { rating: true, scrimmagePref: true, claim: { include: { user: true } } },
    take: 200,
  });

  const here =
    selected.latitude != null && selected.longitude != null
      ? { lat: selected.latitude, lng: selected.longitude }
      : null;

  return teams
    .map((t) => {
      const confirmed = t.claim?.status === "APPROVED";
      const distanceMiles =
        here && t.latitude != null && t.longitude != null
          ? haversineMiles(here, { lat: t.latitude, lng: t.longitude })
          : null;
      return {
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
        confirmed,
        seeking: !!t.scrimmagePref?.seekingScrimmage,
        distanceMiles,
        // Contact shown to a signed-in viewer only if the other coach opted in.
        contactEmail: signedIn && t.claim?.contactOptIn ? t.claim.user.email : null,
        contactPhone: signedIn && t.claim?.contactOptIn ? t.claim.user.phone : null,
        _eff: effectiveDistanceMi(distanceMiles, confirmed),
        _ratingGap: Math.abs((t.rating?.rating ?? 0) - rating),
      };
    })
    // Confirmed-promoted-by-distance, then nearest, then closest in rating.
    .sort((a, b) => a._eff - b._eff || a._ratingGap - b._ratingGap)
    .slice(0, 50);
}
