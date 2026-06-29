/**
 * SessionTdPort — the public-demo data adapter. Everything lives in the browser
 * session (sessionStorage); nothing is persisted server-side and nothing is
 * shared between visitors. Real teams are still fetched from the live
 * /api/teams/search endpoint so invitations target real clubs — but no invite is
 * ever sent. This is the adapter that powers /demo/td.
 */

import {
  generatePools,
  buildSchedule as coreBuildSchedule,
  buildBracket as coreBuildBracket,
  type PoolTeam,
  type SchedulePool,
  type ScheduleField,
  type BracketStandingTeam,
} from "@nbr/core";
import type {
  TdDataPort,
  CreateTournamentInput,
  AddDivisionInput,
  AddFieldInput,
  ScheduleOptionsInput,
  RegisterUmpireInput,
} from "./td-port";
import type {
  TdTournament,
  TdDivision,
  TdTeamRef,
  TdUmpire,
  TdAdvancementRule,
  PaymentStatus,
  TeamSearchParams,
} from "./types";
import { uid, nowIso } from "./util";
import { buildDemoStore, type DemoStore } from "./demo-seed";

const KEY = "nbr-demo-td-v1";
const VERSION = 1;

interface Persisted {
  version: number;
  store: DemoStore;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export class SessionTdPort implements TdDataPort {
  readonly mode = "demo" as const;
  private store: DemoStore;

  constructor() {
    this.store = this.load();
  }

  private load(): DemoStore {
    if (typeof window === "undefined") return buildDemoStore();
    try {
      const raw = window.sessionStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted;
        if (parsed.version === VERSION && parsed.store) return parsed.store;
      }
    } catch {
      /* fall through to a fresh seed */
    }
    const seeded = buildDemoStore();
    this.persist(seeded);
    return seeded;
  }

  private persist(store: DemoStore = this.store) {
    this.store = store;
    if (typeof window === "undefined") return;
    try {
      const payload: Persisted = { version: VERSION, store };
      window.sessionStorage.setItem(KEY, JSON.stringify(payload));
    } catch {
      /* sessionStorage may be unavailable (private mode quota) — ignore */
    }
  }

  private tournament(id: string): TdTournament {
    const t = this.store.tournaments.find((x) => x.id === id);
    if (!t) throw new Error(`Tournament ${id} not found`);
    return t;
  }

  // ── Tournaments ────────────────────────────────────────────────────────────
  async listTournaments(): Promise<TdTournament[]> {
    return clone(this.store.tournaments);
  }

  async getTournament(id: string): Promise<TdTournament | null> {
    const t = this.store.tournaments.find((x) => x.id === id);
    return t ? clone(t) : null;
  }

  async createTournament(input: CreateTournamentInput): Promise<TdTournament> {
    const t: TdTournament = {
      id: uid("tourn"),
      name: input.name,
      status: "DRAFT",
      startDate: input.startDate ?? null,
      location: input.location ?? null,
      entryFee: input.entryFee ?? null,
      depositAmount: input.depositAmount ?? null,
      poolPlayGames: 3,
      allowCrossover: false,
      divisions: [],
      invites: [],
      fields: [],
      schedule: [],
      advancementRules: {},
      messages: [],
      createdAt: nowIso(),
    };
    this.store.tournaments.unshift(t);
    this.persist();
    return clone(t);
  }

  async updateTournament(
    id: string,
    patch: Partial<CreateTournamentInput & { status: string; poolPlayGames: number; allowCrossover: boolean }>,
  ): Promise<void> {
    const t = this.tournament(id);
    Object.assign(t, patch);
    this.persist();
  }

  async deleteTournament(id: string): Promise<void> {
    this.store.tournaments = this.store.tournaments.filter((x) => x.id !== id);
    this.persist();
  }

  // ── Divisions ────────────────────────────────────────────────────────────--
  async addDivision(tournamentId: string, input: AddDivisionInput): Promise<TdDivision> {
    const t = this.tournament(tournamentId);
    const div: TdDivision = {
      id: uid("div"),
      ageGroup: input.ageGroup,
      nbrLevel: input.nbrLevel,
      nbrMin: input.nbrMin ?? null,
      nbrMax: input.nbrMax ?? null,
      pools: null,
      bracket: null,
    };
    t.divisions.push(div);
    this.persist();
    return clone(div);
  }

  async removeDivision(tournamentId: string, divisionId: string): Promise<void> {
    const t = this.tournament(tournamentId);
    t.divisions = t.divisions.filter((d) => d.id !== divisionId);
    t.invites = t.invites.filter((i) => i.divisionId !== divisionId);
    t.schedule = t.schedule.filter((g) => g.divisionId !== divisionId);
    delete t.advancementRules[divisionId];
    this.persist();
  }

  // ── Team search + invites ───────────────────────────────────────────────────
  async searchTeams(params: TeamSearchParams): Promise<TdTeamRef[]> {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.nbrMin != null) qs.set("ratingMin", String(params.nbrMin));
    if (params.nbrMax != null) qs.set("ratingMax", String(params.nbrMax));
    if (params.age) qs.set("age", params.age);
    if (params.near) qs.set("near", params.near);
    try {
      const res = await fetch(`/api/teams/search?${qs.toString()}`);
      const data = await res.json();
      return (data.teams ?? []).map(
        (h: {
          id: string;
          name: string;
          city: string | null;
          state: string | null;
          ageGroup: string | null;
          rating: number | null;
          isProvisional: boolean;
          distanceMiles: number | null;
        }): TdTeamRef => ({
          id: h.id,
          name: h.name,
          city: h.city,
          state: h.state,
          ageGroup: h.ageGroup,
          nbr: h.rating,
          isProvisional: h.isProvisional,
          distanceMiles: h.distanceMiles,
        }),
      );
    } catch {
      return [];
    }
  }

  async invite(tournamentId: string, divisionId: string, team: TdTeamRef): Promise<void> {
    const t = this.tournament(tournamentId);
    if (t.invites.some((i) => i.team.id === team.id && i.divisionId === divisionId)) return;
    // A team the director has invited to a prior demo tournament is a "repeat customer".
    const isRepeat = this.store.tournaments.some(
      (other) => other.id !== tournamentId && other.invites.some((i) => i.team.id === team.id),
    );
    t.invites.push({
      id: uid("inv"),
      divisionId,
      team,
      paymentStatus: "INVITED",
      isRepeatCustomer: isRepeat,
      createdAt: nowIso(),
    });
    if (t.status === "DRAFT") t.status = "OPEN";
    this.persist();
  }

  async removeInvite(tournamentId: string, inviteId: string): Promise<void> {
    const t = this.tournament(tournamentId);
    t.invites = t.invites.filter((i) => i.id !== inviteId);
    this.persist();
  }

  async setPaymentStatus(tournamentId: string, inviteId: string, status: PaymentStatus): Promise<void> {
    const t = this.tournament(tournamentId);
    const inv = t.invites.find((i) => i.id === inviteId);
    if (inv) inv.paymentStatus = status;
    this.persist();
  }

  // ── Pools ────────────────────────────────────────────────────────────────--
  async generatePools(tournamentId: string, divisionId: string, numPools: number): Promise<void> {
    const t = this.tournament(tournamentId);
    const div = t.divisions.find((d) => d.id === divisionId);
    if (!div) return;
    const teams: PoolTeam[] = t.invites
      .filter((i) => i.divisionId === divisionId)
      .map((i) => ({
        id: i.team.id,
        name: i.team.name,
        rating: i.team.nbr ?? 1500,
        isProvisional: i.team.isProvisional,
      }));
    if (teams.length < 2) return;
    const pools = Math.min(Math.max(2, numPools), teams.length);
    div.pools = generatePools(teams, pools);
    div.bracket = null; // pools changed — invalidate any prior bracket
    this.persist();
  }

  // ── Fields + scheduling ─────────────────────────────────────────────────────
  async addField(tournamentId: string, input: AddFieldInput): Promise<void> {
    const t = this.tournament(tournamentId);
    t.fields.push({
      id: uid("field"),
      name: input.name,
      hasLights: input.hasLights,
      allowedAgeGroups: input.allowedAgeGroups,
      privateNotes: input.privateNotes ?? "",
    });
    this.persist();
  }

  async updateField(tournamentId: string, fieldId: string, patch: Partial<AddFieldInput>): Promise<void> {
    const t = this.tournament(tournamentId);
    const f = t.fields.find((x) => x.id === fieldId);
    if (f) Object.assign(f, patch);
    this.persist();
  }

  async removeField(tournamentId: string, fieldId: string): Promise<void> {
    const t = this.tournament(tournamentId);
    t.fields = t.fields.filter((x) => x.id !== fieldId);
    this.persist();
  }

  async buildSchedule(tournamentId: string, options: ScheduleOptionsInput): Promise<void> {
    const t = this.tournament(tournamentId);
    t.poolPlayGames = options.poolPlayGames;
    t.allowCrossover = options.allowCrossover;
    const games: TdTournament["schedule"] = [];
    const fields: ScheduleField[] = t.fields.map((f) => ({
      id: f.id,
      name: f.name,
      hasLights: f.hasLights,
      allowedAgeGroups: f.allowedAgeGroups,
    }));
    for (const div of t.divisions) {
      if (!div.pools) continue;
      const pools: SchedulePool[] = div.pools.pools.map((p) => ({
        label: p.label,
        teams: p.teams.map((tm) => ({ id: tm.id, name: tm.name })),
      }));
      const result = coreBuildSchedule(pools, fields, {
        ageGroup: div.ageGroup,
        poolPlayGames: options.poolPlayGames,
        allowCrossover: options.allowCrossover,
      });
      for (const g of result.games) {
        games.push({
          id: uid("game"),
          divisionId: div.id,
          poolLabel: g.poolLabel,
          fieldId: g.fieldId,
          fieldName: g.fieldName,
          slotLabel: g.slotLabel,
          homeTeamId: g.homeTeamId,
          homeTeamName: g.homeTeamName,
          awayTeamId: g.awayTeamId,
          awayTeamName: g.awayTeamName,
          isCrossover: g.isCrossover,
          umpireId: null,
        });
      }
    }
    t.schedule = games;
    if (games.length > 0) t.status = "FINALIZED";
    this.persist();
  }

  async clearSchedule(tournamentId: string): Promise<void> {
    const t = this.tournament(tournamentId);
    t.schedule = [];
    this.persist();
  }

  // ── Umpires ─────────────────────────────────────────────────────────────--
  async listUmpires(): Promise<TdUmpire[]> {
    return clone(this.store.umpires);
  }

  async registerUmpire(input: RegisterUmpireInput): Promise<void> {
    this.store.umpires.push({
      id: uid("ump"),
      name: input.name,
      email: input.email ?? null,
      ageGroups: input.ageGroups,
      available: true,
      willUmpireScrimmages: input.willUmpireScrimmages,
      notes: [],
    });
    this.persist();
  }

  async toggleUmpireAvailable(umpireId: string): Promise<void> {
    const u = this.store.umpires.find((x) => x.id === umpireId);
    if (u) u.available = !u.available;
    this.persist();
  }

  async assignUmpire(tournamentId: string, gameId: string, umpireId: string | null): Promise<void> {
    const t = this.tournament(tournamentId);
    const g = t.schedule.find((x) => x.id === gameId);
    if (!g) return;
    g.umpireId = umpireId;
    // Accepting an assignment marks the umpire unavailable for new requests.
    if (umpireId) {
      const u = this.store.umpires.find((x) => x.id === umpireId);
      if (u) u.available = false;
    }
    this.persist();
  }

  async addUmpireNote(umpireId: string, body: string): Promise<void> {
    const u = this.store.umpires.find((x) => x.id === umpireId);
    if (u) u.notes.unshift({ id: uid("note"), body, createdAt: nowIso() });
    this.persist();
  }

  // ── Brackets ─────────────────────────────────────────────────────────────--
  async setAdvancementRule(tournamentId: string, divisionId: string, rule: TdAdvancementRule): Promise<void> {
    const t = this.tournament(tournamentId);
    t.advancementRules[divisionId] = rule;
    this.persist();
  }

  async buildBracket(tournamentId: string, divisionId: string): Promise<void> {
    const t = this.tournament(tournamentId);
    const div = t.divisions.find((d) => d.id === divisionId);
    const rule = t.advancementRules[divisionId];
    if (!div || !div.pools || !rule) return;
    const standings: BracketStandingTeam[] = [];
    for (const pool of div.pools.pools) {
      pool.teams.forEach((tm, idx) => {
        standings.push({
          id: tm.id,
          name: tm.name,
          poolLabel: pool.label,
          poolRank: idx + 1, // pre-play: seed order within pool stands in for record
          strength: tm.rating,
        });
      });
    }
    div.bracket = coreBuildBracket(standings, {
      poolWinnersAdvance: rule.poolWinnersAdvance,
      wildcards: rule.wildcards,
      seedBy: rule.seedBy,
      reseed: rule.reseed,
    });
    this.persist();
  }

  // ── Messages ─────────────────────────────────────────────────────────────--
  async sendMessage(tournamentId: string, inviteId: string, body: string): Promise<void> {
    const t = this.tournament(tournamentId);
    const inv = t.invites.find((i) => i.id === inviteId);
    if (!inv) return;
    t.messages.push({
      id: uid("msg"),
      inviteId,
      teamName: inv.team.name,
      body,
      fromDirector: true,
      createdAt: nowIso(),
    });
    this.persist();
  }

  async reset(): Promise<void> {
    const fresh = buildDemoStore();
    this.persist(fresh);
  }
}
