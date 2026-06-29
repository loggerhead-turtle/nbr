"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markActivitySeenAction } from "@/lib/admin-actions";

/**
 * On mount, mark the activity feed as seen so the nav "new" badge clears.
 * Runs once; refreshes server components afterward so the badge updates live.
 */
export function ActivitySeen({ hadNew }: { hadNew: boolean }) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    markActivitySeenAction().then(() => {
      if (hadNew) router.refresh();
    });
  }, [hadNew, router]);

  return null;
}
