"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

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

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setTab(id ? "build" : "dashboard");
  }, []);

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
