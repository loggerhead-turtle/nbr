"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Radio group for a coach who manages one or more teams. Picking a team reloads
 * the scrimmage finder anchored to that team, so the recommended opponents and
 * the "request" actions all apply to the team they selected. Coaches routinely
 * run multiple teams, so making the active team explicit avoids sending a
 * request from the wrong one.
 */
export function MyTeamSelector({
  teams,
  selectedId,
}: {
  teams: { id: string; name: string }[];
  selectedId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const pick = (id: string) => {
    if (id === selectedId) return;
    startTransition(() => router.push(`/scrimmages?team=${id}`));
  };

  return (
    <fieldset className={`mt-5 card p-4 ${pending ? "opacity-60" : ""}`}>
      <legend className="px-1 text-sm font-semibold text-navy-900">
        You’re scheduling for
      </legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {teams.map((t) => {
          const active = t.id === selectedId;
          return (
            <label
              key={t.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                active
                  ? "border-navy-700 bg-navy-50 font-semibold text-navy-900"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="team"
                value={t.id}
                checked={active}
                onChange={() => pick(t.id)}
                className="h-4 w-4"
              />
              {t.name}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
