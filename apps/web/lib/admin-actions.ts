"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, GameSource, GameStatus } from "@nbr/db";
import { createTeamSchema, createGameSchema, teamSlug } from "@nbr/core";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  checkPassword,
  createSessionToken,
  isAdmin,
} from "./auth";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
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

  const raw = {
    name: formData.get("name"),
    gcTeamId: formData.get("gcTeamId") || "",
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
      // Create an initial (provisional) rating row so the team is queryable.
      rating: { create: {} },
    },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, message: `Added ${team.name}. Slug: ${team.slug}` };
}

export async function createGameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

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
