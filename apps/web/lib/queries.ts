import { prisma, Prisma } from "@nbr/db";

export interface RatingRow {
  teamId: string;
  slug: string;
  name: string;
  city: string | null;
  state: string;
  ageGroup: string | null;
  classification: string | null;
  isGhost: boolean;
  hasApprovedClaim: boolean;
  rating: number;
  rd: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  isProvisional: boolean;
}

export interface RatingsQuery {
  search?: string;
  ageGroup?: string;
  classification?: string;
  includeProvisional?: boolean;
  sort?: "rating" | "name" | "games";
  page?: number;
  pageSize?: number;
}

export async function getRatings(q: RatingsQuery = {}): Promise<{
  rows: RatingRow[];
  total: number;
}> {
  const pageSize = q.pageSize ?? 50;
  const page = Math.max(1, q.page ?? 1);

  const where: Prisma.TeamWhereInput = {
    isActive: true,
    rating: { isNot: null },
    // Public side requires a classification: a youth age group OR a varsity class.
    // Unclassified teams are admin-only.
    OR: [{ ageGroup: { not: null } }, { classification: { not: null } }],
  };
  if (q.search) {
    where.name = { contains: q.search, mode: "insensitive" };
  }
  if (q.ageGroup) {
    where.ageGroup = q.ageGroup as Prisma.TeamWhereInput["ageGroup"];
    delete where.OR;
  }
  if (q.classification) {
    where.classification = q.classification;
    delete where.OR;
  }
  if (!q.includeProvisional) {
    where.rating = { is: { isProvisional: false } };
  }

  const orderBy: Prisma.TeamOrderByWithRelationInput =
    q.sort === "name"
      ? { name: "asc" }
      : q.sort === "games"
        ? { rating: { gamesPlayed: "desc" } }
        : { rating: { rating: "desc" } };

  try {
    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        orderBy,
        include: { rating: true, claim: { select: { status: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.team.count({ where }),
    ]);

    const rows: RatingRow[] = teams
      .filter((t) => t.rating)
      .map((t) => ({
        teamId: t.id,
        slug: t.slug,
        name: t.name,
        city: t.city,
        state: t.state,
        ageGroup: t.ageGroup,
        classification: t.classification,
        isGhost: t.isGhost,
        hasApprovedClaim: t.claim?.status === "APPROVED",
        rating: t.rating!.rating,
        rd: t.rating!.rd,
        gamesPlayed: t.rating!.gamesPlayed,
        wins: t.rating!.wins,
        losses: t.rating!.losses,
        ties: t.rating!.ties,
        isProvisional: t.rating!.isProvisional,
      }));

    return { rows, total };
  } catch {
    // DB unavailable (e.g. during a build with no database): render empty.
    return { rows: [], total: 0 };
  }
}

export async function getTeamBySlug(slug: string) {
  return prisma.team.findUnique({
    where: { slug },
    include: {
      rating: true,
      claim: { include: { user: true } },
      ratingHistory: { orderBy: { asOf: "asc" } },
      homeGames: {
        where: { status: "FINAL" },
        include: { awayTeam: true },
        orderBy: { playedAt: "desc" },
        take: 25,
      },
      awayGames: {
        where: { status: "FINAL" },
        include: { homeTeam: true },
        orderBy: { playedAt: "desc" },
        take: 25,
      },
    },
  });
}

/**
 * Walk the succession chain (newest team's predecessors) to build a season-by-
 * season website history. Each prior season had its own GameChanger team page.
 */
export async function getTeamSeasonHistory(
  predecessorTeamId: string | null,
): Promise<{ id: string; name: string; slug: string; gcTeamId: string | null; website: string | null; seasonYear: number | null }[]> {
  const out: { id: string; name: string; slug: string; gcTeamId: string | null; website: string | null; seasonYear: number | null }[] = [];
  let cursor = predecessorTeamId;
  let guard = 0;
  while (cursor && guard < 15) {
    const t = await prisma.team.findUnique({
      where: { id: cursor },
      select: { id: true, name: true, slug: true, gcTeamId: true, website: true, seasonYear: true, predecessorTeamId: true },
    });
    if (!t) break;
    out.push({ id: t.id, name: t.name, slug: t.slug, gcTeamId: t.gcTeamId, website: t.website, seasonYear: t.seasonYear });
    cursor = t.predecessorTeamId;
    guard += 1;
  }
  return out;
}

export interface MapPoint {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  tier: "green" | "gray" | "ghost";
}

/** Located teams for the map, plus summary counts (verified / coached / etc.). */
export async function getTeamMapData(): Promise<{
  points: MapPoint[];
  counts: { verified: number; coached: number; ghost: number; unlocatedVerified: number };
}> {
  try {
    const located = await prisma.team.findMany({
      where: { isActive: true, latitude: { not: null }, longitude: { not: null } },
      select: {
        slug: true,
        name: true,
        latitude: true,
        longitude: true,
        isGhost: true,
        claim: { select: { status: true } },
      },
    });

    const points: MapPoint[] = located.map((t) => ({
      slug: t.slug,
      name: t.name,
      lat: t.latitude!,
      lng: t.longitude!,
      tier: t.isGhost ? "ghost" : t.claim?.status === "APPROVED" ? "green" : "gray",
    }));

    const verified = points.filter((p) => p.tier !== "ghost").length;
    const coached = points.filter((p) => p.tier === "green").length;
    const ghost = points.filter((p) => p.tier === "ghost").length;

    // Verified teams we couldn't place yet (no coordinates).
    const unlocatedVerified = await prisma.team.count({
      where: { isActive: true, isGhost: false, OR: [{ latitude: null }, { longitude: null }] },
    });

    return { points, counts: { verified, coached, ghost, unlocatedVerified } };
  } catch {
    return { points: [], counts: { verified: 0, coached: 0, ghost: 0, unlocatedVerified: 0 } };
  }
}

// ── Messaging (scrimmage + tournament-director threads) ──────────────────────

export type ThreadKind = "scrimmage" | "tournament";

const fullName = (u: { firstName: string | null; lastName: string | null } | null | undefined) =>
  u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || null : null;

async function myTeamIds(userId: string): Promise<string[]> {
  const claims = await prisma.claim.findMany({ where: { userId }, select: { teamId: true } });
  return claims.map((c) => c.teamId);
}

/** Total unread messages across a user's scrimmage + tournament threads (nav badge). */
export async function getUnreadCountForUser(userId: string): Promise<number> {
  try {
    const teamIds = await myTeamIds(userId);
    let count = 0;

    const sReqs = await prisma.scrimmageRequest.findMany({
      where: { OR: [{ fromUserId: userId }, { toTeamId: { in: teamIds } }] },
      select: { id: true, fromUserId: true, fromReadAt: true, toReadAt: true },
    });
    for (const r of sReqs) {
      const readAt = r.fromUserId === userId ? r.fromReadAt : r.toReadAt;
      count += await prisma.scrimmageMessage.count({
        where: { requestId: r.id, senderUserId: { not: userId }, ...(readAt ? { createdAt: { gt: readAt } } : {}) },
      });
    }

    const tInvites = await prisma.tournamentInvite.findMany({
      where: { OR: [{ tournament: { directorUserId: userId } }, { teamId: { in: teamIds } }] },
      select: { id: true, directorReadAt: true, teamReadAt: true, tournament: { select: { directorUserId: true } } },
    });
    for (const inv of tInvites) {
      const isDirector = inv.tournament.directorUserId === userId;
      const readAt = isDirector ? inv.directorReadAt : inv.teamReadAt;
      count += await prisma.tournamentMessage.count({
        where: { inviteId: inv.id, senderUserId: { not: userId }, ...(readAt ? { createdAt: { gt: readAt } } : {}) },
      });
    }
    return count;
  } catch {
    return 0;
  }
}

export interface ThreadRow {
  kind: ThreadKind;
  id: string;
  myLabel: string;
  otherLabel: string;
  lastBody: string;
  lastAt: Date;
  status: string;
  unread: number;
}

/** Inbox: a user's threads (both kinds) with last message + unread count. */
export async function getUserThreads(userId: string): Promise<ThreadRow[]> {
  const teamIds = await myTeamIds(userId);
  const rows: ThreadRow[] = [];

  // Scrimmage threads
  const sReqs = await prisma.scrimmageRequest.findMany({
    where: { OR: [{ fromUserId: userId }, { toTeamId: { in: teamIds } }] },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const teamIdSet = [...new Set(sReqs.flatMap((r) => [r.fromTeamId, r.toTeamId]))];
  const teams = await prisma.team.findMany({ where: { id: { in: teamIdSet } }, select: { id: true, name: true } });
  const teamName = new Map(teams.map((t) => [t.id, t.name] as const));
  for (const r of sReqs) {
    const fromSide = r.fromUserId === userId;
    const readAt = fromSide ? r.fromReadAt : r.toReadAt;
    const unread = await prisma.scrimmageMessage.count({
      where: { requestId: r.id, senderUserId: { not: userId }, ...(readAt ? { createdAt: { gt: readAt } } : {}) },
    });
    const last = r.messages[0];
    rows.push({
      kind: "scrimmage",
      id: r.id,
      myLabel: (fromSide ? teamName.get(r.fromTeamId) : teamName.get(r.toTeamId)) ?? "Your team",
      otherLabel: (fromSide ? teamName.get(r.toTeamId) : teamName.get(r.fromTeamId)) ?? "A team",
      lastBody: last?.body ?? r.message ?? "",
      lastAt: last?.createdAt ?? r.createdAt,
      status: r.status,
      unread,
    });
  }

  // Tournament threads
  const tInvites = await prisma.tournamentInvite.findMany({
    where: { OR: [{ tournament: { directorUserId: userId } }, { teamId: { in: teamIds } }] },
    include: {
      tournament: { select: { name: true, directorUserId: true } },
      team: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  for (const inv of tInvites) {
    const isDirector = inv.tournament.directorUserId === userId;
    const readAt = isDirector ? inv.directorReadAt : inv.teamReadAt;
    const unread = await prisma.tournamentMessage.count({
      where: { inviteId: inv.id, senderUserId: { not: userId }, ...(readAt ? { createdAt: { gt: readAt } } : {}) },
    });
    const last = inv.messages[0];
    rows.push({
      kind: "tournament",
      id: inv.id,
      myLabel: isDirector ? inv.tournament.name : inv.team.name,
      otherLabel: isDirector ? inv.team.name : inv.tournament.name,
      lastBody: last?.body ?? "",
      lastAt: last?.createdAt ?? inv.createdAt,
      status: inv.status,
      unread,
    });
  }

  return rows.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

export interface ThreadView {
  kind: ThreadKind;
  id: string;
  side: string;
  status: string;
  myLabel: string;
  otherLabel: string;
  otherTeamSlug: string | null;
  otherName: string | null;
  otherEmail: string | null;
  otherPhone: string | null;
  myShareEmail: boolean;
  mySharePhone: boolean;
  messages: { id: string; mine: boolean; body: string; createdAt: Date }[];
}

/** Full thread for the message view (dispatches on kind). */
export async function loadThread(
  kind: ThreadKind,
  id: string,
  userId: string,
): Promise<ThreadView | null> {
  if (kind === "scrimmage") return loadScrimmageThread(id, userId);
  if (kind === "tournament") return loadTournamentThread(id, userId);
  return null;
}

async function loadScrimmageThread(id: string, userId: string): Promise<ThreadView | null> {
  const req = await prisma.scrimmageRequest.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!req) return null;
  let side: "from" | "to" | null = null;
  if (req.fromUserId === userId) side = "from";
  else {
    const toClaim = await prisma.claim.findUnique({ where: { teamId: req.toTeamId } });
    if (toClaim?.userId === userId) side = "to";
  }
  if (!side) return null;

  const [fromTeam, toTeam, fromUser, toClaim] = await Promise.all([
    prisma.team.findUnique({ where: { id: req.fromTeamId }, select: { name: true, slug: true } }),
    prisma.team.findUnique({ where: { id: req.toTeamId }, select: { name: true, slug: true } }),
    prisma.user.findUnique({ where: { id: req.fromUserId }, select: { firstName: true, lastName: true, email: true, phone: true } }),
    prisma.claim.findUnique({
      where: { teamId: req.toTeamId },
      include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } },
    }),
  ]);
  const other = side === "from" ? toClaim?.user ?? null : fromUser;
  const otherShareEmail = side === "from" ? req.toShareEmail : req.fromShareEmail;
  const otherSharePhone = side === "from" ? req.toSharePhone : req.fromSharePhone;

  return {
    kind: "scrimmage",
    id: req.id,
    side,
    status: req.status,
    myLabel: (side === "from" ? fromTeam?.name : toTeam?.name) ?? "Your team",
    otherLabel: (side === "from" ? toTeam?.name : fromTeam?.name) ?? "A team",
    otherTeamSlug: (side === "from" ? toTeam?.slug : fromTeam?.slug) ?? null,
    otherName: fullName(other),
    otherEmail: otherShareEmail ? other?.email ?? null : null,
    otherPhone: otherSharePhone ? other?.phone ?? null : null,
    myShareEmail: side === "from" ? req.fromShareEmail : req.toShareEmail,
    mySharePhone: side === "from" ? req.fromSharePhone : req.toSharePhone,
    messages: req.messages.map((m) => ({ id: m.id, mine: m.senderUserId === userId, body: m.body, createdAt: m.createdAt })),
  };
}

async function loadTournamentThread(id: string, userId: string): Promise<ThreadView | null> {
  const inv = await prisma.tournamentInvite.findUnique({
    where: { id },
    include: {
      tournament: { select: { name: true, directorUserId: true } },
      team: { select: { name: true, slug: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!inv) return null;
  let side: "director" | "team" | null = null;
  if (inv.tournament.directorUserId === userId) side = "director";
  else {
    const claim = await prisma.claim.findUnique({ where: { teamId: inv.teamId } });
    if (claim?.userId === userId) side = "team";
  }
  if (!side) return null;

  const [director, teamClaim] = await Promise.all([
    prisma.user.findUnique({ where: { id: inv.tournament.directorUserId }, select: { firstName: true, lastName: true, email: true, phone: true } }),
    prisma.claim.findUnique({
      where: { teamId: inv.teamId },
      include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } },
    }),
  ]);
  const coach = teamClaim?.user ?? null;
  const other = side === "director" ? coach : director;
  const otherShareEmail = side === "director" ? inv.teamShareEmail : inv.directorShareEmail;
  const otherSharePhone = side === "director" ? inv.teamSharePhone : inv.directorSharePhone;

  return {
    kind: "tournament",
    id: inv.id,
    side,
    status: inv.status,
    myLabel: side === "director" ? inv.tournament.name : inv.team.name,
    otherLabel: side === "director" ? inv.team.name : inv.tournament.name,
    otherTeamSlug: side === "director" ? inv.team.slug : null,
    otherName: fullName(other),
    otherEmail: otherShareEmail ? other?.email ?? null : null,
    otherPhone: otherSharePhone ? other?.phone ?? null : null,
    myShareEmail: side === "director" ? inv.directorShareEmail : inv.teamShareEmail,
    mySharePhone: side === "director" ? inv.directorSharePhone : inv.teamSharePhone,
    messages: inv.messages.map((m) => ({ id: m.id, mine: m.senderUserId === userId, body: m.body, createdAt: m.createdAt })),
  };
}

export async function getAllTeamSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  return prisma.team.findMany({
    where: {
      isActive: true,
      OR: [{ ageGroup: { not: null } }, { classification: { not: null } }],
    },
    select: { slug: true, updatedAt: true },
  });
}

/** Rank within the comparable set (non-provisional, same component) for display. */
export async function getTeamRank(teamId: string, rating: number): Promise<number | null> {
  const team = await prisma.rating.findUnique({ where: { teamId } });
  if (!team || team.isProvisional) return null;
  const better = await prisma.rating.count({
    where: { isProvisional: false, rating: { gt: rating } },
  });
  return better + 1;
}
