"use client";

import { useState, useCallback, useRef } from "react";
import type { PoolResult } from "@nbr/core";
import { PoolResultView } from "./pool-result";

interface SelectedTeam {
  id: string;
  name: string;
  rating: number;
  isProvisional?: boolean;
  custom?: boolean;
}

interface SearchHit {
  id: string;
  name: string;
  city: string | null;
  ageGroup: string | null;
  rating: number | null;
  isProvisional: boolean;
}

export function PoolGeneratorClient() {
  const [selected, setSelected] = useState<SelectedTeam[]>([]);
  const [numPools, setNumPools] = useState(2);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<PoolResult | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/teams/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setHits(data.teams ?? []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 250);
  }, []);

  const addTeam = (t: SelectedTeam) => {
    if (selected.some((s) => s.id === t.id)) return;
    setSelected((prev) => [...prev, t]);
    setResult(null);
    setShareUrl(null);
  };

  const addFromHit = (h: SearchHit) => {
    addTeam({
      id: h.id,
      name: h.name,
      rating: h.rating ?? 1500,
      isProvisional: h.isProvisional,
    });
    setQuery("");
    setHits([]);
  };

  const removeTeam = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id));
    setResult(null);
  };

  const updateRating = (id: string, rating: number) => {
    setSelected((prev) => prev.map((s) => (s.id === id ? { ...s, rating } : s)));
    setResult(null);
  };

  const [customName, setCustomName] = useState("");
  const [customRating, setCustomRating] = useState("1500");
  const addCustom = () => {
    if (!customName.trim()) return;
    addTeam({
      id: `custom-${customName.trim()}-${Date.now()}`,
      name: customName.trim(),
      rating: Number(customRating) || 1500,
      custom: true,
    });
    setCustomName("");
    setCustomRating("1500");
  };

  const generate = async (save: boolean) => {
    setError(null);
    if (selected.length < numPools) {
      setError(`You need at least ${numPools} teams for ${numPools} pools.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/pools/generate${save ? "?save=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          numPools,
          teams: selected.map((s) => ({
            id: s.id,
            name: s.name,
            rating: s.rating,
            isProvisional: s.isProvisional,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setResult(data.result);
      if (data.token) {
        setShareUrl(`${window.location.origin}/pools/${data.token}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Builder panel */}
      <div className="no-print space-y-4">
        <div className="card p-4">
          <label className="label" htmlFor="tname">
            Tournament name (optional)
          </label>
          <input
            id="tname"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Summer Slugfest 12U"
          />

          <label className="label mt-4" htmlFor="search">
            Add a rated team
          </label>
          <input
            id="search"
            className="input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              runSearch(e.target.value);
            }}
            placeholder="Search team name…"
            autoComplete="off"
          />
          {searching && <p className="mt-1 text-xs text-slate-400">Searching…</p>}
          {hits.length > 0 && (
            <ul className="mt-2 max-h-60 overflow-auto rounded-lg border border-slate-200">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => addFromHit(h)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span>
                      <span className="font-medium text-slate-800">{h.name}</span>
                      {h.city && <span className="ml-1 text-xs text-slate-400">{h.city}</span>}
                    </span>
                    <span className="tabular-nums text-navy-800">
                      {h.rating ?? "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Or add a team manually
            </p>
            <div className="flex gap-2">
              <input
                className="input"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Team name"
              />
              <input
                className="input w-24"
                type="number"
                value={customRating}
                onChange={(e) => setCustomRating(e.target.value)}
                placeholder="Rating"
              />
            </div>
            <button type="button" onClick={addCustom} className="btn-ghost mt-2 w-full">
              + Add team
            </button>
          </div>
        </div>

        <div className="card p-4">
          <label className="label" htmlFor="pools">
            Number of pools
          </label>
          <input
            id="pools"
            type="number"
            min={1}
            max={256}
            className="input w-28"
            value={numPools}
            onChange={(e) => setNumPools(Math.max(1, Math.min(256, Number(e.target.value) || 1)))}
          />
          <p className="mt-2 text-xs text-slate-500">
            {selected.length} team{selected.length === 1 ? "" : "s"} selected.
          </p>
          {error && <p className="mt-2 text-sm font-medium text-rose-600">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => generate(false)}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate pools"}
            </button>
          </div>
        </div>
      </div>

      {/* Selected + results */}
      <div className="space-y-6">
        {selected.length > 0 && (
          <div className="no-print card p-4">
            <h3 className="mb-2 text-sm font-bold text-navy-900">Selected teams</h3>
            <ul className="flex flex-wrap gap-2">
              {selected
                .slice()
                .sort((a, b) => b.rating - a.rating)
                .map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1 text-sm"
                  >
                    <span className="font-medium text-slate-700">{t.name}</span>
                    <input
                      type="number"
                      value={Math.round(t.rating)}
                      onChange={(e) => updateRating(t.id, Number(e.target.value) || 0)}
                      className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right text-xs tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => removeTeam(t.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Remove ${t.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {result ? (
          <div className="card p-6">
            <div className="no-print mb-4 flex flex-wrap gap-2">
              <button onClick={() => window.print()} className="btn-ghost">
                🖨 Print
              </button>
              <button onClick={() => generate(true)} disabled={busy} className="btn-ghost">
                🔗 Save & share
              </button>
              {shareUrl && (
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="input flex-1"
                />
              )}
            </div>
            <PoolResultView result={result} name={name} />
          </div>
        ) : (
          <div className="card flex min-h-[300px] items-center justify-center p-10 text-center">
            <div>
              <p className="text-4xl">⚾</p>
              <p className="mt-3 font-semibold text-navy-900">Build your pools</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                Add teams on the left, choose how many pools you need, and generate
                evenly-matched pools instantly.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
