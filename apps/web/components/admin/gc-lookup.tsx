"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NbrLink } from "./team-links";
import type { TeamOpponentsView } from "@nbr/db";

const BASE = "/admin/gc-lookup";

/** Front-page-style live search for VERIFIED teams; soft-navigates to ?q=. */
export function GcLookupSearch({ defaultQuery }: { defaultQuery?: string }) {
  const router = useRouter();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (q: string) => {
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    router.replace(`${BASE}${qs}`, { scroll: false });
  };

  return (
    <input
      defaultValue={defaultQuery}
      placeholder="Search verified teams by name…"
      className="input w-full"
      autoFocus
      onChange={(e) => {
        const v = e.target.value;
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => go(v), 400);
      }}
    />
  );
}

/** Copy a team name to the clipboard to paste into GameChanger search. */
function CopyNameButton({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(name);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked (rare) — select-and-copy fallback via prompt.
          window.prompt("Copy this team name:", name);
        }
      }}
      className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${
        copied ? "bg-emerald-600 text-white" : "bg-navy-700 text-white hover:bg-navy-600"
      }`}
      title="Copy the team name to paste into GameChanger search"
    >
      {copied ? "Copied ✓" : "Copy name"}
    </button>
  );
}

/**
 * The selected verified team's still-unverified (ghost) opponents. Each row: the
 * opponent's name + a copy button to paste into GameChanger, so you can find the
 * real team and add it by id. Verify one, its games attach to the real record.
 */
export function UnverifiedOpponentList({ view }: { view: TeamOpponentsView }) {
  const { team, opponents } = view;
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-900 px-4 py-2 text-sm text-white">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          {team.name}
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
            {team.ageGroup ?? "no age"}
          </span>
          <NbrLink slug={team.slug} />
          {team.gcTeamId && (
            <a
              href={`https://web.gc.com/teams/${team.gcTeamId}/schedule`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-sky-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-sky-700"
            >
              GC schedule ↗
            </a>
          )}
        </span>
        <span className="text-xs text-navy-100">
          {opponents.length} unverified opponent{opponents.length === 1 ? "" : "s"}
        </span>
      </div>

      {opponents.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">
          🎉 Every opponent on this team&rsquo;s schedule is already a verified team.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {opponents.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
                  <span className="truncate">{o.name}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {o.ageGroup ?? "no age"}
                  </span>
                </p>
                <p className="text-xs text-slate-400">
                  {o.games} game{o.games === 1 ? "" : "s"} · last {o.lastPlayed}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(o.name + " gamechanger")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                  title="Web search for this team's GameChanger page"
                >
                  Search ↗
                </a>
                <CopyNameButton name={o.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
