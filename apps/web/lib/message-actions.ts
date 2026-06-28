"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@nbr/db";
import { getCurrentUser } from "./user-auth";

type Kind = "scrimmage" | "tournament";

function parseKind(v: FormDataEntryValue | null): Kind | null {
  return v === "scrimmage" || v === "tournament" ? v : null;
}

/** Resolve the current user's side of a thread, or null if not a participant. */
async function scrimmageSide(id: string, userId: string) {
  const req = await prisma.scrimmageRequest.findUnique({ where: { id } });
  if (!req) return null;
  if (req.fromUserId === userId) return "from" as const;
  const claim = await prisma.claim.findUnique({ where: { teamId: req.toTeamId } });
  return claim?.userId === userId ? ("to" as const) : null;
}

async function tournamentSide(id: string, userId: string) {
  const inv = await prisma.tournamentInvite.findUnique({
    where: { id },
    include: { tournament: { select: { directorUserId: true } } },
  });
  if (!inv) return null;
  if (inv.tournament.directorUserId === userId) return "director" as const;
  const claim = await prisma.claim.findUnique({ where: { teamId: inv.teamId } });
  return claim?.userId === userId ? ("team" as const) : null;
}

/** Post a message into a thread (scrimmage or tournament). */
export async function sendMessageAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const kind = parseKind(formData.get("kind"));
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!kind || !id || !body) return;

  if (kind === "scrimmage") {
    const side = await scrimmageSide(id, user.id);
    if (!side) return;
    await prisma.scrimmageMessage.create({ data: { requestId: id, senderUserId: user.id, body } });
    await prisma.scrimmageRequest.update({
      where: { id },
      data: side === "from" ? { fromReadAt: new Date() } : { toReadAt: new Date() },
    });
  } else {
    const side = await tournamentSide(id, user.id);
    if (!side) return;
    await prisma.tournamentMessage.create({ data: { inviteId: id, senderUserId: user.id, body } });
    await prisma.tournamentInvite.update({
      where: { id },
      data: side === "director" ? { directorReadAt: new Date() } : { teamReadAt: new Date() },
    });
  }
  revalidatePath(`/messages/${kind}/${id}`);
  revalidatePath("/account");
}

/** Mark a thread read for the current viewer (clears their unread). */
export async function markThreadReadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const kind = parseKind(formData.get("kind"));
  const id = String(formData.get("id") ?? "");
  if (!kind || !id) return;
  await markRead(kind, id, user.id);
  revalidatePath(`/messages/${kind}/${id}`);
  revalidatePath("/account");
}

/** Mark read helper, also callable from the thread page on view. */
export async function markRead(kind: Kind, id: string, userId: string): Promise<void> {
  if (kind === "scrimmage") {
    const side = await scrimmageSide(id, userId);
    if (!side) return;
    await prisma.scrimmageRequest.update({
      where: { id },
      data: side === "from" ? { fromReadAt: new Date() } : { toReadAt: new Date() },
    });
  } else {
    const side = await tournamentSide(id, userId);
    if (!side) return;
    await prisma.tournamentInvite.update({
      where: { id },
      data: side === "director" ? { directorReadAt: new Date() } : { teamReadAt: new Date() },
    });
  }
}

/** Toggle sharing of the viewer's email or phone within a thread (revocable). */
export async function setThreadShareAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const kind = parseKind(formData.get("kind"));
  const id = String(formData.get("id") ?? "");
  const field = String(formData.get("field") ?? ""); // "email" | "phone"
  const value = formData.get("value") === "1";
  if (!kind || !id || (field !== "email" && field !== "phone")) return;

  if (kind === "scrimmage") {
    const side = await scrimmageSide(id, user.id);
    if (!side) return;
    const key =
      side === "from"
        ? field === "email" ? "fromShareEmail" : "fromSharePhone"
        : field === "email" ? "toShareEmail" : "toSharePhone";
    await prisma.scrimmageRequest.update({ where: { id }, data: { [key]: value } });
  } else {
    const side = await tournamentSide(id, user.id);
    if (!side) return;
    const key =
      side === "director"
        ? field === "email" ? "directorShareEmail" : "directorSharePhone"
        : field === "email" ? "teamShareEmail" : "teamSharePhone";
    await prisma.tournamentInvite.update({ where: { id }, data: { [key]: value } });
  }
  revalidatePath(`/messages/${kind}/${id}`);
}
