"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@nbr/db";
import { gcTeamIdSchema } from "@nbr/core";
import { isAdmin } from "./auth";
import { getCurrentUser } from "./user-auth";
import { getCurrentSeasonYear, setCurrentSeasonYear } from "./season";
import type { AccountState } from "./account-actions";

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || "team";
  let n = 2;
  while (await prisma.team.findUnique({ where: { slug } })) slug = `${base}-${n++}`;
  return slug;
}

/** Admin opens a new season — turns on the rollover prompt for coaches. */
export async function advanceSeasonAction(formData: FormData): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
  const typed = Number(formData.get("year"));
  const current = await getCurrentSeasonYear();
  const next = Number.isFinite(typed) && typed > 2000 ? typed : (current ?? new Date().getUTCFullYear()) + 1;
  await setCurrentSeasonYear(next);
  revalidatePath("/admin");
}

/**
 * Coach creates their new-season team from the rollover prompt: links it to the
 * prior team (rating carries forward), copies the claim, archives the old team.
 */
export async function createSuccessorAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const predecessorTeamId = String(formData.get("predecessorTeamId") ?? "");
  const claim = await prisma.claim.findUnique({ where: { teamId: predecessorTeamId } });
  if (!claim || claim.userId !== user!.id) {
    return { error: "You can only do this for a team you’ve claimed." };
  }

  const parsed = gcTeamIdSchema.safeParse(String(formData.get("gcTeamId") ?? "").trim());
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid GameChanger ID." };
  const gcTeamId = parsed.data;

  if (await prisma.team.findUnique({ where: { gcTeamId } })) {
    return { error: "That GameChanger ID is already in the system." };
  }
  if (await prisma.team.findUnique({ where: { predecessorTeamId } })) {
    return { error: "This team already has a next-season team." };
  }

  const old = await prisma.team.findUnique({ where: { id: predecessorTeamId } });
  const season = await getCurrentSeasonYear();
  const slug = await uniqueSlug(`gc-${gcTeamId.toLowerCase()}`);

  const newTeam = await prisma.team.create({
    data: {
      name: `Unnamed team (${gcTeamId})`,
      gcTeamId,
      slug,
      state: old?.state ?? "UT",
      needsEnrichment: true,
      scrapeEnabled: true,
      seasonYear: season ?? undefined,
      predecessorTeamId,
      rating: { create: {} },
    },
  });

  // Carry the coach's claim onto the new team; archive the old one.
  await prisma.claim.create({
    data: {
      teamId: newTeam.id,
      userId: user!.id,
      status: "APPROVED",
      contactOptIn: claim.contactOptIn,
      approvedAt: new Date(),
    },
  });
  await prisma.team.update({ where: { id: predecessorTeamId }, data: { isActive: false } });

  revalidatePath("/account");
  revalidatePath("/");
  return {
    ok: true,
    message:
      "Your new-season team was created and linked to last season. Its rating carries over, and scores will start updating after the next scrape.",
  };
}
