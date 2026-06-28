"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@nbr/db";
import { getCurrentUser } from "./user-auth";
import { sendEmail, emailLayout, siteUrl } from "./email";
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

export interface SendScrimmageResult {
  requestId: string | null;
  /** Whether the target team has an APPROVED claim (i.e. a coach who'll receive it). */
  claimed: boolean;
}

export async function sendScrimmageRequestAction(formData: FormData): Promise<SendScrimmageResult> {
  const fail: SendScrimmageResult = { requestId: null, claimed: false };
  const user = await getCurrentUser();
  if (!user) return fail;
  const fromTeamId = String(formData.get("fromTeamId") ?? "");
  const toTeamId = String(formData.get("toTeamId") ?? "");
  const message = String(formData.get("message") ?? "").trim().slice(0, 500) || null;
  if (!fromTeamId || !toTeamId || fromTeamId === toTeamId) return fail;
  if (!(await ownsTeam(user.id, fromTeamId))) return fail;

  const toTeam = await prisma.team.findUnique({
    where: { id: toTeamId },
    include: { claim: { include: { user: true } } },
  });
  if (!toTeam) return fail;
  const claimed = toTeam.claim?.status === "APPROVED";

  // Avoid duplicate pending requests for the same pairing.
  let existing = await prisma.scrimmageRequest.findFirst({
    where: { fromTeamId, toTeamId, status: "PENDING" },
  });
  if (!existing) {
    existing = await prisma.scrimmageRequest.create({
      data: { fromTeamId, toTeamId, fromUserId: user.id, message },
    });

    // Notify the recipient team's coach — only if the team is actually claimed.
    // Otherwise the request waits as PENDING and surfaces once a coach claims it.
    if (claimed && toTeam.claim?.user?.email) {
      const fromTeam = await prisma.team.findUnique({
        where: { id: fromTeamId },
        select: { name: true },
      });
      await sendEmail({
        to: toTeam.claim.user.email,
        subject: `Scrimmage request for ${toTeam.name}`,
        html: emailLayout(
          "New scrimmage request",
          `<p><strong>${fromTeam?.name ?? "A team"}</strong> would like to scrimmage <strong>${toTeam.name}</strong>.</p>
           ${message ? `<p>“${message}”</p>` : ""}`,
          { label: "Respond in your account", url: siteUrl("/account") },
        ),
      });
    }
  }
  revalidatePath("/scrimmages");
  revalidatePath("/account");
  return { requestId: existing.id, claimed };
}

/** Cancel a pending scrimmage request you sent (deletes it so it can be re-sent). */
export async function cancelScrimmageRequestAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return;

  const req = await prisma.scrimmageRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") return;
  if (!(await ownsTeam(user.id, req.fromTeamId))) return;

  await prisma.scrimmageRequest.delete({ where: { id: requestId } });
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
