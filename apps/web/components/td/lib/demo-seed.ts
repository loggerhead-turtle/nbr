/**
 * Demo seed data — a realistic snapshot of a tournament director's season so the
 * public /demo/td portal looks alive on first load. All teams here are clearly
 * fabricated demo clubs (the live team search returns real teams when the visitor
 * actively searches). Nothing here is persisted server-side.
 */

import { generatePools, buildSchedule as coreBuildSchedule, buildBracket as coreBuildBracket } from "@nbr/core";
import type {
  TdTournament,
  TdUmpire,
  TdDivision,
  TdInvite,
  TdField,
  PaymentStatus,
} from "./types";
import { DEFAULT_ADVANCEMENT, ADVANCEMENT_PRESETS } from "./advancement-presets";

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

function buildFields(): TdField[] {
  return [
    { id: sid("f"), name: "Miller Park #1", hasLights: true, allowedAgeGroups: ["U8", "U9", "U10"], privateNotes: "Gate code 4417. Groundskeeper: Dave (call before 7am drags)." },
    { id: sid("f"), name: "Miller Park #2", hasLights: true, allowedAgeGroups: ["U10", "U11", "U12"], privateNotes: "" },
    { id: sid("f"), name: "Lions Field", hasLights: false, allowedAgeGroups: ["U11", "U12", "U13"], privateNotes: "No lights — last slot 6:30pm in October." },
    { id: sid("f"), name: "Veterans Diamond", hasLights: true, allowedAgeGroups: ["U13", "U14"], privateNotes: "Concession key in the TD box." },
    { id: sid("f"), name: "Canyon Complex A", hasLights: true, allowedAgeGroups: ["U14", "U15", "U16"], privateNotes: "" },
    { id: sid("f"), name: "Canyon Complex B", hasLights: false, allowedAgeGroups: ["U15", "U16"], privateNotes: "Shared with high school team Sat AM — ours after noon." },
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
  ];
  list[1]!.notes.unshift({ id: sid("note"), body: "Excellent with coaches; great strike zone consistency. Request him for championship games.", createdAt: new Date().toISOString() });
  list[3]!.notes.unshift({ id: sid("note"), body: "Strong umpire but ran 15 min late Saturday — confirm arrival time next event.", createdAt: new Date().toISOString() });
  return list;
}

function emptyTournament(over: Partial<TdTournament>): TdTournament {
  return {
    id: sid("t"),
    name: "Demo Tournament",
    status: "DRAFT",
    startDate: null,
    location: null,
    entryFee: null,
    depositAmount: null,
    poolPlayGames: 3,
    allowCrossover: false,
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
    location: "Miller Park, Salt Lake City",
    entryFee: 595,
    depositAmount: 150,
    poolPlayGames: 3,
    allowCrossover: false,
    fields: buildFields(),
  });
  // Eight age groups; 10U and 12U each split into two NBR levels (two events in one).
  const t1Divs: TdDivision[] = [
    division("U8", "NBR I", 1450, 1700),
    division("U9", "NBR I", 1450, 1720),
    division("U10", "NBR I", 1620, 1850),
    division("U10", "NBR II", 1420, 1610),
    division("U11", "NBR I", 1500, 1780),
    division("U12", "NBR I", 1650, 1880),
    division("U12", "NBR II", 1440, 1640),
    division("U13", "NBR I", 1520, 1800),
  ];
  t1.divisions = t1Divs;
  for (const d of t1Divs) {
    const isTopLevel = d.nbrLevel === "NBR I";
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
  // Schedule across all divisions.
  const fieldsForSchedule = t1.fields.map((f) => ({
    id: f.id,
    name: f.name,
    hasLights: f.hasLights,
    allowedAgeGroups: f.allowedAgeGroups,
  }));
  for (const d of t1.divisions) {
    if (!d.pools) continue;
    const pools = d.pools.pools.map((p) => ({ label: p.label, teams: p.teams.map((tm) => ({ id: tm.id, name: tm.name })) }));
    const res = coreBuildSchedule(pools, fieldsForSchedule, { ageGroup: d.ageGroup, poolPlayGames: 3, allowCrossover: false });
    for (const g of res.games) {
      t1.schedule.push({
        id: sid("game"),
        divisionId: d.id,
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
    location: "Canyon Complex, Provo",
    entryFee: 650,
    depositAmount: 200,
  });
  const t2Divs = [
    division("U11", "NBR I", 1550, 1820),
    division("U14", "NBR I", 1560, 1840),
    division("U14", "NBR II", 1430, 1610),
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
      body: "Got it, thank you! You're penciled into the 11U NBR I bracket.",
      fromDirector: true,
      createdAt: new Date(Date.now() - 1.5 * 36e5).toISOString(),
    },
  );

  // ── Tournament 3: DRAFT — just created, no divisions yet. ──
  const t3 = emptyTournament({
    name: "Spring Kickoff Invitational",
    status: "DRAFT",
    startDate: new Date(Date.now() + 60 * 864e5).toISOString(),
    location: "TBD",
    entryFee: 525,
    depositAmount: 125,
  });

  return { tournaments: [t1, t2, t3], umpires };
}

export { ADVANCEMENT_PRESETS };
