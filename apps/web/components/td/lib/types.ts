/**
 * Shared, serializable DTOs for the Tournament Director module. These are the
 * shapes the UI consumes — independent of Prisma. Both the live (DB) and demo
 * (sessionStorage) data adapters return exactly these types so the same
 * components render in both modes.
 */

import type { PoolResult, BracketResult, FieldGrade } from "@nbr/core";

export type { FieldGrade };

export type TournamentStatus = "DRAFT" | "OPEN" | "FINALIZED";

/** Game time-limit options. 1h45 lets games run every 2h; longer limits widen the slot. */
export const GAME_DURATIONS: { minutes: number; label: string }[] = [
  { minutes: 105, label: "1h 45m (games every 2h)" },
  { minutes: 120, label: "2h (games every 2h 15m)" },
  { minutes: 135, label: "2h 15m (games every 2h 30m)" },
];

/** Combined invite + payment standing the director tracks per team. */
export type PaymentStatus = "PENCILED" | "INVITED" | "DEPOSIT_PAID" | "PAID";

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string; tone: string }[] = [
  { value: "PENCILED", label: "Penciled in", tone: "bg-slate-100 text-slate-600" },
  { value: "INVITED", label: "Invited", tone: "bg-sky-100 text-sky-700" },
  { value: "DEPOSIT_PAID", label: "Deposit paid", tone: "bg-amber-100 text-amber-800" },
  { value: "PAID", label: "Paid in full", tone: "bg-emerald-100 text-emerald-700" },
];

export interface TdTeamRef {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  ageGroup: string | null;
  /** The team's NBR (rating) number, rounded. */
  nbr: number | null;
  isProvisional: boolean;
  distanceMiles?: number | null;
}

export interface TdDivision {
  id: string;
  ageGroup: string; // "U12"
  nbrLevel: string; // "NBR I"
  nbrMin: number | null;
  nbrMax: number | null;
  pools: PoolResult | null;
  bracket: BracketResult | null;
}

export interface TdInvite {
  id: string;
  divisionId: string | null;
  team: TdTeamRef;
  paymentStatus: PaymentStatus;
  /** Team the director has hosted before — recommended to message first. */
  isRepeatCustomer: boolean;
  createdAt: string;
}

export interface TdField {
  id: string;
  name: string;
  hasLights: boolean;
  /** Field grade — Championship is best; top pools and bracket finals land here. */
  grade: FieldGrade;
  allowedAgeGroups: string[]; // ["U10","U12"]
  privateNotes: string; // TD-only
}

export interface TdScheduleGame {
  id: string;
  divisionId: string;
  kind: "pool" | "bracket";
  poolLabel: string | null;
  roundName: string | null; // bracket round, e.g. "Final"
  fieldId: string | null;
  fieldName: string | null;
  fieldGrade: FieldGrade | null;
  dayIndex: number | null;
  date: string | null;
  startMinutes: number | null;
  slotLabel: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  isCrossover: boolean;
  umpireId: string | null;
}

export interface TdUmpireNote {
  id: string;
  body: string;
  createdAt: string;
}

export interface TdUmpire {
  id: string;
  name: string;
  email: string | null;
  ageGroups: string[];
  available: boolean;
  willUmpireScrimmages: boolean;
  notes: TdUmpireNote[];
}

export interface TdAdvancementRule {
  presetKey: string | null;
  name: string;
  synopsis: string;
  poolWinnersAdvance: number;
  wildcards: number;
  seedBy: "POOL_RECORD" | "RATING" | "RUN_DIFF";
  reseed: boolean;
  isCustom: boolean;
}

export interface TdMessage {
  id: string;
  inviteId: string;
  teamName: string;
  body: string;
  fromDirector: boolean;
  createdAt: string;
}

export interface TdTournament {
  id: string;
  name: string;
  status: TournamentStatus;
  startDate: string | null; // ISO date (day 1)
  endDate: string | null; // ISO date (last day)
  location: string | null;
  entryFee: number | null;
  depositAmount: number | null;
  // Scheduling config.
  poolPlayGames: number; // total pool games per team
  poolPlayGamesPerDay: number; // per team per day (default 2)
  allowCrossover: boolean;
  dayStartTime: string; // "HH:MM"
  gamesEndBy: string; // "HH:MM" hard cutoff
  sunsetTime: string; // "HH:MM" — no-light fields must finish by this
  gameDurationMinutes: number; // time limit (105 | 120 | 135)
  bracketDayIndex: number; // which day hosts bracket games (0-based)
  divisions: TdDivision[];
  invites: TdInvite[];
  fields: TdField[];
  schedule: TdScheduleGame[];
  /** Per-division advancement rule, keyed by divisionId. */
  advancementRules: Record<string, TdAdvancementRule>;
  messages: TdMessage[];
  createdAt: string;
}

/** Params for the shared team search (proxied to /api/teams/search). */
export interface TeamSearchParams {
  q?: string;
  nbrMin?: number;
  nbrMax?: number;
  age?: string;
  near?: string;
}
