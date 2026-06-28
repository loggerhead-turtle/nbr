"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@nbr/db";
import { getCurrentUser } from "./user-auth";
import type { AccountState } from "./account-actions";

/** Verify the signed-in user owns the claim for a team. */
async function ownsTeam(userId: string, teamId: string): Promise<boolean> {
  const claim = await prisma.claim.findUnique({ where: { teamId } });
  return !!claim && claim.userId === userId;
}

export async function updateScrimmagePrefAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId || !(await ownsTeam(user!.id, teamId))) {
    return { error: "You can only manage teams you’ve claimed." };
  }
  const seekingScrimmage = formData.get("seekingScrimmage") === "on";
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 300) || null;
  const distRaw = String(formData.get("maxDistanceMiles") ?? "").trim();
  const maxDistanceMiles = distRaw && /^\d{1,4}$/.test(distRaw) ? Number(distRaw) : null;

  await prisma.scrimmagePref.upsert({
    where: { teamId },
    create: { teamId, userId: user!.id, seekingScrimmage, notes, maxDistanceMiles },
    update: { seekingScrimmage, notes, maxDistanceMiles },
  });
  revalidatePath("/account");
  return { ok: true, message: "Scrimmage settings saved." };
}

export async function sendScrimmageRequestAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/scrimmages");
  const fromTeamId = String(formData.get("fromTeamId") ?? "");
  const toTeamId = String(formData.get("toTeamId") ?? "");
  const message = String(formData.get("message") ?? "").trim().slice(0, 500) || null;
  if (!fromTeamId || !toTeamId || fromTeamId === toTeamId) return;
  if (!(await ownsTeam(user!.id, fromTeamId))) return;

  // Avoid duplicate pending requests for the same pairing.
  const existing = await prisma.scrimmageRequest.findFirst({
    where: { fromTeamId, toTeamId, status: "PENDING" },
  });
  if (!existing) {
    await prisma.scrimmageRequest.create({
      data: { fromTeamId, toTeamId, fromUserId: user!.id, message },
    });
  }
  revalidatePath("/scrimmages");
  revalidatePath("/account");
}

export async function respondScrimmageRequestAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const id = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || !["ACCEPTED", "DECLINED"].includes(decision)) return;

  const req = await prisma.scrimmageRequest.findUnique({ where: { id } });
  if (!req) return;
  if (!(await ownsTeam(user!.id, req.toTeamId))) return;

  await prisma.scrimmageRequest.update({ where: { id }, data: { status: decision } });
  revalidatePath("/account");
}
