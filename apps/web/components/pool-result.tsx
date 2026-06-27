import type { PoolResult } from "@nbr/core";

/** Renders generated pools as printable cards. Server-renderable (no client JS). */
export function PoolResultView({ result, name }: { result: PoolResult; name?: string }) {
  const balanceQuality =
    result.balanceStdDev < 40 ? "Excellent" : result.balanceStdDev < 90 ? "Good" : "Fair";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">
            {name || "Generated Pools"}
          </h2>
          <p className="text-sm text-slate-500">
            {result.numTeams} teams · {result.numPools} pools · Balance:{" "}
            <span className="font-semibold text-navy-800">{balanceQuality}</span>{" "}
            (±{Math.round(result.strengthSpread)} spread)
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.pools.map((pool) => (
          <div key={pool.index} className="card overflow-hidden">
            <div className="flex items-center justify-between bg-navy-900 px-4 py-2.5 text-white">
              <span className="font-bold">{pool.label}</span>
              <span className="text-xs text-navy-100">
                Avg {Math.round(pool.averageRating)}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {pool.teams.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                      {t.seed}
                    </span>
                    <span className="font-medium text-slate-800">{t.name}</span>
                    {t.isProvisional && (
                      <span className="badge bg-amber-100 text-amber-800">prov</span>
                    )}
                  </span>
                  <span className="tabular-nums font-semibold text-navy-800">
                    {Math.round(t.rating)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
              Pool strength: {Math.round(pool.totalRating)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
