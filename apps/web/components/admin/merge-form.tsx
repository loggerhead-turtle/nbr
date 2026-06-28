"use client";

import { mergeTeamAction } from "@/lib/admin-actions";

export interface MergeOption {
  id: string;
  label: string;
}

export function MergeForm({ teams }: { teams: MergeOption[] }) {
  return (
    <form
      action={mergeTeamAction}
      className="card flex flex-wrap items-end gap-3 p-4"
      onSubmit={(e) => {
        const form = e.currentTarget;
        const src = (form.elements.namedItem("sourceId") as HTMLSelectElement)?.value;
        const tgt = (form.elements.namedItem("targetId") as HTMLSelectElement)?.value;
        if (!src || !tgt || src === tgt) {
          e.preventDefault();
          alert("Pick two different teams.");
          return;
        }
        if (!confirm("Merge these teams? The first team's games move to the second, then the first is deleted. This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <div className="min-w-[200px] flex-1">
        <label className="label">Merge this team…</label>
        <select name="sourceId" className="input" defaultValue="">
          <option value="" disabled>
            Select duplicate…
          </option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[200px] flex-1">
        <label className="label">…into this team (kept)</label>
        <select name="targetId" className="input" defaultValue="">
          <option value="" disabled>
            Select team to keep…
          </option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-accent">
        Merge
      </button>
    </form>
  );
}
