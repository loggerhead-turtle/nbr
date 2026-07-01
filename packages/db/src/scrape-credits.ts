import { prisma } from "./index";

/**
 * Game-scraper compensation: one ScrapeCredit per team a scraper adds (pay rate
 * snapshotted at add time), plus Payout records. This module computes per-scraper
 * earnings by calendar period and the leaderboard, all in a fixed timezone so
 * "today / this week / this month" line up with the operator's local day.
 */

const TZ = "America/Denver";

export const SCRAPE_RATE_KEY = "scrapePayRateCents";
export const SCRAPE_GOALS_KEY = "scrapeGoals";

export interface ScrapeGoals {
  daily: number;
  weekly: number;
  monthly: number;
}

const DEFAULT_RATE_CENTS = 8;
const DEFAULT_GOALS: ScrapeGoals = { daily: 40, weekly: 200, monthly: 800 };

// ── timezone-aware calendar boundaries ──────────────────────────────────────

function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUTC - at.getTime()) / 60000;
}

/** UTC instant of local (TZ) midnight for the wall-clock day of `d`. */
function tzMidnight(y: number, m: number, day: number): Date {
  const utcGuess = Date.UTC(y, m - 1, day, 0, 0, 0);
  const off = tzOffsetMinutes(new Date(utcGuess));
  return new Date(utcGuess - off * 60000);
}

interface Boundaries {
  dayStart: Date;
  weekStart: Date;
  monthStart: Date;
}

function periodBoundaries(now = new Date()): Boundaries {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = dtf
    .formatToParts(now)
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const dayStart = tzMidnight(y, m, d);
  const weekdayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday ?? "Sun");
  const weekStart = new Date(dayStart.getTime() - Math.max(0, weekdayIdx) * 86400000);
  const monthStart = tzMidnight(y, m, 1);
  return { dayStart, weekStart, monthStart };
}

// ── settings ────────────────────────────────────────────────────────────────

export async function getScrapePayRateCents(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: SCRAPE_RATE_KEY } }).catch(() => null);
  const n = row?.value ? Number(row.value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : DEFAULT_RATE_CENTS;
}

export async function setScrapePayRateCents(cents: number): Promise<void> {
  const v = String(Math.max(0, Math.round(cents)));
  await prisma.appSetting.upsert({
    where: { key: SCRAPE_RATE_KEY },
    create: { key: SCRAPE_RATE_KEY, value: v },
    update: { value: v },
  });
}

export async function getScrapeGoals(): Promise<ScrapeGoals> {
  const row = await prisma.appSetting.findUnique({ where: { key: SCRAPE_GOALS_KEY } }).catch(() => null);
  if (!row?.value) return DEFAULT_GOALS;
  try {
    const g = JSON.parse(row.value);
    return {
      daily: Number(g.daily) || DEFAULT_GOALS.daily,
      weekly: Number(g.weekly) || DEFAULT_GOALS.weekly,
      monthly: Number(g.monthly) || DEFAULT_GOALS.monthly,
    };
  } catch {
    return DEFAULT_GOALS;
  }
}

export async function setScrapeGoals(g: ScrapeGoals): Promise<void> {
  const clean = {
    daily: Math.max(0, Math.round(g.daily) || 0),
    weekly: Math.max(0, Math.round(g.weekly) || 0),
    monthly: Math.max(0, Math.round(g.monthly) || 0),
  };
  await prisma.appSetting.upsert({
    where: { key: SCRAPE_GOALS_KEY },
    create: { key: SCRAPE_GOALS_KEY, value: JSON.stringify(clean) },
    update: { value: JSON.stringify(clean) },
  });
}

// ── recording ────────────────────────────────────────────────────────────────

/** Record one credit per newly added team for a scraper. Skips dupes (teamId). */
export async function recordScrapeCredits(
  userId: string,
  items: { teamId: string; gcTeamId: string | null }[],
  rateCents: number,
): Promise<number> {
  if (!userId || items.length === 0) return 0;
  const res = await prisma.scrapeCredit.createMany({
    data: items.map((it) => ({ userId, teamId: it.teamId, gcTeamId: it.gcTeamId, rateCents })),
    skipDuplicates: true,
  });
  return res.count;
}

// ── stats ────────────────────────────────────────────────────────────────────

export interface PeriodStat {
  teams: number;
  cents: number;
}

async function sumSince(userId: string, since: Date): Promise<PeriodStat> {
  const r = await prisma.scrapeCredit.aggregate({
    where: { userId, createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { rateCents: true },
  });
  return { teams: r._count._all, cents: r._sum.rateCents ?? 0 };
}

interface UserTotals {
  today: PeriodStat;
  week: PeriodStat;
  month: PeriodStat;
  sinceLastPayout: PeriodStat;
  total: PeriodStat;
  lastPayoutAt: string | null;
}

async function computeUserTotals(userId: string): Promise<UserTotals> {
  const { dayStart, weekStart, monthStart } = periodBoundaries();
  const lastPayout = await prisma.payout.findFirst({
    where: { userId },
    orderBy: { paidThrough: "desc" },
    select: { paidThrough: true },
  });
  const since = lastPayout?.paidThrough ?? new Date(0);
  const [today, week, month, sinceLastPayout, totalAgg] = await Promise.all([
    sumSince(userId, dayStart),
    sumSince(userId, weekStart),
    sumSince(userId, monthStart),
    sumSince(userId, since),
    prisma.scrapeCredit.aggregate({
      where: { userId },
      _count: { _all: true },
      _sum: { rateCents: true },
    }),
  ]);
  return {
    today,
    week,
    month,
    sinceLastPayout,
    total: { teams: totalAgg._count._all, cents: totalAgg._sum.rateCents ?? 0 },
    lastPayoutAt: lastPayout?.paidThrough.toISOString() ?? null,
  };
}

export interface ScraperStats extends UserTotals {
  rateCents: number;
  goals: ScrapeGoals;
}

export async function getScraperStats(userId: string): Promise<ScraperStats> {
  const [totals, rateCents, goals] = await Promise.all([
    computeUserTotals(userId),
    getScrapePayRateCents(),
    getScrapeGoals(),
  ]);
  return { ...totals, rateCents, goals };
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  todayTeams: number;
  weekTeams: number;
  monthTeams: number;
  unpaidTeams: number;
  unpaidCents: number;
  totalTeams: number;
  lastPayoutAt: string | null;
}

/** Everyone who is a game-scraper or has ever earned a credit, with their totals. */
export async function getScraperLeaderboard(): Promise<LeaderboardRow[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ role: "GAME_SCRAPER" }, { scrapeCredits: { some: {} } }],
    },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  });
  const rows = await Promise.all(
    users.map(async (u) => {
      const t = await computeUserTotals(u.id);
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
      return {
        userId: u.id,
        name,
        email: u.email,
        role: u.role,
        todayTeams: t.today.teams,
        weekTeams: t.week.teams,
        monthTeams: t.month.teams,
        unpaidTeams: t.sinceLastPayout.teams,
        unpaidCents: t.sinceLastPayout.cents,
        totalTeams: t.total.teams,
        lastPayoutAt: t.lastPayoutAt,
      };
    }),
  );
  // Most owed first, then most this month.
  rows.sort((a, b) => b.unpaidCents - a.unpaidCents || b.monthTeams - a.monthTeams);
  return rows;
}

export interface PayoutResult {
  amountCents: number;
  teamsCount: number;
}

/** Mark a scraper paid: bank all unpaid credits up to now as a Payout, resetting
 * "since last pay period" to zero. */
export async function recordPayout(userId: string, note?: string): Promise<PayoutResult> {
  const lastPayout = await prisma.payout.findFirst({
    where: { userId },
    orderBy: { paidThrough: "desc" },
    select: { paidThrough: true },
  });
  const since = lastPayout?.paidThrough ?? new Date(0);
  const paidThrough = new Date();
  const agg = await prisma.scrapeCredit.aggregate({
    where: { userId, createdAt: { gt: since, lte: paidThrough } },
    _count: { _all: true },
    _sum: { rateCents: true },
  });
  const amountCents = agg._sum.rateCents ?? 0;
  const teamsCount = agg._count._all;
  await prisma.payout.create({
    data: { userId, amountCents, teamsCount, paidThrough, note: note ?? null },
  });
  return { amountCents, teamsCount };
}
