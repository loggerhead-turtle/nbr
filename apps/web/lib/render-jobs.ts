/**
 * Trigger the worker to scrape a just-added team immediately, via Render's
 * one-off Job API. The web app can't scrape itself (GameChanger needs a real
 * browser, which only the worker service has), so adding a team kicks a one-off
 * job on the worker service that scrapes the team and then recomputes ratings.
 *
 * Configuration (both required; no-op if either is unset, e.g. local dev):
 *   RENDER_API_KEY            — a Render API key.
 *   RENDER_WORKER_SERVICE_ID  — the service ID of the Docker worker (nbr-scraper,
 *                               which has Chromium baked in).
 *
 * Fire-and-forget: failures are logged, never thrown, so adding a team always
 * succeeds even if the trigger can't reach Render. Teams also remain "initial"
 * due, so the scheduled scraper picks them up as a fallback.
 */

// GameChanger IDs are short alphanumeric tokens; re-validate before putting one
// into a job's start command to avoid any command injection.
const GC_ID = /^[A-Za-z0-9]+$/;

/**
 * POST a one-off job to Render. Returns true only when the job was actually
 * dispatched (env configured AND the API accepted it); false when the trigger
 * is unconfigured or the call failed — so callers can tell the admin whether
 * anything really happened instead of the trigger being a silent no-op.
 */
async function postJob(startCommand: string): Promise<boolean> {
  const apiKey = process.env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_WORKER_SERVICE_ID;
  if (!apiKey || !serviceId) {
    console.warn(
      "[render-jobs] RENDER_API_KEY / RENDER_WORKER_SERVICE_ID not set — " +
        "skipping one-off job (relying on the scheduled scraper).",
    );
    return false;
  }

  try {
    const res = await fetch(`https://api.render.com/v1/services/${serviceId}/jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ startCommand }),
    });
    if (!res.ok) {
      console.error(
        `[render-jobs] trigger failed: ${res.status} ${await res.text().catch(() => "")}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[render-jobs] trigger error:", err);
    return false;
  }
}

/** Scrape one just-added team (by GameChanger ID), then recompute. */
export async function triggerScrapeTeam(gcTeamId: string | null | undefined): Promise<boolean> {
  if (!gcTeamId || !GC_ID.test(gcTeamId)) return false;
  return postJob(`pnpm --filter @nbr/worker scrape-one ${gcTeamId}`);
}

/** Scrape all just-added (never-scraped) teams, then recompute once (bulk add). */
export async function triggerScrapeNew(): Promise<boolean> {
  return postJob("pnpm --filter @nbr/worker scrape-new");
}

/** Recompute all ratings (e.g. after an admin repairs/merges teams). */
export async function triggerRecompute(): Promise<boolean> {
  return postJob("pnpm --filter @nbr/worker recompute");
}
