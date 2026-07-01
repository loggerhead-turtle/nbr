"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { AGE_GROUPS } from "@nbr/core";
import { ageGroupLabel } from "@/lib/format";
import { quickAddTeamsAction, type ActionState } from "@/lib/admin-actions";
import { NbrLink } from "./team-links";
import type { TeamOpponentsView } from "@nbr/db";

const BASE = "/admin/gc-lookup";

/**
 * Front-page-style live search for VERIFIED teams, with an age-group filter.
 * Both controls soft-navigate (?q=&age=) so scroll position is kept.
 */
export function GcLookupSearch({
  defaultQuery,
  defaultAge,
}: {
  defaultQuery?: string;
  defaultAge?: string;
}) {
  const router = useRouter();
  const qRef = useRef<HTMLInputElement>(null);
  const ageRef = useRef<HTMLSelectElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = () => {
    const params = new URLSearchParams();
    const q = qRef.current?.value.trim();
    const age = ageRef.current?.value;
    if (q) params.set("q", q);
    if (age) params.set("age", age);
    const qs = params.toString();
    router.replace(qs ? `${BASE}?${qs}` : BASE, { scroll: false });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={qRef}
        defaultValue={defaultQuery}
        placeholder="Search verified teams by name…"
        className="input min-w-[200px] flex-1"
        onChange={() => {
          if (debounce.current) clearTimeout(debounce.current);
          debounce.current = setTimeout(go, 400);
        }}
      />
      <select ref={ageRef} defaultValue={defaultAge ?? ""} className="input" onChange={go}>
        <option value="">All ages</option>
        {AGE_GROUPS.map((a) => (
          <option key={a} value={a}>
            {ageGroupLabel(a)}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Floating "add teams" box that stays fixed on screen while you scroll the
 * lookup page — paste the GameChanger IDs you found and add them without
 * scrolling back up. Uses the same bulk quick-add as the Add-team page.
 */
export function StickyAddTeams() {
  const [state, action, pending] = useActionState<ActionState, FormData>(quickAddTeamsAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the box after a successful add so the next batch starts fresh.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(92vw,22rem)] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <form ref={formRef} action={action} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            name="ids"
            placeholder="Paste GameChanger ID(s)…"
            className="input flex-1 font-mono text-sm"
            aria-label="GameChanger team IDs"
          />
          <button type="submit" disabled={pending} className="btn-primary shrink-0 disabled:opacity-50">
            {pending ? "Adding…" : "Add teams"}
          </button>
        </div>
        {state.error && <p className="text-xs font-medium text-rose-600">{state.error}</p>}
        {state.ok && state.message && (
          <p className="text-xs font-medium text-emerald-700">{state.message}</p>
        )}
      </form>
    </div>
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
