"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@nbr/db";
import { getCurrentUser } from "./user-auth";

/** Resolve which side of a request a user is on, or null if not a participant. */
async function sideOf(
  req: { fromUserId: string; toTeamId: string },
  userId: string,
): Promise<"from" | "to" | null> {
  if (req.fromUserId === userId) return "from";
  const toClaim = await prisma.claim.findUnique({ where: { teamId: req.toTeamId } });
  return toClaim?.userId === userId ? "to" : null;
}

/** Post a message into a scrimmage thread. */
export async function sendScrimmageMessageAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const requestId = String(formData.get("requestId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!requestId || !body) return;

  const req = await prisma.scrimmageRequest.findUnique({ where: { id: requestId } });
  if (!req) return;
  const side = await sideOf(req, user.id);
  if (!side) return;

  await prisma.scrimmageMessage.create({
    data: { requestId, senderUserId: user.id, body },
  });
  // The sender has implicitly read up to their own message.
  await prisma.scrimmageRequest.update({
    where: { id: requestId },
    data: side === "from" ? { fromReadAt: new Date() } : { toReadAt: new Date() },
  });
  revalidatePath(`/messages/${requestId}`);
  revalidatePath("/account");
}

/** Mark a thread read for the current viewer (clears their unread). */
export async function markThreadReadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return;
  const req = await prisma.scrimmageRequest.findUnique({ where: { id: requestId } });
  if (!req) return;
  const side = await sideOf(req, user.id);
  if (!side) return;
  await prisma.scrimmageRequest.update({
    where: { id: requestId },
    data: side === "from" ? { fromReadAt: new Date() } : { toReadAt: new Date() },
  });
  revalidatePath(`/messages/${requestId}`);
  revalidatePath("/account");
}

/** Toggle sharing of the viewer's email or phone within a thread (revocable). */
export async function setThreadShareAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const requestId = String(formData.get("requestId") ?? "");
  const field = String(formData.get("field") ?? ""); // "email" | "phone"
  const value = formData.get("value") === "1";
  if (!requestId || (field !== "email" && field !== "phone")) return;

  const req = await prisma.scrimmageRequest.findUnique({ where: { id: requestId } });
  if (!req) return;
  const side = await sideOf(req, user.id);
  if (!side) return;

  const key =
    side === "from"
      ? field === "email"
        ? "fromShareEmail"
        : "fromSharePhone"
      : field === "email"
        ? "toShareEmail"
        : "toSharePhone";

  await prisma.scrimmageRequest.update({ where: { id: requestId }, data: { [key]: value } });
  revalidatePath(`/messages/${requestId}`);
}
