import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@nbr/db";

/**
 * Lightweight email+password auth for coach accounts. A signed, time-limited
 * cookie carries the user id. Separate from the admin gate (lib/auth.ts).
 */

export const USER_COOKIE = "nbr_user";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET || "insecure-dev-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createUserSession(userId: string): string {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresStr, sig] = parts as [string, string, string];
  const expected = sign(`${userId}.${expiresStr}`);
  if (expected.length !== sig.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  if (!Number.isFinite(Number(expiresStr)) || Number(expiresStr) < Date.now()) return null;
  return userId;
}

export const userCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface SessionUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  role: string;
}

function adminAllowlist(): string[] {
  return (process.env.ADMIN_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const userId = verifyToken(store.get(USER_COOKIE)?.value);
  if (!userId) return null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
    });
    if (!user) return null;
    // Bootstrap: an allowlisted email is always an admin — persist the role so it
    // shows in the Users list and survives allowlist changes.
    if (user.role !== "ADMIN" && adminAllowlist().includes(user.email.toLowerCase())) {
      await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } }).catch(() => {});
      return { ...user, role: "ADMIN" };
    }
    return user;
  } catch {
    return null;
  }
}

/** True when the signed-in user is an admin (role ADMIN or allowlisted email). */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  return user.role === "ADMIN" || adminAllowlist().includes(user.email.toLowerCase());
}
