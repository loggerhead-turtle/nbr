import Link from "next/link";
import { prisma } from "@nbr/db";
import { AGE_GROUPS } from "@nbr/core";
import { AGE_OFFSETS_KEY, DEFAULT_AGE_OFFSETS, parseAgeOffsets } from "@/lib/age-offset";
import { setAgeOffsetsAction } from "@/lib/admin-actions";
import { formatRating, ageGroupLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Age offsets", robots: { index: false } };

/**
 * Admin editor for the per-age-group baseline offset (display points, 14U = 0),
 * which the `bt-age-v1` model bakes into stored ratings. Enter a value per age
 * group; the table previews the resulting combined cross-age ranking. Editing a
 * field + "Preview" recomputes the table in place (no save); "Save & apply"
 * persists the offsets — they take effect on the next rating recompute.
 *
 * Preview math: a team's within-age standing = storedRating − bakedOffset(age),
 * where bakedOffset is the currently-saved offset (what the last recompute used).
 * Preview rating = within-age standing + the offset you're editing. So when the
 * edited values equal the saved ones, the preview equals the live site.
 */
export default async function AgeOffsetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const includeProvisional = sp.prov === "1";

  const savedRow = await prisma.appSetting.findUnique({ where: { key: AGE_OFFSETS_KEY } });
  // Saved (= baked into current ratings) and the target being edited (GET overrides).
  const saved: Record<string, number> = { ...DEFAULT_AGE_OFFSETS, ...parseAgeOffsets(savedRow?.value) };
  const target: Record<string, number> = { ...saved };
  for (const a of AGE_GROUPS) {
    const v = sp[`offset_${a}`];
    if (v != null && v.trim() !== "" && Number.isFinite(Number(v))) target[a] = Math.round(Number(v));
  }

  const teams = await prisma.team.findMany({
    where: {
      isActive: true,
      isGhost: false,
      ageGroup: { not: null },
      rating: { is: includeProvisional ? {} : { isProvisional: false } },
    },
    include: { rating: true },
    take: 2000,
  });

  const rows = teams
    .filter((t) => t.rating)
    .map((t) => {
      const ag = t.ageGroup!;
      const baked = saved[ag] ?? 0;
      const within = t.rating!.rating - baked; // standing relative to its age
      const preview = within + (target[ag] ?? 0);
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        ageGroup: ag,
        current: t.rating!.rating,
        preview,
        isProvisional: t.rating!.isProvisional,
      };
    })
    .sort((a, b) => b.preview - a.preview);

  const dirty = AGE_GROUPS.some((a) => (target[a] ?? 0) !== (saved[a] ?? 0));

  return (
    <div>
      <h1 className="text-2xl font-black text-navy-900">Age-group offsets</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Each age group&apos;s baseline is shifted by these points (14U = 0). The values are
        baked into the live ratings by the <strong>bt-age-v1</strong> model. Edit a value and
        press <strong>Preview</strong> to see the resulting combined ranking; press{" "}
        <strong>Save &amp; apply</strong> to persist — changes take effect on the next rating
        recompute. The table reflects the live site when the edited values match the saved ones.
      </p>

      {/* Preview form (GET) — re-renders the table without saving. */}
      <form method="get" className="mt-4">
        <input type="hidden" name="prov" value={includeProvisional ? "1" : ""} />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {AGE_GROUPS.map((a) => (
            <div key={a}>
              <label className="label" htmlFor={`offset_${a}`}>
                {ageGroupLabel(a)}
              </label>
              <input
                id={`offset_${a}`}
                name={`offset_${a}`}
                defaultValue={String(target[a] ?? 0)}
                className="input w-full"
                inputMode="numeric"
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button className="btn-ghost" type="submit">
            Preview
          </button>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="prov" value="1" defaultChecked={includeProvisional} />
            Include provisional
          </label>
        </div>
      </form>

      {/* Save form (server action) — persists exactly the values shown above. */}
      <form action={setAgeOffsetsAction} className="mt-3">
        {AGE_GROUPS.map((a) => (
          <input key={a} type="hidden" name={`offset_${a}`} value={String(target[a] ?? 0)} />
        ))}
        <button className="btn-primary" type="submit">
          Save &amp; apply{dirty ? " (unsaved changes)" : ""}
        </button>
        {dirty && (
          <span className="ml-3 text-sm text-amber-600">
            Previewing unsaved values — Save &amp; apply, then run a recompute.
          </span>
        )}
      </form>

      <p className="mt-5 text-sm text-slate-500">{rows.length} teams</p>

      <div className="card mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-900 text-xs uppercase tracking-wide text-navy-100">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3 text-right">Current</th>
              <th className="px-4 py-3 text-right">Preview</th>
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
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                  {formatRating(r.current)}
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="text-base font-bold tabular-nums text-navy-900">
                    {formatRating(r.preview)}
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
