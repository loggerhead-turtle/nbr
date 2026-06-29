/**
 * Shared, serializable DTOs for the Tournament Director module. These are the
 * shapes the UI consumes — independent of Prisma. Both the live (DB) and demo
 * (sessionStorage) data adapters return exactly these types so the same
 * components render in both modes.
 */

import type { PoolResult, BracketResult } from "@nbr/core";

export type TournamentStatus = "DRAFT" | "OPEN" | "FINALIZED";

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
  allowedAgeGroups: string[]; // ["U10","U12"]
  privateNotes: string; // TD-only
}

export interface TdScheduleGame {
  id: string;
  divisionId: string;
  poolLabel: string | null;
  fieldId: string | null;
  fieldName: string | null;
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
  startDate: string | null;
  location: string | null;
  entryFee: number | null;
  depositAmount: number | null;
  poolPlayGames: number;
  allowCrossover: boolean;
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
