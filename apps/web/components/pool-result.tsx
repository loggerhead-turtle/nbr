import type { PoolResult, Pool } from "@nbr/core";

/**
 * Renders generated pools as printable cards. Server-renderable (no client JS).
 * `formatValue` controls how rating numbers display — the public pool generator
 * uses raw ratings (default), while the NBR director portal passes a formatter
 * that shows them on the compact NBR scale.
 *
 * Rematches: teams in the same pool that have already played are highlighted, and
 * each shows a circled marker with the *position number* of the opponent in this
 * pool, shaded darker the more times they've met.
 */
function rematchChipClass(games: number): string {
  if (games >= 3) return "bg-red-500 text-white";
  if (games === 2) return "bg-orange-300 text-orange-950";
  return "bg-amber-200 text-amber-900";
}

function PoolCard({
  pool,
  formatValue,
}: {
  pool: Pool;
  formatValue: (n: number) => string;
}) {
  const posById = new Map(pool.teams.map((t, i) => [t.id, i + 1]));
  // Older cached results (e.g. demo sessionStorage) may lack these fields.
  const rematches = pool.rematches ?? [];
  const pastGames = pool.pastGames ?? 0;
  const opponentsOf = (teamId: string) =>
    rematches
      .filter((r) => r.aId === teamId || r.bId === teamId)
      .map((r) => ({ pos: posById.get(r.aId === teamId ? r.bId : r.aId), games: r.games }))
      .filter((o): o is { pos: number; games: number } => o.pos != null)
      .sort((a, b) => a.pos - b.pos);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between bg-navy-900 px-4 py-2.5 text-white">
        <span className="font-bold">{pool.label}</span>
        <span className="flex items-center gap-2 text-xs text-navy-100">
          {pastGames > 0 && (
            <span
              title={`${pastGames} prior game(s) among these teams`}
              className="rounded-full bg-amber-400 px-2 py-0.5 font-bold text-amber-950"
            >
              {pastGames} rematch{pastGames === 1 ? "" : "es"}
            </span>
          )}
          <span>Avg {formatValue(pool.averageRating)}</span>
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {pool.teams.map((t, i) => {
          const opps = opponentsOf(t.id);
          return (
            <li
              key={t.id}
              className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                opps.length ? "bg-amber-50" : ""
              }`}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                  {i + 1}
                </span>
                <span className="font-medium text-slate-800">{t.name}</span>
                {t.isProvisional && <span className="badge bg-amber-100 text-amber-800">prov</span>}
                {opps.map((o) => (
                  <span
                    key={o.pos}
                    title={`Played team #${o.pos} ${o.games}× this season`}
                    className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold ${rematchChipClass(
                      o.games,
                    )}`}
                  >
                    {o.pos}
                  </span>
                ))}
              </span>
              <span className="tabular-nums font-semibold text-navy-800">{formatValue(t.rating)}</span>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        Pool strength: {formatValue(pool.totalRating)}
      </div>
    </div>
  );
}

export function PoolResultView({
  result,
  name,
  formatValue = (n) => Math.round(n).toString(),
}: {
  result: PoolResult;
  name?: string;
  formatValue?: (n: number) => string;
}) {
  const balanceQuality =
    result.balanceStdDev < 40 ? "Excellent" : result.balanceStdDev < 90 ? "Good" : "Fair";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">{name || "Generated Pools"}</h2>
          <p className="text-sm text-slate-500">
            {result.numTeams} teams · {result.numPools} pools · Balance:{" "}
            <span className="font-semibold text-navy-800">{balanceQuality}</span> (±
            {Math.round(result.strengthSpread)} spread)
            {(result.rematchPairs ?? 0) > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-amber-700">
                  {result.rematchPairs} rematch{result.rematchPairs === 1 ? "" : "es"}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.pools.map((pool) => (
          <PoolCard key={pool.index} pool={pool} formatValue={formatValue} />
        ))}
      </div>
    </div>
  );
}
