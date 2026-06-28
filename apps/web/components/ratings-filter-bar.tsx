"use client";

import { useRef } from "react";
import { AGE_GROUPS, CLASSIFICATIONS } from "@nbr/core";
import { ageGroupLabel } from "@/lib/format";

/**
 * Public ratings filter. It's a plain GET form (works without JS). When live
 * search is enabled (admin setting), changing any control auto-submits — text is
 * debounced — so there's no Apply button. When disabled, the Apply button shows.
 */
export function RatingsFilterBar({
  search,
  division,
  includeProvisional,
  sort,
  liveSearch,
}: {
  search?: string;
  division: string;
  includeProvisional: boolean;
  sort: string;
  liveSearch: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submitNow = () => {
    if (!liveSearch) return;
    formRef.current?.requestSubmit();
  };
  const submitDebounced = () => {
    if (!liveSearch) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => formRef.current?.requestSubmit(), 350);
  };

  return (
    <form ref={formRef} method="get" className="card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-[200px] flex-1">
        <label className="label" htmlFor="q">
          Search teams
        </label>
        <input
          id="q"
          name="q"
          defaultValue={search}
          placeholder="Team name…"
          className="input"
          onChange={submitDebounced}
        />
      </div>
      <div>
        <label className="label" htmlFor="division">
          Division
        </label>
        <select id="division" name="division" defaultValue={division} className="input" onChange={submitNow}>
          <optgroup label="Youth (age group)">
            {AGE_GROUPS.map((a) => (
              <option key={a} value={a}>
                {ageGroupLabel(a)}
              </option>
            ))}
          </optgroup>
          <optgroup label="High school (varsity)">
            {CLASSIFICATIONS.map((c) => (
              <option key={c} value={`v:${c}`}>
                Varsity {c}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="sort">
          Sort by
        </label>
        <select id="sort" name="sort" defaultValue={sort} className="input" onChange={submitNow}>
          <option value="name">Alphabetical</option>
          <option value="rating">Rating</option>
          <option value="games">Games played</option>
        </select>
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
        <input
          type="checkbox"
          name="prov"
          value="1"
          defaultChecked={includeProvisional}
          className="h-4 w-4 shrink-0"
          onChange={submitNow}
        />
        Include provisional
      </label>
      {!liveSearch && (
        <button type="submit" className="btn-primary">
          Apply
        </button>
      )}
    </form>
  );
}
