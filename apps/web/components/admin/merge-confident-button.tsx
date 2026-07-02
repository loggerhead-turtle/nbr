"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mergeConfidentDuplicatesAction } from "@/lib/admin-actions";

/**
 * One-click merge of every duplicate pair the confidence model scores at 100%.
 * `count` is how many such pairs are currently listed (for the label + confirm);
 * the action re-derives them server-side, so it stays correct if data shifted.
 */
export function MergeConfidentButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  if (count === 0 && !message) return null;

  const onClick = () => {
    if (
      !window.confirm(
        `Merge ${count} duplicate pair${count === 1 ? "" : "s"} the model scores at 100% confidence?\n\n` +
          "Each folds the duplicate into the kept record and combines their games — nothing is lost, but this can't be undone.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await mergeConfidentDuplicatesAction();
      setMessage(res.error ?? res.message ?? null);
      router.refresh();
    });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <button
        onClick={onClick}
        disabled={pending || count === 0}
        title="Merges every pair scored at 100% (identical name, location/coaches, and games that line up). Ratings recompute after."
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Merging…" : `⚡ Merge all 100% confident${count > 0 ? ` (${count})` : ""}`}
      </button>
      {message && <span className="text-sm font-medium text-emerald-700">{message}</span>}
    </div>
  );
}
