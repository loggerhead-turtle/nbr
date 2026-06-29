/**
 * The single data-access contract the whole TD module depends on. Two adapters
 * implement it: `SessionTdPort` (public demo, sessionStorage, nothing persisted)
 * and `DbTdPort` (logged-in portal, persisted via authenticated /api/td routes).
 * Every method is async so the two backends are interchangeable.
 */

import type {
  TdTournament,
  TdTeamRef,
  TdDivision,
  TdInvite,
  TdField,
  TdUmpire,
  TdAdvancementRule,
  PaymentStatus,
  TeamSearchParams,
} from "./types";

export interface CreateTournamentInput {
  name: string;
  startDate?: string | null;
  location?: string | null;
  entryFee?: number | null;
  depositAmount?: number | null;
}

export interface AddDivisionInput {
  ageGroup: string;
  nbrLevel: string;
  nbrMin?: number | null;
  nbrMax?: number | null;
}

export interface AddFieldInput {
  name: string;
  hasLights: boolean;
  allowedAgeGroups: string[];
  privateNotes?: string;
}

export interface ScheduleOptionsInput {
  poolPlayGames: number;
  allowCrossover: boolean;
}

export interface RegisterUmpireInput {
  name: string;
  email?: string | null;
  ageGroups: string[];
  willUmpireScrimmages: boolean;
}

export interface TdDataPort {
  readonly mode: "demo" | "live";

  // Tournaments
  listTournaments(): Promise<TdTournament[]>;
  getTournament(id: string): Promise<TdTournament | null>;
  createTournament(input: CreateTournamentInput): Promise<TdTournament>;
  updateTournament(id: string, patch: Partial<CreateTournamentInput & { status: string; poolPlayGames: number; allowCrossover: boolean }>): Promise<void>;
  deleteTournament(id: string): Promise<void>;

  // Divisions
  addDivision(tournamentId: string, input: AddDivisionInput): Promise<TdDivision>;
  removeDivision(tournamentId: string, divisionId: string): Promise<void>;

  // Team search (real teams, both modes) + invites
  searchTeams(params: TeamSearchParams): Promise<TdTeamRef[]>;
  invite(tournamentId: string, divisionId: string, team: TdTeamRef): Promise<void>;
  removeInvite(tournamentId: string, inviteId: string): Promise<void>;
  setPaymentStatus(tournamentId: string, inviteId: string, status: PaymentStatus): Promise<void>;

  // Pools
  generatePools(tournamentId: string, divisionId: string, numPools: number): Promise<void>;

  // Fields + scheduling
  addField(tournamentId: string, input: AddFieldInput): Promise<void>;
  updateField(tournamentId: string, fieldId: string, patch: Partial<AddFieldInput>): Promise<void>;
  removeField(tournamentId: string, fieldId: string): Promise<void>;
  buildSchedule(tournamentId: string, options: ScheduleOptionsInput): Promise<void>;
  clearSchedule(tournamentId: string): Promise<void>;

  // Umpires (TD pool)
  listUmpires(): Promise<TdUmpire[]>;
  registerUmpire(input: RegisterUmpireInput): Promise<void>;
  toggleUmpireAvailable(umpireId: string): Promise<void>;
  assignUmpire(tournamentId: string, gameId: string, umpireId: string | null): Promise<void>;
  addUmpireNote(umpireId: string, body: string): Promise<void>;

  // Brackets
  setAdvancementRule(tournamentId: string, divisionId: string, rule: TdAdvancementRule): Promise<void>;
  buildBracket(tournamentId: string, divisionId: string): Promise<void>;

  // Messages (uses existing invite threads conceptually)
  sendMessage(tournamentId: string, inviteId: string, body: string): Promise<void>;

  // Demo-only
  reset?(): Promise<void>;
}
