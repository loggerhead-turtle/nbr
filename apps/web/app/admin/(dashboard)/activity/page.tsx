import Link from "next/link";
import {
  getRecentActivity,
  getActivitySeenMap,
  countNewActivityByType,
  ACTIVITY_TYPES,
  type ActivityType,
} from "@/lib/activity";
import { clearActivityTypeAction, clearAllActivityAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity", robots: { index: false } };

const ICON: Record<ActivityType, string> = Object.fromEntries(
  ACTIVITY_TYPES.map((t) => [t.type, t.icon]),
) as Record<ActivityType, string>;

function timeAgo(d: Date, now: number): string {
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const sp = await searchParams;
  const valid = ACTIVITY_TYPES.map((t) => t.type) as string[];
  const only = sp.type && valid.includes(sp.type) ? (sp.type as ActivityType) : undefined;

  const seenMap = await getActivitySeenMap();
  const [events, counts] = await Promise.all([
    getRecentActivity(150, only),
    countNewActivityByType(seenMap),
  ]);
  const now = Date.now();
  const totalNew = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-navy-900">Activity</h1>
        {totalNew > 0 && (
          <form action={clearAllActivityAction}>
            <button className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Clear all
            </button>
          </form>
        )}
      </div>
      <p className="mb-5 max-w-2xl text-sm text-slate-500">
        Recent across the site. Notifications stay until you clear them — use a section&rsquo;s{" "}
        <span className="font-medium">Clear</span> button to dismiss just that category. A dot marks
        items newer than the last time you cleared that section.
      </p>

      {/* Per-section filters + clear buttons */}
      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/admin/activity"
          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
            !only ? "border-navy-400 bg-navy-50" : "border-slate-200 hover:bg-slate-50"
          }`}
        >
          <span className="font-medium text-navy-900">All sections</span>
          {totalNew > 0 && <CountBadge n={totalNew} />}
        </Link>
        {ACTIVITY_TYPES.map((t) => {
          const n = counts[t.type];
          return (
            <div
              key={t.type}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                only === t.type ? "border-navy-400 bg-navy-50" : "border-slate-200"
              }`}
            >
              <Link href={`/admin/activity?type=${t.type}`} className="flex min-w-0 items-center gap-1.5 hover:underline">
                <span aria-hidden>{t.icon}</span>
                <span className="truncate text-navy-900">{t.label}</span>
                {n > 0 && <CountBadge n={n} />}
              </Link>
              {n > 0 && (
                <form action={clearActivityTypeAction}>
                  <input type="hidden" name="type" value={t.type} />
                  <button className="shrink-0 text-xs font-medium text-slate-500 hover:text-rose-600">Clear</button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {events.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">No activity yet.</div>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {events.map((e) => {
            const isNew = e.at > seenMap[e.type];
            const row = (
              <div className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 text-lg leading-none" aria-hidden>
                  {ICON[e.type]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-navy-900">
                    {e.title}
                    {isNew && (
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="New" />
                    )}
                  </p>
                  {e.detail && <p className="truncate text-xs text-slate-500">{e.detail}</p>}
                </div>
                <time className="shrink-0 whitespace-nowrap text-xs text-slate-400">
                  {timeAgo(e.at, now)}
                </time>
              </div>
            );
            return (
              <li key={e.id} className={isNew ? "bg-emerald-50/40" : ""}>
                {e.href ? (
                  <Link href={e.href} className="block hover:bg-slate-50">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}
