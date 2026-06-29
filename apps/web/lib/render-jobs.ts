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

async function postJob(startCommand: string): Promise<void> {
  const apiKey = process.env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_WORKER_SERVICE_ID;
  if (!apiKey || !serviceId) return; // not configured — rely on the scheduled scraper

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
    }
  } catch (err) {
    console.error("[render-jobs] trigger error:", err);
  }
}

/** Scrape one just-added team (by GameChanger ID), then recompute. */
export async function triggerScrapeTeam(gcTeamId: string | null | undefined): Promise<void> {
  if (!gcTeamId || !GC_ID.test(gcTeamId)) return;
  await postJob(`pnpm --filter @nbr/worker scrape-one ${gcTeamId}`);
}

/** Scrape all just-added (never-scraped) teams, then recompute once (bulk add). */
export async function triggerScrapeNew(): Promise<void> {
  await postJob("pnpm --filter @nbr/worker scrape-new");
}

/** Recompute all ratings (e.g. after an admin repairs/merges teams). */
export async function triggerRecompute(): Promise<void> {
  await postJob("pnpm --filter @nbr/worker recompute");
}
