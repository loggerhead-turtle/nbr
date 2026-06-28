"use client";

import { useTransition } from "react";
import { sendMessageAction, setThreadShareAction } from "@/lib/message-actions";

/**
 * Reply box + revocable contact-sharing toggles for a thread (scrimmage or
 * tournament). Toggling "Share my email/phone" shares it with the other party
 * immediately; unchecking revokes it.
 */
export function ThreadPanel({
  kind,
  id,
  myShareEmail,
  mySharePhone,
}: {
  kind: "scrimmage" | "tournament";
  id: string;
  myShareEmail: boolean;
  mySharePhone: boolean;
}) {
  const [pending, start] = useTransition();

  const toggle = (field: "email" | "phone", checked: boolean) => {
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("id", id);
    fd.set("field", field);
    fd.set("value", checked ? "1" : "0");
    start(async () => {
      await setThreadShareAction(fd);
    });
  };

  return (
    <div className="mt-4">
      <form action={sendMessageAction} className="flex flex-col gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <textarea name="body" required rows={3} placeholder="Write a message…" className="input" />
        <div className="flex justify-end">
          <button className="btn-primary">Send</button>
        </div>
      </form>

      <div className="mt-3 rounded-lg bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-600">Share my contact in this thread</p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              defaultChecked={myShareEmail}
              disabled={pending}
              onChange={(e) => toggle("email", e.target.checked)}
              className="h-4 w-4 shrink-0"
            />
            Share my email
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              defaultChecked={mySharePhone}
              disabled={pending}
              onChange={(e) => toggle("phone", e.target.checked)}
              className="h-4 w-4 shrink-0"
            />
            Share my phone
          </label>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Off by default. Unchecking revokes access for the other party.
        </p>
      </div>
    </div>
  );
}
