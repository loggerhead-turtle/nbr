"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@nbr/db";
import { normalizeWebsiteUrl } from "@nbr/core";
import {
  USER_COOKIE,
  userCookieOptions,
  createUserSession,
  hashPassword,
  verifyPassword,
  getCurrentUser,
} from "./user-auth";

export interface AccountState {
  error?: string;
  ok?: boolean;
  message?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function safeNext(next: FormDataEntryValue | null): string {
  const s = String(next ?? "");
  // Only allow internal paths.
  return s.startsWith("/") && !s.startsWith("//") ? s : "/account";
}

export async function signupAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!firstName || !lastName) return { error: "First and last name are required." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists. Try signing in." };

  const user = await prisma.user.create({
    data: { firstName, lastName, email, phone: phone || null, passwordHash: await hashPassword(password) },
  });
  const store = await cookies();
  store.set(USER_COOKIE, createUserSession(user.id), userCookieOptions);
  redirect(next);
}

export async function loginUserAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect email or password." };
  }
  const store = await cookies();
  store.set(USER_COOKIE, createUserSession(user.id), userCookieOptions);
  redirect(next);
}

export async function logoutUserAction(): Promise<void> {
  const store = await cookies();
  store.delete(USER_COOKIE);
  redirect("/");
}

export async function claimTeamAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  const teamId = String(formData.get("teamId") ?? "");
  if (!user) redirect(`/login?next=${encodeURIComponent(`/claim/${teamId}`)}`);
  if (!teamId) return { error: "Missing team." };
  if (formData.get("confirm") !== "on") {
    return { error: "Please confirm that you are claiming your own team." };
  }

  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { claim: true } });
  if (!team) return { error: "Team not found." };
  if (team.claim) return { error: "This team has already been claimed." };

  const contactOptIn = formData.get("contactOptIn") === "on";
  const zip = String(formData.get("zip") ?? "").trim();

  await prisma.claim.create({
    data: { teamId, userId: user!.id, status: "APPROVED", contactOptIn, approvedAt: new Date() },
  });
  if (zip && /^\d{5}$/.test(zip) && !team.zip) {
    await prisma.team.update({ where: { id: teamId }, data: { zip } });
  }

  revalidatePath(`/teams/${team.slug}`);
  redirect(`/teams/${team.slug}?claimed=1`);
}

export async function updateTeamWebsiteAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const teamId = String(formData.get("teamId") ?? "");
  const claim = await prisma.claim.findUnique({ where: { teamId } });
  if (!claim || claim.userId !== user!.id) {
    return { error: "You can only manage teams you’ve claimed." };
  }
  const website = normalizeWebsiteUrl(String(formData.get("website") ?? ""));
  const team = await prisma.team.update({
    where: { id: teamId },
    data: { website },
    select: { slug: true },
  });
  revalidatePath(`/teams/${team.slug}`);
  revalidatePath("/account");
  return { ok: true, message: website ? "Team website saved." : "Team website cleared." };
}

export async function reportClaimAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) {
    const teamId = String(formData.get("teamId") ?? "");
    redirect(`/login?next=${encodeURIComponent(`/teams`)}&report=${teamId}`);
  }
  const teamId = String(formData.get("teamId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!teamId || !reason) return { error: "Please describe the problem." };

  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { claim: true } });
  if (!team) return { error: "Team not found." };

  await prisma.report.create({
    data: {
      teamId,
      claimId: team.claim?.id ?? null,
      reporterUserId: user!.id,
      reason: reason.slice(0, 300),
      details: String(formData.get("details") ?? "").slice(0, 1000) || null,
    },
  });
  return { ok: true, message: "Thanks — we’ll review this report." };
}
