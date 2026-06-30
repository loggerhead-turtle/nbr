"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePhantomGamesAction, clearTeamGcIdAction } from "@/lib/admin-actions";
import type { ReconcileSnapshot, ReconcileTeamFinding } from "@nbr/core";

const gcUrl = (id: string) => `https://web.gc.com/teams/${id}/schedule`;

function GcLink({ gcTeamId }: { gcTeamId: string | null }) {
  if (!gcTeamId) return null;
  return (
    <a
      href={gcUrl(gcTeamId)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-sky-700"
    >
      GC ↗
    </a>
  );
}

export function ReconcileReview({ snapshot }: { snapshot: ReconcileSnapshot }) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const markDone = (teamId: string) => setResolved((p) => new Set(p).add(teamId));

  const withExtras = snapshot.withExtras.filter((t) => !resolved.has(t.teamId));
  const deadIds = snapshot.deadIds.filter((t) => !resolved.has(t.teamId));
  const captured = new Date(snapshot.capturedAt);

  return (
    <div className="space-y-8">
      <p className="text-xs text-slate-400">
        Captured {captured.toLocaleString()} · {snapshot.teamsScanned} verified team(s) scanned.
        Deletes here act on the saved snapshot — no GameChanger re-scrape.
      </p>

      <section>
        <h2 className="mb-1 text-lg font-bold text-navy-900">
          Phantom games on verified teams ({withExtras.length})
        </h2>
        <p className="mb-3 max-w-3xl text-sm text-slate-500">
          These teams&rsquo; GameChanger pages loaded fine, but our database holds games that
          <strong> aren&rsquo;t on their page</strong> — typically mis-attributed games from the old
          merge bugs. Verify with the GC link, then delete the ones that don&rsquo;t belong. Rows
          marked <span className="font-semibold text-amber-700">SPARSE</span> have far fewer live
          games than we store, so some &ldquo;extras&rdquo; may be real-but-unposted — check those
          carefully.
        </p>
        {withExtras.length === 0 ? (
          <p className="text-sm text-slate-400">No phantom games. 🎉</p>
        ) : (
          <div className="space-y-4">
            {withExtras.map((t) => (
              <ExtrasCard key={t.teamId} team={t} onDone={() => markDone(t.teamId)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold text-navy-900">
          Dead GameChanger IDs ({deadIds.length})
        </h2>
        <p className="mb-3 max-w-3xl text-sm text-slate-500">
          These teams have a GameChanger ID in our DB, but the page shows{" "}
          <strong>nothing online</strong> (dead or empty). Their games are opponent-reported, so
          don&rsquo;t delete them blindly. Clear the bad ID to turn the row into a ghost, then merge
          it into the real team on the <strong>Ghosts</strong> or <strong>Duplicates</strong> page.
        </p>
        {deadIds.length === 0 ? (
          <p className="text-sm text-slate-400">No dead IDs. 🎉</p>
        ) : (
          <div className="space-y-3">
            {deadIds.map((t) => (
              <DeadIdCard key={t.teamId} team={t} onDone={() => markDone(t.teamId)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ExtrasCard({ team, onDone }: { team: ReconcileTeamFinding; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const deleteAll = () => {
    if (
      !window.confirm(
        `Delete ${team.extras.length} phantom game(s) from “${team.name}”?\n\n` +
          (team.sparse
            ? "⚠️ This team's live page is sparse — make sure these really don't belong before deleting.\n\n"
            : "") +
          "This removes the games and re-runs ratings. It can't be undone.",
      )
    )
      return;
    const fd = new FormData();
    fd.set("gameIds", team.extras.map((g) => g.gameId).join(","));
    startTransition(async () => {
      await deletePhantomGamesAction(fd);
      onDone();
      router.refresh();
    });
  };

  return (
    <div className={`card overflow-hidden ${pending ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-900 px-4 py-2 text-sm text-white">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          {team.name}
          {team.ageGroup && <span className="text-white/60">({team.ageGroup})</span>}
          <GcLink gcTeamId={team.gcTeamId} />
          {team.sparse && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
              SPARSE
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-white/15 px-2 py-0.5">
            {team.liveCount} live / {team.dbCount} db
          </span>
          <span className="rounded-full bg-rose-500/80 px-2 py-0.5">{team.extras.length} phantom</span>
        </span>
      </div>
      <ul className="divide-y divide-slate-100 text-sm">
        {team.extras.map((g) => (
          <li key={g.gameId} className="flex items-center justify-between gap-2 px-4 py-2">
            <span className="truncate text-slate-600">
              {g.date} · vs {g.opponent}
            </span>
            <span className="tabular-nums text-navy-800">
              {g.us}-{g.them}
            </span>
          </li>
        ))}
      </ul>
      <div className="no-print flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
        <button
          onClick={deleteAll}
          disabled={pending}
          className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          🗑 Delete {team.extras.length} phantom game{team.extras.length === 1 ? "" : "s"}
        </button>
        <button onClick={onDone} disabled={pending} className="btn-ghost disabled:opacity-50">
          Skip
        </button>
      </div>
    </div>
  );
}

function DeadIdCard({ team, onDone }: { team: ReconcileTeamFinding; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const clearId = () => {
    if (
      !window.confirm(
        `Clear the dead GameChanger ID on “${team.name}” and make it a ghost?\n\n` +
          "Its games stay; you can then merge it into the real team on the Ghosts/Duplicates page.",
      )
    )
      return;
    const fd = new FormData();
    fd.set("teamId", team.teamId);
    startTransition(async () => {
      await clearTeamGcIdAction(fd);
      onDone();
      router.refresh();
    });
  };

  return (
    <div className={`card flex flex-wrap items-center justify-between gap-2 p-4 ${pending ? "opacity-50" : ""}`}>
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-slate-800">{team.name}</span>
        {team.ageGroup && <span className="text-slate-400">({team.ageGroup})</span>}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
          {team.dbCount} game(s) in DB · page empty
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-400">
          {team.gcTeamId}
        </span>
      </span>
      <span className="flex gap-2">
        <button
          onClick={clearId}
          disabled={pending}
          className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-50"
        >
          Clear bad ID → ghost
        </button>
        <button onClick={onDone} disabled={pending} className="btn-ghost disabled:opacity-50">
          Skip
        </button>
      </span>
    </div>
  );
}
