"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@nbr/db";
import { getCurrentUser } from "./user-auth";
import { sendEmail, adminEmail, emailLayout, siteUrl } from "./email";
import type { AccountState } from "./account-actions";

async function requireApprovedTd(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/td");
  const u = await prisma.user.findUnique({ where: { id: user!.id }, select: { tdStatus: true } });
  if (u?.tdStatus !== "APPROVED") redirect("/account");
  return user!.id;
}

export async function requestTdAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const tournamentName = String(formData.get("tournamentName") ?? "").trim().slice(0, 120) || null;
  const org = String(formData.get("org") ?? "").trim().slice(0, 120) || null;
  const website = String(formData.get("website") ?? "").trim().slice(0, 200) || null;

  const current = await prisma.user.findUnique({ where: { id: user!.id }, select: { tdStatus: true } });
  if (current?.tdStatus === "APPROVED") return { ok: true, message: "You’re already a tournament director." };

  await prisma.user.update({
    where: { id: user!.id },
    data: {
      tdStatus: "REQUESTED",
      tdRequestedAt: new Date(),
      tdTournamentName: tournamentName,
      tdOrg: org,
      tdWebsite: website,
    },
  });

  // Notify the administrator that a request is awaiting review.
  await sendEmail({
    to: adminEmail(),
    subject: "New tournament-director request",
    html: emailLayout(
      "New tournament-director request",
      `<p><strong>${user!.firstName ?? ""} ${user!.lastName ?? ""}</strong> (${user!.email}) requested tournament-director access.</p>
       <p>Tournament: ${tournamentName ?? "—"}<br/>Organization: ${org ?? "—"}<br/>Website: ${website ?? "—"}</p>`,
      { label: "Review in admin", url: siteUrl("/admin") },
    ),
  });

  revalidatePath("/account");
  return {
    ok: true,
    message: "Your request has been submitted to the administrator for consideration.",
  };
}

export async function updateTdProfileAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/td");
  await prisma.user.update({
    where: { id: user!.id },
    data: {
      tdTournamentName: String(formData.get("tournamentName") ?? "").trim().slice(0, 120) || null,
      tdOrg: String(formData.get("org") ?? "").trim().slice(0, 120) || null,
      tdWebsite: String(formData.get("website") ?? "").trim().slice(0, 200) || null,
    },
  });
  revalidatePath("/td");
  return { ok: true, message: "Profile saved." };
}

export async function createTournamentAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const tdId = await requireApprovedTd();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (name.length < 2) return { error: "Enter a tournament name." };
  const t = await prisma.tournament.create({ data: { name, directorUserId: tdId } });
  redirect(`/td/${t.id}`);
}

async function ownsTournament(userId: string, tournamentId: string): Promise<boolean> {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { directorUserId: true } });
  return t?.directorUserId === userId;
}

export async function inviteTeamAction(formData: FormData): Promise<void> {
  const tdId = await requireApprovedTd();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  if (!tournamentId || !teamId || !(await ownsTournament(tdId, tournamentId))) return;

  const existing = await prisma.tournamentInvite.findUnique({
    where: { tournamentId_teamId: { tournamentId, teamId } },
  });
  // Never re-invite a team that declined; don't duplicate an existing invite.
  if (existing) return;
  await prisma.tournamentInvite.create({ data: { tournamentId, teamId } });

  // Notify the team's coach (if claimed).
  const [team, tournament] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId }, include: { claim: { include: { user: true } } } }),
    prisma.tournament.findUnique({ where: { id: tournamentId } }),
  ]);
  if (team?.claim?.user?.email) {
    await sendEmail({
      to: team.claim.user.email,
      subject: `${team.name} invited to ${tournament?.name ?? "a tournament"}`,
      html: emailLayout(
        "You’ve got a tournament invitation",
        `<p><strong>${team.name}</strong> has been invited to <strong>${tournament?.name ?? "a tournament"}</strong>.</p>
         <p>Accept or decline from your account.</p>`,
        { label: "View invitation", url: siteUrl("/account") },
      ),
    });
  }

  revalidatePath(`/td/${tournamentId}`);
}

export async function removeInviteAction(formData: FormData): Promise<void> {
  const tdId = await requireApprovedTd();
  const id = String(formData.get("inviteId") ?? "");
  const inv = await prisma.tournamentInvite.findUnique({ where: { id }, select: { tournamentId: true } });
  if (!inv || !(await ownsTournament(tdId, inv.tournamentId))) return;
  await prisma.tournamentInvite.delete({ where: { id } });
  revalidatePath(`/td/${inv.tournamentId}`);
}

/** TD manually sets an invite's status (useful for unclaimed teams). */
export async function setInviteStatusAction(formData: FormData): Promise<void> {
  const tdId = await requireApprovedTd();
  const id = String(formData.get("inviteId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["INVITED", "ACCEPTED", "DECLINED"].includes(status)) return;
  const inv = await prisma.tournamentInvite.findUnique({ where: { id }, select: { tournamentId: true } });
  if (!inv || !(await ownsTournament(tdId, inv.tournamentId))) return;
  await prisma.tournamentInvite.update({ where: { id }, data: { status } });
  revalidatePath(`/td/${inv.tournamentId}`);
}

/** A team's coach accepts/declines an invite (from their account). */
export async function respondTournamentInviteAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const id = String(formData.get("inviteId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!["ACCEPTED", "DECLINED"].includes(decision)) return;
  const inv = await prisma.tournamentInvite.findUnique({ where: { id }, select: { teamId: true } });
  if (!inv) return;
  const claim = await prisma.claim.findUnique({ where: { teamId: inv.teamId } });
  if (!claim || claim.userId !== user!.id) return;
  await prisma.tournamentInvite.update({ where: { id }, data: { status: decision } });
  revalidatePath("/account");
}
