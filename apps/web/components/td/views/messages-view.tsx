"use client";

import { useState } from "react";
import { useTd } from "../lib/td-context";
import { divisionLabel, EmptyCard } from "../lib/ui";

export function MessagesView() {
  const { selected, act } = useTd();
  const [activeInvite, setActiveInvite] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  if (!selected) return null;
  const t = selected;

  if (t.invites.length === 0) {
    return <EmptyCard icon="💬" title="No teams to message" sub="Invite teams first, then message their coaches here." />;
  }

  // Repeat customers float to the top of the recommended list.
  const recipients = [...t.invites].sort((a, b) => {
    if (a.isRepeatCustomer !== b.isRepeatCustomer) return a.isRepeatCustomer ? -1 : 1;
    return a.team.name.localeCompare(b.team.name);
  });

  const active = recipients.find((i) => i.id === activeInvite) ?? null;
  const thread = active ? t.messages.filter((m) => m.inviteId === active.id) : [];

  const send = async () => {
    if (!active || !draft.trim()) return;
    await act((p) => p.sendMessage(t.id, active.id, draft.trim()));
    setDraft("");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
          <p className="font-bold text-navy-900">Recipients</p>
          <p className="text-xs text-slate-500">Repeat customers are recommended first.</p>
        </div>
        <ul className="max-h-[480px] divide-y divide-slate-100 overflow-auto">
          {recipients.map((i) => {
            const div = t.divisions.find((d) => d.id === i.divisionId);
            const count = t.messages.filter((m) => m.inviteId === i.id).length;
            return (
              <li key={i.id}>
                <button
                  onClick={() => setActiveInvite(i.id)}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${active?.id === i.id ? "bg-navy-50" : "hover:bg-slate-50"}`}
                >
                  <span>
                    <span className="font-medium text-navy-800">{i.team.name}</span>
                    {i.isRepeatCustomer && <span className="badge ml-1.5 bg-violet-100 text-violet-700">repeat</span>}
                    {div && <span className="block text-xs text-slate-400">{divisionLabel(div)}</span>}
                  </span>
                  {count > 0 && <span className="badge bg-slate-200 text-slate-600">{count}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card flex min-h-[480px] flex-col">
        {active ? (
          <>
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="font-bold text-navy-900">{active.team.name}</p>
              <p className="text-xs text-slate-500">{active.team.city ? `${active.team.city}, ${active.team.state}` : active.team.state}</p>
            </div>
            <div className="flex-1 space-y-2 overflow-auto p-4">
              {thread.length === 0 && <p className="text-sm text-slate-400">No messages yet. Say hello 👋</p>}
              {thread.map((m) => (
                <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.fromDirector ? "ml-auto bg-navy-800 text-white" : "bg-slate-100 text-slate-800"}`}>
                  {m.body}
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-slate-100 p-3">
              <input
                className="input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Message the coach… (demo — not actually sent)"
              />
              <button onClick={send} className="btn-primary">Send</button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <p className="text-3xl">💬</p>
              <p className="mt-2 font-semibold text-navy-900">Pick a recipient</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">Repeat customers are listed first so you can re-invite your regulars in one click.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
