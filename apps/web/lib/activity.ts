import { prisma } from "@nbr/db";

/**
 * Admin activity feed: recent cross-model events (new accounts, logins, teams,
 * games, claims, scrimmage requests, reports, TD requests) merged into one
 * time-sorted list, plus a "new since last seen" count for the nav badge.
 */

export type ActivityType =
  | "login"
  | "user"
  | "team"
  | "game"
  | "claim"
  | "scrimmage"
  | "report"
  | "td";

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  at: Date;
  title: string;
  detail: string | null;
  href: string | null;
}

export const ACTIVITY_TYPES: { type: ActivityType; label: string; icon: string }[] = [
  { type: "login", label: "Logins", icon: "🔑" },
  { type: "user", label: "New users", icon: "👤" },
  { type: "team", label: "New teams", icon: "⚾" },
  { type: "game", label: "New games", icon: "📊" },
  { type: "claim", label: "Team claims", icon: "✋" },
  { type: "scrimmage", label: "Scrimmage requests", icon: "🤝" },
  { type: "report", label: "Reports", icon: "🚩" },
  { type: "td", label: "TD requests", icon: "🏆" },
];

const PER_SOURCE = 25;
const fullName = (u: { firstName: string | null; lastName: string | null } | null) =>
  u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : "";

const ACTIVITY_SEEN_KEY = "adminActivitySeenAt"; // legacy global fallback
const ACTIVITY_SEEN_PREFIX = "adminActivitySeenAt_"; // per-section key prefix

const ALL_TYPES = ACTIVITY_TYPES.map((t) => t.type);
const epochMap = (): Record<ActivityType, Date> =>
  Object.fromEntries(ALL_TYPES.map((t) => [t, new Date(0)])) as Record<ActivityType, Date>;

/** Per-section "last cleared" timestamps; falls back to the legacy global key. */
export async function getActivitySeenMap(): Promise<Record<ActivityType, Date>> {
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: [...ALL_TYPES.map((t) => ACTIVITY_SEEN_PREFIX + t), ACTIVITY_SEEN_KEY] } },
    });
    const byKey = new Map(rows.map((r) => [r.key, new Date(r.value)]));
    const legacy = byKey.get(ACTIVITY_SEEN_KEY) ?? new Date(0);
    const out = {} as Record<ActivityType, Date>;
    for (const t of ALL_TYPES) out[t] = byKey.get(ACTIVITY_SEEN_PREFIX + t) ?? legacy;
    return out;
  } catch {
    return epochMap();
  }
}

/** Clear one section: stamp its "seen" time to now. */
export async function markActivityTypeSeen(type: ActivityType): Promise<void> {
  const key = ACTIVITY_SEEN_PREFIX + type;
  const now = new Date().toISOString();
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: now }, update: { value: now } });
}

/** Clear every section at once. */
export async function markAllActivitySeen(): Promise<void> {
  await Promise.all(ALL_TYPES.map((t) => markActivityTypeSeen(t)));
}

/** New-event count per section, each measured against that section's seen time. */
export async function countNewActivityByType(
  seen: Record<ActivityType, Date>,
): Promise<Record<ActivityType, number>> {
  try {
    const [login, user, team, game, claim, scrimmage, report, td] = await Promise.all([
      prisma.user.count({ where: { lastLoginAt: { gt: seen.login } } }),
      prisma.user.count({ where: { createdAt: { gt: seen.user } } }),
      prisma.team.count({ where: { isGhost: false, createdAt: { gt: seen.team } } }),
      prisma.game.count({ where: { createdAt: { gt: seen.game } } }),
      prisma.claim.count({ where: { createdAt: { gt: seen.claim } } }),
      prisma.scrimmageRequest.count({ where: { createdAt: { gt: seen.scrimmage } } }),
      prisma.report.count({ where: { createdAt: { gt: seen.report } } }),
      prisma.user.count({ where: { tdRequestedAt: { gt: seen.td } } }),
    ]);
    return { login, user, team, game, claim, scrimmage, report, td };
  } catch {
    return Object.fromEntries(ALL_TYPES.map((t) => [t, 0])) as Record<ActivityType, number>;
  }
}

export async function getActivitySeenAt(): Promise<Date> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { key: ACTIVITY_SEEN_KEY } });
    return s ? new Date(s.value) : new Date(0);
  } catch {
    return new Date(0);
  }
}

export async function markActivitySeen(): Promise<void> {
  const now = new Date().toISOString();
  await prisma.appSetting.upsert({
    where: { key: ACTIVITY_SEEN_KEY },
    create: { key: ACTIVITY_SEEN_KEY, value: now },
    update: { value: now },
  });
}

/** Total events newer than `since` across every source — the nav badge count. */
export async function countNewActivity(since: Date): Promise<number> {
  try {
    const gt = { gt: since };
    const [logins, users, teams, games, claims, scrims, reports, tds] = await Promise.all([
      prisma.user.count({ where: { lastLoginAt: gt } }),
      prisma.user.count({ where: { createdAt: gt } }),
      prisma.team.count({ where: { isGhost: false, createdAt: gt } }),
      prisma.game.count({ where: { createdAt: gt } }),
      prisma.claim.count({ where: { createdAt: gt } }),
      prisma.scrimmageRequest.count({ where: { createdAt: gt } }),
      prisma.report.count({ where: { createdAt: gt } }),
      prisma.user.count({ where: { tdRequestedAt: gt } }),
    ]);
    return logins + users + teams + games + claims + scrims + reports + tds;
  } catch {
    return 0;
  }
}

/** Recent events, newest first. Optionally restrict to a single type. */
export async function getRecentActivity(
  limit = 100,
  only?: ActivityType,
): Promise<ActivityEvent[]> {
  const events: ActivityEvent[] = [];

  const [logins, users, teams, games, claims, scrims, reports, tds] = await Promise.all([
    prisma.user.findMany({
      where: { lastLoginAt: { not: null } },
      orderBy: { lastLoginAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, firstName: true, lastName: true, email: true, lastLoginAt: true },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
    }),
    prisma.team.findMany({
      where: { isGhost: false },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, name: true, slug: true, gcTeamId: true, createdAt: true },
    }),
    prisma.game.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: {
        id: true,
        createdAt: true,
        homeScore: true,
        awayScore: true,
        homeTeam: { select: { name: true, slug: true } },
        awayTeam: { select: { name: true } },
      },
    }),
    prisma.claim.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: {
        id: true,
        status: true,
        createdAt: true,
        team: { select: { name: true, slug: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.scrimmageRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, status: true, createdAt: true, fromTeamId: true, toTeamId: true },
    }),
    prisma.report.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        team: { select: { name: true, slug: true } },
      },
    }),
    prisma.user.findMany({
      where: { tdRequestedAt: { not: null } },
      orderBy: { tdRequestedAt: "desc" },
      take: PER_SOURCE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        tdStatus: true,
        tdOrg: true,
        tdRequestedAt: true,
      },
    }),
  ]);

  for (const u of logins) {
    events.push({
      id: `login-${u.id}-${u.lastLoginAt!.getTime()}`,
      type: "login",
      at: u.lastLoginAt!,
      title: "Signed in",
      detail: fullName(u) ? `${fullName(u)} · ${u.email}` : u.email,
      href: "/admin/users",
    });
  }
  for (const u of users) {
    events.push({
      id: `user-${u.id}`,
      type: "user",
      at: u.createdAt,
      title: "New account",
      detail: fullName(u) ? `${fullName(u)} · ${u.email}` : u.email,
      href: "/admin/users",
    });
  }
  for (const t of teams) {
    events.push({
      id: `team-${t.id}`,
      type: "team",
      at: t.createdAt,
      title: "New team",
      detail: t.gcTeamId ? `${t.name} · GC ${t.gcTeamId}` : t.name,
      href: `/teams/${t.slug}`,
    });
  }
  for (const g of games) {
    events.push({
      id: `game-${g.id}`,
      type: "game",
      at: g.createdAt,
      title: "New game",
      detail: `${g.homeTeam.name} ${g.homeScore ?? "?"}–${g.awayScore ?? "?"} ${g.awayTeam.name}`,
      href: `/teams/${g.homeTeam.slug}`,
    });
  }
  for (const c of claims) {
    events.push({
      id: `claim-${c.id}`,
      type: "claim",
      at: c.createdAt,
      title: `Team claim (${c.status.toLowerCase()})`,
      detail: `${fullName(c.user) || c.user.email} → ${c.team.name}`,
      href: `/teams/${c.team.slug}`,
    });
  }
  if (scrims.length > 0) {
    const ids = [...new Set(scrims.flatMap((s) => [s.fromTeamId, s.toTeamId]))];
    const named = await prisma.team.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(named.map((t) => [t.id, t.name]));
    for (const s of scrims) {
      events.push({
        id: `scrim-${s.id}`,
        type: "scrimmage",
        at: s.createdAt,
        title: `Scrimmage request (${s.status.toLowerCase()})`,
        detail: `${nameOf.get(s.fromTeamId) ?? "?"} → ${nameOf.get(s.toTeamId) ?? "?"}`,
        href: null,
      });
    }
  }
  for (const r of reports) {
    events.push({
      id: `report-${r.id}`,
      type: "report",
      at: r.createdAt,
      title: `Report (${r.status.toLowerCase()})`,
      detail: `${r.reason}${r.team ? ` · ${r.team.name}` : ""}`,
      href: r.team ? `/teams/${r.team.slug}` : null,
    });
  }
  for (const u of tds) {
    events.push({
      id: `td-${u.id}-${u.tdRequestedAt!.getTime()}`,
      type: "td",
      at: u.tdRequestedAt!,
      title: `TD request (${u.tdStatus.toLowerCase()})`,
      detail: `${fullName(u) || u.email}${u.tdOrg ? ` · ${u.tdOrg}` : ""}`,
      href: "/admin/users",
    });
  }

  const filtered = only ? events.filter((e) => e.type === only) : events;
  filtered.sort((a, b) => b.at.getTime() - a.at.getTime());
  return filtered.slice(0, limit);
}
