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
import { HONEYPOT_FIELD, clientIp, rateLimit, isDisposableEmail } from "./anti-spam";

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
  // Honeypot: a hidden field only bots fill. Pretend success without creating anything.
  if (String(formData.get(HONEYPOT_FIELD) ?? "").trim() !== "") {
    return { ok: true, message: "Account created." };
  }

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const next = safeNext(formData.get("next"));

  if (!firstName || !lastName) return { error: "First and last name are required." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (isDisposableEmail(email)) {
    return { error: "Please use a permanent email address — disposable inboxes aren’t allowed." };
  }
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirmPassword) return { error: "The two passwords don’t match." };

  // Throttle abusive signup bursts by IP and by email.
  const ip = await clientIp();
  if (!rateLimit(`signup:ip:${ip}`, 5).ok) {
    return { error: "Too many sign-up attempts. Please try again later." };
  }
  if (!rateLimit(`signup:email:${email}`, 3).ok) {
    return { error: "Too many sign-up attempts for this email. Please try again later." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists. Try signing in." };

  const user = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email,
      phone: phone || null,
      passwordHash: await hashPassword(password),
      lastLoginAt: new Date(),
    },
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
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const store = await cookies();
  store.set(USER_COOKIE, createUserSession(user.id), userCookieOptions);
  // Game-scraper staff land in their limited area unless an explicit next was set.
  const explicitNext = String(formData.get("next") ?? "").startsWith("/");
  const dest = !explicitNext && user.role === "GAME_SCRAPER" ? "/staff/gc-lookup" : next;
  redirect(dest);
}

export async function logoutUserAction(): Promise<void> {
  const store = await cookies();
  store.delete(USER_COOKIE);
  redirect("/");
}

/** Update the signed-in user's name, email, and phone. */
export async function updateProfileAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!firstName || !lastName) return { error: "First and last name are required." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (isDisposableEmail(email)) {
    return { error: "Please use a permanent email address." };
  }
  if (email !== user!.email.toLowerCase()) {
    const clash = await prisma.user.findUnique({ where: { email } });
    if (clash && clash.id !== user!.id) {
      return { error: "That email is already in use by another account." };
    }
  }

  await prisma.user.update({
    where: { id: user!.id },
    data: { firstName, lastName, email, phone: phone || null },
  });
  revalidatePath("/account");
  return { ok: true, message: "Profile saved." };
}

/** Change the signed-in user's password (requires the current one when set). */
export async function changePasswordAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8) return { error: "New password must be at least 8 characters." };
  if (newPassword !== confirmPassword) return { error: "The two new passwords don’t match." };

  const dbUser = await prisma.user.findUnique({
    where: { id: user!.id },
    select: { passwordHash: true },
  });
  // Accounts with a password must prove the current one; accounts without a
  // password yet (e.g. created before setting one) can set one directly.
  if (dbUser?.passwordHash) {
    if (!(await verifyPassword(currentPassword, dbUser.passwordHash))) {
      return { error: "Your current password is incorrect." };
    }
  }

  await prisma.user.update({
    where: { id: user!.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  revalidatePath("/account");
  return { ok: true, message: "Password updated." };
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
