"use client";

import { useState, useTransition } from "react";
import {
  sendScrimmageRequestAction,
  cancelScrimmageRequestAction,
} from "@/lib/scrimmage-actions";

/**
 * Per-candidate send/cancel control on the scrimmage finder. Gives immediate
 * visual feedback: the dark "Request scrimmage" button flips to a green
 * "Request sent" confirmation with a Cancel button, and notes when the target
 * team isn't claimed yet (so the coach knows it'll be delivered later).
 */
export function ScrimmageRequestControl({
  fromTeamId,
  toTeamId,
  initialRequestId,
  targetClaimed,
}: {
  fromTeamId: string;
  toTeamId: string;
  initialRequestId: string | null;
  targetClaimed: boolean;
}) {
  const [requestId, setRequestId] = useState<string | null>(initialRequestId);
  const [pending, startTransition] = useTransition();
  const requested = requestId !== null;

  function send(formData: FormData) {
    startTransition(async () => {
      const res = await sendScrimmageRequestAction(formData);
      if (res.requestId) setRequestId(res.requestId);
    });
  }

  function cancel(formData: FormData) {
    startTransition(async () => {
      await cancelScrimmageRequestAction(formData);
      setRequestId(null);
    });
  }

  if (requested) {
    return (
      <div className="w-full max-w-xs rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
        <p className="font-semibold text-emerald-700">✓ Request sent</p>
        {!targetClaimed && (
          <p className="mt-1 text-xs text-emerald-800/80">
            This team isn’t claimed yet — we’ll deliver your request as soon as a coach claims it.
          </p>
        )}
        <form action={cancel} className="mt-2">
          <input type="hidden" name="requestId" value={requestId ?? ""} />
          <button
            disabled={pending}
            className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
          >
            {pending ? "Canceling…" : "Cancel request"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={send} className="flex w-full max-w-xs flex-col gap-2">
      <input type="hidden" name="fromTeamId" value={fromTeamId} />
      <input type="hidden" name="toTeamId" value={toTeamId} />
      <input name="message" placeholder="Optional message" className="input text-sm" />
      <button disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Sending…" : "Request scrimmage"}
      </button>
    </form>
  );
}
