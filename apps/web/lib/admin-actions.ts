"use server";

import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  prisma,
  GameSource,
  GameStatus,
  findCrossAgeMergeArtifacts,
  repairCrossAgeMerge,
  deleteExactNameGhosts,
  deleteOrphanGhosts,
  getGhostSplitGroups,
  reassignTeamGames,
  refreshTeamPendingMerge,
  dedupeAllGames,
  getScrapePayRateCents,
  setScrapePayRateCents,
  setScrapeGoals,
  recordScrapeCredits,
  recordPayout,
  resolveGameMergeCandidate,
  GHOST_MERGE_DISMISSALS_KEY,
  type GhostSplitGroup,
  type GameMergeResolution,
} from "@nbr/db";
import {
  createTeamSchema,
  createGameSchema,
  teamSlug,
  gcTeamIdSchema,
  AGE_GROUPS,
  CLASSIFICATIONS,
  geocodeCity,
  normalizeWebsiteUrl,
  isRatingAlgorithm,
  TIER_CUTOFFS_KEY,
  parseTierCutoffs,
  RECONCILE_SNAPSHOT_KEY,
  type ReconcileSnapshot,
} from "@nbr/core";
import { AGE_OFFSETS_KEY } from "./age-offset";
import { LIVE_SEARCH_KEY } from "./site-settings";
import { mergeTeams } from "./teams";
import {
  triggerScrapeTeam,
  triggerScrapeNew,
  triggerRescrapeAll,
  triggerCleanGhosts,
  triggerRecompute,
  triggerMergeDuplicates,
} from "./render-jobs";
import type { MergeTargetOption } from "./merge-types";
import {
  markActivitySeen,
  markActivityTypeSeen,
  markAllActivitySeen,
  ACTIVITY_TYPES,
  type ActivityType,
} from "./activity";
import { sendEmail, emailLayout, siteUrl } from "./email";
import { getCurrentSeasonYear } from "./season";
import { setRatingAlgorithm } from "./settings";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  checkPassword,
  createSessionToken,
  isAdmin,
} from "./auth";
import { isCurrentUserScraper, getCurrentUser, hashPassword } from "./user-auth";
import {
  getDuplicateMergesAtLeast,
  countDuplicateCandidates,
  createDuplicateMergeRun,
  finishDuplicateMergeRun,
} from "./duplicates";
import { DUP_BACKLOG_CONF_KEY } from "./site-settings";
import { formatUsd } from "./format";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Allow full admins OR limited game-scraper staff (add games, GC lookup). */
async function requireStaff() {
  if (await isAdmin()) return;
  if (await isCurrentUserScraper()) return;
  redirect("/login?next=/staff/gc-lookup");
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    return { error: "Incorrect password." };
  }
  const store = await cookies();
  store.set(ADMIN_COOKIE, createSessionToken(), adminCookieOptions);
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (await prisma.team.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

export async function createTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const nameInput = String(formData.get("name") ?? "").trim();
  const gcInput = String(formData.get("gcTeamId") ?? "").trim();
  const seasonYear = (await getCurrentSeasonYear()) ?? undefined;

  // Name is optional on the admin side. With no name but a GameChanger ID, create
  // a stub the scraper will enrich (name/city/age filled in on first scrape).
  if (!nameInput) {
    if (!gcInput) return { error: "Enter a team name or a GameChanger ID." };
    const parsedId = gcTeamIdSchema.safeParse(gcInput);
    if (!parsedId.success) {
      return { error: parsedId.error.errors[0]?.message ?? "Invalid GameChanger ID." };
    }
    const gcTeamId = parsedId.data;
    const dup = await prisma.team.findUnique({ where: { gcTeamId } });
    if (dup) return { error: `That GameChanger ID is already linked to “${dup.name}”.` };
    const slug = await uniqueSlug(`gc-${gcTeamId.toLowerCase()}`);
    await prisma.team.create({
      data: {
        name: `Unnamed team (${gcTeamId})`,
        gcTeamId,
        slug,
        state: "UT",
        needsEnrichment: true,
        scrapeEnabled: true,
        seasonYear,
        rating: { create: {} },
      },
    });
    await triggerScrapeTeam(gcTeamId);
    revalidatePath("/admin/teams");
    return { ok: true, message: "Added. Scraping now; name and details fill in shortly." };
  }

  const raw = {
    name: nameInput,
    gcTeamId: gcInput,
    ageGroup: formData.get("ageGroup") || undefined,
    division: formData.get("division") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || "UT",
    zip: formData.get("zip") || "",
  };

  const parsed = createTeamSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid team details." };
  }
  const data = parsed.data;

  if (data.gcTeamId) {
    const existing = await prisma.team.findUnique({ where: { gcTeamId: data.gcTeamId } });
    if (existing) {
      return { error: `That GameChanger ID is already linked to “${existing.name}”.` };
    }
  }

  // NOTE: we no longer auto-promote a matching ghost into this new team. A
  // ghost is a name-only opponent and same-name/age is not proof it's the same
  // club, so silently folding it in is how contamination spread. Instead the new
  // team is created fresh; if a ghost strongly matches it, the match surfaces on
  // the Merge queue (/admin/merge-queue) for a human to approve.
  const slug = await uniqueSlug(teamSlug(data.name, data.ageGroup));

  const team = await prisma.team.create({
    data: {
      name: data.name,
      gcTeamId: data.gcTeamId ?? null,
      slug,
      ageGroup: data.ageGroup ?? null,
      division: data.division ?? null,
      city: data.city ?? null,
      state: data.state,
      zip: data.zip ?? null,
      isGhost: false,
      seasonYear,
      // Create an initial (provisional) rating row so the team is queryable.
      rating: { create: {} },
    },
  });

  // Flag a "Verifying" state if this new team already has a confident ghost
  // match awaiting review — its games still count, and the badge clears when the
  // match is approved/dismissed on the Merge queue.
  await refreshTeamPendingMerge(team.id).catch(() => {});

  if (team.gcTeamId) await triggerScrapeTeam(team.gcTeamId);
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, message: `Added ${team.name}. Slug: ${team.slug}` };
}

export async function quickAddTeamsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const raw = String(formData.get("ids") ?? "");
  const tokens = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (tokens.length === 0) return { error: "Paste at least one GameChanger team ID." };

  let skipped = 0;
  const invalid: string[] = [];
  const created: { teamId: string; gcTeamId: string }[] = [];
  const seasonYear = (await getCurrentSeasonYear()) ?? undefined;

  for (const token of tokens) {
    const parsed = gcTeamIdSchema.safeParse(token);
    if (!parsed.success) {
      invalid.push(token);
      continue;
    }
    const gcTeamId = parsed.data;
    const existing = await prisma.team.findUnique({ where: { gcTeamId } });
    if (existing) {
      skipped += 1;
      continue;
    }
    const slug = await uniqueSlug(`gc-${gcTeamId.toLowerCase()}`);
    const team = await prisma.team.create({
      data: {
        name: `Unnamed team (${gcTeamId})`,
        gcTeamId,
        slug,
        state: "UT",
        needsEnrichment: true,
        scrapeEnabled: true,
        seasonYear,
        rating: { create: {} },
      },
      select: { id: true },
    });
    created.push({ teamId: team.id, gcTeamId });
  }

  const added = created.length;

  // Credit the signed-in scraper for each NEW team, at the current pay rate, so
  // their live earnings update after each submit.
  let earnedCents = 0;
  const user = await getCurrentUser();
  if (user && added > 0) {
    const rateCents = await getScrapePayRateCents();
    await recordScrapeCredits(user.id, created, rateCents).catch(() => 0);
    earnedCents = added * rateCents;
  }

  if (added > 0) await triggerScrapeNew();
  revalidatePath("/admin/teams");
  revalidatePath("/admin/gc-lookup");
  revalidatePath("/staff/gc-lookup");
  const parts = [`Added ${added} team${added === 1 ? "" : "s"}`];
  if (earnedCents > 0) parts.push(`+${formatUsd(earnedCents)}`);
  if (skipped) parts.push(`${skipped} already present`);
  if (invalid.length) parts.push(`${invalid.length} invalid (${invalid.slice(0, 3).join(", ")})`);
  return {
    ok: true,
    message: `${parts.join(" · ")}. Scraping now; names and details fill in shortly.`,
  };
}

export async function createGameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const raw = {
    homeTeamId: formData.get("homeTeamId"),
    awayTeamId: formData.get("awayTeamId"),
    homeScore: formData.get("homeScore"),
    awayScore: formData.get("awayScore"),
    playedAt: formData.get("playedAt"),
    neutralSite: formData.get("neutralSite") === "on",
    notes: formData.get("notes") || undefined,
  };

  const parsed = createGameSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid game details." };
  }
  const g = parsed.data;

  // Advisory dedup: warn if a same-day game between these teams already exists.
  const dayStart = new Date(g.playedAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(g.playedAt);
  dayEnd.setHours(23, 59, 59, 999);
  const dup = await prisma.game.findFirst({
    where: {
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      playedAt: { gte: dayStart, lte: dayEnd },
    },
  });
  if (dup && formData.get("confirmDuplicate") !== "1") {
    return {
      error:
        "A game between these teams on this date already exists. Re-submit with “allow duplicate” checked if this is a doubleheader.",
    };
  }

  await prisma.game.create({
    data: {
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      status: GameStatus.FINAL,
      source: GameSource.MANUAL,
      playedAt: g.playedAt,
      neutralSite: g.neutralSite,
      notes: g.notes ?? null,
    },
  });

  revalidatePath("/admin");
  return {
    ok: true,
    message: "Game recorded. Run a rating recompute to update ratings.",
  };
}

export async function updateTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("teamId") ?? "");
  if (!id) return { error: "Missing team id." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Name is too short." };

  const rawGc = String(formData.get("gcTeamId") ?? "").trim();
  let gcTeamId: string | null = null;
  if (rawGc) {
    const parsed = gcTeamIdSchema.safeParse(rawGc);
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Invalid GameChanger ID." };
    }
    gcTeamId = parsed.data;
    // Guard against linking an ID already used by another team.
    const clash = await prisma.team.findUnique({ where: { gcTeamId } });
    if (clash && clash.id !== id) {
      return { error: `That GameChanger ID is already linked to “${clash.name}”.` };
    }
  }

  const scrapeEnabled = formData.get("scrapeEnabled") === "on";

  const rawAge = String(formData.get("ageGroup") ?? "").trim();
  const ageGroup = rawAge && (AGE_GROUPS as readonly string[]).includes(rawAge) ? rawAge : null;

  const rawClass = String(formData.get("classification") ?? "").trim();
  const classification =
    rawClass && (CLASSIFICATIONS as readonly string[]).includes(rawClass) ? rawClass : null;

  // Optional admin location edit. When the city field is present and changed, we
  // lock the location (so the scraper won't overwrite it with a tournament host
  // city) and re-geocode. A "city" field is only sent by forms that include it.
  const locationData: Record<string, unknown> = {};
  if (formData.has("city")) {
    const existing = await prisma.team.findUnique({
      where: { id },
      select: { city: true, state: true },
    });
    const city = String(formData.get("city") ?? "").trim() || null;
    if (city !== (existing?.city ?? null)) {
      locationData.city = city;
      locationData.locationLocked = true;
      const geo = city ? geocodeCity(city, existing?.state ?? "UT") : null;
      locationData.latitude = geo?.lat ?? null;
      locationData.longitude = geo?.lng ?? null;
    }
  }

  // Optional admin website edit (only when the form includes a website field).
  const websiteData: Record<string, unknown> = {};
  if (formData.has("website")) {
    websiteData.website = normalizeWebsiteUrl(String(formData.get("website") ?? ""));
  }

  try {
    await prisma.team.update({
      where: { id },
      data: {
        name,
        gcTeamId,
        scrapeEnabled,
        ageGroup: ageGroup as never,
        classification,
        ...locationData,
        ...websiteData,
        // Reset scrape bookkeeping so a corrected ID gets re-scraped promptly.
        lastScrapedAt: null,
        nextScrapeAfter: null,
        consecutiveFailures: 0,
      },
    });
  } catch {
    return { error: "Could not update the team." };
  }

  revalidatePath("/admin/teams");
  revalidatePath("/");
  return { ok: true, message: "Saved." };
}

/**
 * Wipe a team's (wrong) location and lock it so the scraper won't repopulate it.
 * GameChanger sometimes reports a tournament's host city (e.g. RMSB's Northern
 * Utah setup) instead of the team's home town.
 */
export async function clearTeamLocationAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("teamId") ?? "");
  if (!id) return;
  await prisma.team.update({
    where: { id },
    data: { city: null, zip: null, latitude: null, longitude: null, locationLocked: true },
  });
  revalidatePath("/admin/teams");
  revalidatePath("/");
}

/** Toggle live ratings search (no Apply button) on the public ratings page. */
export async function setLiveSearchAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const on = formData.get("liveSearch") === "on";
  await prisma.appSetting.upsert({
    where: { key: LIVE_SEARCH_KEY },
    create: { key: LIVE_SEARCH_KEY, value: on ? "1" : "0" },
    update: { value: on ? "1" : "0" },
  });
  revalidatePath("/");
  revalidatePath("/admin");
}

/** Save the admin-tunable cross-age rating offset (points per age year). */
export async function setTierCutoffsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  // Percentile lower-bounds for AA / AAA / Majors (A is below AA). parseTierCutoffs
  // clamps to 0–100 and keeps them ordered.
  const cutoffs = parseTierCutoffs(
    JSON.stringify({
      AA: Number(formData.get("AA")),
      AAA: Number(formData.get("AAA")),
      Majors: Number(formData.get("Majors")),
    }),
  );
  await prisma.appSetting.upsert({
    where: { key: TIER_CUTOFFS_KEY },
    create: { key: TIER_CUTOFFS_KEY, value: JSON.stringify(cutoffs) },
    update: { value: JSON.stringify(cutoffs) },
  });
  revalidatePath("/admin/tiers");
  revalidatePath("/");
}

export async function setAgeOffsetsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  // One numeric field per age group (name="offset_U12"), points relative to 14U=0.
  const offsets: Record<string, number> = {};
  for (const a of AGE_GROUPS) {
    const raw = formData.get(`offset_${a}`);
    if (raw == null || String(raw).trim() === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) offsets[a] = Math.max(-5000, Math.min(5000, Math.round(n)));
  }
  await prisma.appSetting.upsert({
    where: { key: AGE_OFFSETS_KEY },
    create: { key: AGE_OFFSETS_KEY, value: JSON.stringify(offsets) },
    update: { value: JSON.stringify(offsets) },
  });
  revalidatePath("/admin/age-offset");
}

export async function mergeTeamAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const sourceId = String(formData.get("sourceId") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  await mergeTeams(sourceId, targetId);
  revalidatePath("/admin/teams");
  revalidatePath("/");
}

export async function setRatingAlgorithmAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const algorithm = String(formData.get("algorithm") ?? "");
  if (!isRatingAlgorithm(algorithm)) return { error: "Unknown rating algorithm." };
  await setRatingAlgorithm(algorithm);
  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved. The next rating recompute will use this model." };
}

/** Merge a ghost team into a chosen real team (Ghost-teams admin page). */
export async function mergeGhostAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const ghostId = String(formData.get("ghostId") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  if (!ghostId || !targetId || ghostId === targetId) return;
  // The ghost (source) folds into the real team (target), which keeps its id.
  await mergeTeams(ghostId, targetId);
  // The target may still have another pending match, or none — recompute its flag.
  await refreshTeamPendingMerge(targetId).catch(() => {});
  revalidatePath("/admin/ghosts");
  revalidatePath("/admin/merge-queue");
  revalidatePath("/admin/duplicates");
  revalidatePath("/admin/teams");
  revalidatePath("/");
}

/**
 * Dismiss a ghost↔real match on the Merge queue: record the pair so it stops
 * being suggested. Stored as a JSON array of "ghostId|targetId" keys in
 * AppSetting (no schema change). Best-effort — dismissing is advisory.
 */
export async function dismissGhostMergeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("dismissKey") ?? "").trim();
  if (!key.includes("|")) return;
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: GHOST_MERGE_DISMISSALS_KEY },
    });
    const arr: string[] = row?.value ? JSON.parse(row.value) : [];
    const set = new Set(Array.isArray(arr) ? arr : []);
    set.add(key);
    await prisma.appSetting.upsert({
      where: { key: GHOST_MERGE_DISMISSALS_KEY },
      create: { key: GHOST_MERGE_DISMISSALS_KEY, value: JSON.stringify([...set]) },
      update: { value: JSON.stringify([...set]) },
    });
    // Clear the target's "Verifying" badge if this was its only pending match.
    const targetId = key.slice(key.indexOf("|") + 1);
    if (targetId) await refreshTeamPendingMerge(targetId).catch(() => {});
  } catch {
    // ignore — dismissing is best-effort
  }
  revalidatePath("/admin/merge-queue");
  revalidatePath("/");
}

/**
 * Resolve a Game merge queue conflict (a same-day matchup whose two teams'
 * schedules disagree on the game count). "doubleheader" keeps the real legs and
 * drops the other side's duplicate, "single" collapses to one game, "dismiss"
 * just closes it. Recompute ratings after a collapse — the game graph changed.
 */
export async function resolveGameMergeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("candidateId") ?? "").trim();
  const resolution = String(formData.get("resolution") ?? "") as GameMergeResolution;
  if (!id || !["doubleheader", "single", "dismiss"].includes(resolution)) return;
  await resolveGameMergeCandidate(id, resolution);
  revalidatePath("/admin/game-merge");
  revalidatePath("/");
}

/**
 * Bulk-delete every ghost whose exact name matches a single verified (GameChanger)
 * team — the ghost and its (duplicate) games are removed; the verified team is
 * kept. Recompute afterward since the game graph changed.
 */
export async function deleteExactNameGhostsAction(): Promise<void> {
  await requireAdmin();
  const { deleted } = await deleteExactNameGhosts();
  if (deleted > 0) await triggerRecompute();
  revalidatePath("/admin/ghosts");
  revalidatePath("/admin/duplicates");
  revalidatePath("/admin/teams");
  revalidatePath("/");
}

/**
 * Delete every ghost with zero games (orphans — typically left behind after a
 * reconcile prune). Safe: nothing references them. Recompute is unnecessary
 * since they had no games, but we revalidate the pages whose counts change.
 */
export async function deleteOrphanGhostsAction(): Promise<void> {
  await requireAdmin();
  await deleteOrphanGhosts();
  revalidatePath("/admin/ghosts");
  revalidatePath("/admin/audit");
  revalidatePath("/admin/teams");
}

/** Group a junk-drawer ghost's games by opponent age (for the split UI). */
export async function getGhostSplitGroupsAction(ghostId: string): Promise<GhostSplitGroup[]> {
  await requireAdmin();
  if (!ghostId) return [];
  return getGhostSplitGroups(ghostId);
}

/** Move a set of a ghost's games onto a chosen team (one age-group at a time). */
export async function reassignGhostGamesAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const ghostId = String(formData.get("ghostId") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  const gameIds = String(formData.get("gameIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ghostId || !targetId || gameIds.length === 0) return;
  await reassignTeamGames(ghostId, gameIds, targetId);
  revalidatePath("/admin/ghosts");
  revalidatePath("/admin/duplicates");
  revalidatePath("/");
}

/** Search real (non-ghost) teams to hand-pick a merge target for a ghost. */
export async function searchMergeTargets(query: string): Promise<MergeTargetOption[]> {
  await requireAdmin();
  const q = query.trim();
  if (q.length < 2) return [];
  const teams = await prisma.team.findMany({
    where: { isGhost: false, name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, city: true, ageGroup: true, gcTeamId: true },
    orderBy: { name: "asc" },
    take: 15,
  });
  return teams;
}

/**
 * Repair cross-age-group merge artifacts: split off-age games back onto
 * regenerated ghosts at the opponent's age, then trigger a recompute. An empty
 * `teamId` repairs every flagged team; otherwise just the one. `gap` is the
 * minimum age-year distance that counts as suspect (default 3).
 */
export async function repairBadMergesAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const teamId = String(formData.get("teamId") ?? "");
  const gap = Math.max(2, Number(formData.get("gap") ?? "3") || 3);

  const findings = await findCrossAgeMergeArtifacts(gap);
  const targets = teamId ? findings.filter((f) => f.teamId === teamId) : findings;

  let moved = 0;
  for (const f of targets) moved += await repairCrossAgeMerge(f);

  // Reassigned games change ratings — kick a recompute (no-op if Render isn't
  // configured; the scheduled recompute will catch it either way).
  if (moved > 0) await triggerRecompute();

  revalidatePath("/admin/bad-merges");
  revalidatePath("/admin/ghosts");
  revalidatePath("/");
}

/** Mark the admin activity feed as seen (clears the nav "new" badge). */
export async function markActivitySeenAction(): Promise<void> {
  await requireAdmin();
  await markActivitySeen();
  revalidatePath("/admin", "layout");
}

/** Clear one activity section (e.g. just "new users") — explicit, not on visit. */
export async function clearActivityTypeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const type = String(formData.get("type") ?? "");
  if (!(ACTIVITY_TYPES as readonly { type: string }[]).some((t) => t.type === type)) return;
  await markActivityTypeSeen(type as ActivityType);
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/activity");
}

/** Clear every activity section at once. */
export async function clearAllActivityAction(): Promise<void> {
  await requireAdmin();
  await markAllActivitySeen();
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/activity");
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || !["ADMIN", "USER", "GAME_SCRAPER"].includes(role)) return;
  await prisma.user.update({
    where: { id: userId },
    data: { role: role as "ADMIN" | "USER" | "GAME_SCRAPER" },
  });
  revalidatePath("/admin/users");
}

/**
 * Generate a readable, crypto-random password. Omits ambiguous characters
 * (0/O, 1/l/I) so it survives being read aloud or copied by hand.
 */
function generatePassword(length = 14): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/**
 * Admin-set password: type a specific password for a user to sign in with. Sends
 * the user a security notice (never the password itself — the admin relays it).
 */
export async function setUserPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!userId) return { error: "Missing user." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return { error: "User not found." };

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });

  // Best-effort heads-up so the change isn't silent. Never includes the password.
  await sendEmail({
    to: user.email,
    subject: "Your National Baseball Ratings password was changed",
    html: emailLayout(
      "Password changed",
      `<p>An administrator set a new password on your account. If you weren't expecting this, please contact us right away.</p>`,
      { label: "Sign in", url: siteUrl("/login") },
    ),
  });

  revalidatePath("/admin/users");
  return { ok: true, message: `Password updated for ${user.email}.` };
}

/**
 * Password reset: generate a new random password, set it, and email it to the
 * user. When email isn't configured, the new password is returned to the admin
 * so they can pass it along manually.
 */
export async function resetUserPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Missing user." };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return { error: "User not found." };

  const password = generatePassword();
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });

  await sendEmail({
    to: user.email,
    subject: "Your new National Baseball Ratings password",
    html: emailLayout(
      "Password reset",
      `<p>An administrator reset your password. Your new password is:</p>
       <p style="font-size:18px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:1px;">${password}</p>
       <p>Use it to sign in. If you didn't request this, contact us right away.</p>`,
      { label: "Sign in", url: siteUrl("/login") },
    ),
  });

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: process.env.RESEND_API_KEY
      ? `New password emailed to ${user.email}.`
      : `Email isn't configured — give ${user.email} this password: ${password}`,
  };
}

/** Save the game-scraper pay rate (cents/team) and period goals (teams). */
export async function setScrapePayAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const rate = Number(formData.get("rateCents"));
  if (Number.isFinite(rate) && rate >= 0) await setScrapePayRateCents(Math.round(rate));
  await setScrapeGoals({
    daily: Number(formData.get("daily")) || 0,
    weekly: Number(formData.get("weekly")) || 0,
    monthly: Number(formData.get("monthly")) || 0,
  });
  revalidatePath("/admin/scraper-pay");
  revalidatePath("/admin/gc-lookup");
  revalidatePath("/staff/gc-lookup");
  revalidatePath("/staff/leaderboard");
  return { ok: true, message: "Saved." };
}

/** Mark a scraper paid through now — banks unpaid credits and resets their
 * "since last pay period" to zero. */
export async function markScraperPaidAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  await recordPayout(userId);
  revalidatePath("/admin/scraper-pay");
  revalidatePath("/staff/leaderboard");
}

export async function setTdStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!userId || !["APPROVED", "REJECTED", "NONE"].includes(status)) return;
  const user = await prisma.user.update({ where: { id: userId }, data: { tdStatus: status } });

  if (status === "APPROVED" || status === "REJECTED") {
    await sendEmail({
      to: user.email,
      subject:
        status === "APPROVED"
          ? "You’re approved as a tournament director"
          : "Tournament-director request update",
      html: emailLayout(
        status === "APPROVED" ? "You’re approved!" : "Request reviewed",
        status === "APPROVED"
          ? `<p>Your tournament-director request has been approved. You can now create tournaments and invite teams.</p>`
          : `<p>Your tournament-director request was not approved at this time. Contact us if you have questions.</p>`,
        status === "APPROVED" ? { label: "Open TD portal", url: siteUrl("/td") } : undefined,
      ),
    });
  }
  revalidatePath("/admin");
}

/** How many pairs one bulk-merge click processes (keeps a request fast). */
const MERGE_BATCH = 300;

/**
 * Bulk-merge every duplicate pair whose merge confidence is at least the
 * admin-chosen threshold (e.g. 100, 99, 96). Each source folds into its kept
 * target — nothing is lost. A team already merged away in this pass is skipped
 * (its remaining pairs resurface on the next scan). Processes up to MERGE_BATCH
 * pairs per click and reports how many remain so the admin can keep going.
 */
export async function mergeDuplicatesByConfidenceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const minPct = Math.max(1, Math.min(100, Math.round(Number(formData.get("minPct")) || 100)));

  const merges = await getDuplicateMergesAtLeast(minPct, MERGE_BATCH);
  if (merges.length === 0) {
    return { ok: true, message: `No duplicates at ${minPct}% confidence or higher right now.` };
  }

  const deleted = new Set<string>();
  let merged = 0;
  for (const { sourceId, targetId } of merges) {
    // Skip if either side was already folded away this pass — mergeTeams would
    // no-op on the missing team, and the leftover pair resurfaces next scan.
    if (deleted.has(sourceId) || deleted.has(targetId)) continue;
    await mergeTeams(sourceId, targetId);
    deleted.add(sourceId);
    merged += 1;
  }

  if (merged > 0) await triggerRecompute();
  revalidatePath("/admin/duplicates");
  revalidatePath("/admin/audit");
  revalidatePath("/");

  const remaining = await countDuplicateCandidates().catch(() => 0);
  return {
    ok: true,
    message:
      `Merged ${merged} duplicate${merged === 1 ? "" : "s"} at ≥${minPct}% confidence${merged > 0 ? " — ratings recompute started." : "."}` +
      (remaining > 0
        ? ` ${remaining} possible duplicate${remaining === 1 ? "" : "s"} remain — run it again to keep going.`
        : ""),
  };
}

/**
 * Start a background duplicate-backlog merge on the worker at the chosen minimum
 * confidence. Remembers the level, refuses to start if one is already running,
 * creates the run row, and dispatches the worker job (marking the run FAILED if
 * the worker isn't configured so the page shows why).
 */
export async function startDuplicateBacklogAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const minPct = Math.max(1, Math.min(100, Math.round(Number(formData.get("minPct")) || 100)));

  await prisma.appSetting.upsert({
    where: { key: DUP_BACKLOG_CONF_KEY },
    create: { key: DUP_BACKLOG_CONF_KEY, value: String(minPct) },
    update: { value: String(minPct) },
  });

  const running = await prisma.duplicateMergeRun.findFirst({ where: { status: "RUNNING" } });
  if (running) {
    return { error: "A backlog merge is already running. Wait for it to finish before starting another." };
  }

  const run = await createDuplicateMergeRun(minPct);
  const dispatched = await triggerMergeDuplicates(minPct, run.id);
  if (!dispatched) {
    await finishDuplicateMergeRun(run.id, {
      status: "FAILED",
      error: "Worker not configured (RENDER_API_KEY / RENDER_WORKER_SERVICE_ID unset).",
    });
    revalidatePath("/admin/duplicates-backlog");
    return {
      error:
        "Couldn't start the worker job. Set RENDER_API_KEY and RENDER_WORKER_SERVICE_ID (see server logs).",
    };
  }

  revalidatePath("/admin/duplicates-backlog");
  return {
    ok: true,
    message: `Backlog merge started at ≥${minPct}% confidence — merges appear below as the worker runs. Refresh to update.`,
  };
}

export async function dismissDuplicateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const a = String(formData.get("teamIdA") ?? "");
  const b = String(formData.get("teamIdB") ?? "");
  if (!a || !b || a === b) return;
  const [teamIdA, teamIdB] = a < b ? [a, b] : [b, a];
  try {
    await prisma.duplicateDismissal.upsert({
      where: { teamIdA_teamIdB: { teamIdA, teamIdB } },
      create: { teamIdA, teamIdB },
      update: {},
    });
  } catch {
    // ignore
  }
  revalidatePath("/admin/duplicates");
}

/**
 * "Revisit later" for a duplicate pair: hide it for a few days so the next
 * scrape/recompute can add more games, then let it resurface. Stored as a JSON
 * map (pairKey → ISO expiry) in AppSetting so no schema change is needed.
 */
export async function snoozeDuplicateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const a = String(formData.get("teamIdA") ?? "");
  const b = String(formData.get("teamIdB") ?? "");
  if (!a || !b || a === b) return;
  const [teamIdA, teamIdB] = a < b ? [a, b] : [b, a];
  const key = `${teamIdA}|${teamIdB}`;
  const days = Math.min(30, Math.max(1, Number(formData.get("days") ?? "1") || 1));
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "duplicateSnoozes" } });
    const map: Record<string, string> = row?.value ? JSON.parse(row.value) : {};
    // Prune expired entries so the blob doesn't grow without bound.
    const now = Date.now();
    for (const [k, v] of Object.entries(map)) {
      if (new Date(v).getTime() <= now) delete map[k];
    }
    map[key] = until;
    await prisma.appSetting.upsert({
      where: { key: "duplicateSnoozes" },
      create: { key: "duplicateSnoozes", value: JSON.stringify(map) },
      update: { value: JSON.stringify(map) },
    });
  } catch {
    // ignore — snoozing is best-effort
  }
  revalidatePath("/admin/duplicates");
}

/**
 * Delete a set of phantom games surfaced by the reconcile capture (games in our
 * DB that aren't on a team's live GameChanger page). Deletes by id — no
 * re-scrape — then recomputes since the game graph changed.
 */
/**
 * Prune the saved reconcile snapshot so the page reflects what's been resolved
 * (the snapshot is a frozen capture; without this, deleted games/teams reappear
 * on reload). Best-effort.
 */
async function pruneReconcileSnapshot(opts: {
  deletedGameIds?: Set<string>;
  removeTeamId?: string;
}): Promise<void> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: RECONCILE_SNAPSHOT_KEY } });
    if (!row?.value) return;
    const snap = JSON.parse(row.value) as ReconcileSnapshot;
    if (opts.deletedGameIds) {
      const gone = opts.deletedGameIds;
      snap.withExtras = snap.withExtras
        .map((t) => ({ ...t, extras: t.extras.filter((g) => !gone.has(g.gameId)) }))
        .filter((t) => t.extras.length > 0);
    }
    if (opts.removeTeamId) {
      snap.withExtras = snap.withExtras.filter((t) => t.teamId !== opts.removeTeamId);
      snap.deadIds = snap.deadIds.filter((t) => t.teamId !== opts.removeTeamId);
    }
    await prisma.appSetting.update({
      where: { key: RECONCILE_SNAPSHOT_KEY },
      data: { value: JSON.stringify(snap) },
    });
  } catch {
    // best-effort — the snapshot is just a cached view
  }
}

export async function deletePhantomGamesAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const ids = String(formData.get("gameIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return;
  // No recompute here on purpose — when clearing phantoms across many teams you'd
  // otherwise kick a recompute job per click. Hit "Recompute" once when done.
  await prisma.game.deleteMany({ where: { id: { in: ids } } });
  await pruneReconcileSnapshot({ deletedGameIds: new Set(ids) });
  revalidatePath("/admin/reconcile");
  revalidatePath("/");
}

/** Kick a single ratings recompute — use after a batch of reconcile deletes. */
export async function recomputeRatingsAction(): Promise<ActionState> {
  await requireAdmin();
  const sent = await triggerRecompute();
  return sent
    ? { ok: true, message: "Recompute started — ratings update in a few minutes." }
    : {
        error:
          "Couldn't start the recompute job. Set RENDER_API_KEY and RENDER_WORKER_SERVICE_ID (see server logs).",
      };
}

/**
 * Remove duplicate games across all verified teams — the cleanup for the extra
 * rows a merge can leave (the same matchup recorded against the verified team and
 * against a ghost of the opponent). Keeps the verified-opponent copy, then
 * recomputes since the game graph changed.
 */
export async function dedupeGamesAction(): Promise<ActionState> {
  await requireAdmin();
  const removed = await dedupeAllGames();
  if (removed > 0) await triggerRecompute();
  revalidatePath("/");
  revalidatePath("/admin/merge-queue");
  return removed > 0
    ? { ok: true, message: `Removed ${removed} duplicate game${removed === 1 ? "" : "s"} — recompute started.` }
    : { ok: true, message: "No duplicate games found." };
}

/**
 * Re-scrape recently added teams to refresh their location (state/city). Quick-
 * added teams default to state "UT"; the scraper now corrects out-of-state teams
 * from their own page, but teams added before that fix stay mislabeled until
 * re-scraped. This resets recent adds so the scrape-new pass re-fetches them.
 */
export async function rescrapeRecentAction(): Promise<ActionState> {
  await requireAdmin();
  const cutoff = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
  const res = await prisma.team.updateMany({
    where: {
      isGhost: false,
      gcTeamId: { not: null },
      locationLocked: false,
      createdAt: { gte: cutoff },
    },
    data: { lastScrapedAt: null, nextScrapeAfter: null, consecutiveFailures: 0 },
  });
  let sent = false;
  if (res.count > 0) sent = await triggerScrapeNew();
  if (res.count === 0) return { ok: true, message: "No recently added teams to re-scrape." };
  return sent
    ? { ok: true, message: `Re-scraping ${res.count} recent team(s) to fix locations — check back shortly.` }
    : {
        error: `Reset ${res.count} team(s), but couldn't start the scrape job (RENDER_API_KEY / RENDER_WORKER_SERVICE_ID not set).`,
      };
}

/**
 * Kick a full re-scrape of every scrapeable team — a deliberate one-off, e.g. to
 * backfill new fields (season/record/game UUIDs) across the whole population.
 * Long-running; unrelated to the on-add scrape.
 */
export async function rescrapeAllAction(): Promise<ActionState> {
  await requireAdmin();
  const eligible = await prisma.team.count({
    where: { scrapeEnabled: true, gcTeamId: { not: null } },
  });
  if (eligible === 0) return { error: "No scrapeable teams (need a GameChanger ID)." };
  const sent = await triggerRescrapeAll();
  return sent
    ? {
        ok: true,
        message: `Full re-scrape started for ${eligible} team${eligible === 1 ? "" : "s"} — this runs a while; check the nbr-scraper job logs.`,
      }
    : {
        error:
          "Couldn't start the job. Set RENDER_API_KEY and RENDER_WORKER_SERVICE_ID (see server logs).",
      };
}

/**
 * Clean up ghosts as a BACKGROUND job (merge duplicate ghosts + delete empty
 * ones). Dispatched to the worker rather than run inline because at thousands of
 * ghosts an inline web request would time out.
 */
export async function cleanGhostsAction(): Promise<ActionState> {
  await requireAdmin();
  const sent = await triggerCleanGhosts();
  return sent
    ? {
        ok: true,
        message:
          "Ghost cleanup started in the background (merging duplicates, removing empties). Refresh the counts in a couple of minutes.",
      }
    : {
        error:
          "Couldn't start the cleanup job. Set RENDER_API_KEY and RENDER_WORKER_SERVICE_ID (see server logs).",
      };
}

/** Scrape every just-added (never-scraped) team, then recompute — the manual
 * equivalent of the on-add trigger, for when you've bulk-added teams. Reports how
 * many teams are actually eligible so a "nothing happened" is explained, not
 * silent (the job only scrapes teams with a GameChanger ID that were never
 * scraped). */
export async function scrapeNewTeamsAction(): Promise<ActionState> {
  await requireAdmin();

  // Same predicate runScrapeNew uses: a GC id, scraping on, never scraped yet.
  const eligible = await prisma.team.count({
    where: { scrapeEnabled: true, gcTeamId: { not: null }, lastScrapedAt: null },
  });
  if (eligible === 0) {
    // Explain the most likely reason nothing would scrape.
    const noGcId = await prisma.team.count({
      where: { isGhost: false, gcTeamId: null, lastScrapedAt: null },
    });
    return {
      error:
        noGcId > 0
          ? `Nothing to scrape: ${noGcId} added team(s) have no GameChanger ID. Add teams by GameChanger ID (Add team → paste IDs) so they can be scraped.`
          : "Nothing to scrape — every added team has already been scraped.",
    };
  }

  const sent = await triggerScrapeNew();
  return sent
    ? {
        ok: true,
        message: `Scrape started for ${eligible} new team${eligible === 1 ? "" : "s"} — ratings recompute after. (Check the nbr-scraper job logs for progress.)`,
      }
    : {
        error:
          "Couldn't start the scrape job. Set RENDER_API_KEY and RENDER_WORKER_SERVICE_ID (see server logs).",
      };
}

/**
 * A team whose GameChanger id points at nothing online (dead id). Clear the id
 * and turn it into a ghost so it stops being treated as a verified team and can
 * be merged into the real team on the Ghosts/Duplicates page.
 */
export async function clearTeamGcIdAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) return;
  await prisma.team.update({
    where: { id: teamId },
    data: { gcTeamId: null, scrapeEnabled: false, isGhost: true },
  });
  await pruneReconcileSnapshot({ removeTeamId: teamId });
  revalidatePath("/admin/reconcile");
  revalidatePath("/admin/ghosts");
  revalidatePath("/admin/duplicates");
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("teamId") ?? "");
  if (!id) return;
  try {
    // Games cascade with the team (see schema relations).
    await prisma.team.delete({ where: { id } });
  } catch {
    // Ignore — team may already be gone.
  }
  revalidatePath("/admin/teams");
  revalidatePath("/");
}
