import { prisma } from "@nbr/db";
import { TIER_CUTOFFS_KEY, parseTierCutoffs, DEFAULT_TIER_CUTOFFS } from "@nbr/core";
import { setTierCutoffsAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "NBR tiers", robots: { index: false } };

/**
 * Admin editor for the competitive-tier cutoffs (A / AA / AAA / Majors). The
 * values are percentile lower-bounds WITHIN an age group: a team's tier comes
 * from where its rating falls among established same-age teams. Tiers are
 * computed at read time, so changes apply on the next page load (no recompute).
 */
export default async function TiersPage() {
  const row = await prisma.appSetting.findUnique({ where: { key: TIER_CUTOFFS_KEY } });
  const c = parseTierCutoffs(row?.value);

  const fields: { key: "AA" | "AAA" | "Majors"; label: string; help: string }[] = [
    { key: "AA", label: "AA ≥ percentile", help: "below this = A" },
    { key: "AAA", label: "AAA ≥ percentile", help: "" },
    { key: "Majors", label: "Majors ≥ percentile", help: "top tier" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-black text-navy-900">NBR competitive tiers</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        A team&apos;s tier is its rating&apos;s percentile <strong>within its age group</strong>{" "}
        (older teams rate higher on the unified scale, so tiers are relative to same-age peers).
        These are the percentile lower-bounds; anything below the AA cutoff is <strong>A</strong>.
        Provisional teams and age groups with fewer than 5 established teams aren&apos;t tiered.
        Changes apply immediately (no recompute needed). Default is a USSSA-style pyramid:
        A &lt;25, AA 25–60, AAA 60–92, Majors top ~8%.
      </p>

      <form action={setTierCutoffsAction} className="card mt-4 max-w-xl space-y-4 p-6">
        <div className="grid grid-cols-3 gap-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={f.key}>
                {f.label}
              </label>
              <input
                id={f.key}
                name={f.key}
                defaultValue={String(c[f.key])}
                className="input w-full"
                inputMode="numeric"
              />
              {f.help && <p className="mt-1 text-xs text-slate-400">{f.help}</p>}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Current: A &lt;{c.AA} · AA {c.AA}–{c.AAA} · AAA {c.AAA}–{c.Majors} · Majors ≥{c.Majors}.
          (Defaults: {DEFAULT_TIER_CUTOFFS.AA}/{DEFAULT_TIER_CUTOFFS.AAA}/{DEFAULT_TIER_CUTOFFS.Majors}.)
        </p>
        <button className="btn-primary" type="submit">
          Save
        </button>
      </form>
    </div>
  );
}
