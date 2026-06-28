import Link from "next/link";
import { prisma } from "@nbr/db";
import { ageOffsetPoints, AGE_OFFSET_KEY, clampAgeStep, DEFAULT_AGE_STEP } from "@/lib/age-offset";
import { setAgeOffsetStepAction } from "@/lib/admin-actions";
import { formatRating, ageGroupLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Age offset (experimental)", robots: { index: false } };

/**
 * Admin-only control + visualization of the cross-age rating offset. Each age
 * group's rating is shifted by the saved step (points per age year, 14U = 0) so
 * older teams sort above younger ones. The step is persisted in AppSetting and
 * editable here; saving re-renders the combined ranking so you can watch the
 * effect. Display-only — it does not change stored ratings or the public site.
 */
export default async function AgeOffsetPage({
  searchParams,
}: {
  searchParams: Promise<{ prov?: string }>;
}) {
  const sp = await searchParams;
  const includeProvisional = sp.prov === "1";
  const saved = await prisma.appSetting.findUnique({ where: { key: AGE_OFFSET_KEY } });
  const step = saved ? clampAgeStep(saved.value) : DEFAULT_AGE_STEP;

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
        <strong>{step}</strong> points per age year (14U = 0). The value is saved and used as the
        canonical offset; this is a backstage view to validate it before exposing — it does{" "}
        <strong>not</strong> change stored ratings or the public ratings page.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-6">
        <form action={setAgeOffsetStepAction} className="flex items-end gap-3">
          <div>
            <label className="label" htmlFor="step">Points per age year</label>
            <input
              id="step"
              name="step"
              defaultValue={String(step)}
              className="input w-32"
              inputMode="numeric"
            />
          </div>
          <button className="btn-primary">Save &amp; apply</button>
        </form>

        <form method="get" className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="prov" value="1" defaultChecked={includeProvisional} />
            Include provisional
          </label>
          <button className="btn-ghost">Apply</button>
        </form>
      </div>

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
