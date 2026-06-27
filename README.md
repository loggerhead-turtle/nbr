# National Baseball Ratings (NBR)

A UTR-style rating system for amateur baseball **teams**. NBR compiles game
results, rates teams with a peer-reviewed statistical model (Glicko-2), publishes
a free public ranking, and provides a free tournament **pool generator** that
builds balanced pools so the strongest teams are split fairly across pools.

> Independent project. Not affiliated with, endorsed by, or sponsored by
> GameChanger Media, Inc. or any league.

## What's in the MVP

- **Public ratings** (`/`) — searchable, sortable, filterable rankings. No login.
- **Team pages** (`/teams/[slug]`) — rating, confidence, record, rating-history
  chart, recent games, SEO metadata + JSON-LD.
- **Tournament pool generator** (`/pools`) — serpentine seeding + balance
  refinement, printable, shareable. No login.
- **Add a team** (`/submit-team`) — visitors submit a GameChanger team ID.
- **Admin** (`/admin`) — add teams, enter games manually, view scrape/rating runs.
- **Rating engine** — Glicko-2, recomputed on a schedule.
- **Scraper** — schedule-aware, polite, kill-switchable GameChanger collector.

Phase 2 (schema already in place, not yet wired): team claiming + accounts,
contact-privacy gating, report-bad-claim flow, ZIP/area scrimmage matching.

## Architecture

A pnpm monorepo with two deployable apps sharing one Prisma schema + database.

```
packages/db        Prisma schema + client (shared)
packages/ratings   Glicko-2 math + rating engine (pure, unit-tested)
packages/core      pool generator, zod schemas, slug/name utils (pure, tested)
apps/web           Next.js (App Router) — public pages, admin, API routes
apps/worker        Node CLI — Playwright scraper + rating recompute (Render cron)
```

The **web** service never runs Playwright (no Chromium in the request path). The
**worker** runs the scraper and recompute as separate Render cron jobs.

## Rating model (Glicko-2)

Chosen over Elo because teams play intermittently: rating deviation (RD) grows
during layoffs, volatility tracks erratic results, and high RD naturally marks a
team **provisional**. Each recompute replays all FINAL games in weekly rating
periods (idempotent, reproducible). Connectivity is tracked via union-find —
ratings are only comparable within a connected component. Home-field advantage is
applied to the expectation for non-neutral games only. Margin-of-victory damping
is implemented but off by default (`glicko2-v1` = pure W/L/T).

See `/about` in the app for the plain-English explanation.

## Scraper cadence (anti-flagging by design)

GameChanger has no public API and blocks non-browser requests, so the worker
renders pages in real Chromium. Collection is deliberately low-volume and
schedule-aware:

- **Post-game fetch** — when a team has a game whose scheduled end was ~2–3h ago
  and whose result we don't have yet, fetch it once. Clusters on game days
  (Sat/Mon); looks like a fan checking the box score, not live monitoring.
- **No-schedule fallback** — check on a random weekday (never Saturday), weekly.
- **Adaptive dormancy** — a team with no schedule and no games for ~3–4 weeks
  drops to monthly checks; normal cadence resumes when a game/schedule reappears.
- A team is touched **at most ~once per week**. Global (`SCRAPER_ENABLED`) and
  per-team (`scrapeEnabled`) kill switches; randomized order + jitter; backoff on
  any 403/captcha; auto-disable after repeated failures; manual entry is a
  first-class equal path so the product works without scraping.

## Local development

```bash
pnpm install
cp .env.example .env            # fill in Supabase DATABASE_URL / DIRECT_URL
pnpm --filter @nbr/db generate  # generate Prisma client
pnpm --filter @nbr/db migrate:dev   # create the schema
pnpm --filter @nbr/db seed      # optional: seed sample Utah teams + games
pnpm --filter @nbr/worker recompute # compute ratings from seeded games
pnpm --filter @nbr/web dev      # http://localhost:3000
```

Run the worker jobs:

```bash
pnpm --filter @nbr/worker recompute   # recompute all ratings
SCRAPER_ENABLED=true pnpm --filter @nbr/worker scrape   # run the scraper
```

## Tests & checks

```bash
pnpm -r test        # vitest: Glicko-2 (incl. reference example), engine,
                    # pool generator, schedule parser
pnpm -r typecheck   # tsc across all packages
pnpm --filter @nbr/web build   # production build of the web app
```

## Deployment (Render + Supabase)

- Database: a Supabase Postgres project. Use the **pooled** URL (port 6543,
  `?pgbouncer=true&connection_limit=1`) as `DATABASE_URL` and the **direct** URL
  (port 5432) as `DIRECT_URL`.
- `render.yaml` defines three services: the Next.js web service and two Docker
  cron jobs (`nbr-scraper`, `nbr-recompute`). The worker image
  (`apps/worker/Dockerfile`) is built on the official Playwright image so
  Chromium and its system deps are preinstalled.
- Put shared secrets in a Render env group named `nbr` (database URLs, admin
  password/secret, scraper flags).

## Environment variables

See `.env.example`. Key ones: `DATABASE_URL`, `DIRECT_URL`,
`NEXT_PUBLIC_SITE_URL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`,
`SCRAPER_ENABLED`, `SCRAPER_MAX_TEAMS_PER_RUN`, `SCRAPER_POSTGAME_DELAY_HOURS`.
