"use client";

import { useState, useRef, useTransition } from "react";
import { inviteTeamAction } from "@/lib/tournament-actions";

interface Hit {
  id: string;
  name: string;
  city: string | null;
  rating: number | null;
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
  const [hits, setHits] = useState<Hit[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/teams/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setHits(data.teams ?? []);
      } catch {
        setHits([]);
      }
    }, 250);
  };

  const invite = (teamId: string) => {
    const fd = new FormData();
    fd.set("tournamentId", tournamentId);
    fd.set("teamId", teamId);
    startTransition(async () => {
      await inviteTeamAction(fd);
      setInvited((s) => new Set(s).add(teamId));
    });
  };

  return (
    <div className="card p-4">
      <label className="label" htmlFor="invsearch">Invite a team</label>
      <input
        id="invsearch"
        className="input"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          search(e.target.value);
        }}
        placeholder="Search team name…"
        autoComplete="off"
      />
      {hits.length > 0 && (
        <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
          {hits.map((h) => {
            const status = excluded[h.id];
            const already = invited.has(h.id);
            return (
              <li key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-slate-800">{h.name}</span>
                  {h.city && <span className="ml-1 text-xs text-slate-400">{h.city}</span>}
                  {h.rating != null && <span className="ml-2 tabular-nums text-navy-700">{h.rating}</span>}
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
