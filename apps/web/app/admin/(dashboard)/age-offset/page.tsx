import Link from "next/link";
import { prisma } from "@nbr/db";
import { ageOffsetPoints, DEFAULT_AGE_STEP } from "@/lib/age-offset";
import { formatRating, ageGroupLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Age offset (experimental)", robots: { index: false } };

/**
 * Admin-only visualization of a cross-age combined ranking. Each age group's
 * rating is shifted by `step` points per age year (14U = 0) so older teams sort
 * above younger ones. Display-only — nothing here changes stored ratings or the
 * public site. Tune `step` until the ordering looks right.
 */
export default async function AgeOffsetPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; prov?: string }>;
}) {
  const sp = await searchParams;
  const step = clampStep(sp.step);
  const includeProvisional = sp.prov === "1";

  const teams = await prisma.team.findMany({
    where: {
      isActive: true,
      isGhost: false,
      ageGroup: { not: null },
      rating: { is: includeProvisional ? {} : { isProvisional: false } },
    },
    include: { rating: true },
    take: 1000,
  });

  const rows = teams
    .filter((t) => t.rating)
    .map((t) => {
      const offset = ageOffsetPoints(t.ageGroup, step);
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        ageGroup: t.ageGroup,
        raw: t.rating!.rating,
        offset,
        adjusted: t.rating!.rating + offset,
        isProvisional: t.rating!.isProvisional,
      };
    })
    .sort((a, b) => b.adjusted - a.adjusted);

  return (
    <div>
      <h1 className="text-2xl font-black text-navy-900">Cross-age ranking (experimental)</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Combined ranking across age groups, shifting each age group by{" "}
        <strong>{step}</strong> points per age year (14U = 0). This is a backstage view to validate
        the offset before exposing it — it does <strong>not</strong> change stored ratings or the
        public ratings page.
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="step">Points per age year</label>
          <input id="step" name="step" defaultValue={String(step)} className="input w-32" inputMode="numeric" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" name="prov" value="1" defaultChecked={includeProvisional} />
          Include provisional
        </label>
        <button className="btn-primary">Apply</button>
      </form>

      <p className="mt-4 text-sm text-slate-500">{rows.length} teams</p>

      <div className="card mt-2 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-900 text-xs uppercase tracking-wide text-navy-100">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3 text-right">Raw</th>
              <th className="px-4 py-3 text-right">Offset</th>
              <th className="px-4 py-3 text-right">Adjusted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-semibold text-slate-400">{i + 1}</td>
                <td className="px-4 py-2">
                  <Link href={`/teams/${r.slug}`} className="font-semibold text-navy-800 hover:underline">
                    {r.name}
                  </Link>
                  {r.isProvisional && <span className="ml-2 text-xs text-amber-600">prov</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{ageGroupLabel(r.ageGroup)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">{formatRating(r.raw)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-400">
                  {r.offset > 0 ? `+${r.offset}` : r.offset}
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="text-base font-bold tabular-nums text-navy-900">
                    {formatRating(r.adjusted)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function clampStep(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_AGE_STEP;
  return Math.max(0, Math.min(1000, Math.round(n)));
}
