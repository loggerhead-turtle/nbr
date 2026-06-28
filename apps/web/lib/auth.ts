import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isCurrentUserAdmin } from "./user-auth";

/**
 * Admin auth. Primary path: a signed-in user with an ADMIN role (bootstrapped
 * from ADMIN_ALLOWLIST). Fallback: a shared-password cookie (emergency backdoor)
 * so the owner can never be locked out.
 */

export const ADMIN_COOKIE = "nbr_admin";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET || "insecure-dev-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createSessionToken(): string {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `admin.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [role, expiresStr, sig] = parts as [string, string, string];
  const payload = `${role}.${expiresStr}`;
  const expected = sign(payload);
  if (expected.length !== sig.length) return false;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  return role === "admin";
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Server-side guard: a real admin account, OR the shared-password fallback. */
export async function isAdmin(): Promise<boolean> {
  if (await isCurrentUserAdmin()) return true;
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_COOKIE)?.value);
}

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
