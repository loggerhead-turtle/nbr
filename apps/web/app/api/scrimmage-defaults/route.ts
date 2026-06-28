import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nbr/db";
import { getCurrentUser } from "@/lib/user-auth";

/**
 * Per-coach saved default filters for the front-page scrimmage finder. Signed-in
 * coaches get account-synced defaults; signed-out visitors fall back to the
 * browser (localStorage), handled client-side.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ defaults: null, signedIn: false });
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { scrimmageDefaults: true },
  });
  let defaults: unknown = null;
  if (u?.scrimmageDefaults) {
    try {
      defaults = JSON.parse(u.scrimmageDefaults);
    } catch {
      defaults = null;
    }
  }
  return NextResponse.json({ defaults, signedIn: true });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, signedIn: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  // Whitelist the fields we persist; keep it small.
  const defaults = {
    ageGroup: typeof body.ageGroup === "string" ? body.ageGroup.slice(0, 8) : "",
    ratingMin: clampNum(body.ratingMin),
    ratingMax: clampNum(body.ratingMax),
    near: typeof body.near === "string" ? body.near.slice(0, 60) : "",
    maxMiles: clampNum(body.maxMiles),
  };
  await prisma.user.update({
    where: { id: user.id },
    data: { scrimmageDefaults: JSON.stringify(defaults) },
  });
  return NextResponse.json({ ok: true });
}

function clampNum(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? String(Math.round(n)) : "";
}
