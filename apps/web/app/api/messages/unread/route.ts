import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-auth";
import { getUnreadCountForUser } from "@/lib/queries";

/** Unread scrimmage-message count for the current user (drives the nav badge). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ count: 0 });
  const count = await getUnreadCountForUser(user.id);
  return NextResponse.json({ count });
}
