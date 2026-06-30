/**
 * Demo seed data — a realistic snapshot of a tournament director's season so the
 * public /demo/td portal looks alive on first load. All teams here are clearly
 * fabricated demo clubs (the live team search returns real teams when the visitor
 * actively searches). Nothing here is persisted server-side.
 */

import {
  generatePools,
  buildTournamentSchedule,
  buildBracket as coreBuildBracket,
  type GradedField,
  type ScheduleDivisionInput,
  type BracketGameInput,
  type BracketResult,
} from "@nbr/core";
import type {
  TdTournament,
  TdUmpire,
  TdDivision,
  TdInvite,
  TdField,
  FieldGrade,
  PaymentStatus,
} from "./types";
import { DEFAULT_ADVANCEMENT, ADVANCEMENT_PRESETS } from "./advancement-presets";
import { parseHM, enumerateDays } from "./util";

function flattenBracketSeed(bracket: BracketResult): BracketGameInput[] {
  const out: BracketGameInput[] = [];
  bracket.rounds.forEach((round, ri) => {
    round.matchups.forEach((m) => {
      if (ri === 0) {
        if (!m.home.team || !m.away.team) return;
        out.push({ roundIndex: ri, roundName: round.name, homeName: m.home.team.name, awayName: m.away.team.name });
      } else {
        out.push({ roundIndex: ri, roundName: round.name, homeName: "TBD", awayName: "TBD" });
      }
    });
  });
  return out;
}

export interface DemoStore {
  tournaments: TdTournament[];
  umpires: TdUmpire[];
}

// Deterministic id generator so seeded ids are stable within a build.
let seq = 0;
const sid = (p: string) => `seed_${p}_${(seq += 1)}`;

const CLUB_NAMES = [
  "Wasatch Wolves", "Provo Pioneers", "SLC Thunder", "Ogden Raptors", "Lehi Lightning",
  "Davis Diamonds", "Park City Aces", "Bountiful Bears", "Logan Loggers", "Sandy Storm",
  "Draper Dragons", "Layton Lancers", "Murray Mavericks", "Tooele Titans", "Spanish Fork Sox",
  "Cedar City Reds", "St. George Heat", "Riverton Rangers", "Herriman Hawks", "Eagle Mountain Express",
  "Kaysville Knights", "Orem Owls", "Lindon Legends", "Pleasant Grove Pride", "American Fork Admirals",
  "Saratoga Spurs", "Magna Miners", "Tremonton Twisters", "Vernal Vipers", "Roy Rockets",
  "Clearfield Cyclones", "Syracuse Surge",
];

const CITIES: Record<string, string> = {
  "Wasatch Wolves": "Heber City", "Provo Pioneers": "Provo", "SLC Thunder": "Salt Lake City",
  "Ogden Raptors": "Ogden", "Lehi Lightning": "Lehi", "Davis Diamonds": "Farmington",
  "Park City Aces": "Park City", "Bountiful Bears": "Bountiful", "Logan Loggers": "Logan",
  "Sandy Storm": "Sandy", "Draper Dragons": "Draper", "Layton Lancers": "Layton",
  "Murray Mavericks": "Murray", "Tooele Titans": "Tooele", "Spanish Fork Sox": "Spanish Fork",
  "Cedar City Reds": "Cedar City", "St. George Heat": "St. George", "Riverton Rangers": "Riverton",
  "Herriman Hawks": "Herriman", "Eagle Mountain Express": "Eagle Mountain", "Kaysville Knights": "Kaysville",
  "Orem Owls": "Orem", "Lindon Legends": "Lindon", "Pleasant Grove Pride": "Pleasant Grove",
  "American Fork Admirals": "American Fork", "Saratoga Spurs": "Saratoga Springs", "Magna Miners": "Magna",
  "Tremonton Twisters": "Tremonton", "Vernal Vipers": "Vernal", "Roy Rockets": "Roy",
  "Clearfield Cyclones": "Clearfield", "Syracuse Surge": "Syracuse",
};

let clubCursor = 0;
function nextClubs(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(CLUB_NAMES[clubCursor % CLUB_NAMES.length]!);
    clubCursor += 1;
  }
  return out;
}

function makeTeamInvites(
  divisionId: string,
  ageGroup: string,
  count: number,
  nbrBase: number,
  spread: number,
  payments: PaymentStatus[],
): TdInvite[] {
  const ageLabel = ageGroup.replace("U", "") + "U";
  const clubs = nextClubs(count);
  return clubs.map((club, i) => {
    const nbr = Math.round(nbrBase + (spread / 2) - (spread * i) / Math.max(1, count - 1));
    return {
      id: sid("inv"),
      divisionId,
      team: {
        id: sid("team"),
        name: `${club} ${ageLabel}`,
        city: CITIES[club] ?? "Utah",
        state: "UT",
        ageGroup,
        nbr,
        isProvisional: false,
      },
      paymentStatus: payments[i % payments.length]!,
      isRepeatCustomer: i % 4 === 0,
      createdAt: new Date(Date.now() - i * 36e5).toISOString(),
    };
  });
}

function division(ageGroup: string, nbrLevel: string, nbrMin: number, nbrMax: number): TdDivision {
  return { id: sid("div"), ageGroup, nbrLevel, nbrMin, nbrMax, pools: null, bracket: null };
}

const ALL_PAY: PaymentStatus[] = ["PAID", "DEPOSIT_PAID", "PAID", "INVITED", "PENCILED"];

const ALL_AGES = ["U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16"];

function field(name: string, grade: FieldGrade, hasLights: boolean, ages: string[], notes = ""): TdField {
  return { id: sid("f"), name, hasLights, grade, allowedAgeGroups: ages, privateNotes: notes };
}

function buildFields(): TdField[] {
  // Graded so the scheduler can steer top pools and bracket finals to the best fields.
  return [
    field("Championship Diamond", "Championship", true, ALL_AGES, "Stadium field — finals only. Gate code 4417; groundskeeper Dave drags before 7am."),
    field("Miller Park #1", "A", true, ["U8", "U9", "U10", "U11", "U12"], "Press box key in the TD box."),
    field("Miller Park #2", "A", true, ["U10", "U11", "U12", "U13", "U14"], ""),
    field("Veterans Diamond", "B", true, ["U11", "U12", "U13", "U14", "U15", "U16"], "Concession key on the blue lanyard."),
    field("Canyon Complex A", "B", true, ["U13", "U14", "U15", "U16"], ""),
    field("Lions Field", "C", false, ["U8", "U9", "U10", "U11", "U12", "U13"], "No lights — schedule keeps games before sunset."),
    field("Canyon Complex B", "C", false, ["U14", "U15", "U16"], "Shared with the HS team Sat AM — ours after noon."),
    field("Eastside #3", "D", false, ["U8", "U9", "U10", "U11"], "Portable mound; bring extra bases."),
    field("Eastside #4", "D", false, ["U12", "U13", "U14"], ""),
  ];
}

function buildUmpires(): TdUmpire[] {
  const mk = (name: string, ages: string[], scrim: boolean, available = true): TdUmpire => ({
    id: sid("ump"),
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@demo.umpires`,
    ageGroups: ages,
    available,
    willUmpireScrimmages: scrim,
    notes: [],
  });
  const list = [
    mk("Marcus Hill", ["U8", "U9", "U10", "U11"], true),
    mk("Tony Alvarez", ["U12", "U13", "U14"], true),
    mk("Becca Stone", ["U10", "U11", "U12"], false),
    mk("Derek Voss", ["U13", "U14", "U15", "U16"], true, false),
    mk("Priya Nathan", ["U8", "U9", "U10"], true),
    mk("Wes Carter", ["U14", "U15", "U16"], false),
    mk("Gloria Mendez", ["U11", "U12", "U13"], true),
    mk("Sam Whitfield", ["U15", "U16"], true, false),
    mk("Andre Brooks", ["U8", "U9", "U10", "U11", "U12"], true),
    mk("Lena Park", ["U11", "U12", "U13", "U14"], true),
    mk("Hector Ramos", ["U13", "U14", "U15", "U16"], false),
    mk("Janet Cole", ["U9", "U10", "U11"], true),
    mk("Rashad Powell", ["U12", "U13", "U14", "U15"], true),
    mk("Olivia Tran", ["U8", "U9", "U10"], true, false),
  ];
  list[1]!.notes.unshift({ id: sid("note"), body: "Excellent demeanor; consistent zone. Request for championship games.", createdAt: new Date().toISOString() });
  list[3]!.notes.unshift({ id: sid("note"), body: "Strong umpire but ran 15 min late Saturday — confirm arrival time next event.", createdAt: new Date().toISOString() });
  list[8]!.notes.unshift({ id: sid("note"), body: "Great with the younger divisions and parents. Reliable.", createdAt: new Date().toISOString() });
  return list;
}

function emptyTournament(over: Partial<TdTournament>): TdTournament {
  return {
    id: sid("t"),
    name: "Demo Tournament",
    status: "DRAFT",
    startDate: null,
    endDate: null,
    location: null,
    entryFee: null,
    depositAmount: null,
    poolPlayGames: 3,
    poolPlayGamesPerDay: 2,
    allowCrossover: false,
    dayStartTime: "08:00",
    gamesEndBy: "21:00",
    sunsetTime: "20:15",
    gameDurationMinutes: 105,
    bracketDayIndex: 1,
    divisions: [],
    invites: [],
    fields: [],
    schedule: [],
    advancementRules: {},
    messages: [],
    createdAt: new Date().toISOString(),
    ...over,
  };
}

export function buildDemoStore(): DemoStore {
  seq = 0;
  clubCursor = 0;
  const umpires = buildUmpires();

  // ── Tournament 1: FINALIZED — full pools, schedule, and brackets. ──
  const t1 = emptyTournament({
    name: "Wasatch Fall Classic",
    status: "FINALIZED",
    startDate: new Date(Date.now() + 9 * 864e5).toISOString(),
    endDate: new Date(Date.now() + 10 * 864e5).toISOString(),
    location: "Miller Park, Salt Lake City",
    entryFee: 595,
    depositAmount: 150,
    poolPlayGames: 3,
    poolPlayGamesPerDay: 2,
    allowCrossover: false,
    dayStartTime: "08:00",
    gamesEndBy: "21:00",
    sunsetTime: "20:15",
    gameDurationMinutes: 105,
    bracketDayIndex: 1, // pool play day 1, brackets day 2
    fields: buildFields(),
  });
  // Eight age groups; 10U and 12U each split into two NBR levels (two events in one).
  const t1Divs: TdDivision[] = [
    division("U8", "Majors", 145, 170),
    division("U9", "Majors", 145, 172),
    division("U10", "Majors", 162, 185),
    division("U10", "AAA", 142, 161),
    division("U11", "Majors", 150, 178),
    division("U12", "Majors", 165, 188),
    division("U12", "AAA", 144, 164),
    division("U13", "Majors", 152, 180),
  ];
  t1.divisions = t1Divs;
  for (const d of t1Divs) {
    const isTopLevel = d.nbrLevel === "Majors";
    const base = isTopLevel ? 1740 : 1520;
    const invites = makeTeamInvites(d.id, d.ageGroup, isTopLevel ? 8 : 6, base, 220, ALL_PAY);
    t1.invites.push(...invites);
  }
  // Generate pools, schedule, and a bracket for each division so it looks complete.
  for (const d of t1.divisions) {
    const teams = t1.invites
      .filter((i) => i.divisionId === d.id)
      .map((i) => ({ id: i.team.id, name: i.team.name, rating: i.team.nbr ?? 1500, isProvisional: false }));
    if (teams.length >= 2) {
      const numPools = Math.min(Math.max(2, Math.floor(teams.length / 3)), teams.length);
      d.pools = generatePools(teams, numPools);
    }
    // Advancement rule + bracket
    t1.advancementRules[d.id] = { ...DEFAULT_ADVANCEMENT };
    if (d.pools) {
      const standings = d.pools.pools.flatMap((p) =>
        p.teams.map((tm, idx) => ({
          id: tm.id,
          name: tm.name,
          poolLabel: p.label,
          poolRank: idx + 1,
          strength: tm.rating,
        })),
      );
      d.bracket = coreBuildBracket(standings, DEFAULT_ADVANCEMENT);
    }
  }
  // Schedule the whole tournament at once: pool play day 1, brackets day 2,
  // onto graded fields with real clock times (lights/sunset aware).
  const fieldsForSchedule: GradedField[] = t1.fields.map((f) => ({
    id: f.id,
    name: f.name,
    hasLights: f.hasLights,
    allowedAgeGroups: f.allowedAgeGroups,
    grade: f.grade,
  }));
  const scheduleDivisions: ScheduleDivisionInput[] = t1.divisions
    .filter((d) => d.pools)
    .map((d) => ({
      id: d.id,
      ageGroup: d.ageGroup,
      pools: d.pools!.pools.map((p) => ({ label: p.label, teams: p.teams.map((tm) => ({ id: tm.id, name: tm.name })) })),
      bracketGames: d.bracket ? flattenBracketSeed(d.bracket) : undefined,
    }));
  const days = enumerateDays(t1.startDate, t1.endDate);
  const sched = buildTournamentSchedule(scheduleDivisions, fieldsForSchedule, {
    days,
    dayStartMinutes: parseHM(t1.dayStartTime),
    endByMinutes: parseHM(t1.gamesEndBy),
    sunsetMinutes: parseHM(t1.sunsetTime),
    gameDurationMinutes: t1.gameDurationMinutes,
    poolPlayGamesPerDay: t1.poolPlayGamesPerDay,
    poolPlayGamesTotal: t1.poolPlayGames,
    allowCrossover: t1.allowCrossover,
    bracketDayIndex: Math.min(t1.bracketDayIndex, days.length - 1),
  });
  for (const g of sched.games) {
    t1.schedule.push({
      id: sid("game"),
      divisionId: g.divisionId,
      kind: g.kind,
      poolLabel: g.poolLabel,
      roundName: g.roundName,
      fieldId: g.fieldId,
      fieldName: g.fieldName,
      fieldGrade: g.fieldGrade,
      dayIndex: g.dayIndex,
      date: g.date,
      startMinutes: g.startMinutes,
      slotLabel: g.slotLabel,
      homeTeamId: g.homeTeamId,
      homeTeamName: g.homeTeamName,
      awayTeamId: g.awayTeamId,
      awayTeamName: g.awayTeamName,
      isCrossover: g.isCrossover,
      umpireId: null,
    });
  }
  // Assign a couple of umpires to opening games.
  const firstGames = t1.schedule.slice(0, 2);
  firstGames.forEach((g, i) => {
    const u = umpires[i === 0 ? 1 : 6]!;
    g.umpireId = u.id;
  });

  // ── Tournament 2: OPEN — invites in progress, no pools yet. ──
  const t2 = emptyTournament({
    name: "Canyon Country Shootout",
    status: "OPEN",
    startDate: new Date(Date.now() + 23 * 864e5).toISOString(),
    endDate: new Date(Date.now() + 24 * 864e5).toISOString(),
    location: "Canyon Complex, Provo",
    entryFee: 650,
    depositAmount: 200,
    fields: buildFields(),
  });
  const t2Divs = [
    division("U11", "Majors", 155, 182),
    division("U14", "Majors", 156, 184),
    division("U14", "AAA", 143, 161),
  ];
  t2.divisions = t2Divs;
  t2.invites.push(...makeTeamInvites(t2Divs[0]!.id, "U11", 6, 1700, 230, ["PAID", "DEPOSIT_PAID", "INVITED", "PENCILED"]));
  t2.invites.push(...makeTeamInvites(t2Divs[1]!.id, "U14", 7, 1720, 240, ["DEPOSIT_PAID", "INVITED", "INVITED", "PENCILED"]));
  t2.invites.push(...makeTeamInvites(t2Divs[2]!.id, "U14", 4, 1520, 160, ["INVITED", "PENCILED"]));
  t2.messages.push(
    {
      id: sid("msg"),
      inviteId: t2.invites[0]!.id,
      teamName: t2.invites[0]!.team.name,
      body: "Thanks for the invite — we're in! Deposit sent today.",
      fromDirector: false,
      createdAt: new Date(Date.now() - 2 * 36e5).toISOString(),
    },
    {
      id: sid("msg"),
      inviteId: t2.invites[0]!.id,
      teamName: t2.invites[0]!.team.name,
      body: "Got it, thank you! You're penciled into the 11U Majors bracket.",
      fromDirector: true,
      createdAt: new Date(Date.now() - 1.5 * 36e5).toISOString(),
    },
  );

  // ── Tournament 3: DRAFT — just created, no divisions yet. ──
  const t3 = emptyTournament({
    name: "Spring Kickoff Invitational",
    status: "DRAFT",
    startDate: new Date(Date.now() + 60 * 864e5).toISOString(),
    endDate: new Date(Date.now() + 61 * 864e5).toISOString(),
    location: "TBD",
    entryFee: 525,
    depositAmount: 125,
    fields: buildFields(),
  });

  return { tournaments: [t1, t2, t3], umpires };
}

export { ADVANCEMENT_PRESETS };
