import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeamBySlug, getTeamRank } from "@/lib/queries";
import {
  formatRating,
  formatRecord,
  ageGroupLabel,
  formatDate,
} from "@/lib/format";
import { ProvisionalBadge, ConfidenceBadge, GhostBadge } from "@/components/badges";
import { RatingChart } from "@/components/rating-chart";
import { TeamContact } from "@/components/account/team-contact";

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) return { title: "Team not found" };
  const rating = team.rating ? `${formatRating(team.rating.rating)} NBR` : "Unrated";
  const rec = team.rating
    ? formatRecord(team.rating.wins, team.rating.losses, team.rating.ties)
    : "";
  return {
    title: `${team.name} — Baseball Rating & Record`,
    description: `${team.name}${team.city ? ` of ${team.city}, ${team.state}` : ""}: ${rating}${
      rec ? `, ${rec} record` : ""
    }. ${ageGroupLabel(team.ageGroup)} National Baseball Ratings.`,
    alternates: { canonical: `/teams/${team.slug}` },
  };
}

export default async function TeamPage({ params }: Params) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  // Unclassified teams (no age group and no varsity class) are admin-only.
  if (!team || (!team.ageGroup && !team.classification)) notFound();

  const games = [
    ...team.homeGames.map((g) => ({
      id: g.id,
      date: g.playedAt,
      opponent: g.awayTeam,
      us: g.homeScore,
      them: g.awayScore,
      home: true,
      neutral: g.neutralSite,
    })),
    ...team.awayGames.map((g) => ({
      id: g.id,
      date: g.playedAt,
      opponent: g.homeTeam,
      us: g.awayScore,
      them: g.homeScore,
      home: false,
      neutral: g.neutralSite,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const rank = team.rating ? await getTeamRank(team.id, team.rating.rating) : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: team.name,
    sport: "Baseball",
    ...(team.city ? { location: { "@type": "Place", name: `${team.city}, ${team.state}` } } : {}),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link href="/" className="text-sm text-navy-700 hover:underline">
        ← All ratings
      </Link>

      {/* Header card */}
      <div className="card mt-3 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-navy-900">{team.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {team.city ? `${team.city}, ${team.state}` : team.state} ·{" "}
              {team.classification ? `Varsity · ${team.classification}` : ageGroupLabel(team.ageGroup)}
              {team.division ? ` · ${team.division}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {team.rating?.isProvisional && <ProvisionalBadge />}
              {team.rating && <ConfidenceBadge rd={team.rating.rd} />}
              {team.isGhost && <GhostBadge />}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              NBR Rating
            </p>
            <p className="text-4xl font-black tabular-nums text-navy-900">
              {team.rating ? formatRating(team.rating.rating) : "—"}
            </p>
            {rank && (
              <p className="mt-1 text-xs text-slate-500">
                #{rank} overall (non-provisional)
              </p>
            )}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Record"
            value={
              team.rating
                ? formatRecord(team.rating.wins, team.rating.losses, team.rating.ties)
                : "—"
            }
          />
          <Stat label="Games" value={team.rating ? String(team.rating.gamesPlayed) : "0"} />
          <Stat
            label="Rating Deviation"
            value={team.rating ? `±${Math.round(team.rating.rd)}` : "—"}
          />
          <Stat label="State" value={team.state} />
        </dl>
      </div>

      {/* Claim / contact */}
      <div className="mt-6">
        <TeamContact teamId={team.id} teamSlug={team.slug} />
      </div>

      {/* Chart */}
      <div className="card mt-6 p-6">
        <h2 className="text-lg font-bold text-navy-900">Rating history</h2>
        <p className="mb-3 text-sm text-slate-500">How this team’s rating has moved over time.</p>
        <RatingChart points={team.ratingHistory.map((h) => ({ asOf: h.asOf, rating: h.rating }))} />
      </div>

      {/* Recent games */}
      <div className="card mt-6 overflow-hidden">
        <h2 className="px-6 pt-6 text-lg font-bold text-navy-900">Recent games</h2>
        {games.length === 0 ? (
          <p className="px-6 pb-6 pt-2 text-sm text-slate-500">No completed games on record yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-2">Date</th>
                <th className="px-6 py-2">Opponent</th>
                <th className="px-6 py-2 text-center">Result</th>
                <th className="px-6 py-2 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {games.map((g) => {
                const won = (g.us ?? 0) > (g.them ?? 0);
                const tie = (g.us ?? 0) === (g.them ?? 0);
                return (
                  <tr key={g.id}>
                    <td className="px-6 py-3 text-slate-500">{formatDate(g.date)}</td>
                    <td className="px-6 py-3">
                      <Link
                        href={`/teams/${g.opponent.slug}`}
                        className="font-medium text-navy-800 hover:underline"
                      >
                        {g.opponent.name}
                      </Link>
                      <span className="ml-2 text-xs text-slate-400">
                        {g.neutral ? "(neutral)" : g.home ? "(home)" : "(away)"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span
                        className={`badge ${
                          tie
                            ? "bg-slate-200 text-slate-700"
                            : won
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {tie ? "T" : won ? "W" : "L"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {g.us}–{g.them}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Ratings are independent estimates for informational purposes. Not affiliated with
        GameChanger Media, Inc.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold tabular-nums text-navy-900">{value}</dd>
    </div>
  );
}
