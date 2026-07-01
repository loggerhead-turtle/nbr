"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mergeDuplicateGhostsAction, type ActionState } from "@/lib/admin-actions";

/**
 * Collapse duplicate ghost teams (same name + age) into one. These pile up when a
 * team is scraped repeatedly and an age-less opponent keeps spawning a fresh
 * ghost — the cause of the duplicate-count blow-up. Games fold into the kept
 * ghost and de-duplicate; nothing real is touched.
 */
export function MergeDuplicateGhosts() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);

  const run = () => {
    if (
      !window.confirm(
        "Merge duplicate ghost teams (same name + age) into one?\n\n" +
          "Games fold into the kept ghost and de-duplicate. Safe — only ghosts are touched.",
      )
    )
      return;
    startTransition(async () => {
      const r = await mergeDuplicateGhostsAction();
      setMsg(r);
      router.refresh();
    });
  };

  return (
    <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">
          Repeated scrapes can create <strong>duplicate ghosts</strong> of the same opponent —
          collapse them into one.
        </p>
        <button onClick={run} disabled={pending} className="btn-primary disabled:opacity-50">
          {pending ? "Merging…" : "Merge duplicate ghosts"}
        </button>
      </div>
      {msg?.message && <p className="mt-1 text-xs font-medium text-emerald-700">{msg.message}</p>}
      {msg?.error && <p className="mt-1 text-xs font-medium text-rose-600">{msg.error}</p>}
    </div>
  );
}
