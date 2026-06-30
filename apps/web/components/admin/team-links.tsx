/**
 * Shared per-team quick links for admin management pages: the team's own NBR page
 * (to inspect its opponents here) and its GameChanger page (to check the source).
 */

/** Link to the team's page on this site. */
export function NbrLink({ slug }: { slug: string | null | undefined }) {
  if (!slug) return null;
  return (
    <a
      href={`/teams/${slug}`}
      target="_blank"
      rel="noreferrer"
      title="Open this team's NBR page"
      className="inline-flex items-center gap-1 rounded-md bg-navy-700 px-2 py-0.5 text-xs font-bold text-white hover:bg-navy-600"
    >
      NBR ↗
    </a>
  );
}

/** Link to the team's GameChanger schedule, or a muted tag when there's no id. */
export function GcLink({ gcTeamId }: { gcTeamId: string | null | undefined }) {
  if (!gcTeamId)
    return (
      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400">
        no GC page
      </span>
    );
  return (
    <a
      href={`https://web.gc.com/teams/${gcTeamId}/schedule`}
      target="_blank"
      rel="noreferrer"
      title="Open this team's GameChanger page"
      className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-sky-700"
    >
      GC ↗
    </a>
  );
}
