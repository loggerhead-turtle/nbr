import Link from "next/link";
import { prisma, Prisma } from "@nbr/db";
import { haversineMiles, effectiveDistanceMi } from "@nbr/core";
import { getCurrentUser } from "@/lib/user-auth";
import { ScrimmageRequestControl } from "@/components/account/scrimmage-request-control";
import { MyTeamSelector } from "@/components/account/my-team-selector";
import { TeamMedallion } from "@/components/team-medallion";
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

  // Teams this coach manages (claimed). Coaches can run several, so we let them
  // pick which one they're scheduling for.
  const myClaims = user
    ? await prisma.claim.findMany({
        where: { userId: user.id },
        select: {
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
              ageGroup: true,
              classification: true,
              latitude: true,
              longitude: true,
              rating: { select: { rating: true } },
            },
          },
        },
      })
    : [];
  const myTeams = myClaims.map((c) => c.team);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-black text-navy-900">Find a scrimmage</h1>

      {myTeams.length > 0 ? (
        <CoachView teams={myTeams} selectedTeamId={sp.team?.trim()} />
      ) : (
        <VisitorView q={sp.q} signedIn={!!user} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Coach view: pick which of your teams, see evenly matched opponents, request.
// ─────────────────────────────────────────────────────────────────────────────

type MyTeam = {
  id: string;
  name: string;
  slug: string;
  ageGroup: string | null;
  classification: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: { rating: number } | null;
};

async function CoachView({
  teams,
  selectedTeamId,
}: {
  teams: MyTeam[];
  selectedTeamId?: string;
}) {
  const ids = new Set(teams.map((t) => t.id));
  const selected = (selectedTeamId && ids.has(selectedTeamId)
    ? teams.find((t) => t.id === selectedTeamId)
    : teams[0])!;

  const candidates = selected.rating
    ? await loadCandidates(selected, selected.rating.rating, true)
    : [];

  // Pending requests already sent from the selected team → show "Sent / Cancel".
  const pending = await prisma.scrimmageRequest.findMany({
    where: { fromTeamId: selected.id, status: "PENDING" },
    select: { id: true, toTeamId: true },
  });
  const pendingByTarget = new Map(pending.map((r) => [r.toTeamId, r.id]));

  return (
    <>
      <p className="mt-1 text-sm text-slate-500">
        Choose the team you’re managing — the matched opponents below update for it, and any request
        you send comes from that team.
      </p>

      <MyTeamSelector teams={teams.map((t) => ({ id: t.id, name: t.name }))} selectedId={selected.id} />

      {!selected.rating ? (
        <p className="mt-6 text-sm text-slate-500">
          <strong>{selected.name}</strong> isn’t rated yet, so we can’t match it by skill. Once it has
          enough games, evenly matched opponents will appear here.
        </p>
      ) : candidates.length === 0 ? (
        <div className="mt-6 card p-6 text-sm text-slate-500">
          No similarly rated teams in {selected.name}’s division yet. Check back as more teams are
          rated.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-slate-500">
            Evenly matched opponents for <strong className="text-navy-800">{selected.name}</strong> —
            nearest first, coach-confirmed teams promoted.
          </p>
          {candidates.map((c) => (
            <OpponentCard key={c.id} c={c}>
              <ScrimmageRequestControl
                fromTeamId={selected.id}
                toTeamId={c.id}
                initialRequestId={pendingByTarget.get(c.id) ?? null}
                targetClaimed={c.confirmed}
              />
            </OpponentCard>
          ))}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visitor view (logged out, or signed in without a claimed team): search for a
// team you'd like to play; requesting prompts sign-in / claiming a team.
// ─────────────────────────────────────────────────────────────────────────────

async function VisitorView({ q, signedIn }: { q?: string; signedIn: boolean }) {
  const query = q?.trim();

  const where: Prisma.TeamWhereInput = {
    isGhost: false,
    rating: { isNot: null },
    ...(query
      ? { name: { contains: query, mode: "insensitive" } }
      : { scrimmagePref: { is: { seekingScrimmage: true } } }),
  };
  const teams = await prisma.team.findMany({
    where,
    include: { rating: true, scrimmagePref: true, claim: true },
    orderBy: { name: "asc" },
    take: 25,
  });
  const cards = teams.map(toCard);

  return (
    <>
      <p className="mt-1 text-sm text-slate-500">
        Search for a team you’d like to scrimmage. When you send a request we’ll have you sign in (or
        create an account) and pick the team you manage.
      </p>

      <form method="get" className="mt-5 card flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="q">
            Find a team to play
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Search team name…"
            className="input"
          />
        </div>
        <button className="btn-primary">Search</button>
      </form>

      <div className="mt-6 space-y-3">
        {!query && cards.length > 0 && (
          <p className="text-sm text-slate-500">Teams currently looking for scrimmages:</p>
        )}
        {cards.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">
            {query
              ? `No rated teams match “${query}”.`
              : "No teams are flagged as looking for scrimmages right now — search by name to find any team."}
          </div>
        ) : (
          cards.map((c) => (
            <OpponentCard key={c.id} c={c}>
              {signedIn ? (
                <Link href="/submit-team" className="btn-primary whitespace-nowrap text-sm">
                  Claim your team to request
                </Link>
              ) : (
                <Link
                  href={`/login?next=${encodeURIComponent("/scrimmages")}`}
                  className="btn-primary whitespace-nowrap text-sm"
                >
                  Log in to request
                </Link>
              )}
            </OpponentCard>
          ))
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared opponent card + loaders
// ─────────────────────────────────────────────────────────────────────────────

type Card = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string;
  ageGroup: string | null;
  classification: string | null;
  ratingValue: number | null;
  record: string;
  notes: string | null;
  confirmed: boolean;
  seeking: boolean;
  distanceMiles: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

function OpponentCard({ c, children }: { c: Card; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/teams/${c.slug}`} className="font-semibold text-navy-800 hover:underline">
              {c.name}
            </Link>
            <TeamMedallion tier={c.confirmed ? "green" : "gray"} />
            {c.seeking && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                Looking for scrimmages
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {c.city ? `${c.city}, ${c.state}` : c.state} ·{" "}
            {c.classification ? `Varsity ${c.classification}` : ageGroupLabel(c.ageGroup)} · Rating{" "}
            {c.ratingValue ? formatRating(c.ratingValue) : "—"} · {c.record}
            {c.distanceMiles != null && (
              <>
                {" · "}
                <span className="font-medium text-slate-600">
                  ~{Math.round(c.distanceMiles)} mi away
                </span>
              </>
            )}
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
        {children}
      </div>
    </div>
  );
}

function toCard(t: {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string;
  ageGroup: string | null;
  classification: string | null;
  rating: { rating: number; wins: number; losses: number; ties: number } | null;
  scrimmagePref: { notes: string | null; seekingScrimmage: boolean } | null;
  claim: { status: string } | null;
  distanceMiles?: number | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}): Card {
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
    confirmed: t.claim?.status === "APPROVED",
    seeking: !!t.scrimmagePref?.seekingScrimmage,
    distanceMiles: t.distanceMiles ?? null,
    contactEmail: t.contactEmail ?? null,
    contactPhone: t.contactPhone ?? null,
  };
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
): Promise<Card[]> {
  const where: Prisma.TeamWhereInput = {
    id: { not: selected.id },
    isGhost: false,
    rating: { is: { rating: { gte: rating - BAND, lte: rating + BAND } } },
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
      const distanceMiles =
        here && t.latitude != null && t.longitude != null
          ? haversineMiles(here, { lat: t.latitude, lng: t.longitude })
          : null;
      // Contact is shown to the signed-in coach only when the other coach opted in.
      const optedIn = signedIn && t.claim?.contactOptIn;
      const card = toCard({
        ...t,
        distanceMiles,
        contactEmail: optedIn ? t.claim!.user.email : null,
        contactPhone: optedIn ? t.claim!.user.phone : null,
      });
      return {
        card,
        _eff: effectiveDistanceMi(distanceMiles, card.confirmed),
        _ratingGap: Math.abs((t.rating?.rating ?? 0) - rating),
      };
    })
    .sort((a, b) => a._eff - b._eff || a._ratingGap - b._ratingGap)
    .slice(0, 50)
    .map((x) => x.card);
}
