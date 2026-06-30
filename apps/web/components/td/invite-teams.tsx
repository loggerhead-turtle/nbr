"use client";

import { useState, useRef, useTransition, useEffect, useCallback } from "react";
import { inviteTeamAction, inviteTeamsAction } from "@/lib/tournament-actions";
import { TeamMedallion } from "@/components/team-medallion";
import { formatRating } from "@/lib/format";

interface Hit {
  id: string;
  name: string;
  city: string | null;
  state: string;
  rating: number | null;
  hasApprovedClaim: boolean;
  distanceMiles: number | null;
  /** How many of this director's tournaments the team has attended (any age). */
  participations: number;
}

/** `excluded` maps teamId -> status so already-in/declined teams can't be re-invited. */
export function InviteTeams({
  tournamentId,
  excluded,
}: {
  tournamentId: string;
  excluded: Record<string, "INVITED" | "ACCEPTED" | "DECLINED">;
}) {
  const [query, setQuery] = useState("");
  const [ratingMin, setRatingMin] = useState("");
  const [ratingMax, setRatingMax] = useState("");
  const [near, setNear] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const hasRating = ratingMin.trim() !== "" || ratingMax.trim() !== "";
    if (query.trim().length < 2 && !hasRating) {
      setHits([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (ratingMin.trim()) params.set("ratingMin", ratingMin.trim());
        if (ratingMax.trim()) params.set("ratingMax", ratingMax.trim());
        if (near.trim()) params.set("near", near.trim());
        params.set("tournamentId", tournamentId);
        const res = await fetch(`/api/teams/search?${params.toString()}`);
        const data = await res.json();
        setHits(data.teams ?? []);
      } catch {
        setHits([]);
      }
    }, 250);
  }, [query, ratingMin, ratingMax, near, tournamentId]);

  useEffect(() => {
    run();
  }, [run]);

  const invite = (teamId: string) => {
    const fd = new FormData();
    fd.set("tournamentId", tournamentId);
    fd.set("teamId", teamId);
    startTransition(async () => {
      await inviteTeamAction(fd);
      setInvited((s) => new Set(s).add(teamId));
    });
  };

  // Teams shown that can still be invited (not already invited/accepted/declined).
  const invitable = hits.filter((h) => !excluded[h.id] && !invited.has(h.id));
  // "Invite all" is offered only once an NBR range is set (so it targets a band).
  const hasRange = ratingMin.trim() !== "" || ratingMax.trim() !== "";

  const inviteAll = () => {
    const ids = invitable.map((h) => h.id);
    if (ids.length === 0) return;
    const fd = new FormData();
    fd.set("tournamentId", tournamentId);
    fd.set("teamIds", JSON.stringify(ids));
    startTransition(async () => {
      await inviteTeamsAction(fd);
      setInvited((s) => {
        const n = new Set(s);
        ids.forEach((id) => n.add(id));
        return n;
      });
    });
  };

  return (
    <div className="card p-4">
      <label className="label" htmlFor="invsearch">Find teams to invite</label>
      <input
        id="invsearch"
        className="input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search team name…"
        autoComplete="off"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <div className="w-24">
          <label className="label text-[11px]">Min NBR</label>
          <input
            className="input"
            value={ratingMin}
            onChange={(e) => setRatingMin(e.target.value)}
            inputMode="numeric"
            placeholder="any"
          />
        </div>
        <div className="w-24">
          <label className="label text-[11px]">Max NBR</label>
          <input
            className="input"
            value={ratingMax}
            onChange={(e) => setRatingMax(e.target.value)}
            inputMode="numeric"
            placeholder="any"
          />
        </div>
        <div className="min-w-[140px] flex-1">
          <label className="label text-[11px]">Near (city)</label>
          <input
            className="input"
            value={near}
            onChange={(e) => setNear(e.target.value)}
            placeholder="e.g. Provo"
            autoComplete="off"
          />
        </div>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        Search by name and/or a rating range. Add a city to sort by distance.
      </p>

      {hasRange && invitable.length > 0 && (
        <button
          onClick={inviteAll}
          disabled={pending}
          className="btn-primary mt-2 w-full disabled:opacity-50"
        >
          Invite all {invitable.length} in this NBR range
        </button>
      )}

      {hits.length > 0 && (
        <ul className="mt-2 max-h-80 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
          {hits.map((h) => {
            const status = excluded[h.id];
            const already = invited.has(h.id);
            return (
              <li key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5">
                  <TeamMedallion tier={h.hasApprovedClaim ? "green" : "gray"} />
                  <span className="font-medium text-slate-800">{h.name}</span>
                  {h.city && <span className="text-xs text-slate-400">{h.city}, {h.state}</span>}
                  {h.rating != null && <span className="tabular-nums text-navy-700">{formatRating(h.rating)}</span>}
                  {h.distanceMiles != null && (
                    <span className="text-xs text-slate-400">~{h.distanceMiles} mi</span>
                  )}
                  {h.participations > 0 && (
                    <span
                      title={`Played in ${h.participations} of your past tournaments`}
                      className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-navy-100 px-1 text-[10px] font-bold text-navy-800"
                    >
                      {h.participations}
                    </span>
                  )}
                </span>
                {status === "DECLINED" ? (
                  <span className="badge bg-rose-100 text-rose-700">declined — can’t re-invite</span>
                ) : status === "ACCEPTED" ? (
                  <span className="badge bg-emerald-100 text-emerald-700">accepted</span>
                ) : status === "INVITED" || already ? (
                  <span className="badge bg-slate-200 text-slate-600">invited</span>
                ) : (
                  <button onClick={() => invite(h.id)} disabled={pending} className="btn-ghost disabled:opacity-50">
                    Invite
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
