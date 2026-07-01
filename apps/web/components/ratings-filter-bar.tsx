"use client";

import { useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AGE_GROUPS, CLASSIFICATIONS } from "@nbr/core";
import { ageGroupLabel } from "@/lib/format";

/**
 * Public ratings filter. It's a plain GET form (works without JS). With JS, it
 * navigates via the router with `scroll: false` — so the page keeps its scroll
 * position AND this client component stays mounted (the search box keeps focus
 * mid-typing instead of being torn down by a full-page GET). When live search is
 * enabled (admin setting), changing any control auto-submits — text debounced —
 * so there's no Apply button; otherwise the Apply button shows.
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
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Read the form and soft-navigate, dropping ?page so results reset to page 1. */
  const navigate = () => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const params = new URLSearchParams();
    const q = String(data.get("q") ?? "").trim();
    if (q) params.set("q", q);
    const div = String(data.get("division") ?? "").trim();
    if (div) params.set("division", div);
    const srt = String(data.get("sort") ?? "").trim();
    if (srt) params.set("sort", srt);
    if (data.get("prov")) params.set("prov", "1");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const submitNow = () => {
    if (!liveSearch) return;
    navigate();
  };
  const submitDebounced = () => {
    if (!liveSearch) return;
    if (debounce.current) clearTimeout(debounce.current);
    // Long enough to finish typing a team name without a mid-word reload.
    debounce.current = setTimeout(navigate, 700);
  };
  // With JS, intercept the (Apply / Enter) submit so it soft-navigates too — no
  // scroll jump. Without JS this handler never runs and the native GET submits.
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounce.current) clearTimeout(debounce.current);
    navigate();
  };

  return (
    <form
      ref={formRef}
      method="get"
      onSubmit={onSubmit}
      className="card flex flex-wrap items-end gap-3 p-4"
    >
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
          <option value="rating">NBR</option>
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
