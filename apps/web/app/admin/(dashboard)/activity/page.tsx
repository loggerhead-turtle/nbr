import Link from "next/link";
import {
  getRecentActivity,
  getActivitySeenAt,
  ACTIVITY_TYPES,
  type ActivityType,
} from "@/lib/activity";
import { ActivitySeen } from "@/components/admin/activity-seen";

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

  const [events, seenAt] = await Promise.all([getRecentActivity(150, only), getActivitySeenAt()]);
  const now = Date.now();
  const hadNew = events.some((e) => e.at > seenAt);

  return (
    <div>
      <ActivitySeen hadNew={hadNew} />
      <h1 className="mb-1 text-2xl font-black text-navy-900">Activity</h1>
      <p className="mb-5 max-w-2xl text-sm text-slate-500">
        Recent across the site — logins, new accounts, teams, games, claims, scrimmage requests,
        reports, and tournament-director requests. Newest first; a dot marks items since your last
        visit.
      </p>

      <div className="mb-5 flex flex-wrap gap-1.5">
        <FilterChip label="All" href="/admin/activity" active={!only} />
        {ACTIVITY_TYPES.map((t) => (
          <FilterChip
            key={t.type}
            label={`${t.icon} ${t.label}`}
            href={`/admin/activity?type=${t.type}`}
            active={only === t.type}
          />
        ))}
      </div>

      {events.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">No activity yet.</div>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {events.map((e) => {
            const isNew = e.at > seenAt;
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

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active ? "bg-navy-900 text-white" : "bg-slate-100 text-navy-800 hover:bg-slate-200"
      }`}
    >
      {label}
    </Link>
  );
}
