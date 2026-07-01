"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@nbr/db";
import { createTeamSchema, teamSlug } from "@nbr/core";
import { refreshTeamPendingMerge } from "@nbr/db";
import { triggerScrapeTeam } from "./render-jobs";
import { getCurrentSeasonYear } from "./season";
import type { ActionState } from "./admin-actions";

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (await prisma.team.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

/**
 * Public team submission: a visitor proposes a team (typically with its
 * GameChanger ID). The team is created so its scores can begin to be collected;
 * admins can later verify/merge via the dashboard.
 */
export async function submitTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = {
    name: formData.get("name"),
    gcTeamId: formData.get("gcTeamId") || "",
    ageGroup: formData.get("ageGroup") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || "UT",
    zip: formData.get("zip") || "",
  };

  const parsed = createTeamSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Please check your entries." };
  }
  const data = parsed.data;

  if (data.gcTeamId) {
    const existing = await prisma.team.findUnique({ where: { gcTeamId: data.gcTeamId } });
    if (existing) {
      return {
        ok: true,
        message: `Good news — “${existing.name}” is already in our system.`,
      };
    }
  }

  // We no longer auto-merge a matching ghost into a public submission — same
  // name/age isn't proof it's the same club. The team is created fresh; an admin
  // reviews any strong ghost match on the Merge queue before the games are folded
  // in, so a mistaken match can't silently contaminate ratings.
  const slug = await uniqueSlug(teamSlug(data.name, data.ageGroup));
  const team = await prisma.team.create({
    data: {
      name: data.name,
      gcTeamId: data.gcTeamId ?? null,
      slug,
      ageGroup: data.ageGroup ?? null,
      city: data.city ?? null,
      state: data.state,
      zip: data.zip ?? null,
      seasonYear: (await getCurrentSeasonYear()) ?? undefined,
      rating: { create: {} },
    },
  });

  // Flag "Verifying" if a confident ghost match is already waiting for review.
  await refreshTeamPendingMerge(team.id).catch(() => {});

  if (data.gcTeamId) await triggerScrapeTeam(data.gcTeamId);
  revalidatePath("/");
  return {
    ok: true,
    message:
      "Thanks! We’ve added the team and will begin collecting its scores. Ratings appear once it has played enough games.",
  };
}
