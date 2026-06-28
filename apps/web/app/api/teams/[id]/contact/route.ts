import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nbr/db";
import { getCurrentUser } from "@/lib/user-auth";

/**
 * Returns a claimed team's contact info ONLY to a signed-in user, and ONLY when
 * the coach opted in. Names are public; email/phone are gated here (never sent to
 * the static team page).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const team = await prisma.team.findUnique({
    where: { id },
    include: { claim: { include: { user: true } } },
  });
  if (!team || !team.claim) return NextResponse.json({ claimed: false });

  const coachName = [team.claim.user.firstName, team.claim.user.lastName].filter(Boolean).join(" ");
  const user = await getCurrentUser();
  const canView = Boolean(team.claim.contactOptIn && user);

  return NextResponse.json({
    claimed: true,
    coachName,
    optIn: team.claim.contactOptIn,
    signedIn: Boolean(user),
    canView,
    ...(canView ? { email: team.claim.user.email, phone: team.claim.user.phone } : {}),
  });
}
