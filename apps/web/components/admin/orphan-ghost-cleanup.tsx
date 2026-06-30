"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteOrphanGhostsAction } from "@/lib/admin-actions";

/**
 * One-click cleanup: DELETE every ghost team that has zero games. These are pure
 * cruft — typically opponents left behind after a reconcile prune removed their
 * phantom games, or after an opponent was re-resolved to a real team. Nothing
 * references them, so removing them is always safe.
 */
export function OrphanGhostCleanup({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  if (count === 0) return null;

  const run = () => {
    if (
      !window.confirm(
        `Delete ${count} empty ghost team(s) (zero games)?\n\n` +
          `These have no games at all, so nothing is lost. This can't be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteOrphanGhostsAction();
      setDone(true);
      router.refresh();
    });
  };

  return (
    <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">
          <strong>{count}</strong> empty ghost team{count === 1 ? "" : "s"} with no games (cruft,
          usually left after a reconcile prune).
        </p>
        <button onClick={run} disabled={pending || done} className="btn-primary disabled:opacity-50">
          {pending ? "Deleting…" : done ? "Deleted ✓" : `Delete ${count} empty ghost${count === 1 ? "" : "s"}`}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Only removes ghosts with zero games — nothing legitimate is touched.
      </p>
    </div>
  );
}
