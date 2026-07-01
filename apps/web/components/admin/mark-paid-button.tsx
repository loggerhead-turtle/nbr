"use client";

import { useTransition } from "react";
import { markScraperPaidAction } from "@/lib/admin-actions";

export function MarkPaidButton({ userId, amountLabel }: { userId: string; amountLabel: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            `Mark paid ${amountLabel}? This banks their unpaid credits and resets "since last payout" to zero.`,
          )
        )
          return;
        const fd = new FormData();
        fd.set("userId", userId);
        start(async () => {
          await markScraperPaidAction(fd);
        });
      }}
      className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {pending ? "…" : "Mark paid"}
    </button>
  );
}
