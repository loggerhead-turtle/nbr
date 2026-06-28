"use client";

import { useActionState } from "react";
import {
  updateTeamAction,
  deleteTeamAction,
  clearTeamLocationAction,
  type ActionState,
} from "@/lib/admin-actions";
import { AGE_GROUPS, CLASSIFICATIONS } from "@nbr/core";
import { ageGroupLabel } from "@/lib/format";

const initial: ActionState = {};

export interface TeamRowData {
  id: string;
  name: string;
  gcTeamId: string | null;
  ageGroup: string | null;
  classification: string | null;
  city: string | null;
  locationLocked: boolean;
  scrapeEnabled: boolean;
  isGhost: boolean;
  games: number;
  lastScrapedAt: string | null;
}

export function TeamRow({ team }: { team: TeamRowData }) {
  const [state, action, pending] = useActionState(updateTeamAction, initial);
  const unclassified = !team.ageGroup && !team.classification;

  return (
    <div className="card p-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="teamId" value={team.id} />
        <div className="min-w-[180px] flex-1">
          <label className="label">Team name</label>
          <input name="name" defaultValue={team.name} className="input" />
        </div>
        <div className="min-w-[170px]">
          <label className="label">GameChanger ID</label>
          <input
            name="gcTeamId"
            defaultValue={team.gcTeamId ?? ""}
            placeholder="(none)"
            className="input font-mono text-xs"
          />
        </div>
        <div className="min-w-[130px]">
          <label className="label">City</label>
          <input
            name="city"
            defaultValue={team.city ?? ""}
            placeholder="(none)"
            className="input"
          />
        </div>
        <div>
          <label className="label">Age (youth)</label>
          <select
            name="ageGroup"
            defaultValue={team.ageGroup ?? ""}
            className={`input ${unclassified ? "border-amber-400 bg-amber-50" : ""}`}
          >
            <option value="">—</option>
            {AGE_GROUPS.map((a) => (
              <option key={a} value={a}>
                {ageGroupLabel(a)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Class (varsity)</label>
          <select
            name="classification"
            defaultValue={team.classification ?? ""}
            className={`input ${unclassified ? "border-amber-400 bg-amber-50" : ""}`}
          >
            <option value="">—</option>
            {CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" name="scrapeEnabled" defaultChecked={team.scrapeEnabled} /> Scrape
        </label>
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
      </form>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>
          {team.city ? team.city : "no location"}
          {team.locationLocked && " 🔒"}
          {" · "}
          {team.games} game{team.games === 1 ? "" : "s"}
          {team.isGhost && " · unverified"}
          {team.lastScrapedAt && ` · last scraped ${team.lastScrapedAt}`}
        </span>
        <div className="flex items-center gap-3">
          {state.error && <span className="font-medium text-rose-600">{state.error}</span>}
          {state.ok && <span className="font-medium text-emerald-600">{state.message}</span>}
          {team.city && (
            <form action={clearTeamLocationAction}>
              <input type="hidden" name="teamId" value={team.id} />
              <button
                type="submit"
                className="font-medium text-slate-500 hover:text-slate-700"
                onClick={(e) => {
                  if (!confirm(`Remove the location for “${team.name}”? It won’t be re-scraped.`)) {
                    e.preventDefault();
                  }
                }}
              >
                Remove location
              </button>
            </form>
          )}
          <form action={deleteTeamAction}>
            <input type="hidden" name="teamId" value={team.id} />
            <button
              type="submit"
              className="font-medium text-rose-500 hover:text-rose-700"
              onClick={(e) => {
                if (!confirm(`Delete “${team.name}” and all its games? This cannot be undone.`)) {
                  e.preventDefault();
                }
              }}
            >
              Delete
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
