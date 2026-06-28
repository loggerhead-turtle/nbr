"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AGE_GROUPS } from "@nbr/core";
import { ageGroupLabel } from "@/lib/format";
import { TeamMedallion } from "@/components/team-medallion";

interface Hit {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string;
  ageGroup: string | null;
  rating: number | null;
  hasApprovedClaim: boolean;
  distanceMiles: number | null;
}

interface Filters {
  ageGroup: string;
  ratingMin: string;
  ratingMax: string;
  near: string;
  maxMiles: string;
}

const EMPTY: Filters = { ageGroup: "14U", ratingMin: "", ratingMax: "", near: "", maxMiles: "" };
const LS_KEY = "nbr.scrimmageFilters";

/**
 * Front-page scrimmage finder: filter teams by age, rating range and distance,
 * see matches inline. Defaults save to the coach's account (or the browser when
 * signed out). Scheduling routes through the team page / login.
 */
export function ScrimmageFinderCard() {
  const [f, setF] = useState<Filters>(EMPTY);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [signedIn, setSignedIn] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load saved defaults: account first (if signed in), else browser.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/scrimmage-defaults");
        const data = await res.json();
        if (!active) return;
        setSignedIn(!!data.signedIn);
        if (data.defaults) {
          setF({ ...EMPTY, ...data.defaults });
          return;
        }
      } catch {
        /* ignore */
      }
      const ls = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
      if (ls && active) {
        try {
          setF({ ...EMPTY, ...JSON.parse(ls) });
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const set = (k: keyof Filters, v: string) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  };

  const search = () => {
    startSearch(async () => {
      const params = new URLSearchParams();
      if (f.ageGroup) params.set("age", f.ageGroup);
      if (f.ratingMin) params.set("ratingMin", f.ratingMin);
      if (f.ratingMax) params.set("ratingMax", f.ratingMax);
      if (f.near) params.set("near", f.near);
      if (f.maxMiles) params.set("maxMiles", f.maxMiles);
      try {
        const res = await fetch(`/api/teams/search?${params.toString()}`);
        const data = await res.json();
        setHits(data.teams ?? []);
      } catch {
        setHits([]);
      }
    });
  };

  const saveDefault = async () => {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, JSON.stringify(f));
    if (signedIn) {
      try {
        await fetch("/api/scrimmage-defaults", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(f),
        });
      } catch {
        /* ignore */
      }
    }
    setSaved(true);
  };

  return (
    <section className="card border-diamond-600/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-navy-900">⚾ Find a scrimmage</h2>
        <Link href="/scrimmages" className="text-sm font-medium text-navy-700 hover:underline">
          Full finder →
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Filter by age, rating range and distance to find an evenly matched opponent near you.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <label className="label">Age group</label>
          <select className="input" value={f.ageGroup} onChange={(e) => set("ageGroup", e.target.value)}>
            <option value="">Any</option>
            {AGE_GROUPS.map((a) => (
              <option key={a} value={a}>
                {ageGroupLabel(a)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Min rating</label>
          <input className="input" inputMode="numeric" placeholder="any" value={f.ratingMin} onChange={(e) => set("ratingMin", e.target.value)} />
        </div>
        <div>
          <label className="label">Max rating</label>
          <input className="input" inputMode="numeric" placeholder="any" value={f.ratingMax} onChange={(e) => set("ratingMax", e.target.value)} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label">Near (city)</label>
          <input className="input" placeholder="e.g. Provo" value={f.near} onChange={(e) => set("near", e.target.value)} />
        </div>
        <div>
          <label className="label">Within (mi)</label>
          <input className="input" inputMode="numeric" placeholder="any" value={f.maxMiles} onChange={(e) => set("maxMiles", e.target.value)} />
        </div>
        <div className="flex items-end">
          <button onClick={search} disabled={searching} className="btn-accent w-full disabled:opacity-50">
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs">
        <button onClick={saveDefault} className="font-medium text-navy-700 hover:underline">
          Save as my default
        </button>
        {saved && (
          <span className="text-emerald-600">
            Saved{signedIn ? " to your account" : " in this browser"}.
          </span>
        )}
      </div>

      {hits != null && (
        <div className="mt-4">
          {hits.length === 0 ? (
            <p className="text-sm text-slate-500">No teams match those filters. Widen your range or distance.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {hits.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <TeamMedallion tier={h.hasApprovedClaim ? "green" : "gray"} />
                    <Link href={`/teams/${h.slug}`} className="font-medium text-navy-800 hover:underline">
                      {h.name}
                    </Link>
                    <span className="text-xs text-slate-400">
                      {h.city ? `${h.city}, ${h.state}` : h.state}
                      {h.ageGroup ? ` · ${ageGroupLabel(h.ageGroup)}` : ""}
                      {h.rating != null ? ` · ${h.rating}` : ""}
                      {h.distanceMiles != null ? ` · ~${h.distanceMiles} mi` : ""}
                    </span>
                  </span>
                  <Link href={`/teams/${h.slug}`} className="btn-ghost text-xs">
                    View / request
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
