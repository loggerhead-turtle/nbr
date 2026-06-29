"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteExactNameGhostsAction } from "@/lib/admin-actions";

/**
 * One-click cleanup: DELETE every ghost whose name exactly matches a verified
 * (GameChanger) team. The verified team is kept; the ghost (and its duplicate
 * games) is removed. We delete rather than merge so the verified team's own
 * scraped games aren't duplicated.
 */
export function BulkGhostDelete({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  if (count === 0) return null;

  const run = () => {
    if (
      !window.confirm(
        `Delete ${count} ghost team(s) that exactly match a verified (GameChanger) team?\n\n` +
          `The ghost and its games are removed. The verified team — the one with the GameChanger ID — is kept. This can't be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteExactNameGhostsAction();
      setDone(true);
      router.refresh();
    });
  };

  return (
    <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-rose-900">
          <strong>{count}</strong> ghost team{count === 1 ? "" : "s"} exactly match a verified
          (GameChanger) team by name.
        </p>
        <button onClick={run} disabled={pending || done} className="btn-primary disabled:opacity-50">
          {pending
            ? "Deleting…"
            : done
              ? "Deleted ✓"
              : `Delete ${count} duplicate ghost${count === 1 ? "" : "s"}`}
        </button>
      </div>
      <p className="mt-1 text-xs text-rose-800/70">
        Removes each ghost whose full name (including “10U/14U”) is identical to a verified team —
        the verified team keeps its own scraped games, so nothing is duplicated. Different ages never
        match. Ambiguous names (the same name on two verified teams) are skipped.
      </p>
    </div>
  );
}
