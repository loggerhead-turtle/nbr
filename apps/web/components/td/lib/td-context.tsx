"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { TdDataPort } from "./td-port";
import type { TdTournament, TdUmpire } from "./types";

export type TdTab =
  | "dashboard"
  | "build"
  | "teams"
  | "payments"
  | "pools"
  | "schedule"
  | "umpires"
  | "brackets"
  | "messages";

interface TdContextValue {
  port: TdDataPort;
  mode: "demo" | "live";
  loading: boolean;
  tournaments: TdTournament[];
  umpires: TdUmpire[];
  selectedId: string | null;
  selected: TdTournament | null;
  tab: TdTab;
  select: (id: string | null) => void;
  setTab: (tab: TdTab) => void;
  /** Run a port mutation, then refresh data from the port. */
  act: <T>(fn: (port: TdDataPort) => Promise<T>) => Promise<T>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<TdContextValue | null>(null);

export function TdProvider({ port, children }: { port: TdDataPort; children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<TdTournament[]>([]);
  const [umpires, setUmpires] = useState<TdUmpire[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TdTab>("dashboard");

  const refresh = useCallback(async () => {
    const [ts, us] = await Promise.all([port.listTournaments(), port.listUmpires()]);
    setTournaments(ts);
    setUmpires(us);
  }, [port]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await refresh();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  const act = useCallback(
    async <T,>(fn: (p: TdDataPort) => Promise<T>): Promise<T> => {
      const result = await fn(port);
      await refresh();
      return result;
    },
    [port, refresh],
  );

  // Changing the selected tournament doesn't change which tab you're on (so the
  // tournament picker keeps you on the same view); clearing returns to dashboard.
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id) setTab("dashboard");
  }, []);

  // Always keep a tournament selected when any exist, so the per-tournament tabs
  // are usable immediately (and after a tournament is deleted or the demo reset).
  useEffect(() => {
    if (loading || tournaments.length === 0) return;
    const exists = selectedId && tournaments.some((t) => t.id === selectedId);
    if (!exists) setSelectedId(tournaments[0]!.id);
  }, [loading, tournaments, selectedId]);

  const selected = useMemo(
    () => tournaments.find((t) => t.id === selectedId) ?? null,
    [tournaments, selectedId],
  );

  const value: TdContextValue = {
    port,
    mode: port.mode,
    loading,
    tournaments,
    umpires,
    selectedId,
    selected,
    tab,
    select,
    setTab,
    act,
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTd(): TdContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTd must be used within <TdProvider>");
  return v;
}
